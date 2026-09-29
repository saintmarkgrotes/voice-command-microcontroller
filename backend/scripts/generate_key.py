"""Print a fresh random 256-bit AES key as 64 hex characters.

Usage:  python scripts/generate_key.py
Put the output in backend/.env as AES_SECRET_KEY. Never commit it.
"""

import secrets

print(secrets.token_hex(32))