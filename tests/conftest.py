"""Shared fixtures: temp DB + faces dir, FakeEngine, TestClient.
No camera, models, Telegram or LLM are ever used."""
import sqlite3
import time

import cv2
import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api
import rules
import vault_utils


class FakeEngine:
    """Covers every engine.* attribute used by api.py and chat.py."""

    def __init__(self, faces_path):
        self.camera_name = "Camera #1: Front Door"
        self.running = True
        self.faces_path = faces_path
        self.face_ok = True
        self.calls = []
        self.last_seen = {}
        self.in_view = []
        self.sec = {"level": "normal", "night_enabled": False, "night_start": "23:00",
                    "night_end": "06:00", "updated_at": None}

    def get_status(self):
        return {"running": self.running, "fps": 5.2, "unknown_count": 1,
                "camera": self.camera_name,
                "security_level": self.get_security()["effective_level"],
                "in_view": self.in_view}

    def get_last_seen(self):
        return dict(self.last_seen)

    def has_face(self, img):
        self.calls.append("has_face")
        return self.face_ok

    def reload_people(self):
        self.calls.append("reload_people")

    def get_security(self):
        s = dict(self.sec)
        s["effective_level"] = rules.effective_level(
            s["level"], s["night_enabled"], s["night_start"], s["night_end"], time.time())
        return s

    def set_security(self, level=None, night_enabled=None, night_start=None, night_end=None):
        if level is not None:
            rules.security_params(level)          # ValueError on unknown level
        for v in (night_start, night_end):
            if v is not None and not rules.valid_hhmm(v):
                raise ValueError(f"bad time {v!r}")
        for k, v in (("level", level), ("night_enabled", night_enabled),
                     ("night_start", night_start), ("night_end", night_end)):
            if v is not None:
                self.sec[k] = v
        self.sec["updated_at"] = time.time()

    def get_source(self):
        return {"source": 0, "is_file": False, "is_default": True,
                "finished": False, "progress": None}

    def set_source(self, path):
        self.calls.append(("set_source", path))


@pytest.fixture
def sent(tmp_path, monkeypatch):
    """Temp DB + Telegram capture. Returns the list of captured send_telegram calls."""
    path = str(tmp_path / "t.db")
    monkeypatch.setattr(vault_utils, "DB_PATH", path)
    monkeypatch.setattr(api, "DB_PATH", path)
    out = []
    fake = lambda *a, **k: out.append((a, k))
    monkeypatch.setattr(vault_utils, "send_telegram", fake)
    monkeypatch.setattr(api, "send_telegram", fake)
    monkeypatch.setattr(vault_utils, "_send",
                        lambda *a, **k: pytest.fail("real Telegram send attempted"))
    monkeypatch.setattr(api, "house_unit", lambda: "No. 12, Test Lane")
    monkeypatch.setattr(vault_utils, "FACES_DIR", tmp_path / "faces")
    monkeypatch.setattr(api, "FACES_DIR", tmp_path / "faces")
    vault_utils.init_db()
    return out


@pytest.fixture
def engine(tmp_path, sent):
    faces = tmp_path / "faces"
    faces.mkdir(exist_ok=True)
    return FakeEngine(faces)


@pytest.fixture
def client(engine):
    app = FastAPI()
    app.include_router(api.create_router(engine))
    return TestClient(app)


def jpeg(color=(0, 128, 255)):
    img = np.full((64, 64, 3), color, np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def add_event(identity="unknown", event_type="intrusion", ts=None, **kw):
    eid = vault_utils.log_event(vault_utils.CAMERA_NAME, 1, identity, event_type, **kw)
    if ts is not None:
        con = sqlite3.connect(vault_utils.DB_PATH)
        con.execute("UPDATE events SET ts=? WHERE id=?", (ts, eid))
        con.commit()
        con.close()
    return eid


def sql(query, args=()):
    con = sqlite3.connect(vault_utils.DB_PATH)
    try:
        rows = con.execute(query, args).fetchall()
        con.commit()
        return rows
    finally:
        con.close()
