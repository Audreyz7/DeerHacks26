from flask import Blueprint, request

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..db import get_db

# Helper Functions
def parse_hhmm(hhmm: str) -> tuple[int, int]:
    """Parse 'HH:MM' -> (HH, MM). Raises ValueError if invalid."""
    hh, mm = hhmm.split(":")
    return int(hh), int(mm)

def in_window(now_local: datetime, start_hhmm: str, end_hhmm: str) -> bool:
    """Return True if now_local is within [start, end] in local time.
    Allows times that crosses midnight (e.g. 22:00 -> 02:00).
    """
    sh, sm = parse_hhmm(start_hhmm)
    eh, em = parse_hhmm(end_hhmm)

    start = now_local.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end = now_local.replace(hour=eh, minute=em, second=0, microsecond=0)

    if start <= end:
        return start <= now_local <= end
    # crosses midnight
    return now_local >= start or now_local <= end

def is_due(now_utc: datetime, last_utc: datetime | None, interval_min: int) -> bool:
    """T/F For Triggered reminder or if need to trigger reminder bc larger than set interval"""
    if last_utc is None:
        return True
    return now_utc >= (last_utc + timedelta(minutes=interval_min))

bp = Blueprint("pets", __name__)

# Routes 

@bp.post("/schedule")
def set_schedule():
    """
    React sets schedule.
    Body JSON:
      {
        "user_id": "audrey",
        "timezone": "America/Toronto",
        "start_time": "09:00",
        "end_time": "22:00",
        "interval_min": 60,
        "enabled": true
      }
    """
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    tz = data.get("timezone", "America/Toronto") # Fallback is Toronto
    start_time = data.get("start_time")
    end_time = data.get("end_time")
    interval_min = data.get("interval_min")

    if not start_time or not end_time or interval_min is None:
        return {"error": "missing start_time/end_time/interval_min"}, 400

    # validate timezone & HH:MM format
    try:
        ZoneInfo(tz)
        parse_hhmm(start_time)
        parse_hhmm(end_time)
        interval_min = int(interval_min)
        if interval_min <= 0:
            raise ValueError("interval_min must be > 0")
    except Exception as e:
        return {"error": f"invalid schedule fields: {e}"}, 400

    doc = {
        "user_id": user_id,
        "timezone": tz,
        "start_time": start_time,
        "end_time": end_time,
        "interval_min": interval_min,
        "enabled": bool(data.get("enabled", True)),
    }

    db.water_schedules.update_one(
        {"user_id": user_id},
        {"$set": doc, "$setOnInsert": {"last_triggered_at": None}}, # if user not found -> last triggered is none, otherwise update 
        upsert=True,
    )

    return {"ok": True, "schedule": doc}


@bp.get("/schedule")
def get_schedule():
    """React can fetch current schedule for UI."""
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    sched = db.water_schedules.find_one({"user_id": user_id}, {"_id": 0})
    if not sched:
        return {"error": "not found"}, 404
    # last_triggered_at is datetime (ok to return if Flask auto-json can handle it? safer stringify)
    if sched.get("last_triggered_at"):
        sched["last_triggered_at"] = sched["last_triggered_at"].isoformat()
    return sched


@bp.get("/poll")
def poll_for_reminder():
    """
    ESP32 polls this endpoint.
    Query: ?user_id=audrey
    Response:
      {
        "remind_now": true/false,
        "reason": "...",
        "server_time_utc": "...",
        "payload": { ...optional future graphics fields... }
      }
    """
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    sched = db.water_schedules.find_one({"user_id": user_id})
    if not sched:
        return {"remind_now": False, "reason": "no_schedule"}

    if not sched.get("enabled", False):
        return {"remind_now": False, "reason": "disabled"}

    now_utc = datetime.now(tz=ZoneInfo("UTC"))
    tz = ZoneInfo(sched.get("timezone", "America/Toronto"))
    now_local = now_utc.astimezone(tz)

    if not in_window(now_local, sched["start_time"], sched["end_time"]):
        return {
            "remind_now": False,
            "reason": "outside_window",
            "server_time_utc": now_utc.isoformat(),
        }

    last = sched.get("last_triggered_at")  # stored in UTC as datetime
    interval_min = int(sched["interval_min"])

    if not is_due(now_utc, last, interval_min):
        return {
            "remind_now": False,
            "reason": "not_due_yet",
            "server_time_utc": now_utc.isoformat(),
        }

    # Due: mark triggered and return remind_now
    db.water_schedules.update_one(
        {"user_id": user_id},
        {"$set": {"last_triggered_at": now_utc}},
    )

    # Optional log
    db.water_events.insert_one({"user_id": user_id, "at_utc": now_utc, "type": "REMINDER_SENT"})

    return {
        "remind_now": True,
        "reason": "due",
        "server_time_utc": now_utc.isoformat(),
        # Future: you can add graphics instructions here later
        "payload": {
            "title": "Drink water",
            "message": "Time to hydrate!",
            "animation": "WATER_DROP"  # placeholder for later ESP32 graphics
        },
    }


@bp.post("/ack")
def ack_reminder():
    """
    ESP32 can call after it displays the reminder (optional).
    Body: {"user_id":"audrey"}
    """
    db = get_db()
    data = request.get_json(force=True)
    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    now_utc = datetime.now(tz=ZoneInfo("UTC"))
    db.water_events.insert_one({"user_id": user_id, "at_utc": now_utc, "type": "DEVICE_ACK"})
    return {"ok": True}