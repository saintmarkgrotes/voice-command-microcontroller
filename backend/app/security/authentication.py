"""Authentication (who are you?) and authorization (what may you do?).

- Users come from the AUTH_USERS environment variable (password HASHES only).
- Login exchanges a username and password for a short-lived signed token (JWT, HS256).
- Every protected request must carry:  Authorization: Bearer <token>
- Roles: "admin" may control devices and read status; "viewer" may only read status.

Tokens are stateless. There is no server-side logout: the app deletes its copy
and the token expires on its own. Removing a user from AUTH_USERS (and restarting)
invalidates that user's tokens immediately.
"""

import time
import uuid
from dataclasses import dataclass
from functools import wraps

import jwt
from flask import current_app, g, request
from werkzeug.security import check_password_hash

from app.errors import ForbiddenError, UnauthorizedError

ISSUER = "smart-home-backend"
AUDIENCE = "smart-home-mobile"
ALGORITHM = "HS256"
ROLES = ("admin", "viewer")

MIN_SECRET_LENGTH = 32
MAX_USERNAME_LENGTH = 64
MAX_PASSWORD_LENGTH = 128
MAX_TOKEN_LENGTH = 2048


class AuthConfigError(Exception):
    """Authentication is misconfigured. Messages never contain secrets or hashes."""


@dataclass(frozen=True)
class User:
    username: str
    role: str
    password_hash: str


@dataclass(frozen=True)
class AuthenticatedUser:
    username: str
    role: str


def parse_users(raw):
    """Parse 'alice|admin|<hash>;bob|viewer|<hash>' into {lowercase name: User}."""
    users = {}
    for entry in (raw or "").split(";"):
        entry = entry.strip()
        if not entry:
            continue
        parts = [part.strip() for part in entry.split("|")]
        if len(parts) != 3:
            raise AuthConfigError(
                "Each AUTH_USERS entry must look like username|role|password_hash."
            )
        username, role, password_hash = parts
        if not username or len(username) > MAX_USERNAME_LENGTH:
            raise AuthConfigError("A username in AUTH_USERS is empty or too long.")
        if role not in ROLES:
            raise AuthConfigError(f"User '{username}' has an unknown role.")
        if password_hash.count("$") < 2:
            raise AuthConfigError(f"User '{username}' has an invalid password hash.")
        key = username.lower()
        if key in users:
            raise AuthConfigError(f"User '{username}' is listed twice.")
        users[key] = User(username, role, password_hash)

    if not users:
        raise AuthConfigError("AUTH_USERS defines no users.")
    return users


def _unauthorized():
    # One generic error for every failure reason: nothing useful for an attacker.
    return UnauthorizedError(headers={"WWW-Authenticate": "Bearer"})


class AuthService:
    def __init__(self, secret_key, users, ttl_seconds=3600, clock=time.time):
        if not isinstance(secret_key, str) or len(secret_key) < MIN_SECRET_LENGTH:
            raise AuthConfigError(
                f"JWT_SECRET_KEY must be at least {MIN_SECRET_LENGTH} characters."
            )
        if not users:
            raise AuthConfigError("AUTH_USERS defines no users.")
        if ttl_seconds < 1:
            raise AuthConfigError("ACCESS_TOKEN_TTL_SECONDS must be at least 1.")

        self._secret = secret_key
        self._users = users
        self._ttl = ttl_seconds
        self._clock = clock
        # Unknown usernames are checked against a real hash of the same cost, so
        # response time does not reveal whether a username exists.
        self._dummy_hash = next(iter(users.values())).password_hash

    def __repr__(self):
        return "<AuthService secret=[hidden]>"

    @property
    def ttl_seconds(self):
        return self._ttl

    def authenticate(self, username, password):
        """Return an AuthenticatedUser for valid credentials, otherwise None."""
        user = self._users.get(username.strip().lower())
        valid = check_password_hash(
            user.password_hash if user else self._dummy_hash, password
        )
        if user is not None and valid:
            return AuthenticatedUser(user.username, user.role)
        return None

    def issue_token(self, user):
        now = int(self._clock())
        claims = {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": user.username,
            "role": user.role,
            "iat": now,
            "exp": now + self._ttl,
            "jti": uuid.uuid4().hex,
        }
        return jwt.encode(claims, self._secret, algorithm=ALGORITHM)

    def verify_token(self, token):
        """Return the AuthenticatedUser for a valid token or raise UnauthorizedError."""
        if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LENGTH:
            raise _unauthorized()
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[ALGORITHM],  # fixed list: "none" and other algorithms are refused
                audience=AUDIENCE,
                issuer=ISSUER,
                options={"require": ["exp", "iat", "sub", "role", "jti"]},
            )
        except jwt.InvalidTokenError:
            raise _unauthorized() from None

        subject, role = claims.get("sub"), claims.get("role")
        user = self._users.get(subject.lower()) if isinstance(subject, str) else None
        # The user must still exist with the same role (removals/changes apply at once).
        if user is None or role not in ROLES or user.role != role:
            raise _unauthorized()
        return AuthenticatedUser(user.username, user.role)


def _bearer_token():
    header = request.headers.get("Authorization", "")
    parts = header.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise _unauthorized()
    return parts[1]


def require_auth(*roles):
    """Route decorator. With no roles, any valid user may pass.

    Put it directly under the route decorator:
        @bp.post("/x")
        @require_auth("admin")
        def view(): ...
    Sets g.current_user to the AuthenticatedUser.
    """
    allowed = set(roles) if roles else set(ROLES)

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            user = current_app.extensions["auth_service"].verify_token(_bearer_token())
            if user.role not in allowed:
                raise ForbiddenError()
            g.current_user = user
            return view(*args, **kwargs)

        return wrapper

    return decorator