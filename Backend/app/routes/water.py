from flask import Blueprint, current_app, request

from datetime import datetime, timedelta

from ..db import get_db
from ..timezone_utils import get_timezone

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


def _safe_interval_min(value, default: int = 45) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except (TypeError, ValueError):
        return default


def _safe_daily_goal_liters(value, default: float = 2.5) -> float:
    try:
        parsed = float(value)
        return parsed if parsed > 0 else default
    except (TypeError, ValueError):
        return default


def _now_utc() -> datetime:
    return datetime.now(tz=get_timezone("UTC"))


def _parse_timestamp(value: str | None) -> datetime:
    if not value:
        return _now_utc()

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=get_timezone("UTC"))
    return parsed.astimezone(get_timezone("UTC"))


def _local_day_bounds(now_utc: datetime, timezone_name: str) -> tuple[datetime, datetime]:
    tz = get_timezone(timezone_name)
    now_local = now_utc.astimezone(tz)
    local_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(get_timezone("UTC")), local_end.astimezone(get_timezone("UTC"))


def _weekly_history(db, user_id: str, timezone_name: str, days: int = 7) -> list[dict]:
    tz = get_timezone(timezone_name)
    now_utc = _now_utc()
    history: list[dict] = []

    for offset in range(days - 1, -1, -1):
        target_local = now_utc.astimezone(tz) - timedelta(days=offset)
        day_start_local = target_local.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end_local = day_start_local + timedelta(days=1)
        day_start_utc = day_start_local.astimezone(get_timezone("UTC"))
        day_end_utc = day_end_local.astimezone(get_timezone("UTC"))

        events = db.water_events.find(
            {
                "user_id": user_id,
                "type": "INTAKE",
                "at_utc": {"$gte": day_start_utc, "$lt": day_end_utc},
            },
            {"_id": 0, "amount_ml": 1},
        )
        total_ml = sum(int(event.get("amount_ml", 0)) for event in events)
        history.append(
            {
                "label": day_start_local.strftime("%a"),
                "total_ml": total_ml,
                "total_liters": round(total_ml / 1000, 2),
            }
        )

    return history


def _summary_payload(db, user_id: str) -> dict:
    sched = db.water_schedules.find_one({"user_id": user_id}, {"_id": 0}) or {}
    timezone_name = sched.get("timezone", current_app.config["DEFAULT_TIMEZONE"])
    now_utc = _now_utc()
    day_start_utc, day_end_utc = _local_day_bounds(now_utc, timezone_name)

    intake_events = list(
        db.water_events.find(
            {
                "user_id": user_id,
                "type": "INTAKE",
                "at_utc": {"$gte": day_start_utc, "$lt": day_end_utc},
            },
            {"_id": 0},
            sort=[("at_utc", 1)],
        )
    )
    total_intake_ml = sum(int(event.get("amount_ml", 0)) for event in intake_events)
    last_intake_at = intake_events[-1]["at_utc"].isoformat() if intake_events else None

    next_reminder_at = None
    if sched.get("enabled") and sched.get("interval_min"):
        last_triggered_at = sched.get("last_triggered_at")
        if last_triggered_at:
            next_reminder_at = (
                last_triggered_at + timedelta(minutes=int(sched["interval_min"]))
            ).isoformat()

    return {
        "user_id": user_id,
        "today": {
            "total_intake_ml": total_intake_ml,
            "total_intake_liters": round(total_intake_ml / 1000, 2),
            "goal_liters": _safe_daily_goal_liters(sched.get("daily_goal_liters", 2.5)),
            "progress_percent": min(
                round((total_intake_ml / max(_safe_daily_goal_liters(sched.get("daily_goal_liters", 2.5)) * 1000, 1)) * 100),
                100,
            ),
            "last_intake_at": last_intake_at,
            "next_reminder_at": next_reminder_at,
        },
        "weekly_history": _weekly_history(db, user_id, timezone_name),
        "schedule": {
            "timezone": timezone_name,
            "start_time": sched.get("start_time", "09:00"),
            "end_time": sched.get("end_time", "18:00"),
            "interval_min": _safe_interval_min(sched.get("interval_min", 45)),
            "enabled": bool(sched.get("enabled", True)),
            "daily_goal_liters": _safe_daily_goal_liters(sched.get("daily_goal_liters", 2.5)),
        },
    }

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
        get_timezone(tz)
        parse_hhmm(start_time)
        parse_hhmm(end_time)
        interval_min = int(interval_min)
        if interval_min <= 0:
            raise ValueError("interval_min must be > 0")
        daily_goal_liters = _safe_daily_goal_liters(data.get("daily_goal_liters", 2.5), default=0)
        if daily_goal_liters <= 0:
            raise ValueError("daily_goal_liters must be > 0")
    except Exception as e:
        return {"error": f"invalid schedule fields: {e}"}, 400

    doc = {
        "user_id": user_id,
        "timezone": tz,
        "start_time": start_time,
        "end_time": end_time,
        "interval_min": interval_min,
        "enabled": bool(data.get("enabled", True)),
        "daily_goal_liters": daily_goal_liters,
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

    now_utc = datetime.now(tz=get_timezone("UTC"))
    tz = get_timezone(sched.get("timezone", "America/Toronto"))
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

    now_utc = datetime.now(tz=get_timezone("UTC"))
    db.water_events.insert_one({"user_id": user_id, "at_utc": now_utc, "type": "DEVICE_ACK"})
    return {"ok": True}


@bp.post("/intake")
def log_intake():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    try:
        amount_ml = int(data.get("amount_ml", 250))
    except (TypeError, ValueError):
        return {"error": "amount_ml must be an integer"}, 400

    if amount_ml <= 0:
        return {"error": "amount_ml must be greater than zero"}, 400

    consumed_at = _parse_timestamp(data.get("consumed_at"))
    db.water_events.insert_one(
        {
            "user_id": user_id,
            "at_utc": consumed_at,
            "type": "INTAKE",
            "amount_ml": amount_ml,
            "source": data.get("source", "frontend"),
        }
    )

    return {"ok": True, "logged_at": consumed_at.isoformat(), "summary": _summary_payload(db, user_id)}, 201


@bp.get("/summary")
def get_summary():
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    db = get_db()
    return _summary_payload(db, user_id)
