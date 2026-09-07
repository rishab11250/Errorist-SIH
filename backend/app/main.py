"""FastAPI application entrypoint."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.db import init_db
from app.dashboard_routes import router as dashboard_router
from app.models import HealthResponse
from app.report_routes import router as report_router
from app.rules_loader import get_active_rules, load_rules, set_active_rules
from app.scan_routes import router as scan_router

RULES_PATH = Path(__file__).resolve().parent / "rules.yaml"
DB_PATH = Path("lmpc.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load rules.yaml and initialise SQLite on startup."""
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

# CORS: allow local dev frontend on 3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan_router)
app.include_router(dashboard_router)
app.include_router(report_router)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe. Returns service version + rules version."""
    cfg = get_active_rules()
    return HealthResponse(status="ok", rules_version=cfg.version)


@app.get("/")
async def root() -> dict[str, str]:
    """Root index — placeholder for browser preview."""
    return {"service": "lmpc-backend", "version": __version__}
