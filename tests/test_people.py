"""People API: residents (family) and visitors (guest)."""
from conftest import jpeg, sql


def create(client, name="Ali", role="family", n=1, **form):
    files = [("photos", (f"p{i}.jpg", jpeg(), "image/jpeg")) for i in range(n)]
    return client.post("/api/people", data={"name": name, "role": role, **form}, files=files)


def test_create_family(client, engine):
    r = create(client, "Azhad", n=2)
    assert r.status_code == 201
    p = r.json()
    assert isinstance(p["id"], int) and p["name"] == "Azhad" and p["role"] == "family"
    assert p["validFrom"] is None and p["validTo"] is None and p["active"] is True
    assert p["photoCount"] == 2 and p["photoUrl"] == f"/api/people/{p['id']}/photo"
    assert p["lastSeen"] is None and p["createdAt"].endswith("Z")
    assert len(list((engine.faces_path / "Azhad").glob("*.jpg"))) == 2
    assert "reload_people" in engine.calls


def test_create_guest_window(client):
    p = create(client, "Ali", "guest", validFrom="2026-10-24T14:00Z",
               validTo="2026-10-24T18:00Z").json()
    assert p["role"] == "guest" and p["validFrom"] == "2026-10-24T14:00:00Z"
    assert p["validTo"] == "2026-10-24T18:00:00Z" and p["active"] is False


def test_create_family_ignores_window(client):
    p = create(client, "Mum", "family", validFrom="2026-10-24T14:00Z").json()
    assert p["validFrom"] is None


def test_create_errors(client, engine):
    assert create(client, "bad/name").status_code == 400
    assert create(client, "unknown").status_code == 400
    assert create(client, "Ali", "admin").status_code == 400
    assert create(client, "Ali", "guest", validFrom="tomorrow").status_code == 400
    assert create(client, "Ali", "guest", validFrom="2026-10-25T00:00Z",
                  validTo="2026-10-24T00:00Z").status_code == 400
    assert create(client, "Ali", n=0).status_code == 400
    bad = client.post("/api/people", data={"name": "Ali"},
                      files=[("photos", ("x.jpg", b"not an image", "image/jpeg"))])
    assert bad.status_code == 400
    engine.face_ok = False
    r = create(client, "Ali")
    assert r.status_code == 400 and "No face found" in r.json()["detail"]
    assert not (engine.faces_path / "Ali").exists()
    assert sql("SELECT COUNT(*) FROM people")[0][0] == 0


def test_create_duplicate_409(client):
    assert create(client, "Ali").status_code == 201
    assert create(client, "ali").status_code == 409
    assert create(client, "ALI").status_code == 409


def test_list_order_and_sync(client, engine):
    create(client, "Zed")
    create(client, "Bob", "guest")
    (engine.faces_path / "Amy").mkdir()          # copied in by hand -> synced as family
    names = [(p["name"], p["role"]) for p in client.get("/api/people").json()]
    assert names == [("Amy", "family"), ("Zed", "family"), ("Bob", "guest")]


def test_last_seen(client, engine):
    pid = create(client, "Ali").json()["id"]
    engine.last_seen = {"Ali": 1_800_000_000}
    p = client.get("/api/people").json()[0]
    assert p["id"] == pid and p["lastSeen"] == "2027-01-15T08:00:00Z"


def test_patch(client, engine):
    pid = create(client, "Ali").json()["id"]
    engine.calls.clear()
    r = client.patch(f"/api/people/{pid}", json={"role": "guest",
                                                 "validFrom": "2026-10-24T14:00Z"})
    assert r.status_code == 200
    p = r.json()
    assert p["role"] == "guest" and p["validFrom"] == "2026-10-24T14:00:00Z"
    assert p["validTo"] is None and engine.calls == ["reload_people"]
    p = client.patch(f"/api/people/{pid}", json={"validTo": "2026-10-24T18:00Z"}).json()
    assert p["validFrom"] == "2026-10-24T14:00:00Z" and p["validTo"] == "2026-10-24T18:00:00Z"
    p = client.patch(f"/api/people/{pid}", json={"validFrom": None}).json()
    assert p["validFrom"] is None and p["validTo"] == "2026-10-24T18:00:00Z"
    p = client.patch(f"/api/people/{pid}", json={"role": "family"}).json()
    assert p["role"] == "family" and p["validTo"] is None and p["active"] is True
    assert client.patch(f"/api/people/{pid}", json={"role": "boss"}).status_code == 400
    assert client.patch(f"/api/people/{pid}", json={"role": "guest", "validFrom": "x"}
                        ).status_code == 400
    assert client.patch(f"/api/people/{pid}", json={
        "role": "guest", "validFrom": "2026-10-25T00:00Z",
        "validTo": "2026-10-24T00:00Z"}).status_code == 400
    assert client.patch("/api/people/999", json={}).status_code == 404


def test_delete_removes_row_and_folder(client, engine):
    pid = create(client, "Ali").json()["id"]
    assert (engine.faces_path / "Ali").is_dir()
    engine.calls.clear()
    assert client.delete(f"/api/people/{pid}").status_code == 204
    assert not (engine.faces_path / "Ali").exists()
    assert sql("SELECT COUNT(*) FROM people")[0][0] == 0
    assert engine.calls == ["reload_people"]
    assert client.get("/api/people").json() == []
    assert client.delete(f"/api/people/{pid}").status_code == 404


def test_add_photos_and_thumbnail(client, engine):
    pid = create(client, "Ali").json()["id"]
    files = [("photos", ("a.png", jpeg(), "image/jpeg"))]
    p = client.post(f"/api/people/{pid}/photos", files=files).json()
    assert p["photoCount"] == 2
    r = client.get(f"/api/people/{pid}/photo")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.content[:2] == b"\xff\xd8"
    engine.face_ok = False
    assert client.post(f"/api/people/{pid}/photos", files=files).status_code == 400
    assert client.post("/api/people/999/photos", files=files).status_code == 404


def test_photo_404_without_photos(client, engine):
    (engine.faces_path / "Empty").mkdir()
    pid = client.get("/api/people").json()[0]["id"]
    assert client.get(f"/api/people/{pid}/photo").status_code == 404


def test_reload(client, engine):
    (engine.faces_path / "Kid").mkdir()
    r = client.post("/api/people/reload")
    assert r.status_code == 200 and [p["name"] for p in r.json()] == ["Kid"]
    assert "reload_people" in engine.calls
