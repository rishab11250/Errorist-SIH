"""Shared API error envelope and request correlation IDs."""

from __future__ import annotations

import logging
import re
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger(__name__)

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_ERROR_CODE = re.compile(r"^[a-z][a-z0-9_]*$")
_HTTP_DETAILS = {
    "authentication_required": "Sign in to continue.",
    "forbidden": "You do not have permission to perform this action.",
    "invalid_credentials": "Username or password is incorrect.",
    "no_text_extracted": "No usable text was extracted from the evidence image.",
    "scan_not_found": "Scan not found.",
    "session_expired": "Your session is no longer valid. Sign in again.",
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
    app.add_middleware(RequestIDMiddleware)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)
