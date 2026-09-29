"""Decrypt a saved /api/commands response to verify it (development only).

Usage (from backend/):  python -m scripts.decrypt_payload response.json
Uses AES_SECRET_KEY from backend/.env. Never expose this tool or the key.
"""

import json
import sys

from app.config import Config
from app.services.command_service import COMMAND_AAD
from app.services.encryption_service import DecryptionError, EncryptionService


def main():
    if len(sys.argv) != 2:
        print("Usage: python -m scripts.decrypt_payload <response.json>")
        return 1

    with open(sys.argv[1], encoding="utf-8-sig") as file:
        body = json.load(file)
    payload = body.get("encrypted_payload", body)

    service = EncryptionService.from_hex_key(Config.AES_SECRET_KEY)
    try:
        print(service.decrypt(payload, associated_data=COMMAND_AAD).decode("utf-8"))
    except DecryptionError as error:
        print(f"Decryption failed: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())