from __future__ import annotations

from datetime import datetime

from flask import Blueprint, current_app, request
from zoneinfo import ZoneInfo

from ..db import get_db

bp = Blueprint("settings", __name__)
UTC = ZoneInfo("UTC")


def _default_settings(user_id: str) -> dict:
    return {
        "user_id": user_id,
        "api_keys": {
            "anthropic": "",
            "elevenlabs": current_app.config.get("ELEVEN_LABS_API_KEY", ""),
            "presage": current_app.config.get("PRESAGE_API_KEY", ""),
            "gemini": current_app.config.get("GEMINI_API_KEY", ""),
        },
        "database": {
            "mongo_uri": current_app.config.get("MONGO_URI", ""),
        },
        "hardware": {
            "device_ip": "",
            "websocket_port": "81",
        },
    }


@bp.get("")
def get_settings():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    saved = db.app_settings.find_one({"user_id": user_id}, {"_id": 0})
    if saved:
        return saved
    return _default_settings(user_id)


@bp.post("")
def save_settings():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    document = {
        "user_id": user_id,
        "api_keys": {
            "anthropic": str(data.get("api_keys", {}).get("anthropic", "")),
            "elevenlabs": str(data.get("api_keys", {}).get("elevenlabs", "")),
            "presage": str(data.get("api_keys", {}).get("presage", "")),
            "gemini": str(data.get("api_keys", {}).get("gemini", "")),
        },
        "database": {
            "mongo_uri": str(data.get("database", {}).get("mongo_uri", "")),
        },
        "hardware": {
            "device_ip": str(data.get("hardware", {}).get("device_ip", "")),
            "websocket_port": str(data.get("hardware", {}).get("websocket_port", "81")),
        },
        "updated_at": datetime.now(tz=UTC).isoformat(),
    }

    db.app_settings.update_one({"user_id": user_id}, {"$set": document}, upsert=True)
    return {"ok": True, "settings": document}
