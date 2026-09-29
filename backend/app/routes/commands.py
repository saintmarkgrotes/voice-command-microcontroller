from flask import Blueprint, current_app, jsonify, request

from app.utils.validators import validate_command_request

commands_bp = Blueprint("commands", __name__)


@commands_bp.post("/commands")
def create_command():
    data = request.get_json(silent=True)  # None if malformed or not JSON
    device, command = validate_command_request(data)

    result = current_app.extensions["command_service"].process(device, command)

    return jsonify({"success": True, **result}), 200