from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import health

app = FastAPI(title="Loaf API")

# Configure CORS for localhost:3000 as per spec
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
