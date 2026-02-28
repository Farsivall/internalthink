import logging
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root before any app imports
_root = Path(__file__).resolve().parent.parent
_env = _root / ".env"
if _env.exists():
    load_dotenv(_env)
load_dotenv()

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routers import health, projects, context, chat, chat_messages, voice, decision

logger = logging.getLogger(__name__)
app = FastAPI(title="InternalThink / Loaf API")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return JSON instead of 500 HTML."""
    if isinstance(exc, (HTTPException, RequestValidationError)):
        raise exc
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)[:200]},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177", "http://localhost:5178", "http://localhost:5179",
        "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175", "http://127.0.0.1:5176", "http://127.0.0.1:5177", "http://127.0.0.1:5178", "http://127.0.0.1:5179",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(projects.router, prefix="/api/projects")
app.include_router(context.router, prefix="/api/context")
app.include_router(chat.router, prefix="/api")
app.include_router(chat_messages.router, prefix="/api")
app.include_router(voice.router, prefix="/api")
app.include_router(decision.router, prefix="/api/projects")
