import pytest
from werkzeug.security import generate_password_hash

from app import create_app
from app.config import Config
from app.security.authentication import AuthenticatedUser

ADMIN_PASSWORD = "admin-test-password"
VIEWER_PASSWORD = "viewer-test-password"

# Fast, low-cost hashes: tests only. Real users get strong hashes from scripts/create_user.py.
_ADMIN_HASH = generate_password_hash(ADMIN_PASSWORD, method="pbkdf2:sha256:1000")
_VIEWER_HASH = generate_password_hash(VIEWER_PASSWORD, method="pbkdf2:sha256:1000")


class ConfigForTests(Config):
    TESTING = True
    DEBUG = False
    APP_ENV = "testing"
    # Fixed test secrets. They protect nothing and are not real secrets.
    AES_SECRET_KEY = "0123456789abcdef" * 4
    JWT_SECRET_KEY = "test-jwt-secret-key-0123456789-abcdefghij"
    AUTH_USERS = f"admin|admin|{_ADMIN_HASH};viewer|viewer|{_VIEWER_HASH}"
    ACCESS_TOKEN_TTL_SECONDS = 3600


@pytest.fixture
def app_factory():
    """Build a fresh app, optionally overriding config values."""

    def make(**overrides):
        config = type("ConfigWithOverrides", (ConfigForTests,), overrides)
        return create_app(config)

    return make


@pytest.fixture
def app(app_factory):
    return app_factory()


def _client_with_token(app, username, role):
    token = app.extensions["auth_service"].issue_token(
        AuthenticatedUser(username, role)
    )
    client = app.test_client()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return client


@pytest.fixture
def client(app):
    """Signed in as an admin (may control devices and read status)."""
    return _client_with_token(app, "admin", "admin")


@pytest.fixture
def viewer_client(app):
    """Signed in as a viewer (may only read status)."""
    return _client_with_token(app, "viewer", "viewer")


@pytest.fixture
def anonymous_client(app):
    """Not signed in."""
    return app.test_client()


@pytest.fixture
def credentials():
    return {
        "admin": ("admin", ADMIN_PASSWORD),
        "viewer": ("viewer", VIEWER_PASSWORD),
    }