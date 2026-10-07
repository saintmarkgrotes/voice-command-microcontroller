from flask import Blueprint, current_app, g, jsonify, request

from app.security.authentication import require_auth
from app.security.rate_limit import enforce_rate_limit
from app.utils.validators import validate_command_request

commands_bp = Blueprint("commands", __name__)


@commands_bp.post("/commands")
@require_auth("admin")
def create_command():
    # Order matters: authenticate -> authorize -> rate limit -> validate -> process.
    enforce_rate_limit(
        current_app.extensions["command_limiter"], f"user:{g.current_user.username}"
    )

    data = request.get_json(silent=True)  # None if malformed or not JSON
    device, command = validate_command_request(data)

    result = current_app.extensions["command_service"].process(device, command)

    return jsonify({"success": True, **result}), 200