import pytest

from app import create_app
from app.config import Config


class ConfigForTests(Config):
    TESTING = True
    DEBUG = False
    APP_ENV = "testing"
    # Fixed key for tests only. It protects nothing and is not a real secret.
    AES_SECRET_KEY = "0123456789abcdef" * 4


@pytest.fixture
def app():
    return create_app(ConfigForTests)


@pytest.fixture
def client(app):
    return app.test_client()