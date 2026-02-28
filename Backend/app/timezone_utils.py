from __future__ import annotations

from datetime import timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def get_timezone(name: str = "UTC"):
    if name.upper() == "UTC":
        return timezone.utc

    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc
