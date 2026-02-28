import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB = os.getenv("MONGO_DB", "desktoppet")
    DEFAULT_TIMEZONE = os.getenv("DEFAULT_TIMEZONE", "America/Vancouver")

    # Companion chat (Gemini + ElevenLabs)
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-pro-preview")
    ELEVEN_LABS_API_KEY = os.getenv("ELEVEN_LABS_API_KEY", "")
    ELEVEN_LABS_VOICE_ID = os.getenv("ELEVEN_LABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    ELEVEN_LABS_STT_MODEL = os.getenv("ELEVEN_LABS_STT_MODEL", "scribe_v1")
    ELEVEN_LABS_TTS_MODEL = os.getenv("ELEVEN_LABS_TTS_MODEL", "eleven_multilingual_v2")

    # Presage SmartSpectra integration keys.
    # The backend stores and aggregates the resulting metrics, while
    # measurement itself should happen on the device/edge integration.
    PRESAGE_API_KEY = os.getenv("PRESAGE_API_KEY", "")
    PRESAGE_PROJECT_ID = os.getenv("PRESAGE_PROJECT_ID", "")
