def test_health_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_unknown_route_uses_error_contract(client):
    response = client.get("/api/does-not-exist")
    body = response.get_json()
    assert response.status_code == 404
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"
    assert isinstance(body["error"]["message"], str)


def test_wrong_method_uses_error_contract(client):
    response = client.post("/api/health")
    body = response.get_json()
    assert response.status_code == 405
    assert body["success"] is False
    assert body["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_unhandled_exception_returns_generic_500(app):
    @app.get("/api/boom")
    def boom():
        raise RuntimeError("super secret internal detail")

    response = app.test_client().get("/api/boom")
    text = response.get_data(as_text=True)
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert "super secret internal detail" not in text
    assert "Traceback" not in text