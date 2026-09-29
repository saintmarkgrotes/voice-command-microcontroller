import base64
import json
import time

import pytest

from app.services.command_service import COMMAND_AAD

VALID_COMMANDS = [
    ("light", "LIGHT_ON"),
    ("light", "LIGHT_OFF"),
    ("fan", "FAN_ON"),
    ("fan", "FAN_OFF"),
    ("door", "DOOR_OPEN"),
    ("door", "DOOR_CLOSE"),
    ("pump", "PUMP_ON"),
    ("pump", "PUMP_OFF"),
]

INVALID_BODIES = [
    ({"command": "LIGHT_ON"}, "INVALID_REQUEST"),
    ({"device": "light"}, "INVALID_REQUEST"),
    ({"device": 123, "command": "LIGHT_ON"}, "INVALID_REQUEST"),
    ({"device": "light", "command": None}, "INVALID_REQUEST"),
    ([], "INVALID_REQUEST"),
    ("just a string", "INVALID_REQUEST"),
    ({"device": "toaster", "command": "LIGHT_ON"}, "INVALID_DEVICE"),
    ({"device": "", "command": "LIGHT_ON"}, "INVALID_DEVICE"),
    ({"device": "light", "command": "LIGHT_DIM"}, "INVALID_COMMAND"),
    ({"device": "light", "command": "l\u0131ght_on"}, "INVALID_COMMAND"),
    ({"device": "light", "command": "FAN_ON"}, "COMMAND_DEVICE_MISMATCH"),
    ({"device": "door", "command": "PUMP_OFF"}, "COMMAND_DEVICE_MISMATCH"),
]


def post_command(client, device, command, **extra):
    return client.post(
        "/api/commands", json={"device": device, "command": command, **extra}
    )


@pytest.mark.parametrize("device,command", VALID_COMMANDS)
def test_valid_commands_return_encrypted_payload(client, app, device, command):
    response = post_command(client, device, command)
    body = response.get_json()

    assert response.status_code == 200
    assert set(body) == {"success", "command_id", "device", "encrypted_payload"}
    assert body["success"] is True
    assert body["device"] == device

    payload = body["encrypted_payload"]
    assert payload["algorithm"] == "AES-256-GCM"
    assert len(base64.b64decode(payload["nonce"])) == 12
    assert len(base64.b64decode(payload["tag"])) == 16
    assert payload["ciphertext"]

    # The plaintext must be recoverable only by decrypting.
    plaintext = app.extensions["encryption_service"].decrypt(
        payload, associated_data=COMMAND_AAD
    )
    internal = json.loads(plaintext)
    assert internal["command"] == command
    assert internal["device"] == device
    assert internal["command_id"] == body["command_id"]


def test_plaintext_command_is_not_in_the_response(client):
    response = post_command(client, "light", "LIGHT_ON")
    assert "LIGHT_ON" not in response.get_data(as_text=True)


def test_client_timestamp_is_ignored(client, app):
    response = post_command(client, "light", "LIGHT_ON", timestamp=1)
    body = response.get_json()
    assert response.status_code == 200
    assert "timestamp" not in body

    internal = json.loads(
        app.extensions["encryption_service"].decrypt(
            body["encrypted_payload"], associated_data=COMMAND_AAD
        )
    )
    assert internal["timestamp"] != 1
    assert abs(internal["timestamp"] - time.time()) < 10


def test_input_is_normalized(client, app):
    response = post_command(client, " Light ", " light_on ")
    body = response.get_json()
    assert response.status_code == 200
    assert body["device"] == "light"

    internal = json.loads(
        app.extensions["encryption_service"].decrypt(
            body["encrypted_payload"], associated_data=COMMAND_AAD
        )
    )
    assert internal["command"] == "LIGHT_ON"


@pytest.mark.parametrize("payload,expected_code", INVALID_BODIES)
def test_invalid_requests_are_rejected(client, payload, expected_code):
    response = client.post("/api/commands", json=payload)
    body = response.get_json()
    assert response.status_code == 400
    assert body["success"] is False
    assert body["error"]["code"] == expected_code
    assert isinstance(body["error"]["message"], str)


def test_malformed_json_is_rejected(client):
    response = client.post(
        "/api/commands", data="{not json", content_type="application/json"
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REQUEST"


def test_non_json_content_type_is_rejected(client):
    response = client.post("/api/commands", data="hello", content_type="text/plain")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REQUEST"


def test_oversized_body_is_rejected(client):
    response = client.post(
        "/api/commands", json={"device": "light", "command": "x" * 10000}
    )
    assert response.status_code == 413
    assert response.get_json()["success"] is False


def test_get_on_commands_is_not_allowed(client):
    response = client.get("/api/commands")
    assert response.status_code == 405