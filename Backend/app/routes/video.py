from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from flask import Blueprint, Response, current_app, request, stream_with_context

from ..db import get_db
from ..timezone_utils import get_timezone
from .stress import queue_break_prompt_if_needed

try:
    import cv2
except ModuleNotFoundError:
    cv2 = None

try:
    import numpy as np
except ModuleNotFoundError:
    np = None


bp = Blueprint("video", __name__)

UTC = get_timezone("UTC")
VIDEO_SOURCE_COLLECTION = "video_sources"
LIVE_ANALYSIS_COLLECTION = "live_stress_snapshots"
FRAME_PERSIST_INTERVAL_SECONDS = 5
DEFAULT_SOURCE_TYPE = "webcam"
_live_analysis_cache: dict[str, dict] = {}
_live_analysis_lock = Lock()


def _now_utc() -> datetime:
    return datetime.now(tz=UTC)


def _round_unit_interval(value: float) -> float:
    return round(max(0.0, min(1.0, float(value))), 3)


def _normalize_source_type(value: str | None) -> str:
    if value == "esp32":
        return "esp32"
    return "webcam"


def _coerce_stream_url(device_value: str, default_path: str = "/stream") -> str:
    value = (device_value or "").strip()
    if not value:
        return ""

    candidate = value if "://" in value else f"http://{value}"
    parsed = urlparse(candidate)
    if not parsed.scheme or not parsed.netloc:
        return ""
    if parsed.path:
        return candidate
    return f"{candidate.rstrip('/')}{default_path}"


def _default_video_source(user_id: str) -> dict:
    return {
        "user_id": user_id,
        "source_type": DEFAULT_SOURCE_TYPE,
        "esp32_stream_url": "",
        "webcam_index": 0,
        "updated_at": _now_utc().isoformat(),
    }


def _get_saved_video_source(db, user_id: str) -> dict:
    saved = getattr(db, VIDEO_SOURCE_COLLECTION).find_one({"user_id": user_id}, {"_id": 0})
    if not saved:
        return _default_video_source(user_id)

    source = _default_video_source(user_id)
    source.update(saved)
    source["source_type"] = _normalize_source_type(saved.get("source_type"))
    try:
        source["webcam_index"] = int(saved.get("webcam_index", 0))
    except (TypeError, ValueError):
        source["webcam_index"] = 0
    source["esp32_stream_url"] = str(saved.get("esp32_stream_url", ""))
    return source


def _resolve_esp32_stream_url(db, user_id: str, explicit_url: str | None) -> str:
    if explicit_url:
        return _coerce_stream_url(explicit_url)

    source = _get_saved_video_source(db, user_id)
    if source.get("esp32_stream_url"):
        return _coerce_stream_url(str(source["esp32_stream_url"]))

    settings = db.app_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    hardware = settings.get("hardware", {})
    return _coerce_stream_url(str(hardware.get("device_ip", "")))


def _iter_esp32_frames(stream):
    buffer = b""
    while True:
        chunk = stream.read(4096)
        if not chunk:
            break
        buffer += chunk

        start = buffer.find(b"\xff\xd8")
        end = buffer.find(b"\xff\xd9")
        while start != -1 and end != -1 and end > start:
            frame_bytes = buffer[start : end + 2]
            yield frame_bytes
            buffer = buffer[end + 2 :]
            start = buffer.find(b"\xff\xd8")
            end = buffer.find(b"\xff\xd9")


def _read_one_esp32_frame(stream_url: str) -> bytes:
    with urlopen(stream_url, timeout=5) as upstream:
        frame_bytes = next(_iter_esp32_frames(upstream), None)
    if not frame_bytes:
        raise RuntimeError("No frame received from the ESP32 stream.")
    return frame_bytes


def _iter_webcam_frames(webcam_index: int):
    if cv2 is None:
        raise RuntimeError("OpenCV is not installed.")

    capture = cv2.VideoCapture(webcam_index)
    if not capture.isOpened():
        capture.release()
        raise RuntimeError("Unable to open the selected webcam.")

    try:
        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            yield frame
    finally:
        capture.release()


def _read_one_webcam_frame(webcam_index: int) -> bytes:
    frame = next(_iter_webcam_frames(webcam_index), None)
    if frame is None:
        raise RuntimeError("No frame received from the selected webcam.")
    return _encode_frame_bytes(frame)


def _decode_frame_bytes(frame_bytes: bytes):
    if cv2 is None or np is None:
        return None
    frame_buffer = np.frombuffer(frame_bytes, dtype=np.uint8)
    return cv2.imdecode(frame_buffer, cv2.IMREAD_COLOR)


def _encode_frame_bytes(frame) -> bytes:
    if cv2 is None:
        raise RuntimeError("OpenCV is not installed.")
    ok, encoded = cv2.imencode(".jpg", frame)
    if not ok:
        raise RuntimeError("Unable to encode video frame.")
    return encoded.tobytes()


def _compute_local_frame_metrics(frame_bytes: bytes) -> dict:
    if cv2 is None or np is None:
        return {
            "focus_score": 0.5,
            "stress_score": 0.5,
            "confidence": 0.2,
            "raw_metrics": {
                "provider": "opencv-unavailable",
                "brightness": 0.0,
                "contrast": 0.0,
                "motion_edges": 0.0,
            },
        }

    frame = _decode_frame_bytes(frame_bytes)
    if frame is None:
        return {
            "focus_score": 0.5,
            "stress_score": 0.5,
            "confidence": 0.1,
            "raw_metrics": {
                "provider": "opencv-decode-failed",
                "brightness": 0.0,
                "contrast": 0.0,
                "motion_edges": 0.0,
            },
        }

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray)) / 255.0
    contrast = float(np.std(gray)) / 128.0
    edges = cv2.Canny(gray, 80, 160)
    edge_density = float(np.count_nonzero(edges)) / float(edges.size or 1)

    focus_score = _round_unit_interval((contrast * 0.55) + ((1.0 - edge_density) * 0.35) + (brightness * 0.1))
    stress_score = _round_unit_interval((edge_density * 0.6) + ((1.0 - brightness) * 0.25) + (contrast * 0.15))
    confidence = _round_unit_interval(0.45 + min(contrast, 1.0) * 0.25 + min(edge_density * 2.0, 0.3))

    return {
        "focus_score": focus_score,
        "stress_score": stress_score,
        "confidence": confidence,
        "raw_metrics": {
            "provider": "opencv-heuristic",
            "brightness": round(brightness, 3),
            "contrast": round(contrast, 3),
            "motion_edges": round(edge_density, 3),
        },
    }


def _call_presage(frame_bytes: bytes, local_metrics: dict) -> dict | None:
    api_key = current_app.config.get("PRESAGE_API_KEY", "")
    project_id = current_app.config.get("PRESAGE_PROJECT_ID", "")
    api_url = current_app.config.get("PRESAGE_API_URL", "")
    if not api_key or not project_id or not api_url:
        return None

    payload = {
        "project_id": project_id,
        "image_base64": base64.b64encode(frame_bytes).decode("ascii"),
        "fallback_metrics": local_metrics,
    }
    request_headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    request_body = json.dumps(payload).encode("utf-8")

    try:
        req = Request(api_url, data=request_body, headers=request_headers, method="POST")
        with urlopen(req, timeout=4) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except Exception:
        current_app.logger.exception("Presage video analysis request failed.")
        return None

    focus_score = parsed.get("focus_score", parsed.get("attention_index"))
    stress_score = parsed.get("stress_score", parsed.get("stress_index"))
    if focus_score is None or stress_score is None:
        return None

    return {
        "focus_score": _round_unit_interval(focus_score),
        "stress_score": _round_unit_interval(stress_score),
        "confidence": _round_unit_interval(parsed.get("confidence", 0.8)),
        "raw_metrics": {
            "provider": "presage",
            "presage_response": parsed,
        },
    }


def _analyze_frame(frame_bytes: bytes) -> dict:
    local_metrics = _compute_local_frame_metrics(frame_bytes)
    presage_metrics = _call_presage(frame_bytes, local_metrics)
    if presage_metrics:
        return presage_metrics
    return local_metrics


def _save_live_analysis(db, user_id: str, source_type: str, source_label: str, analysis: dict, session_id: str | None, captured_at: datetime) -> dict:
    snapshot = {
        "user_id": user_id,
        "session_id": session_id,
        "source_type": source_type,
        "source_label": source_label,
        "captured_at": captured_at,
        "focus_score": analysis["focus_score"],
        "stress_score": analysis["stress_score"],
        "confidence": analysis["confidence"],
        "raw_metrics": analysis["raw_metrics"],
        "signal_source": analysis["raw_metrics"].get("provider", source_type),
    }

    getattr(db, LIVE_ANALYSIS_COLLECTION).update_one(
        {"user_id": user_id},
        {"$set": snapshot},
        upsert=True,
    )
    with _live_analysis_lock:
        _live_analysis_cache[user_id] = dict(snapshot)
    return snapshot


def _persist_live_sample_if_needed(db, user_id: str, session_id: str | None, analysis: dict, captured_at: datetime, last_saved_at: datetime | None) -> datetime | None:
    if not session_id:
        return last_saved_at
    if last_saved_at and captured_at - last_saved_at < timedelta(seconds=FRAME_PERSIST_INTERVAL_SECONDS):
        return last_saved_at

    session = db.focus_sessions.find_one({"session_id": session_id})
    if not session or session.get("user_id") != user_id or session.get("status") != "active":
        return last_saved_at

    sample = {
        "sample_id": str(uuid4()),
        "session_id": session_id,
        "user_id": user_id,
        "captured_at": captured_at,
        "focus_score": analysis["focus_score"],
        "stress_score": analysis["stress_score"],
        "confidence": analysis["confidence"],
        "raw_metrics": analysis["raw_metrics"],
        "signal_source": analysis["raw_metrics"].get("provider", "video"),
    }
    db.focus_samples.insert_one(sample)
    queue_break_prompt_if_needed(db, session, user_id, captured_at)
    return captured_at


def _stream_error_frame(message: str):
    yield b"--frame\r\n"
    yield b"Content-Type: text/plain\r\n\r\n"
    yield f"{message}\r\n".encode("utf-8")


@bp.get("/source")
def get_video_source():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    return _get_saved_video_source(db, user_id)


@bp.post("/source")
def save_video_source():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    document = {
        "user_id": user_id,
        "source_type": _normalize_source_type(data.get("source_type")),
        "esp32_stream_url": _coerce_stream_url(str(data.get("esp32_stream_url", "")), default_path="/stream"),
        "webcam_index": 0,
        "updated_at": _now_utc().isoformat(),
    }
    try:
        document["webcam_index"] = int(data.get("webcam_index", 0))
    except (TypeError, ValueError):
        document["webcam_index"] = 0
    getattr(db, VIDEO_SOURCE_COLLECTION).update_one({"user_id": user_id}, {"$set": document}, upsert=True)
    return {"ok": True, "source": document}


@bp.get("/stream")
def stream_video():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    saved_source = _get_saved_video_source(db, user_id)
    source_type = _normalize_source_type(request.args.get("source_type") or saved_source.get("source_type"))
    session_id = request.args.get("session_id")

    if source_type == "esp32":
        stream_url = _resolve_esp32_stream_url(db, user_id, request.args.get("stream_url"))
        if not stream_url:
            return {"error": "missing esp32 stream URL"}, 400

        def generate():
            last_saved_at = None
            try:
                with urlopen(stream_url, timeout=5) as upstream:
                    for frame_bytes in _iter_esp32_frames(upstream):
                        captured_at = _now_utc()
                        analysis = _analyze_frame(frame_bytes)
                        _save_live_analysis(db, user_id, source_type, stream_url, analysis, session_id, captured_at)
                        last_saved_at = _persist_live_sample_if_needed(
                            db, user_id, session_id, analysis, captured_at, last_saved_at
                        )

                        yield b"--frame\r\n"
                        yield b"Content-Type: image/jpeg\r\n\r\n"
                        yield frame_bytes
                        yield b"\r\n"
            except (HTTPError, URLError, TimeoutError, OSError):
                current_app.logger.exception("Unable to open ESP32-CAM stream.")
                yield from _stream_error_frame("ESP32-CAM stream unavailable.")

        return Response(
            stream_with_context(generate()),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    webcam_index = saved_source.get("webcam_index", 0)

    def generate():
        last_saved_at = None
        try:
            for frame in _iter_webcam_frames(int(webcam_index)):
                frame_bytes = _encode_frame_bytes(frame)
                captured_at = _now_utc()
                analysis = _analyze_frame(frame_bytes)
                _save_live_analysis(
                    db,
                    user_id,
                    source_type,
                    f"webcam:{webcam_index}",
                    analysis,
                    session_id,
                    captured_at,
                )
                last_saved_at = _persist_live_sample_if_needed(
                    db, user_id, session_id, analysis, captured_at, last_saved_at
                )

                yield b"--frame\r\n"
                yield b"Content-Type: image/jpeg\r\n\r\n"
                yield frame_bytes
                yield b"\r\n"
        except RuntimeError as exc:
            current_app.logger.exception("Unable to open webcam stream.")
            yield from _stream_error_frame(str(exc))

    return Response(
        stream_with_context(generate()),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@bp.get("/latest")
def get_latest_video_snapshot():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    with _live_analysis_lock:
        cached = _live_analysis_cache.get(user_id)
    snapshot = dict(cached) if cached else getattr(db, LIVE_ANALYSIS_COLLECTION).find_one({"user_id": user_id}, {"_id": 0})
    if not snapshot:
        return {"user_id": user_id, "snapshot": None}

    if snapshot.get("captured_at"):
        snapshot["captured_at"] = snapshot["captured_at"].isoformat()
    return {"user_id": user_id, "snapshot": snapshot}


@bp.post("/presage-test")
def run_presage_test():
    db = get_db()
    data = request.get_json(silent=True) or {}

    user_id = data.get("user_id") or request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    api_key = current_app.config.get("PRESAGE_API_KEY", "")
    project_id = current_app.config.get("PRESAGE_PROJECT_ID", "")
    api_url = current_app.config.get("PRESAGE_API_URL", "")
    if not api_key or not project_id or not api_url:
        return {"error": "Presage is not configured. Set PRESAGE_API_KEY, PRESAGE_PROJECT_ID, and PRESAGE_API_URL."}, 400

    saved_source = _get_saved_video_source(db, user_id)
    source_type = _normalize_source_type(data.get("source_type") or saved_source.get("source_type"))

    try:
        if source_type == "esp32":
            stream_url = _resolve_esp32_stream_url(db, user_id, data.get("stream_url"))
            if not stream_url:
                return {"error": "missing esp32 stream URL"}, 400
            frame_bytes = _read_one_esp32_frame(stream_url)
            source_label = stream_url
        else:
            webcam_index = saved_source.get("webcam_index", 0)
            if "webcam_index" in data:
                try:
                    webcam_index = int(data.get("webcam_index", 0))
                except (TypeError, ValueError):
                    webcam_index = 0
            frame_bytes = _read_one_webcam_frame(int(webcam_index))
            source_label = f"webcam:{webcam_index}"
    except (HTTPError, URLError, TimeoutError, OSError, RuntimeError) as exc:
        current_app.logger.exception("Unable to capture frame for Presage test.")
        return {"error": str(exc)}, 503

    local_metrics = _compute_local_frame_metrics(frame_bytes)
    presage_metrics = _call_presage(frame_bytes, local_metrics)
    if not presage_metrics:
        return {
            "ok": False,
            "user_id": user_id,
            "source_type": source_type,
            "source_label": source_label,
            "provider": local_metrics["raw_metrics"].get("provider", "opencv"),
            "fallback_metrics": local_metrics,
            "error": "Presage request failed or returned an unexpected payload.",
        }, 502

    return {
        "ok": True,
        "user_id": user_id,
        "source_type": source_type,
        "source_label": source_label,
        "provider": "presage",
        "focus_score": presage_metrics["focus_score"],
        "stress_score": presage_metrics["stress_score"],
        "confidence": presage_metrics["confidence"],
        "raw_presage_response": presage_metrics["raw_metrics"].get("presage_response"),
        "fallback_metrics": local_metrics,
        "tested_at": _now_utc().isoformat(),
    }
