import json

import pytest

from app.services.command_service import COMMAND_AAD, CommandService
from app.services.device_state_service import DeviceStateService
from app.services.encryption_service import DecryptionError, EncryptionService

KEY = "ab" * 32


@pytest.fixture
def encryption():
    return EncryptionService.from_hex_key(KEY)


def make_service(encryption, now=1750000000, ids=None):
    id_iter = iter(ids or ["id-1", "id-2", "id-3"])
    return CommandService(
        encryption,
        DeviceStateService(),
        clock=lambda: now,
        id_factory=lambda: next(id_iter),
    )


def test_build_command_uses_server_clock_and_id(encryption):
    service = make_service(encryption, now=1750000000.9)
    assert service.build_command("light", "LIGHT_ON") == {
        "command_id": "id-1",
        "device": "light",
        "command": "LIGHT_ON",
        "timestamp": 1750000000,
    }


def test_process_encrypts_the_internal_command(encryption):
    service = make_service(encryption)
    result = service.process("fan", "FAN_OFF")

    assert result["command_id"] == "id-1"
    assert result["device"] == "fan"

    plaintext = encryption.decrypt(
        result["encrypted_payload"], associated_data=COMMAND_AAD
    )
    assert json.loads(plaintext) == {
        "command_id": "id-1",
        "device": "fan",
        "command": "FAN_OFF",
        "timestamp": 1750000000,
    }


def test_decryption_requires_the_protocol_aad(encryption):
    result = make_service(encryption).process("light", "LIGHT_ON")
    with pytest.raises(DecryptionError):
        encryption.decrypt(result["encrypted_payload"])
    with pytest.raises(DecryptionError):
        encryption.decrypt(result["encrypted_payload"], associated_data=b"other")


def test_each_command_gets_a_unique_id_and_nonce(encryption):
    service = CommandService(encryption, DeviceStateService())
    first = service.process("light", "LIGHT_ON")
    second = service.process("light", "LIGHT_ON")
    assert first["command_id"] != second["command_id"]
    assert (
        first["encrypted_payload"]["nonce"] != second["encrypted_payload"]["nonce"]
    )