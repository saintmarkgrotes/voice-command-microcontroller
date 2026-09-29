import base64
import json

import pytest
from Crypto.Cipher import AES

from app import create_app
from app.config import Config
from app.services.encryption_service import (
    ALGORITHM,
    DecryptionError,
    EncryptionError,
    EncryptionService,
    InvalidKeyError,
    parse_hex_key,
)

KEY_A = "11" * 32
KEY_B = "22" * 32
PLAINTEXT = "LIGHT_ON"


@pytest.fixture
def service():
    return EncryptionService.from_hex_key(KEY_A)


def b64(data):
    return base64.b64encode(data).decode("ascii")


def flip_first_bit(b64_value):
    raw = bytearray(base64.b64decode(b64_value))
    raw[0] ^= 0x01
    return b64(bytes(raw))


# --- Test 1: plaintext can be encrypted -------------------------------------

def test_encrypt_returns_well_formed_payload(service):
    payload = service.encrypt(PLAINTEXT)

    assert set(payload) == {"algorithm", "nonce", "ciphertext", "tag"}
    assert payload["algorithm"] == ALGORITHM == "AES-256-GCM"
    assert len(base64.b64decode(payload["nonce"], validate=True)) == 12
    assert len(base64.b64decode(payload["tag"], validate=True)) == 16
    # GCM is a stream mode: ciphertext is exactly as long as the plaintext.
    assert len(base64.b64decode(payload["ciphertext"], validate=True)) == len(PLAINTEXT)


# --- Test 2: correct key decrypts -------------------------------------------

def test_round_trip_with_correct_key(service):
    payload = service.encrypt(PLAINTEXT)
    assert service.decrypt(payload) == b"LIGHT_ON"


def test_round_trip_with_separate_service_instance_and_same_key(service):
    payload = service.encrypt(PLAINTEXT)
    other_instance = EncryptionService.from_hex_key(KEY_A)
    assert other_instance.decrypt(payload) == b"LIGHT_ON"


@pytest.mark.parametrize("message", ["é ü 日本語 ✓", b"\x00\x01\xff raw bytes", "x" * 1000])
def test_round_trip_various_inputs(service, message):
    expected = message.encode("utf-8") if isinstance(message, str) else message
    assert service.decrypt(service.encrypt(message)) == expected


# --- Test 3: wrong key fails ------------------------------------------------

def test_decrypt_with_wrong_key_fails(service):
    payload = service.encrypt(PLAINTEXT)
    wrong = EncryptionService.from_hex_key(KEY_B)
    with pytest.raises(DecryptionError):
        wrong.decrypt(payload)


# --- Test 4: tampering fails authentication ---------------------------------

@pytest.mark.parametrize("field", ["ciphertext", "tag", "nonce"])
def test_modified_field_fails_authentication(service, field):
    payload = service.encrypt(PLAINTEXT)
    payload[field] = flip_first_bit(payload[field])
    with pytest.raises(DecryptionError):
        service.decrypt(payload)


def test_truncated_ciphertext_fails(service):
    payload = service.encrypt(PLAINTEXT)
    raw = base64.b64decode(payload["ciphertext"])
    payload["ciphertext"] = b64(raw[:-1])
    with pytest.raises(DecryptionError):
        service.decrypt(payload)


def test_swapped_tags_between_messages_fail(service):
    first = service.encrypt("LIGHT_ON")
    second = service.encrypt("LIGHT_OFF")
    first["tag"] = second["tag"]
    with pytest.raises(DecryptionError):
        service.decrypt(first)


# --- Test 5: fresh nonce every time -----------------------------------------

def test_every_encryption_uses_a_fresh_nonce(service):
    payloads = [service.encrypt(PLAINTEXT) for _ in range(1000)]
    assert len({p["nonce"] for p in payloads}) == 1000
    # Same plaintext + same key must not produce the same ciphertext.
    assert len({p["ciphertext"] for p in payloads}) == 1000


# --- Test 6: plaintext is not exposed in the payload ------------------------

def test_plaintext_is_not_present_in_payload(service):
    payload = service.encrypt(PLAINTEXT)
    serialized = json.dumps(payload)

    assert set(payload) == {"algorithm", "nonce", "ciphertext", "tag"}
    assert PLAINTEXT not in serialized
    assert b64(PLAINTEXT.encode()) not in serialized
    assert PLAINTEXT.encode() not in base64.b64decode(payload["ciphertext"])


# --- Associated data (AAD) ---------------------------------------------------

def test_aad_must_match_to_decrypt(service):
    payload = service.encrypt(PLAINTEXT, associated_data=b"context-v1")
    assert service.decrypt(payload, associated_data=b"context-v1") == b"LIGHT_ON"
    with pytest.raises(DecryptionError):
        service.decrypt(payload)
    with pytest.raises(DecryptionError):
        service.decrypt(payload, associated_data=b"context-v2")


# --- Interoperability: this is plain, standard AES-GCM -----------------------

def test_payload_decrypts_with_a_raw_gcm_implementation(service):
    """The ESP32 will use its own GCM library, so the format must be standard."""
    payload = service.encrypt(PLAINTEXT, associated_data=b"ctx")

    cipher = AES.new(
        bytes.fromhex(KEY_A),
        AES.MODE_GCM,
        nonce=base64.b64decode(payload["nonce"]),
    )
    cipher.update(b"ctx")
    plaintext = cipher.decrypt_and_verify(
        base64.b64decode(payload["ciphertext"]),
        base64.b64decode(payload["tag"]),
    )
    assert plaintext == b"LIGHT_ON"


# --- Malformed payloads ------------------------------------------------------

def make_bad_payloads(service):
    good = service.encrypt(PLAINTEXT)
    return [
        None,
        "not a dict",
        [],
        {},
        {**good, "algorithm": "AES-128-GCM"},
        {**good, "algorithm": "aes-256-gcm"},
        {k: v for k, v in good.items() if k != "nonce"},
        {k: v for k, v in good.items() if k != "tag"},
        {k: v for k, v in good.items() if k != "ciphertext"},
        {**good, "nonce": "!!!not-base64!!!"},
        {**good, "nonce": 12345},
        {**good, "nonce": b64(b"12345678")},     # 8 bytes, not 12
        {**good, "tag": b64(b"short")},          # not 16 bytes
        {**good, "ciphertext": "***"},
    ]


def test_malformed_payloads_raise_decryption_error(service):
    for bad in make_bad_payloads(service):
        with pytest.raises(DecryptionError):
            service.decrypt(bad)


# --- Encrypt input handling --------------------------------------------------

@pytest.mark.parametrize("bad", ["", b"", None, 123, ["LIGHT_ON"]])
def test_encrypt_rejects_invalid_plaintext(service, bad):
    with pytest.raises(EncryptionError):
        service.encrypt(bad)


# --- Key handling ------------------------------------------------------------

def test_parse_hex_key_accepts_valid_key_and_strips_whitespace():
    assert parse_hex_key(KEY_A) == bytes.fromhex(KEY_A)
    assert parse_hex_key(f"  {KEY_A}\n") == bytes.fromhex(KEY_A)


@pytest.mark.parametrize(
    "bad_key",
    [None, "", "   ", "zz" * 32, "ab" * 16, "ab" * 33, "abc", 12345],
)
def test_parse_hex_key_rejects_bad_keys(bad_key):
    with pytest.raises(InvalidKeyError):
        parse_hex_key(bad_key)


@pytest.mark.parametrize("bad_key", [b"short", b"x" * 31, b"x" * 33, "a" * 32, None])
def test_constructor_requires_exactly_32_bytes(bad_key):
    with pytest.raises(InvalidKeyError):
        EncryptionService(bad_key)


def test_repr_never_shows_the_key(service):
    text = repr(service)
    assert KEY_A not in text
    assert bytes.fromhex(KEY_A).hex() not in text
    assert "hidden" in text


# --- Startup safety ----------------------------------------------------------

class MissingKeyConfig(Config):
    TESTING = True
    AES_SECRET_KEY = ""


class MalformedKeyConfig(Config):
    TESTING = True
    AES_SECRET_KEY = "zz-not-a-real-key-zz"


def test_app_refuses_to_start_without_key():
    with pytest.raises(RuntimeError, match="Encryption is not configured"):
        create_app(MissingKeyConfig)


def test_app_refuses_to_start_with_malformed_key_and_does_not_leak_it():
    with pytest.raises(RuntimeError) as error:
        create_app(MalformedKeyConfig)
    assert MalformedKeyConfig.AES_SECRET_KEY not in str(error.value)


def test_api_response_never_contains_the_key(client):
    response = client.post(
        "/api/commands", json={"device": "light", "command": "LIGHT_ON"}
    )
    text = response.get_data(as_text=True).lower()
    assert ("0123456789abcdef" * 4) not in text
    assert "aes_secret_key" not in text