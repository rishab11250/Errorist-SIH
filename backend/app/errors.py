"""Shared API error envelope and request correlation IDs."""

from __future__ import annotations

import ipaddress
import logging
import re
from urllib.parse import urlsplit
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.settings import AuthSettings

logger = logging.getLogger(__name__)


def is_allowed_origin(origin: str, allowed_origins: tuple[str, ...]) -> bool:
    clean = origin.rstrip("/")
    if clean in allowed_origins:
        return True
    try:
        parsed = urlsplit(clean)
        host = (parsed.hostname or "").lower()
        if (
            host.endswith(".ngrok-free.app")
            or host.endswith(".ngrok-free.dev")
            or host.endswith(".ngrok.app")
            or host.endswith(".ngrok.dev")
            or host.endswith(".ngrok.io")
            or host.endswith(".trycloudflare.com")
            or host.endswith(".localtunnel.me")
        ):
            return True
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback:
            return True
    except Exception:
        pass
    return False


_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_ERROR_CODE = re.compile(r"^[a-z][a-z0-9_]*$")
_HTTP_DETAILS = {
    "authentication_required": "Sign in to continue.",
    "forbidden": "You do not have permission to perform this action.",
    "invalid_credentials": "Username or password is incorrect.",
    "no_text_extracted": "No usable text was extracted from the evidence image.",
    "ocr_payload_too_large": "The OCR payload contains too many words.",
    "scan_not_found": "Scan not found.",
    "session_expired": "Your session is no longer valid. Sign in again.",
    "too_many_attempts": "Too many failed login attempts. Please try again later.",
}


class AppError(Exception):
    """Expected application error safe to return to an API caller."""

    def __init__(self, status_code: int, error: str, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.error = error
        self.detail = detail


def error_body(error: str, detail: str, request_id: str) -> dict[str, str]:
    """Build the stable error response shape used by every API handler."""
    return {"error": error, "detail": detail, "request_id": request_id}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", uuid.uuid4().hex)


def _http_error(exc: StarletteHTTPException) -> tuple[str, str]:
    if isinstance(exc.detail, str) and _ERROR_CODE.fullmatch(exc.detail):
        return exc.detail, _HTTP_DETAILS.get(exc.detail, exc.detail.replace("_", " ").capitalize())
    return f"http_{exc.status_code}", str(exc.detail)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a bounded caller-provided or generated ID to request and response."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        supplied = request.headers.get("X-Request-ID", "")
        request_id = supplied if _REQUEST_ID.fullmatch(supplied) else uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class BrowserRequestSecurityMiddleware(BaseHTTPMiddleware):
    """Reject unsafe browser mutations before request bodies reach a route."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if request.url.path.startswith("/api/") and request.method in {"POST", "PATCH", "DELETE"}:
            settings = getattr(request.app.state, "auth_settings", AuthSettings())
            origin = request.headers.get("origin")
            if origin is not None and not is_allowed_origin(origin, settings.allowed_browser_origins):
                return JSONResponse(
                    status_code=403,
                    content=error_body(
                        "cross_origin_request",
                        "This browser origin is not allowed to modify application data.",
                        _request_id(request),
                    ),
                )
            if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
                return JSONResponse(
                    status_code=403,
                    content=error_body(
                        "cross_origin_request",
                        "Cross-site browser requests cannot modify application data.",
                        _request_id(request),
                    ),
                )
            content_length = request.headers.get("content-length")
            has_body = request.headers.get("transfer-encoding") is not None or (
                content_length is not None and content_length != "0"
            )
            if has_body:
                content_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
                if content_type.lower() != "application/json":
                    return JSONResponse(
                        status_code=415,
                        content=error_body(
                            "unsupported_media_type",
                            "JSON API requests must use Content-Type: application/json.",
                            _request_id(request),
                        ),
                    )
        return await call_next(request)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(exc.error, exc.detail, _request_id(request)),
    )


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    error, detail = _http_error(exc)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(error, detail, _request_id(request)),
        headers=exc.headers,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    messages = [
        f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=error_body("validation_error", "; ".join(messages), _request_id(request)),
    )


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = _request_id(request)
    logger.exception("Unhandled API error (request_id=%s)", request_id, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=error_body(
            "internal_error",
            "The request could not be completed.",
            request_id,
        ),
    )


def install_error_handlers(app: FastAPI) -> None:
    """Register the request-ID middleware and all shared exception handlers."""
    app.add_middleware(BrowserRequestSecurityMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)
