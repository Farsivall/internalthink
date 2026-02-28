from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import health, projects, context, chat

app = FastAPI(title="InternalThink / Loaf API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(projects.router, prefix="/api/projects")
app.include_router(context.router, prefix="/api/context")
app.include_router(chat.router, prefix="/api")
