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

    # 64 hex characters. Secret: only ever read from the environment.
    AES_SECRET_KEY = os.getenv("AES_SECRET_KEY", "")