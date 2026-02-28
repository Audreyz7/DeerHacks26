from __future__ import annotations

from flask import Blueprint, request

from ..db import get_db

bp = Blueprint("encouragement", __name__)


def _compose_message(stress_score: float, focus_score: float) -> str:
    if stress_score >= 0.8:
        return "You have been pushing hard. Slow down, breathe, and take a short reset."
    if focus_score >= 0.75 and stress_score <= 0.4:
        return "You are in a strong flow state. Keep going and protect the momentum."
    if focus_score <= 0.4:
        return "Start with one small task for five minutes. Momentum matters more than perfection."
    return "You are doing fine. Keep a steady pace and check in with yourself."


@bp.post("/message")
def get_encouragement():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    try:
        stress_score = float(data.get("stress_score", 0.0))
        focus_score = float(data.get("focus_score", 0.0))
    except (TypeError, ValueError):
        return {"error": "stress_score and focus_score must be numeric"}, 400

    message = _compose_message(stress_score, focus_score)
    db.encouragement_events.insert_one(
        {
            "user_id": user_id,
            "stress_score": stress_score,
            "focus_score": focus_score,
            "message": message,
        }
    )
    return {"ok": True, "message": message}
