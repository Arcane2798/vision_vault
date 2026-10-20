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
- `FakeEngine` needs what the API reads: `camera_name` (e.g. `"Camera #1: Front Door"`), `running`,
  `get_status()`, and later `reload_people()`.
- Temp database: `monkeypatch.setattr(vault_utils, "DB_PATH", str(tmp_path / "t.db"))` **and** the same for
  `api.DB_PATH` (api imports it by value), then call `vault_utils.init_db()`. Insert rows with `vault_utils.log_event`.
- Never send real Telegram messages: monkeypatch `vault_utils.send_telegram`.
- Never call a real LLM: monkeypatch the chat client and return canned tool calls.

## What to cover (in priority order)
1. Incidents: row → `Incident` mapping, `search` / `status` / `from` / `to` / `sort` filters, PATCH status
   validation (422 on bad status, 404 on missing id), snapshot/clip URLs.
2. Dashboard: `summary` counters and `trend` buckets.
3. Visitor windows (Phase 1): allowed inside the window, `guest_outside_window` outside it, family always
   allowed, boundaries at exactly `valid_from` / `valid_to`.
4. People API (Phase 1): create with photo upload, update window, delete removes folder + row.
5. Embedding cache signature (Phase 1): unchanged folder is not recomputed, changed folder is.
6. Chat tools (Phase 2): read tools return correct data; write tools return `pendingAction` and change nothing.
7. Guard-house alert (Phase 2): sent for `intrusion` only, skipped when `GUARD_TG_CHAT_ID` is unset.

Model-dependent engine behaviour is not unit-tested. An optional smoke test with `test_videos/test1.mp4`
must be marked `@pytest.mark.slow` and skipped by default.

## Frontend
No JS test framework before Friday. The frontend "test" is `npm run typecheck` and `npm run build` in `frontend/`.

One commit per feature; stage only `tests/` and test config paths.
