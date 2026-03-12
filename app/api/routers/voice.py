"""
Voice API — ElevenLabs TTS for specialist responses.
Voice mode: speak with a single consultant; responses can be played as audio.
"""

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import httpx

from app.personas import SPECIALISTS

router = APIRouter(prefix="/voice", tags=["voice"])

# Project root (parent of app/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# Voice-call module: one voice per specialist (user-provided IDs)
VOICE_CALL_VOICE_IDS = {
    "legal": "9IzcwKmvwJcw58h3KnlH",
    "financial": "UgBBYS2sOqTuMpoF3BR0",
    "technical": "EXAVITQu4vr4xnSDxMaL",
    "hydroelectric": "EXAVITQu4vr4xnSDxMaL",  # reuse technical
    "bd": "JBFqnCBsd6RMkjVDRZzb",
    "tax": "9IzcwKmvwJcw58h3KnlH",  # reuse first
}

# Default ElevenLabs voice IDs per specialist (when not in voice-call mode)
VOICE_IDS = {
    "legal": "pNInz6obpgDQGcFmaJgB",
    "financial": "21m00Tcm4TlvDq8ikWAM",
    "technical": "ErXwobaYiN019PkySvjV",
    "hydroelectric": "ErXwobaYiN019PkySvjV",  # reuse technical
    "bd": "TX3LPaxmHKxFdv7VOQHJ",
    "tax": "EXAVITQu4vr4xnSDxMaL",
}

MAX_TEXT_LENGTH = 500


def _get_elevenlabs_key() -> str | None:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        return key
    try:
        from app.core.config import settings
        if settings.elevenlabs_api_key:
            return settings.elevenlabs_api_key
    except Exception:
        pass
    for name in [".env", ".env.local"]:
        env_path = _PROJECT_ROOT / name
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    if line.strip().startswith("ELEVENLABS_API_KEY="):
                        val = line.split("=", 1)[1].strip().strip('"\'')
                        if val and not val.startswith("#"):
                            return val
    return None


class VoiceRequest(BaseModel):
    specialist_id: str
    text: str
    voice_id: str | None = None   # Override to use specific voice (e.g. voice-call module)
    speed: float | None = None    # 0.7–1.2, faster when > 1.0
    summarize_for_speech: bool = False  # When True (e.g. voice call), speak a short summary instead of full text


def _get_openai_key() -> str | None:
    for env_key in ("OPENAI_API_KEY", "OPEN_API_KEY"):
        key = os.environ.get(env_key)
        if key:
            return key
    try:
        from app.core.config import settings
        if getattr(settings, "openai_api_key", None):
            return settings.openai_api_key
        if getattr(settings, "open_api_key", None):
            return settings.open_api_key
    except Exception:
        pass
    return None


def _summarize_for_speech(text: str) -> str:
    """Return one short sentence for TTS — like a quick reply in a real voice conversation."""
    openai_key = _get_openai_key()
    if not openai_key or len(text.strip()) < 60:
        return (text.strip()[:150] + ("..." if len(text) > 150 else "")) or text
    try:
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=40,
            messages=[
                {"role": "system", "content": "You turn long advisor text into exactly ONE short sentence for a voice call. Like someone talking on the phone: one sentence only, no more. Examples: 'I'd flag the compliance risk and get legal to take a look.' 'Runway impact is my main worry.' 'Doable in a few weeks if we scope it down.' Output nothing but that one sentence."},
                {"role": "user", "content": text.strip()[:2000]},
            ],
        )
        out = (r.choices[0].message.content or "").strip().strip('"\'')
        return out[:180] if out else text.strip()[:180]
    except Exception:
        return text.strip()[:180]


@router.get("/available")
def voice_available():
    """Return whether voice is available (ElevenLabs key configured)."""
    return {"available": bool(_get_elevenlabs_key())}


@router.post("", response_class=Response)
def text_to_speech(req: VoiceRequest):
    """Convert specialist response text to speech. Returns audio/mpeg. If summarize_for_speech=True, speaks a short summary."""
    if req.specialist_id not in SPECIALISTS:
        raise HTTPException(status_code=400, detail=f"Unknown specialist: {req.specialist_id}")
    key = _get_elevenlabs_key()
    if not key:
        raise HTTPException(status_code=503, detail="ElevenLabs API key not configured")

    raw = (req.text or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    text = _summarize_for_speech(raw) if req.summarize_for_speech else raw[:MAX_TEXT_LENGTH]
    if not text:
        text = raw[:MAX_TEXT_LENGTH]

    if req.voice_id:
        voice_id = req.voice_id
    elif req.summarize_for_speech:
        voice_id = VOICE_CALL_VOICE_IDS.get(req.specialist_id) or VOICE_IDS.get(req.specialist_id, VOICE_IDS["legal"])
    else:
        voice_id = VOICE_IDS.get(req.specialist_id, VOICE_IDS["legal"])
    speed = 1.0 if req.speed is None else max(0.7, min(1.2, float(req.speed)))

    body: dict = {
        "text": text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {"speed": speed},
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json=body,
            )
        if r.status_code != 200:
            raise HTTPException(
                status_code=503,
                detail=f"ElevenLabs error: {r.text[:100] if r.text else r.status_code}",
            )
        return Response(content=r.content, media_type="audio/mpeg")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Voice service error: {str(e)[:80]}")
