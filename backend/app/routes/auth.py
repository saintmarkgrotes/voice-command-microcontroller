from flask import Blueprint, current_app, jsonify, request

from app.utils.validators import validate_login_request

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True)
    username, password = validate_login_request(data)

    result = current_app.extensions["login_service"].login(
        username, password, request.remote_addr
    )
    response = jsonify({"success": True, **result})
    response.headers["Cache-Control"] = "no-store"
    return response, 200
