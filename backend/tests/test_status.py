import threading

import pytest

from app import create_app
from app.config import Config
from app.constants import COMMAND_DEFINITIONS
from app.services.device_state_service import DeviceStateService
from app.services.encryption_service import EncryptionError

INITIAL_DEVICES = {
    "light": {"state": "off"},
    "fan": {"state": "off"},
    "door": {"state": "closed"},
    "pump": {"state": "off"},
}


class OtherAppConfig(Config):
    TESTING = True
    DEBUG = False
    AES_SECRET_KEY = "cd" * 32


def get_devices(client):
    response = client.get("/api/status")
    assert response.status_code == 200
    return response.get_json()["devices"]


def send(client, device, command):
    return client.post("/api/commands", json={"device": device, "command": command})


def test_initial_status_matches_the_contract(client):
    response = client.get("/api/status")
    body = response.get_json()
    assert response.status_code == 200
    assert body == {"success": True, "devices": INITIAL_DEVICES}


def test_status_is_not_cacheable(client):
    assert client.get("/api/status").headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("command", list(COMMAND_DEFINITIONS))
def test_each_command_updates_only_its_device(client, command):
    definition = COMMAND_DEFINITIONS[command]
    assert send(client, definition["device"], command).status_code == 200

    devices = get_devices(client)
    assert devices[definition["device"]]["state"] == definition["result_state"]
    for name, initial in INITIAL_DEVICES.items():
        if name != definition["device"]:
            assert devices[name] == initial


def test_sequence_of_commands_leaves_the_latest_state(client):
    send(client, "light", "LIGHT_ON")
    send(client, "fan", "FAN_ON")
    send(client, "light", "LIGHT_OFF")
    send(client, "door", "DOOR_OPEN")

    devices = get_devices(client)
    assert devices["light"]["state"] == "off"
    assert devices["fan"]["state"] == "on"
    assert devices["door"]["state"] == "open"
    assert devices["pump"]["state"] == "off"


def test_repeating_a_command_is_idempotent(client):
    assert send(client, "light", "LIGHT_ON").status_code == 200
    assert send(client, "light", "LIGHT_ON").status_code == 200
    assert get_devices(client)["light"]["state"] == "on"


def test_rejected_command_does_not_change_state(client):
    assert send(client, "light", "FAN_ON").status_code == 400
    assert send(client, "toaster", "LIGHT_ON").status_code == 400
    assert get_devices(client) == INITIAL_DEVICES


def test_encryption_failure_does_not_change_state(app, client, monkeypatch):
    def broken_encrypt(*args, **kwargs):
        raise EncryptionError("simulated failure")

    monkeypatch.setattr(app.extensions["encryption_service"], "encrypt", broken_encrypt)

    response = send(client, "light", "LIGHT_ON")
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert "simulated failure" not in response.get_data(as_text=True)
    assert get_devices(client) == INITIAL_DEVICES


def test_post_on_status_is_not_allowed(client):
    response = client.post("/api/status", json={})
    assert response.status_code == 405
    assert response.get_json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_state_is_isolated_between_app_instances(client):
    other_client = create_app(OtherAppConfig).test_client()
    send(client, "light", "LIGHT_ON")
    assert get_devices(client)["light"]["state"] == "on"
    assert get_devices(other_client)["light"]["state"] == "off"


def test_state_service_is_safe_under_concurrent_updates():
    service = DeviceStateService()
    errors = []

    def worker(command):
        try:
            for _ in range(500):
                service.apply_command(command)
                service.get_all()
        except Exception as error:  # noqa: BLE001 - collected for the assertion
            errors.append(error)

    threads = [
        threading.Thread(target=worker, args=(cmd,))
        for cmd in ("LIGHT_ON", "LIGHT_OFF", "FAN_ON", "FAN_OFF") * 2
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert service.get_all()["light"]["state"] in {"on", "off"}


def test_state_service_rejects_unknown_command():
    with pytest.raises(ValueError):
        DeviceStateService().apply_command("LIGHT_DIM")