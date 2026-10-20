---
trigger: glob
globs: "tests/**"
---

# Test agent rules (pytest for the backend, build checks for the frontend)

Read `AGENTS.md` first. Tests check the behaviour described there and in the "Current API" table.

## You own
`tests/` and test configuration (`pytest.ini`, `requirements-dev.txt`).
Do **not** change application code. When a test exposes a bug, leave the test failing (or mark it
`@pytest.mark.xfail(reason=...)`) and report the bug with `file:line`, the input, and expected vs actual.

## Setup
`py -m pip install pytest httpx` (httpx is needed by FastAPI's `TestClient`). Run with `py -m pytest -q`.

## How to test without a camera or models
- **Never import `main.py`** — it loads YOLO/InsightFace and opens the webcam.
- Build the app in a fixture: `FastAPI()` + `include_router(api.create_router(FakeEngine()))`.
- `FakeEngine` needs everything `api.py` calls on `engine.` (check with `grep -o "engine\.\w*" api.py`). Today:
  `camera_name`, `running`, `faces_path` (point it at `tmp_path / "faces"`), `get_status()`, `get_last_seen()`,
  `has_face(img)` (make it configurable so tests can simulate "no face found"), `reload_people()`,
  `get_security()`, `set_security(...)`. Record calls so tests can assert e.g. `reload_people` ran after a create.
- Test photos: generate a small image with `numpy` + `cv2.imencode` in the test; never use real `faces/` photos.
- Temp database: `monkeypatch.setattr(vault_utils, "DB_PATH", str(tmp_path / "t.db"))` **and** the same for
  `api.DB_PATH` (api imports it by value), then call `vault_utils.init_db()`. Insert rows with `vault_utils.log_event`.
- Never send real Telegram messages: monkeypatch `vault_utils.send_telegram`.
- Never call a real LLM: monkeypatch the chat client and return canned tool calls.

## What to cover (in priority order)
0. Pure rules in `rules.py` (fastest, most valuable): `visitor_allowed`, `classify_person`, `valid_person_name`,
   `security_params`, `valid_hhmm`, `in_night_window` (including windows that cross midnight), `effective_level`.
1. Incidents: row → `Incident` mapping (including `identity`), `search` / `status` / `from` / `to` / `sort` filters, PATCH status
   validation (422 on bad status, 404 on missing id), snapshot/clip URLs.
2. Dashboard: `summary` counters and `trend` buckets.
3. Visitor windows (Phase 1): allowed inside the window, `guest_outside_window` outside it, family always
   allowed, boundaries at exactly `valid_from` / `valid_to`.
4. People API (Phase 1): create with photo upload, update window, delete removes folder + row.
5. Security API: `GET/PUT /api/security` round-trip, 400 on unknown level or bad "HH:MM", `/api/status` shape.
6. Embedding cache signature (Phase 1): unchanged folder is not recomputed, changed folder is
   (only if it can be tested without loading InsightFace; otherwise skip).
7. Chat tools (Phase 2): read tools return correct data; write tools return `pendingAction` and change nothing.
8. Guard-house alert (Phase 2): sent for `intrusion` only, skipped when `GUARD_TG_CHAT_ID` is unset.

Model-dependent engine behaviour is not unit-tested. An optional smoke test with `test_videos/test1.mp4`
must be marked `@pytest.mark.slow` and skipped by default.

## Frontend
No JS test framework before Friday. The frontend "test" is `npm run typecheck` and `npm run build` in `frontend/`.

One commit per feature; stage only `tests/` and test config paths.
