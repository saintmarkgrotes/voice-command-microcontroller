"""AES-256-GCM encryption for outgoing device commands.

Payload format (all binary fields Base64-encoded):
    {"algorithm": "AES-256-GCM", "nonce": "...", "ciphertext": "...", "tag": "..."}

nonce = 12 bytes, tag = 16 bytes, key = 32 bytes.
The key is never logged, returned, or included in error messages.
"""

import base64
import binascii

from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

ALGORITHM = "AES-256-GCM"
KEY_SIZE = 32
NONCE_SIZE = 12
TAG_SIZE = 16


class EncryptionError(Exception):
    """Base class for encryption-service failures."""


class InvalidKeyError(EncryptionError):
    """The configured key is missing or malformed."""


class DecryptionError(EncryptionError):
    """Decryption failed: bad key, tampered data, or malformed payload."""


def parse_hex_key(hex_key):
    """Convert a 64-character hex string into 32 key bytes."""
    if not isinstance(hex_key, str) or not hex_key.strip():
        raise InvalidKeyError("AES_SECRET_KEY is not set.")
    try:
        key = bytes.fromhex(hex_key.strip())
    except ValueError:
        raise InvalidKeyError("AES_SECRET_KEY must be hexadecimal.") from None
    if len(key) != KEY_SIZE:
        raise InvalidKeyError("AES_SECRET_KEY must be 32 bytes (64 hex characters).")
    return key


def _to_bytes(value):
    if isinstance(value, str):
        return value.encode("utf-8")
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    return None


def _b64_decode(value):
    if not isinstance(value, str):
        raise DecryptionError("Malformed payload.")
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise DecryptionError("Malformed payload.") from None


class EncryptionService:
    def __init__(self, key):
        if not isinstance(key, (bytes, bytearray)) or len(key) != KEY_SIZE:
            raise InvalidKeyError("Key must be exactly 32 bytes.")
        self._key = bytes(key)

    @classmethod
    def from_hex_key(cls, hex_key):
        return cls(parse_hex_key(hex_key))

    def __repr__(self):
        # Never expose the key, even by accident in logs or the debugger.
        return "<EncryptionService algorithm=AES-256-GCM key=[hidden]>"

    def encrypt(self, plaintext, associated_data=None):
        """Encrypt str/bytes and return the payload dict. A new nonce is used every call."""
        data = _to_bytes(plaintext)
        if not data:
            raise EncryptionError("Plaintext must be non-empty str or bytes.")

        nonce = get_random_bytes(NONCE_SIZE)
        cipher = AES.new(self._key, AES.MODE_GCM, nonce=nonce, mac_len=TAG_SIZE)

        aad = _to_bytes(associated_data)
        if aad:
            cipher.update(aad)

        ciphertext, tag = cipher.encrypt_and_digest(data)
        return {
            "algorithm": ALGORITHM,
            "nonce": base64.b64encode(nonce).decode("ascii"),
            "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
            "tag": base64.b64encode(tag).decode("ascii"),
        }

    def decrypt(self, payload, associated_data=None):
        """Verify the tag and return plaintext bytes; raise DecryptionError on any failure."""
        if not isinstance(payload, dict) or payload.get("algorithm") != ALGORITHM:
            raise DecryptionError("Malformed payload.")

        nonce = _b64_decode(payload.get("nonce"))
        ciphertext = _b64_decode(payload.get("ciphertext"))
        tag = _b64_decode(payload.get("tag"))

        if len(nonce) != NONCE_SIZE or len(tag) != TAG_SIZE:
            raise DecryptionError("Malformed payload.")

        cipher = AES.new(self._key, AES.MODE_GCM, nonce=nonce, mac_len=TAG_SIZE)

        aad = _to_bytes(associated_data)
        if aad:
            cipher.update(aad)

        try:
            return cipher.decrypt_and_verify(ciphertext, tag)
        except ValueError:
            # Same generic error for wrong key and tampering: no oracle for attackers.
            raise DecryptionError("Authentication failed.") from None