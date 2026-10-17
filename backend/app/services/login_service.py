"""Login policy: lockout, credential checks and token creation."""

from app.errors import RateLimitedError, UnauthorizedError


class LoginService:
    def __init__(self, auth_service, limiter):
        self._auth = auth_service
        self._limiter = limiter

    def login(self, username, password, client_ip):
        ip_key = f"ip:{client_ip}"
        user_key = f"user:{username.strip().lower()}"

        # Refuse before checking the password, so locked-out clients cannot keep guessing.
        for key in (ip_key, user_key):
            wait = self._limiter.retry_after(key)
            if wait:
                raise RateLimitedError(
                    "Too many login attempts. Please try again later.",
                    headers={"Retry-After": str(wait)},
                )

        user = self._auth.authenticate(username, password)
        if user is None:
            self._limiter.hit(ip_key)
            self._limiter.hit(user_key)
            # Unknown users and wrong passwords must have the same response.
            raise UnauthorizedError(
                "Invalid username or password.",
                code="INVALID_CREDENTIALS",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # A successful login must not clear other guesses from this IP.
        self._limiter.reset(user_key)
        return {
            "access_token": self._auth.issue_token(user),
            "token_type": "Bearer",
            "expires_in": self._auth.ttl_seconds,
            "user": {"username": user.username, "role": user.role},
        }
