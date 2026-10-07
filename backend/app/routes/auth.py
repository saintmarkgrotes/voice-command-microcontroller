from flask import Blueprint, current_app, jsonify, request

from app.errors import RateLimitedError, UnauthorizedError
from app.utils.validators import validate_login_request

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True)
    username, password = validate_login_request(data)

    auth_service = current_app.extensions["auth_service"]
    limiter = current_app.extensions["login_limiter"]

    ip_key = f"ip:{request.remote_addr}"
    user_key = f"user:{username.strip().lower()}"

    # Refuse before checking the password, so a locked-out client cannot keep guessing.
    for key in (ip_key, user_key):
        wait = limiter.retry_after(key)
        if wait:
            raise RateLimitedError(
                "Too many login attempts. Please try again later.",
                headers={"Retry-After": str(wait)},
            )

    user = auth_service.authenticate(username, password)
    if user is None:
        limiter.hit(ip_key)
        limiter.hit(user_key)
        # Same message for "unknown user" and "wrong password".
        raise UnauthorizedError(
            "Invalid username or password.",
            code="INVALID_CREDENTIALS",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Reset only the username counter: an attacker must not clear the IP counter
    # by logging in to their own account between guesses.
    limiter.reset(user_key)

    response = jsonify(
        {
            "success": True,
            "access_token": auth_service.issue_token(user),
            "token_type": "Bearer",
            "expires_in": auth_service.ttl_seconds,
            "user": {"username": user.username, "role": user.role},
        }
    )
    response.headers["Cache-Control"] = "no-store"
    return response, 200