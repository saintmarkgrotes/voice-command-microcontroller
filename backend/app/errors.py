"""Consistent JSON errors matching docs/api.md.

Every error response has the shape:
    {"success": false, "error": {"code": "...", "message": "..."}}

Services and routes RAISE ApiError subclasses; the handlers registered here
turn them into responses. Internal details are logged, never returned.
"""

from flask import jsonify
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    """Base class for errors we deliberately return to the client."""

    status_code = 500
    code = "INTERNAL_ERROR"
    message = "An internal error occurred."

    def __init__(self, message=None, *, code=None, status_code=None):
        self.message = message or self.message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        super().__init__(self.message)


class BadRequestError(ApiError):
    status_code = 400
    code = "INVALID_REQUEST"
    message = "The request is invalid."


class UnauthorizedError(ApiError):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Authentication is required."


class ForbiddenError(ApiError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to do that."


class NotFoundError(ApiError):
    status_code = 404
    code = "NOT_FOUND"
    message = "Resource not found."


class ConflictError(ApiError):
    status_code = 409
    code = "CONFLICT"
    message = "The request conflicts with the current state."


class RateLimitedError(ApiError):
    status_code = 429
    code = "RATE_LIMITED"
    message = "Too many requests."


class ServiceUnavailableError(ApiError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    message = "The service is temporarily unavailable."


# Framework-generated HTTP errors (unknown route, wrong method, ...) -> contract codes.
_HTTP_STATUS_TO_CODE = {
    400: "INVALID_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    415: "INVALID_REQUEST",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
}

# Fixed messages, so framework error text is never echoed back to clients.
_CODE_TO_MESSAGE = {
    "INVALID_REQUEST": "The request is invalid.",
    "UNAUTHORIZED": "Authentication is required.",
    "FORBIDDEN": "You do not have permission to do that.",
    "NOT_FOUND": "Resource not found.",
    "METHOD_NOT_ALLOWED": "Method not allowed for this resource.",
    "CONFLICT": "The request conflicts with the current state.",
    "RATE_LIMITED": "Too many requests.",
    "SERVICE_UNAVAILABLE": "The service is temporarily unavailable.",
    "INTERNAL_ERROR": "An internal error occurred.",
}


def error_response(code, message, status_code):
    body = {"success": False, "error": {"code": code, "message": message}}
    return jsonify(body), status_code


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(error):
        return error_response(error.code, error.message, error.status_code)

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        status = error.code or 500
        default = "INTERNAL_ERROR" if status >= 500 else "INVALID_REQUEST"
        code = _HTTP_STATUS_TO_CODE.get(status, default)
        return error_response(code, _CODE_TO_MESSAGE[code], status)

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        # Full details go to the server log only, never to the client.
        app.logger.exception("Unhandled exception: %s", error)
        return error_response(
            "INTERNAL_ERROR", _CODE_TO_MESSAGE["INTERNAL_ERROR"], 500
        )