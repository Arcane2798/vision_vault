---
trigger: glob
globs: "*.py"
---

# Backend agent rules (Python: engine, API, utilities)

Read `AGENTS.md` first — it holds the plan, positioning and checklist.

## You own
`engine.py`, `vault_utils.py`, `api.py`, `main.py`, and any new top-level `*.py` module.
Do **not** edit `frontend/` or `tests/`. If the frontend or a test needs a change, say so in your summary.

## API contract
- The backend is authoritative. When you add or change an endpoint, update the **"Current API"** table in
  `AGENTS.md` in the same commit — the frontend agent builds from that table.
- JSON uses camelCase keys and ISO 8601 UTC timestamps, like `_incident()` in `api.py`.
- All dashboard endpoints live under the `/api` router in `api.py`, not in `main.py`.

## Database
- Schema changes go in `vault_utils.init_db()` using the existing "add column if missing" pattern. Never drop tables or data.
- Use `vault_utils.DB_PATH` / `api.DB_PATH` (tests replace it with a temp file) — never hard-code `"vault.db"`.

## Engine
- `VisionEngine._loop` runs in a background thread. Any state read by the API goes under `self.lock`.
- Never block the loop: network calls (Telegram) and ffmpeg run in daemon threads, as in `vault_utils`.
- Put decision logic (e.g. "is this visitor allowed now?") in **small pure functions** with no OpenCV/model
  dependency, so the tester agent can unit-test them.
- Never import `main.py` from another module — importing it loads YOLO and opens the camera.

## Verify before you finish
- `py -m py_compile engine.py vault_utils.py api.py main.py`
- Run `py -m uvicorn main:app --port 8000` and `curl` the endpoints you touched.
- Run `py -m pytest -q` if `tests/` exists.

## Style
4-space indentation, type hints where helpful, small functions, no new frameworks. One commit per feature;
stage only your own files (`git add <paths>`, never `git add -A`). Tick the `AGENTS.md` checklist in the same commit.
