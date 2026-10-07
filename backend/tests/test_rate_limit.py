import pytest

from app.errors import RateLimitedError
from app.security.rate_limit import RateLimiter, enforce_rate_limit

LIGHT_ON = {"device": "light", "command": "LIGHT_ON"}


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


# --- RateLimiter unit tests --------------------------------------------------

def test_events_under_the_limit_are_allowed():
    limiter = RateLimiter(3, 60, clock=FakeClock())
    assert [limiter.check_and_hit("k") for _ in range(3)] == [0, 0, 0]


def test_event_over_the_limit_reports_wait_time_and_is_not_recorded():
    clock = FakeClock()
    limiter = RateLimiter(2, 60, clock=clock)
    limiter.check_and_hit("k")
    clock.now += 10
    limiter.check_and_hit("k")
    clock.now += 5
    assert limiter.check_and_hit("k") == 45  # oldest event leaves the window in 45 s
    clock.now += 45
    assert limiter.check_and_hit("k") == 0  # the blocked attempt did not extend the block


def test_window_slides():
    clock = FakeClock()
    limiter = RateLimiter(1, 60, clock=clock)
    assert limiter.check_and_hit("k") == 0
    clock.now += 59
    assert limiter.check_and_hit("k") > 0
    clock.now += 2
    assert limiter.check_and_hit("k") == 0


def test_keys_are_independent():
    limiter = RateLimiter(1, 60, clock=FakeClock())
    assert limiter.check_and_hit("a") == 0
    assert limiter.check_and_hit("b") == 0
    assert limiter.check_and_hit("a") > 0


def test_reset_clears_a_key():
    limiter = RateLimiter(1, 60, clock=FakeClock())
    limiter.hit("k")
    assert limiter.retry_after("k") > 0
    limiter.reset("k")
    assert limiter.retry_after("k") == 0


def test_retry_after_does_not_record():
    limiter = RateLimiter(1, 60, clock=FakeClock())
    for _ in range(5):
        assert limiter.retry_after("k") == 0


def test_enforce_raises_429_with_retry_after():
    limiter = RateLimiter(1, 60, clock=FakeClock())
    enforce_rate_limit(limiter, "k")
    with pytest.raises(RateLimitedError) as error:
        enforce_rate_limit(limiter, "k")
    assert error.value.status_code == 429
    assert int(error.value.headers["Retry-After"]) >= 1


def test_invalid_limits_are_rejected():
    with pytest.raises(ValueError):
        RateLimiter(0, 60)
    with pytest.raises(ValueError):
        RateLimiter(1, 0)


# --- Login lockout -----------------------------------------------------------

def bad_login(client, username="admin"):
    return client.post(
        "/api/auth/login", json={"username": username, "password": "wrong-password"}
    )


def test_repeated_failures_lock_the_account_with_429(app_factory, credentials):
    client = app_factory(LOGIN_MAX_FAILURES=3).test_client()

    assert [bad_login(client).status_code for _ in range(3)] == [401, 401, 401]

    blocked = bad_login(client)
    assert blocked.status_code == 429
    assert blocked.get_json()["error"]["code"] == "RATE_LIMITED"
    assert int(blocked.headers["Retry-After"]) >= 1

    # Even the correct password is refused while locked, so guessing gains nothing.
    username, password = credentials["admin"]
    correct = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert correct.status_code == 429


def test_successful_login_resets_the_username_counter(app_factory, credentials):
    client = app_factory(LOGIN_MAX_FAILURES=3).test_client()
    username, password = credentials["admin"]

    bad_login(client)
    bad_login(client)
    ok = client.post("/api/auth/login", json={"username": username, "password": password})
    assert ok.status_code == 200

    # Counter was cleared for the username, but two failures remain on the IP.
    assert bad_login(client).status_code == 401


def test_one_ip_guessing_many_usernames_is_limited(app_factory):
    client = app_factory(LOGIN_MAX_FAILURES=3).test_client()
    codes = [bad_login(client, username=f"user{i}").status_code for i in range(5)]
    assert codes == [401, 401, 401, 429, 429]


# --- Command rate limit ------------------------------------------------------

def test_command_rate_limit_returns_429_and_changes_nothing(app_factory):
    app = app_factory(COMMAND_RATE_LIMIT=3)
    token = app.extensions["auth_service"].issue_token(
        app.extensions["auth_service"].authenticate("admin", "admin-test-password")
    )
    client = app.test_client()
    headers = {"Authorization": f"Bearer {token}"}

    for _ in range(3):
        assert client.post("/api/commands", json=LIGHT_ON, headers=headers).status_code == 200

    blocked = client.post(
        "/api/commands", json={"device": "fan", "command": "FAN_ON"}, headers=headers
    )
    assert blocked.status_code == 429
    assert blocked.get_json()["error"]["code"] == "RATE_LIMITED"
    assert int(blocked.headers["Retry-After"]) >= 1

    status = client.get("/api/status", headers=headers).get_json()
    assert status["devices"]["fan"]["state"] == "off"


def test_status_is_not_command_rate_limited(app_factory):
    app = app_factory(COMMAND_RATE_LIMIT=1)
    token = app.extensions["auth_service"].issue_token(
        app.extensions["auth_service"].authenticate("viewer", "viewer-test-password")
    )
    client = app.test_client()
    headers = {"Authorization": f"Bearer {token}"}
    assert all(client.get("/api/status", headers=headers).status_code == 200 for _ in range(10))