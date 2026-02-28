from __future__ import annotations

import base64
import json
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Blueprint, current_app, request

from ..db import get_db

bp = Blueprint("chat", __name__)


def _http_json(url: str, payload: dict, headers: dict[str, str]) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = Request(url, data=body, method="POST")
    for key, value in headers.items():
        req.add_header(key, value)

    with urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _build_transcription_form(audio_bytes: bytes, filename: str, model_id: str) -> tuple[bytes, str]:
    boundary = f"----DesktopPet{uuid.uuid4().hex}"
    lines: list[bytes] = [
        f"--{boundary}\r\n".encode("utf-8"),
        b'Content-Disposition: form-data; name="model_id"\r\n\r\n',
        f"{model_id}\r\n".encode("utf-8"),
        f"--{boundary}\r\n".encode("utf-8"),
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8"),
        b"Content-Type: application/octet-stream\r\n\r\n",
        audio_bytes,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    return b"".join(lines), f"multipart/form-data; boundary={boundary}"


def _transcribe_audio(audio_b64: str, filename: str) -> dict:
    api_key = current_app.config["ELEVEN_LABS_API_KEY"]
    if not api_key:
        raise RuntimeError("ELEVEN_LABS_API_KEY is not configured")

    audio_bytes = base64.b64decode(audio_b64)
    body, content_type = _build_transcription_form(
        audio_bytes,
        filename,
        current_app.config["ELEVEN_LABS_STT_MODEL"],
    )
    url = f'https://api.elevenlabs.io/v1/speech-to-text?{urlencode({"enable_logging": "true"})}'
    req = Request(url, data=body, method="POST")
    req.add_header("xi-api-key", api_key)
    req.add_header("Content-Type", content_type)

    with urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def _gemini_reply(message_text: str, system_prompt: str, model: str | None) -> str:
    api_key = current_app.config["GEMINI_API_KEY"]
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    payload = {
        "systemInstruction": {
            "parts": [
                {
                    "text": system_prompt,
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": message_text,
                    }
                ],
            }
        ],
        "generationConfig": {
            "maxOutputTokens": 512,
        },
    }
    data = _http_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model or current_app.config['GEMINI_MODEL']}:generateContent?key={api_key}",
        payload,
        {
            "content-type": "application/json",
        },
    )

    candidates = data.get("candidates", [])
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    text_chunks = [part.get("text", "") for part in parts if part.get("text")]
    return "".join(text_chunks).strip()


def _fallback_reply(message_text: str, pet_name: str) -> str:
    lowered = message_text.lower()
    if "focus" in lowered or "study" in lowered:
        return f"{pet_name} says: pick one task, silence distractions, and work in one short focused block."
    if "stress" in lowered or "overwhelmed" in lowered:
        return f"{pet_name} says: take one slow breath, reset for two minutes, then resume with a smaller step."
    if "water" in lowered or "drink" in lowered:
        return f"{pet_name} says: hydrate first, then get back to the next small task."
    return f"{pet_name} says: stay steady and take the next clear step."


def _tts_audio(text: str, voice_id: str | None) -> str:
    api_key = current_app.config["ELEVEN_LABS_API_KEY"]
    if not api_key:
        raise RuntimeError("ELEVEN_LABS_API_KEY is not configured")

    resolved_voice_id = voice_id or current_app.config["ELEVEN_LABS_VOICE_ID"]
    payload = {
        "text": text,
        "model_id": current_app.config["ELEVEN_LABS_TTS_MODEL"],
    }
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{resolved_voice_id}",
        data=body,
        method="POST",
    )
    req.add_header("xi-api-key", api_key)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "audio/mpeg")

    with urlopen(req, timeout=60) as response:
        return base64.b64encode(response.read()).decode("utf-8")


def _load_persona(db, user_id: str) -> dict:
    persona = db.pet_personas.find_one({"user_id": user_id}, {"_id": 0})
    if persona:
        return persona

    return {
        "user_id": user_id,
        "pet_name": "Buddy",
        "system_prompt": "You are a friendly desktop pet that gives concise, supportive replies.",
        "gemini_model": current_app.config["GEMINI_MODEL"],
        "voice_id": current_app.config["ELEVEN_LABS_VOICE_ID"],
    }


@bp.post("/persona")
def save_persona():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    pet_name = data.get("pet_name")
    system_prompt = data.get("system_prompt")
    if not user_id or not pet_name or not system_prompt:
        return {"error": "missing user_id, pet_name, or system_prompt"}, 400

    persona = {
        "user_id": user_id,
        "pet_name": pet_name,
        "system_prompt": system_prompt,
        "gemini_model": data.get("gemini_model", current_app.config["GEMINI_MODEL"]),
        "voice_id": data.get("voice_id", current_app.config["ELEVEN_LABS_VOICE_ID"]),
    }
    db.pet_personas.update_one({"user_id": user_id}, {"$set": persona}, upsert=True)
    return {"ok": True, "persona": persona}


@bp.get("/persona")
def get_persona():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400
    return _load_persona(db, user_id)


@bp.post("/message")
def send_message():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    persona = _load_persona(db, user_id)

    wake_name = data.get("wake_name")
    transcript = data.get("transcript", "").strip()
    if not transcript and data.get("audio_base64"):
        try:
            transcription = _transcribe_audio(
                data["audio_base64"],
                data.get("audio_filename", "utterance.wav"),
            )
        except (RuntimeError, ValueError, HTTPError, URLError) as exc:
            return {"error": f"transcription_failed: {exc}"}, 502
        transcript = transcription.get("text", "").strip()

    if not transcript:
        return {"error": "missing transcript or audio_base64"}, 400

    if wake_name and wake_name.lower() not in transcript.lower():
        return {"ok": False, "reason": "wake_name_not_detected"}

    try:
        reply_text = _gemini_reply(
            transcript,
            persona["system_prompt"],
            data.get("gemini_model") or persona.get("gemini_model"),
        )
    except (RuntimeError, HTTPError, URLError):
        reply_text = _fallback_reply(transcript, persona["pet_name"])

    conversation_id = data.get("conversation_id") or str(uuid.uuid4())
    db.chat_messages.insert_many(
        [
            {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": "user",
                "content": transcript,
            },
            {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": "assistant",
                "content": reply_text,
                "pet_name": persona["pet_name"],
            },
        ]
    )

    response = {
        "ok": True,
        "conversation_id": conversation_id,
        "pet_name": persona["pet_name"],
        "transcript": transcript,
        "reply_text": reply_text,
    }
    if data.get("include_audio"):
        try:
            response["reply_audio_base64"] = _tts_audio(reply_text, persona.get("voice_id"))
        except (RuntimeError, HTTPError, URLError) as exc:
            response["audio_error"] = str(exc)

    return response


@bp.post("/preview")
def preview_voice():
    db = get_db()
    data = request.get_json(force=True)

    user_id = data.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    persona = _load_persona(db, user_id)
    preview_text = str(data.get("text") or f"Hi, I'm {persona['pet_name']}. Ready to focus?")

    try:
        audio_base64 = _tts_audio(preview_text, data.get("voice_id") or persona.get("voice_id"))
    except (RuntimeError, HTTPError, URLError):
        return {"ok": True, "text": preview_text, "audio_base64": "", "preview_unavailable": True}

    return {"ok": True, "text": preview_text, "audio_base64": audio_base64, "preview_unavailable": False}


@bp.get("/stats")
def get_chat_stats():
    db = get_db()
    user_id = request.args.get("user_id")
    if not user_id:
        return {"error": "missing user_id"}, 400

    message_count = db.chat_messages.count_documents({"user_id": user_id})
    conversation_count = len(db.chat_messages.distinct("conversation_id", {"user_id": user_id}))
    latest_message = db.chat_messages.find_one(
        {"user_id": user_id},
        {"_id": 0},
        sort=[("_id", -1)],
    )

    return {
        "user_id": user_id,
        "message_count": message_count,
        "conversation_count": conversation_count,
        "latest_message": latest_message,
    }
