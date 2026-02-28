from __future__ import annotations

from datetime import datetime, timedelta
from statistics import mean
from uuid import uuid4

from flask import Blueprint, request
from zoneinfo import ZoneInfo

from ..db import get_db

bp = Blueprint("stress", __name__)

UTC = ZoneInfo("UTC")
HIGH_STRESS_THRESHOLD = 0.75
PROMPT_AFTER_MINUTES = 10


def _now_utc() -> datetime:
    return datetime.now(tz=UTC)


def _parse_timestamp(value: str | None) -> datetime:
    if not value:
        return _now_utc()

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _build_report(samples: list[dict]) -> dict:
    if not samples:
        return {
            "sample_count": 0,
            "average_focus": 0.0,
            "average_stress": 0.0,
            "peak_stress": 0.0,
            "lowest_focus": 0.0,
            "graph_points": [],
        }

    focus_values = [float(sample.get("focus_score", 0.0)) for sample in samples]
    stress_values = [float(sample.get("stress_score", 0.0)) for sample in samples]

    return {
        "sample_count": len(samples),
        "average_focus": round(mean(focus_values), 3),
        "average_stress": round(mean(stress_values), 3),
        "peak_stress": round(max(stress_values), 3),
        "lowest_focus": round(min(focus_values), 3),
        "graph_points": [
            {
                "timestamp": sample["captured_at"].isoformat(),
                "focus_score": float(sample.get("focus_score", 0.0)),
                "stress_score": float(sample.get("stress_score", 0.0)),
            }
            for sample in samples
        ],
    }


def _maybe_queue_break_prompt(db, session: dict, user_id: str, captured_at: datetime) -> None:
    if not session.get("allow_prompted_breaks"):
        return

    high_stress_start = captured_at - timedelta(minutes=PROMPT_AFTER_MINUTES)
    earliest_high_stress = db.focus_samples.find_one(
        {
            "session_id": session["session_id"],
            "captured_at": {"$gte": high_stress_start},
            "stress_score": {"$gte": HIGH_STRESS_THRESHOLD},
        },
        sort=[("captured_at", 1)],
    )
    if not earliest_high_stress:
        return
    if captured_at - earliest_high_stress["captured_at"] < timedelta(minutes=PROMPT_AFTER_MINUTES):
        return

    existing_prompt = db.break_prompts.find_one(
        {
            "user_id": user_id,
            "session_id": session["session_id"],
            "resolved_at": None,
            "type": "HIGH_STRESS_BREAK",
        }
    )
    if existing_prompt:
        return

    db.break_prompts.insert_one(
        {
            "prompt_id": str(uuid4()),
            "user_id": user_id,
            "session_id": session["session_id"],
            "type": "HIGH_STRESS_BREAK",
            "reason": "High stress detected for 10+ minutes",
            "created_at": captured_at,
            "resolved_at": None,
            "payload": {
                "title": "Break time",
                "message": "Your stress has stayed high. Take a short break.",
                "screen": "BREAK_PROMPT",
            },
        }
    )


@bp.post("/session/start")
def start_focus_session():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    session_id = str(uuid4())
    now_utc = _parse_timestamp(data.get("started_at"))
    allow_prompted_breaks = data.get("allow_prompted_breaks")
    if allow_prompted_breaks is None:
        preference = db.break_preferences.find_one({"user_id": user_id}, {"_id": 0})
        allow_prompted_breaks = bool(preference and preference.get("stress_prompt_enabled"))

    session = {
        "session_id": session_id,
        "user_id": user_id,
        "started_at": now_utc,
        "ended_at": None,
        "status": "active",
        "study_label": data.get("study_label", "Study Session"),
        "allow_prompted_breaks": bool(allow_prompted_breaks),
        "signal_source": data.get("signal_source", "presage"),
    }
    db.focus_sessions.insert_one(session)

    response = dict(session)
    response["started_at"] = now_utc.isoformat()
    return {"ok": True, "session": response}, 201


@bp.post("/sample")
def ingest_focus_sample():
    db = get_db()
    data = request.get_json(force=True)

    session_id = data.get("session_id")
    if not session_id:
        return {"error": "missing session_id"}, 400

    session = db.focus_sessions.find_one({"session_id": session_id})
    if not session:
        return {"error": "unknown session_id"}, 404
    if session.get("status") != "active":
        return {"error": "session is not active"}, 409

    try:
        focus_score = float(data.get("focus_score"))
        stress_score = float(data.get("stress_score"))
    except (TypeError, ValueError):
        return {"error": "focus_score and stress_score must be numbers"}, 400

    if not 0.0 <= focus_score <= 1.0 or not 0.0 <= stress_score <= 1.0:
        return {"error": "focus_score and stress_score must be in range [0, 1]"}, 400

    captured_at = _parse_timestamp(data.get("captured_at"))
    sample = {
        "sample_id": str(uuid4()),
        "session_id": session_id,
        "user_id": session["user_id"],
        "captured_at": captured_at,
        "focus_score": focus_score,
        "stress_score": stress_score,
        "confidence": float(data.get("confidence", 1.0)),
        "raw_metrics": data.get("raw_metrics", {}),
        "signal_source": data.get("signal_source", session.get("signal_source", "presage")),
    }
    db.focus_samples.insert_one(sample)

    _maybe_queue_break_prompt(db, session, session["user_id"], captured_at)

    return {
        "ok": True,
        "sample_id": sample["sample_id"],
        "captured_at": captured_at.isoformat(),
    }, 201


@bp.post("/session/end")
def end_focus_session():
    db = get_db()
    data = request.get_json(force=True)

    session_id = data.get("session_id")
    if not session_id:
        return {"error": "missing session_id"}, 400

    session = db.focus_sessions.find_one({"session_id": session_id})
    if not session:
        return {"error": "unknown session_id"}, 404

    ended_at = _parse_timestamp(data.get("ended_at"))
    samples = list(
        db.focus_samples.find(
            {"session_id": session_id},
            {"_id": 0},
            sort=[("captured_at", 1)],
        )
    )
    report = _build_report(samples)

    db.focus_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"status": "completed", "ended_at": ended_at}},
    )
    db.focus_reports.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "session_id": session_id,
                "user_id": session["user_id"],
                "generated_at": ended_at,
                "report": report,
            }
        },
        upsert=True,
    )

    return {
        "ok": True,
        "session_id": session_id,
        "ended_at": ended_at.isoformat(),
        "report": report,
    }


@bp.get("/report/<session_id>")
def get_focus_report(session_id: str):
    db = get_db()
    report = db.focus_reports.find_one({"session_id": session_id}, {"_id": 0})
    if not report:
        return {"error": "not found"}, 404

    if report.get("generated_at"):
        report["generated_at"] = report["generated_at"].isoformat()
    return report
