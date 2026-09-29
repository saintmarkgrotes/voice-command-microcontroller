from flask import Blueprint, current_app, jsonify

status_bp = Blueprint("status", __name__)


@status_bp.get("/status")
def get_status():
    devices = current_app.extensions["device_state_service"].get_all()
    response = jsonify({"success": True, "devices": devices})
    response.headers["Cache-Control"] = "no-store"
    return response, 200