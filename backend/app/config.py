import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _parse_origins(raw):
    """Turn 'a,b,c' into ['a', 'b', 'c']; '*' stays as '*'."""
    if raw.strip() == "*":
        return "*"
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Config:
    APP_ENV = os.getenv("APP_ENV", "production")
    DEBUG = APP_ENV == "development"
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "5000"))
    CORS_ORIGINS = _parse_origins(os.getenv("CORS_ORIGINS", "*"))

    # Commands are tiny; reject oversized bodies (Flask answers 413).
    MAX_CONTENT_LENGTH = 4096

    # Secrets: only ever read from the environment.
    AES_SECRET_KEY = os.getenv("AES_SECRET_KEY", "")  # 64 hex characters
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")  # 32+ characters, different from the AES key

    # Users: "username|role|password_hash" entries separated by ";".
    # Create entries with: python -m scripts.create_user
    AUTH_USERS = os.getenv("AUTH_USERS", "")
    ACCESS_TOKEN_TTL_SECONDS = int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "3600"))

    # Rate limits (per client IP / username for login, per user for commands).
    LOGIN_MAX_FAILURES = int(os.getenv("LOGIN_MAX_FAILURES", "5"))
    LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "300"))
    COMMAND_RATE_LIMIT = int(os.getenv("COMMAND_RATE_LIMIT", "30"))
    COMMAND_RATE_WINDOW_SECONDS = int(os.getenv("COMMAND_RATE_WINDOW_SECONDS", "60"))