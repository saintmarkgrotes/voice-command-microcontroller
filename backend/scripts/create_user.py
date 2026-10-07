"""Create an AUTH_USERS entry (username|role|password_hash) for backend/.env.

Usage (from backend/):  python -m scripts.create_user
The password is typed hidden and is never stored, only its hash is printed.
"""

import getpass
import sys

from werkzeug.security import generate_password_hash

from app.security.authentication import MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, ROLES

MIN_PASSWORD_LENGTH = 10


def main():
    username = input("Username: ").strip()
    if not username or len(username) > MAX_USERNAME_LENGTH or not username.isprintable():
        print("Invalid username.")
        return 1
    if any(char in username for char in "|;"):
        print("Username must not contain '|' or ';'.")
        return 1

    role = input(f"Role ({'/'.join(ROLES)}): ").strip().lower()
    if role not in ROLES:
        print(f"Role must be one of: {', '.join(ROLES)}")
        return 1

    password = getpass.getpass("Password: ")
    if getpass.getpass("Repeat password: ") != password:
        print("Passwords do not match.")
        return 1
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        print(f"Password must be {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters.")
        return 1

    entry = f"{username}|{role}|{generate_password_hash(password)}"
    print("\nAdd this to backend/.env (separate several users with ';'):\n")
    print(f"AUTH_USERS='{entry}'")
    return 0


if __name__ == "__main__":
    sys.exit(main())