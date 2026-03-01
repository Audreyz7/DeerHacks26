# Desktop Pet Backend API Reference

This file documents the current backend request shapes and the MongoDB collections used by the Flask routes.

## Base URL

- Local development: `http://localhost:5000`
- Route prefixes:
  - Water: `/api/water`
  - Focus / Stress: `/api/stress`
  - Breaks: `/api/breaks`
  - Encouragement: `/api/encouragement`
  - Chat: `/api/chat`
  - Video: `/api/video`

## Water

### Set drink-water schedule

- Method: `POST`
- Path: `/api/water/schedule`

```json
{
  "user_id": "audrey",
  "timezone": "America/Vancouver",
  "start_time": "09:00",
  "end_time": "22:00",
  "interval_min": 60,
  "enabled": true
}
```

Example response:

```json
{
  "ok": true,
  "schedule": {
    "user_id": "audrey",
    "timezone": "America/Vancouver",
    "start_time": "09:00",
    "end_time": "22:00",
    "interval_min": 60,
    "enabled": true
  }
}
```

### Get drink-water schedule

- Method: `GET`
- Path: `/api/water/schedule?user_id=audrey`

### Poll for drink-water reminder (ESP32)

- Method: `GET`
- Path: `/api/water/poll?user_id=audrey`

Example response when due:

```json
{
  "remind_now": true,
  "reason": "due",
  "server_time_utc": "2026-02-28T18:00:00+00:00",
  "payload": {
    "title": "Drink water",
    "message": "Time to hydrate!",
    "animation": "WATER_DROP"
  }
}
```

### Acknowledge drink-water reminder

- Method: `POST`
- Path: `/api/water/ack`

```json
{
  "user_id": "audrey"
}
```

## Focus / Stress

The backend expects the camera-side or edge-side integration to send processed Presage-derived metrics rather than raw video.

### Start a study session

- Method: `POST`
- Path: `/api/stress/session/start`

```json
{
  "user_id": "audrey",
  "study_label": "Math Revision",
  "allow_prompted_breaks": true,
  "signal_source": "presage"
}
```

Example response:

```json
{
  "ok": true,
  "session": {
    "session_id": "4fd31b3c-7b3d-4cce-90cf-c7c63e16d9eb",
    "user_id": "audrey",
    "started_at": "2026-02-28T18:00:00+00:00",
    "ended_at": null,
    "status": "active",
    "study_label": "Math Revision",
    "allow_prompted_breaks": true,
    "signal_source": "presage"
  }
}
```

### Ingest a focus/stress sample

- Method: `POST`
- Path: `/api/stress/sample`

```json
{
  "session_id": "4fd31b3c-7b3d-4cce-90cf-c7c63e16d9eb",
  "captured_at": "2026-02-28T18:05:00Z",
  "focus_score": 0.81,
  "stress_score": 0.33,
  "confidence": 0.92,
  "signal_source": "presage",
  "raw_metrics": {
    "attention_index": 0.81,
    "stress_index": 0.33,
    "microexpression_count": 4
  }
}
```

### End a study session and generate report

- Method: `POST`
- Path: `/api/stress/session/end`

```json
{
  "session_id": "4fd31b3c-7b3d-4cce-90cf-c7c63e16d9eb"
}
```

Example response:

```json
{
  "ok": true,
  "session_id": "4fd31b3c-7b3d-4cce-90cf-c7c63e16d9eb",
  "ended_at": "2026-02-28T19:00:00+00:00",
  "report": {
    "sample_count": 12,
    "average_focus": 0.744,
    "average_stress": 0.381,
    "peak_stress": 0.71,
    "lowest_focus": 0.52,
    "graph_points": [
      {
        "timestamp": "2026-02-28T18:05:00+00:00",
        "focus_score": 0.81,
        "stress_score": 0.33
      }
    ]
  }
}
```

### Get a focus report for the frontend graph

- Method: `GET`
- Path: `/api/stress/report/4fd31b3c-7b3d-4cce-90cf-c7c63e16d9eb`

## Breaks

### Start a Pomodoro timer

- Method: `POST`
- Path: `/api/breaks/pomodoro/start`

```json
{
  "user_id": "audrey",
  "focus_minutes": 25,
  "break_minutes": 5,
  "cycles": 4
}
```

### Poll Pomodoro status (ESP32)

- Method: `GET`
- Path: `/api/breaks/pomodoro/status?session_id=0d0b9f9c-7f85-48f0-a8bb-6c6f8ea1fd9b`

Example response:

```json
{
  "session_id": "0d0b9f9c-7f85-48f0-a8bb-6c6f8ea1fd9b",
  "phase": "focus",
  "cycle_index": 1,
  "seconds_remaining": 1420,
  "server_time_utc": "2026-02-28T18:10:00+00:00",
  "payload": {
    "title": "Pomodoro",
    "message": "Focus now",
    "screen": "POMODORO_TIMER"
  }
}
```

### Enable or disable stress-prompted breaks

- Method: `POST`
- Path: `/api/breaks/preferences/stress-prompts`

```json
{
  "user_id": "audrey",
  "enabled": true
}
```

### Poll for queued break prompts

- Method: `GET`
- Path: `/api/breaks/prompt/poll?user_id=audrey`

Example response:

```json
{
  "show_prompt": true,
  "prompt_id": "2f67ff8b-cd46-45f0-b0e9-7720ad0fd8a4",
  "type": "HIGH_STRESS_BREAK",
  "reason": "High stress detected for 10+ minutes",
  "created_at": "2026-02-28T18:45:00+00:00",
  "payload": {
    "title": "Break time",
    "message": "Your stress has stayed high. Take a short break.",
    "screen": "BREAK_PROMPT"
  }
}
```

### Acknowledge a queued break prompt

- Method: `POST`
- Path: `/api/breaks/prompt/ack`

```json
{
  "prompt_id": "2f67ff8b-cd46-45f0-b0e9-7720ad0fd8a4",
  "acknowledged": true
}
```

## Encouragement

### Get an encouragement message

- Method: `POST`
- Path: `/api/encouragement/message`

```json
{
  "user_id": "audrey",
  "focus_score": 0.48,
  "stress_score": 0.68
}
```

## Chat

### Save a custom pet personality

- Method: `POST`
- Path: `/api/chat/persona`

```json
{
  "user_id": "audrey",
  "pet_name": "Nova",
  "system_prompt": "You are Nova, a playful and calm desktop pet who gives concise answers.",
  "gemini_model": "gemini-3-pro-preview",
  "voice_id": "21m00Tcm4TlvDq8ikWAM"
}
```

### Get the saved personality

- Method: `GET`
- Path: `/api/chat/persona?user_id=audrey`

### Send a text chat message

- Method: `POST`
- Path: `/api/chat/message`

```json
{
  "user_id": "audrey",
  "conversation_id": "49d2d6f2-3d4f-4f8a-b14f-2090e22eddbc",
  "wake_name": "Nova",
  "transcript": "Nova, can you help me focus for the next hour?",
  "include_audio": true
}
```

### Send spoken audio for STT -> Gemini -> TTS

- Method: `POST`
- Path: `/api/chat/message`

```json
{
  "user_id": "audrey",
  "wake_name": "Nova",
  "audio_filename": "utterance.wav",
  "audio_base64": "<base64-encoded-wav-or-mp3>",
  "include_audio": true
}
```

Example response:

```json
{
  "ok": true,
  "conversation_id": "49d2d6f2-3d4f-4f8a-b14f-2090e22eddbc",
  "pet_name": "Nova",
  "transcript": "Nova, can you help me focus for the next hour?",
  "reply_text": "Absolutely. Start with one clear goal, silence distractions, and work in one focused block.",
  "reply_audio_base64": "<base64-encoded-mp3>"
}
```

## Video

### Save preferred video source

- Method: `POST`
- Path: `/api/video/source`

```json
{
  "user_id": "audrey",
  "source_type": "webcam",
  "esp32_stream_url": "http://192.168.1.20:81/stream",
  "webcam_index": 0
}
```

### Get preferred video source

- Method: `GET`
- Path: `/api/video/source?user_id=audrey`

### Open analyzed live video stream

- Method: `GET`
- Path: `/api/video/stream?user_id=audrey&source_type=webcam`

### Get latest analyzed video snapshot

- Method: `GET`
- Path: `/api/video/latest?user_id=audrey`

### Run a one-frame Presage test

- Method: `POST`
- Path: `/api/video/presage-test`

```json
{
  "user_id": "audrey",
  "source_type": "webcam",
  "webcam_index": 0
}
```

## MongoDB Collection Schema Map

These are minimal field sets based on the current code. MongoDB will allow extra fields, but these are the ones the backend reads and writes now.

### `water_schedules`

```json
{
  "user_id": "string",
  "timezone": "string",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "interval_min": "int",
  "enabled": "bool",
  "last_triggered_at": "datetime|null"
}
```

### `water_events`

```json
{
  "user_id": "string",
  "at_utc": "datetime",
  "type": "REMINDER_SENT|DEVICE_ACK"
}
```

### `focus_sessions`

```json
{
  "session_id": "uuid string",
  "user_id": "string",
  "started_at": "datetime",
  "ended_at": "datetime|null",
  "status": "active|completed",
  "study_label": "string",
  "allow_prompted_breaks": "bool",
  "signal_source": "string"
}
```

### `focus_samples`

```json
{
  "sample_id": "uuid string",
  "session_id": "uuid string",
  "user_id": "string",
  "captured_at": "datetime",
  "focus_score": "float 0..1",
  "stress_score": "float 0..1",
  "confidence": "float",
  "raw_metrics": "object",
  "signal_source": "string"
}
```

### `focus_reports`

```json
{
  "session_id": "uuid string",
  "user_id": "string",
  "generated_at": "datetime",
  "report": {
    "sample_count": "int",
    "average_focus": "float",
    "average_stress": "float",
    "peak_stress": "float",
    "lowest_focus": "float",
    "graph_points": [
      {
        "timestamp": "ISO datetime string",
        "focus_score": "float",
        "stress_score": "float"
      }
    ]
  }
}
```

### `break_preferences`

```json
{
  "user_id": "string",
  "stress_prompt_enabled": "bool",
  "updated_at": "datetime"
}
```

### `break_prompts`

```json
{
  "prompt_id": "uuid string",
  "user_id": "string",
  "session_id": "uuid string",
  "type": "HIGH_STRESS_BREAK",
  "reason": "string",
  "created_at": "datetime",
  "resolved_at": "datetime|null",
  "acknowledged": "bool|null",
  "payload": {
    "title": "string",
    "message": "string",
    "screen": "string"
  }
}
```

### `pomodoro_sessions`

```json
{
  "session_id": "uuid string",
  "user_id": "string",
  "focus_minutes": "int",
  "break_minutes": "int",
  "cycles": "int",
  "started_at": "datetime",
  "ended_at": "datetime|null",
  "status": "active|completed"
}
```

### `encouragement_events`

```json
{
  "user_id": "string",
  "stress_score": "float",
  "focus_score": "float",
  "message": "string"
}
```

### `pet_personas`

```json
{
  "user_id": "string",
  "pet_name": "string",
  "system_prompt": "string",
  "gemini_model": "string",
  "voice_id": "string"
}
```

### `chat_messages`

```json
{
  "conversation_id": "uuid string",
  "user_id": "string",
  "role": "user|assistant",
  "content": "string",
  "pet_name": "string|null"
}
```

## Recommended Mongo Indexes

These are not created automatically yet, but they are the right next indexes for performance.

- `water_schedules.user_id` unique
- `focus_sessions.session_id` unique
- `focus_samples.session_id`
- `focus_reports.session_id` unique
- `break_preferences.user_id` unique
- `break_prompts.user_id`
- `break_prompts.prompt_id` unique
- `pomodoro_sessions.session_id` unique
- `pet_personas.user_id` unique
- `chat_messages.conversation_id`
