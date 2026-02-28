from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from flask import Blueprint, request
from zoneinfo import ZoneInfo

from ..db import get_db

bp = Blueprint("breaks", __name__)
UTC = ZoneInfo("UTC")


def _now_utc() -> datetime:
    return datetime.now(tz=UTC)


def _parse_timestamp(value: str | None) -> datetime:
    if not value:
        return _now_utc()

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _status_from_session(session: dict, reference_time: datetime) -> dict:
    started_at = session["started_at"]
    elapsed_seconds = max(int((reference_time - started_at).total_seconds()), 0)
    focus_seconds = int(session["focus_minutes"]) * 60
    break_seconds = int(session["break_minutes"]) * 60
    cycles = max(int(session["cycles"]), 1)
    cycle_seconds = focus_seconds + break_seconds
    total_seconds = (cycle_seconds * cycles) - break_seconds

    if elapsed_seconds >= total_seconds:
        phase = "completed"
        seconds_remaining = 0
        cycle_index = cycles
    else:
        cycle_index = min((elapsed_seconds // cycle_seconds) + 1, cycles)
        in_cycle_second = elapsed_seconds % cycle_seconds
        if in_cycle_second < focus_seconds:
            phase = "focus"
            seconds_remaining = focus_seconds - in_cycle_second
        else:
            phase = "break"
            seconds_remaining = cycle_seconds - in_cycle_second

    payload = {
        "title": "Pomodoro",
        "message": "Focus now" if phase == "focus" else "Take a break",
        "screen": "POMODORO_TIMER",
    }
    if phase == "completed":
        payload["message"] = "Session complete"

    return {
        "session_id": session["session_id"],
        "phase": phase,
        "cycle_index": cycle_index,
        "seconds_remaining": seconds_remaining,
        "server_time_utc": reference_time.isoformat(),
        "payload": payload,
    }


@bp.post("/pomodoro/start")
def start_pomodoro():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    try:
        focus_minutes = int(data.get("focus_minutes", 25))
        break_minutes = int(data.get("break_minutes", 5))
        cycles = int(data.get("cycles", 4))
    except (TypeError, ValueError):
        return {"error": "focus_minutes, break_minutes, and cycles must be integers"}, 400

    if focus_minutes <= 0 or break_minutes <= 0 or cycles <= 0:
        return {"error": "pomodoro values must be greater than zero"}, 400

    started_at = _parse_timestamp(data.get("started_at"))
    session = {
        "session_id": str(uuid4()),
        "user_id": user_id,
        "focus_minutes": focus_minutes,
        "break_minutes": break_minutes,
        "cycles": cycles,
        "started_at": started_at,
        "ended_at": None,
        "status": "active",
    }
    db.pomodoro_sessions.insert_one(session)

    return {
        "ok": True,
        "session": {
            "session_id": session["session_id"],
            "user_id": user_id,
            "started_at": started_at.isoformat(),
            "focus_minutes": focus_minutes,
            "break_minutes": break_minutes,
            "cycles": cycles,
        },
    }, 201


@bp.get("/pomodoro/status")
def get_pomodoro_status():
    db = get_db()
    session_id = request.args.get("session_id")
    if not session_id:
        return {"error": "missing session_id"}, 400

    session = db.pomodoro_sessions.find_one({"session_id": session_id})
    if not session:
        return {"error": "not found"}, 404

    now_utc = _now_utc()
    status = _status_from_session(session, now_utc)

    if status["phase"] == "completed" and session.get("status") != "completed":
        db.pomodoro_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "completed", "ended_at": now_utc}},
        )

    return status


@bp.post("/preferences/stress-prompts")
def set_stress_prompt_preference():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    enabled = bool(data.get("enabled", False))
    db.break_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "stress_prompt_enabled": enabled, "updated_at": _now_utc()}},
        upsert=True,
    )
    return {"ok": True, "user_id": user_id, "stress_prompt_enabled": enabled}


@bp.get("/preferences/stress-prompts")
def get_stress_prompt_preference():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    preference = db.break_preferences.find_one({"user_id": user_id}, {"_id": 0})
    return {
        "user_id": user_id,
        "stress_prompt_enabled": bool(preference and preference.get("stress_prompt_enabled")),
    }


@bp.get("/prompt/poll")
def poll_break_prompt():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    prompt = db.break_prompts.find_one(
        {"user_id": user_id, "resolved_at": None},
        sort=[("created_at", 1)],
    )
    if not prompt:
        return {"show_prompt": False, "reason": "none"}

    return {
        "show_prompt": True,
        "prompt_id": prompt["prompt_id"],
        "type": prompt["type"],
        "reason": prompt["reason"],
        "created_at": prompt["created_at"].isoformat(),
        "payload": prompt.get("payload", {}),
    }


@bp.post("/prompt/ack")
def acknowledge_break_prompt():
    db = get_db()
    data = request.get_json(force=True)

    prompt_id = data.get("prompt_id")
    if not prompt_id:
        return {"error": "missing prompt_id"}, 400

    resolved_at = _parse_timestamp(data.get("resolved_at"))
    result = db.break_prompts.update_one(
        {"prompt_id": prompt_id, "resolved_at": None},
        {"$set": {"resolved_at": resolved_at, "acknowledged": bool(data.get("acknowledged", True))}},
    )
    if result.matched_count == 0:
        return {"error": "not found"}, 404

    return {"ok": True, "prompt_id": prompt_id, "resolved_at": resolved_at.isoformat()}


@bp.post("/pomodoro/stop")
def stop_pomodoro():
    db = get_db()
    data = request.get_json(force=True)

    session_id = data.get("session_id")
    if not session_id:
        return {"error": "missing session_id"}, 400

    ended_at = _parse_timestamp(data.get("ended_at"))
    result = db.pomodoro_sessions.update_one(
        {"session_id": session_id, "status": "active"},
        {"$set": {"status": "cancelled", "ended_at": ended_at}},
    )
    if result.matched_count == 0:
        return {"error": "not found"}, 404

    return {"ok": True, "session_id": session_id, "ended_at": ended_at.isoformat()}
