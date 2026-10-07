from flask import Flask
from flask_cors import CORS

from app.config import Config
from app.errors import register_error_handlers
from app.routes.auth import auth_bp
from app.routes.commands import commands_bp
from app.routes.health import health_bp
from app.routes.status import status_bp
from app.security.authentication import AuthConfigError, AuthService, parse_users
from app.security.rate_limit import RateLimiter
from app.services.command_service import CommandService
from app.services.device_state_service import DeviceStateService
from app.services.encryption_service import EncryptionService, InvalidKeyError


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Fail fast: never run with missing or malformed security configuration.
    try:
        encryption_service = EncryptionService.from_hex_key(
            app.config["AES_SECRET_KEY"]
        )
    except InvalidKeyError as error:
        raise RuntimeError(f"Encryption is not configured: {error}") from None

    try:
        if app.config["JWT_SECRET_KEY"] == app.config["AES_SECRET_KEY"]:
            raise AuthConfigError("JWT_SECRET_KEY must differ from AES_SECRET_KEY.")
        auth_service = AuthService(
            app.config["JWT_SECRET_KEY"],
            parse_users(app.config["AUTH_USERS"]),
            ttl_seconds=app.config["ACCESS_TOKEN_TTL_SECONDS"],
        )
    except AuthConfigError as error:
        raise RuntimeError(f"Authentication is not configured: {error}") from None

    device_state_service = DeviceStateService()

    app.extensions["encryption_service"] = encryption_service
    app.extensions["auth_service"] = auth_service
    app.extensions["device_state_service"] = device_state_service
    app.extensions["command_service"] = CommandService(
        encryption_service, device_state_service
    )
    app.extensions["login_limiter"] = RateLimiter(
        app.config["LOGIN_MAX_FAILURES"], app.config["LOGIN_WINDOW_SECONDS"]
    )
    app.extensions["command_limiter"] = RateLimiter(
        app.config["COMMAND_RATE_LIMIT"], app.config["COMMAND_RATE_WINDOW_SECONDS"]
    )

    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    register_error_handlers(app)
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(commands_bp, url_prefix="/api")
    app.register_blueprint(status_bp, url_prefix="/api")

    return app