"""FastAPI application entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.models import HealthResponse

app = FastAPI(
    title="LMPC Compliance Checker",
    version=__version__,
    description="Check packaged-commodity labels against LMPC Rules 2011.",
)

# CORS: allow local dev frontend on 3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe. Returns service version."""
    return HealthResponse(status="ok", rules_version="not-loaded")


@app.get("/")
async def root() -> dict[str, str]:
    """Root index — placeholder for browser preview."""
    return {"service": "lmpc-backend", "version": __version__}
