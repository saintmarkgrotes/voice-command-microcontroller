import time

import jwt
import pytest

from app.security.authentication import (
    ALGORITHM,
    AUDIENCE,
    ISSUER,
    AuthConfigError,
    AuthService,
    parse_users,
)

LIGHT_ON = {"device": "light", "command": "LIGHT_ON"}


def forge_token(app, key=None, algorithm=ALGORITHM, **overrides):
    """Build a token with chosen claims; a None override removes that claim."""
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "admin",
        "role": "admin",
        "iat": now,
        "exp": now + 600,
        "jti": "test-token",
    }
    claims.update(overrides)
    claims = {name: value for name, value in claims.items() if value is not None}
    if algorithm == "none":
        signing_key = None  # unsigned token
    else:
        signing_key = key or app.config["JWT_SECRET_KEY"]
    return jwt.encode(claims, signing_key, algorithm=algorithm)


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def login(client, username, password):
    return client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )


# --- Login -----------------------------------------------------------------

def test_login_success_returns_a_working_token(anonymous_client, app, credentials):
    response = login(anonymous_client, *credentials["admin"])
    body = response.get_json()

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert body["success"] is True
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] == 3600
    assert body["user"] == {"username": "admin", "role": "admin"}

    claims = jwt.decode(
        body["access_token"],
        app.config["JWT_SECRET_KEY"],
        algorithms=[ALGORITHM],
        audience=AUDIENCE,
        issuer=ISSUER,
    )
    assert claims["sub"] == "admin" and claims["role"] == "admin"
    assert claims["exp"] - claims["iat"] == 3600

    status = anonymous_client.get("/api/status", headers=bearer(body["access_token"]))
    assert status.status_code == 200


def test_login_response_never_contains_password_or_hash(anonymous_client, credentials):
    username, password = credentials["admin"]
    text = login(anonymous_client, username, password).get_data(as_text=True)
    assert password not in text
    assert "pbkdf2" not in text and "scrypt" not in text


def test_username_is_case_insensitive(anonymous_client, credentials):
    _, password = credentials["admin"]
    assert login(anonymous_client, "  ADMIN ", password).status_code == 200


def test_every_token_is_unique(anonymous_client, credentials):
    first = login(anonymous_client, *credentials["admin"]).get_json()["access_token"]
    second = login(anonymous_client, *credentials["admin"]).get_json()["access_token"]
    assert first != second


def test_wrong_password_and_unknown_user_look_identical(anonymous_client, credentials):
    wrong_password = login(anonymous_client, "admin", "not-the-password")
    unknown_user = login(anonymous_client, "nobody", "not-the-password")

    for response in (wrong_password, unknown_user):
        assert response.status_code == 401
        assert response.get_json()["error"]["code"] == "INVALID_CREDENTIALS"
        assert response.headers["WWW-Authenticate"] == "Bearer"
    assert wrong_password.get_json() == unknown_user.get_json()


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"username": "admin"},
        {"password": "x"},
        {"username": 1, "password": "x"},
        {"username": "admin", "password": None},
        {"username": "   ", "password": "x"},
        {"username": "admin", "password": ""},
        {"username": "a" * 65, "password": "x"},
        {"username": "admin", "password": "p" * 129},
        [],
        "text",
    ],
)
def test_login_rejects_invalid_bodies(anonymous_client, payload):
    response = anonymous_client.post("/api/auth/login", json=payload)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_REQUEST"


def test_login_rejects_non_json(anonymous_client):
    response = anonymous_client.post(
        "/api/auth/login", data="username=admin", content_type="text/plain"
    )
    assert response.status_code == 400


def test_login_get_is_not_allowed(anonymous_client):
    assert anonymous_client.get("/api/auth/login").status_code == 405


# --- Protected endpoints: missing or bad credentials ------------------------

PROTECTED = [("get", "/api/status"), ("post", "/api/commands")]


@pytest.mark.parametrize("method,path", PROTECTED)
def test_requests_without_a_token_are_rejected(anonymous_client, method, path):
    response = getattr(anonymous_client, method)(path, json=LIGHT_ON)
    body = response.get_json()
    assert response.status_code == 401
    assert body["error"]["code"] == "UNAUTHORIZED"
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    ["", "Bearer", "Bearer ", "Basic abc123", "Token abc", "Bearer a b", "abc.def.ghi"],
)
def test_malformed_authorization_headers_are_rejected(anonymous_client, header):
    response = anonymous_client.get("/api/status", headers={"Authorization": header})
    assert response.status_code == 401


def test_garbage_token_is_rejected(anonymous_client):
    response = anonymous_client.get("/api/status", headers=bearer("not.a.token"))
    assert response.status_code == 401


def test_oversized_token_is_rejected(anonymous_client):
    response = anonymous_client.get("/api/status", headers=bearer("a" * 5000))
    assert response.status_code == 401


def test_bearer_scheme_is_case_insensitive(anonymous_client, app):
    token = forge_token(app)
    response = anonymous_client.get(
        "/api/status", headers={"Authorization": f"bearer {token}"}
    )
    assert response.status_code == 200


def test_tampered_signature_is_rejected(anonymous_client, app):
    token = forge_token(app)
    header, payload, signature = token.split(".")
    flipped = ("A" if signature[0] != "A" else "B") + signature[1:]
    response = anonymous_client.get(
        "/api/status", headers=bearer(f"{header}.{payload}.{flipped}")
    )
    assert response.status_code == 401


def test_token_signed_with_another_key_is_rejected(anonymous_client, app):
    token = forge_token(app, key="some-other-secret-key-0123456789-abcdef")
    assert anonymous_client.get("/api/status", headers=bearer(token)).status_code == 401


def test_unsigned_none_algorithm_token_is_rejected(anonymous_client, app):
    token = forge_token(app, algorithm="none")
    assert anonymous_client.get("/api/status", headers=bearer(token)).status_code == 401


def test_expired_token_is_rejected(anonymous_client, app):
    now = int(time.time())
    token = forge_token(app, iat=now - 7200, exp=now - 3600)
    response = anonymous_client.get("/api/status", headers=bearer(token))
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("claim", ["exp", "iat", "sub", "role", "jti", "aud", "iss"])
def test_tokens_missing_a_required_claim_are_rejected(anonymous_client, app, claim):
    token = forge_token(app, **{claim: None})
    assert anonymous_client.get("/api/status", headers=bearer(token)).status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "another-app"},
        {"iss": "another-issuer"},
        {"role": "superuser"},
        {"role": "viewer"},  # admin user claiming a different role
        {"sub": "ghost"},  # user not in AUTH_USERS
        {"sub": 123},
    ],
)
def test_tokens_with_wrong_claims_are_rejected(anonymous_client, app, overrides):
    token = forge_token(app, **overrides)
    assert anonymous_client.get("/api/status", headers=bearer(token)).status_code == 401


def test_all_failures_share_one_generic_message(anonymous_client, app):
    now = int(time.time())
    tokens = [
        "garbage",
        forge_token(app, exp=now - 10, iat=now - 100),
        forge_token(app, key="x" * 40),
        forge_token(app, sub="ghost"),
    ]
    bodies = [
        anonymous_client.get("/api/status", headers=bearer(t)).get_json()
        for t in tokens
    ]
    assert all(body == bodies[0] for body in bodies)


def test_health_stays_public(anonymous_client):
    assert anonymous_client.get("/api/health").status_code == 200


# --- Authorization (roles) ---------------------------------------------------

def test_viewer_can_read_status(viewer_client):
    assert viewer_client.get("/api/status").status_code == 200


def test_viewer_cannot_send_commands(viewer_client, client):
    response = viewer_client.post("/api/commands", json=LIGHT_ON)
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "FORBIDDEN"
    assert viewer_client.get("/api/status").get_json()["devices"]["light"]["state"] == "off"


def test_admin_can_send_commands_and_read_status(client):
    assert client.post("/api/commands", json=LIGHT_ON).status_code == 200
    assert client.get("/api/status").status_code == 200


def test_authentication_is_checked_before_validation(anonymous_client):
    response = anonymous_client.post("/api/commands", json={"device": "bogus"})
    assert response.status_code == 401


def test_authorization_is_checked_before_validation(viewer_client):
    response = viewer_client.post("/api/commands", json={"device": "bogus"})
    assert response.status_code == 403


def test_unauthenticated_command_does_not_change_state(anonymous_client, client):
    anonymous_client.post("/api/commands", json=LIGHT_ON)
    assert client.get("/api/status").get_json()["devices"]["light"]["state"] == "off"


# --- User configuration ------------------------------------------------------

HASH = "pbkdf2:sha256:1000$salt$abcdef"


def test_parse_users_reads_several_entries():
    users = parse_users(f"Alice|admin|{HASH}; bob|viewer|{HASH} ;")
    assert set(users) == {"alice", "bob"}
    assert users["alice"].username == "Alice"
    assert users["bob"].role == "viewer"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        None,
        "   ;  ",
        "alice|admin",
        f"alice|admin|{HASH}|extra",
        f"|admin|{HASH}",
        f"alice|root|{HASH}",
        "alice|admin|plaintext-password",
        f"alice|admin|{HASH};ALICE|viewer|{HASH}",
        f"{'a' * 65}|admin|{HASH}",
    ],
)
def test_parse_users_rejects_bad_entries(raw):
    with pytest.raises(AuthConfigError):
        parse_users(raw)


def test_config_errors_never_contain_the_hash():
    with pytest.raises(AuthConfigError) as error:
        parse_users(f"alice|root|{HASH}")
    assert HASH not in str(error.value)


def test_auth_service_requires_a_long_secret():
    users = parse_users(f"alice|admin|{HASH}")
    with pytest.raises(AuthConfigError):
        AuthService("too-short", users)
    with pytest.raises(AuthConfigError):
        AuthService("x" * 40, users, ttl_seconds=0)
    assert "x" * 40 not in repr(AuthService("x" * 40, users))


@pytest.mark.parametrize(
    "overrides",
    [
        {"JWT_SECRET_KEY": ""},
        {"JWT_SECRET_KEY": "short"},
        {"JWT_SECRET_KEY": "0123456789abcdef" * 4},  # same as the AES key
        {"AUTH_USERS": ""},
        {"AUTH_USERS": "nonsense"},
    ],
)
def test_app_refuses_to_start_with_bad_auth_configuration(app_factory, overrides):
    with pytest.raises(RuntimeError, match="Authentication is not configured"):
        app_factory(**overrides)