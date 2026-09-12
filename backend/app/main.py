"""FastAPI application entrypoint."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import __version__, db
from app.auth.routes import router as auth_router
from app.dashboard_routes import router as dashboard_router
from app.db import init_db
from app.errors import install_error_handlers
from app.exports.routes import router as exports_router
from app.inspection_routes import router as inspection_router
from app.models import HealthResponse
from app.report_routes import router as report_router
from app.reviews.routes import router as reviews_router
from app.rules_loader import get_active_rules, load_rules, set_active_rules
from app.scan_routes import router as scan_router
from app.settings import AuthSettings
from app.users.routes import router as users_router

RULES_PATH = Path(__file__).resolve().parent / "rules.yaml"
DB_PATH = Path(os.environ.get("LMPC_DB_PATH", "lmpc.db"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load rules.yaml and initialise SQLite on startup."""
    app.state.auth_settings = AuthSettings.from_env()
    cfg = load_rules(RULES_PATH)
    set_active_rules(cfg)
    init_db(DB_PATH)
    yield


app = FastAPI(
    title="LMPC Compliance Checker",
    version=__version__,
    description="Check packaged-commodity labels against LMPC Rules 2011.",
    lifespan=lifespan,
)
install_error_handlers(app)

_auth_settings = AuthSettings.from_env()
_browser_origins = _auth_settings.allowed_browser_origins
_allow_origin_regex = (
    r"https?://([A-Za-z0-9._-]+\.(ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev|ngrok\.io|trycloudflare\.com|localtunnel\.me)|localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?"
    if _auth_settings.allow_tunnel_origins
    else None
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_browser_origins),
    allow_origin_regex=_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
)

app.include_router(scan_router)
app.include_router(inspection_router)
app.include_router(dashboard_router)
app.include_router(report_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(reviews_router)
app.include_router(exports_router)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Readiness probe that verifies the configured database is reachable."""
    cfg = get_active_rules()
    try:
        if db.SessionLocal is None:
            raise RuntimeError("DB not initialized")
        with db.SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except (SQLAlchemyError, RuntimeError):
        return JSONResponse(
            status_code=503,
            content=HealthResponse(status="degraded", rules_version=cfg.version).model_dump(),
        )
    return HealthResponse(status="ok", rules_version=cfg.version)


@app.get("/")
async def root() -> dict[str, str]:
    """Root index — placeholder for browser preview."""
    return {"service": "lmpc-backend", "version": __version__}
