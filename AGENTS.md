# Vision Vault

AI-powered smart township home security: a CCTV/webcam feed is watched by YOLOv8 + InsightFace;
unknown people trigger a recorded incident, a snapshot, and Telegram alerts to the homeowner and guard house.

**Hackathon:** Sime Darby Property University Hackathon 2026 — theme "Township of Tomorrow".
**Deadline: Friday 23 Oct 2026.** Owner / lead: Azhad (backend + vision). Frontend was built by a teammate.

## Positioning — "Township of Tomorrow" (decided Tue 20 Oct)
**Vision Vault is smart home security that plugs into the township.** Each home runs its own camera + AI.
Recognised residents pass silently; registered **visitors** are allowed inside their time window (like a gated
community's visitor registration); an unknown person alerts **both the homeowner and the township guard house**
with a snapshot and clip. Footage and face data stay inside the home (privacy by design).

- UI wording: "residents" / "family", **"visitors"** (never "guests"), "guard house". No "theft" wording.
  The word "township" is fine where it means the community. Backend role names stay `family` / `guest`.
- Scope stays one home, one camera. A township-wide guard dashboard (many homes) is KIV — pitch it, don't build it.

> This file is the single source of truth for status and plan. It is read by Antigravity (`AGENTS.md`)
> and by Claude Code (via `CLAUDE.md` → `@AGENTS.md`). **When you finish a task, tick it here.**

## Ground rules for AI agents
- **The backend is authoritative.** The frontend adapts to the backend's model, not the other way round.
- **Do not delete anything** in "Pending deletion" until the owner confirms in chat.
- **Login/auth is KIV.** Do not build it. Keep `VITE_AUTH_ENABLED=false`; leave `AuthContext` in place.
- Single household, single camera (`cam-01`). Do not build multi-camera management.
- Keep changes small and demo-focused; nothing new after Thursday night except bug fixes.

## Agent roles
Three roles with strict file ownership, so agents can work in parallel without overwriting each other.
Role rules live in `.agents/rules/` (Antigravity loads them automatically by file glob);
Claude Code subagents in `.claude/agents/` point to the same files.

| Role | Owns | Rules file | Claude Code agent |
|---|---|---|---|
| Backend | `*.py` at the root | `.agents/rules/backend.md` | `backend` |
| Frontend | `frontend/` | `.agents/rules/frontend.md` | `frontend` |
| Tester | `tests/`, test config | `.agents/rules/testing.md` | `tester` |

Hand-off: backend updates the "Current API" table → frontend builds against it → tester writes tests from it.
Each agent commits only its own paths. Cross-area changes are requested in the agent's summary, not made directly.

## Architecture

```
 Webcam / test video  (VIDEO_SOURCE env: "0" = webcam, or a file path)
        │
        ▼
 VisionEngine thread (engine.py)
   YOLOv8n + ByteTrack → person tracks
   InsightFace on head crop → matched identity or "unknown"
   Rules: track ≥ 10 frames, unknown for the grace period (3 s at Normal) → intrusion
        │ annotated JPEG                       │ intrusion
        ▼                                      ▼
   /video (MJPEG stream)           vault_utils.py: snapshot, clip (5 s pre + 5 s post,
        │                          re-encoded to H.264), SQLite `events`, Telegram (15 s cooldown)
        ▼                                      │
 FastAPI  main.py + api.py  (/api/*)  ◄────────┘
        │  REST + WebSocket
        ▼
 frontend/  React 18 + TypeScript + Vite + Tailwind  (live mode, no login)
```

Boxes/labels are drawn into the video frame by the engine; the frontend does not draw live overlays.

## Tech stack
- **Backend:** Python, FastAPI, Ultralytics YOLOv8n, InsightFace (`buffalo_s`, CPU), OpenCV, SQLite, imageio-ffmpeg
- **Frontend:** `frontend/` — React 18, TypeScript, Vite 5, Tailwind 3, React Router 6, Recharts, lucide-react
- **Alerts:** Telegram bot (`TG_TOKEN`, `TG_CHAT_ID` in `.env`)
- **AI assistant:** Google Gemini API via the `google-genai` SDK (free-tier Flash model, `GEMINI_API_KEY`); text only, never camera frames
- **Hardware:** USB webcam

## Key files
| Path | Purpose |
|---|---|
| `engine.py` | `VisionEngine`: capture loop, detection, tracking, face recognition, intrusion rules |
| `vault_utils.py` | DB schema/migrations, `log_event`, `ClipRecorder`, H.264 conversion, Telegram |
| `api.py` | `/api/*` router used by `frontend/` (maps `events` rows → frontend `Incident` shape) |
| `main.py` | App setup, CORS, `/video` MJPEG stream, static `/clips` and `/snapshots` |
| `chat.py` | AI assistant: tool functions, PendingAction builders, bounded tool loop; only `_generate` / `make_client` / `provider_error` know about Gemini |
| `faces/<name>/` | Enrollment photos (one folder per person). `faces/embeddings.pkl` = cache |
| `frontend/src/types/index.ts` | Frontend data types = API contract |
| `frontend/src/services/` | The only place the frontend fetches data |
| `frontend/.env.local` | Frontend settings (live mode, websocket, auth off) |
| `.env` | `TG_TOKEN`, `TG_CHAT_ID`, optional `VIDEO_SOURCE`; optional `GUARD_TG_TOKEN` (separate guard bot; with no `GUARD_TG_CHAT_ID` it messages `TG_CHAT_ID`, so one account gets two bot chats) and `GUARD_TG_CHAT_ID` (guard-house chat; with neither set there is no guard Telegram copy) and `HOUSE_UNIT` (e.g. `No. 12, Jalan Elmina 3/1`); `GEMINI_API_KEY` (AI assistant; unset = `/api/chat` returns 503) and optional `CHAT_MODEL` (default `gemini-3.5-flash-lite`, set in `chat.DEFAULT_MODEL`; `gemini-3.8-flash` allows only 20 free requests/day). There is no backend `.env.example`; copy these lines:<br>`# GUARD_TG_CHAT_ID=-1001234567890`<br>`# HOUSE_UNIT=No. 12, Jalan Elmina 3/1`<br>`# GEMINI_API_KEY=your-key-from-aistudio.google.com`<br>`# CHAT_MODEL=gemini-3.5-flash-lite` |

## Vision settings (`.env`, added Wed 21 Oct)
| Key | Default | Meaning |
|---|---|---|
| `VISION_MODE` | (empty) | `legacy` = pre-Wed-21-Oct behaviour: 640x480, buffalo_s recogniser, face check every 8 frames |
| `CAPTURE_SIZE` | `1280x720` | Camera capture size. Faces are cropped from this; YOLO/stream/clips use a 640-wide copy |
| `FACE_RECOGNIZER` | `buffalo_l` | InsightFace pack for recognition (ResNet-50). Cache: `faces/embeddings_<pack>.pkl` (`embeddings.pkl` for buffalo_s) |
| `FACE_DETECTOR` | `buffalo_s` | Pack for face detection (fast det_500m). Only detection + recognition run, no landmark/age models |
| `FACE_CHECK_FRAMES` | `3` | Frames between face checks while a person is unknown; any match during the grace period cancels the alert |
Measured on the i7-10510U: face check 110 ms (was 262 ms), engine 7–10 FPS on `test1.mp4` with 2–3 people.

## Setup & run
```bash
pip install ultralytics insightface fastapi uvicorn python-dotenv opencv-python requests imageio-ffmpeg python-multipart google-genai
```
- Backend (from `vision_vault/`): `py -m uvicorn main:app --port 8000`
  - Guard House view runs on the same laptop: switch with the bottom-left button (decided Tue 20 Oct: no phone in the demo).
    CORS also allows private-LAN origins on port 5173, unused for now.
  - On Azhad's laptop use `py` (Python 3.14 has the packages); `python` there is only the Microsoft Store stub.
  - Test video instead of webcam: set `VIDEO_SOURCE=test_videos/test1.mp4` in `.env`
- Frontend (from `vision_vault/frontend/`): `npm install` once, then `npm run dev` → http://localhost:5173
- Node.js 18+ required.

## Current API (what actually exists)
| Method | Path | Notes |
|---|---|---|
| GET | `/video` | MJPEG stream (use `<img>`, not `<video>`) |
| GET | `/clips/*`, `/snapshots/*` | Static evidence files |
| GET | `/api/cameras` | Single camera `cam-01`; POST/PUT/DELETE return 501 |
| GET | `/api/incidents` | `?search&cameraId&status&from&to&sort`; search also matches `identity`. Incident JSON includes `identity` (`unknown` or the visitor's name) `guardNotified: bool` (alert reached the guard house: every intrusion), `guardAcknowledgedAt: ISO|null`, `guardAckNote: string|null`, `items: string[]` (e.g. `["knife"]`, seen near the unknown person; `events.items`), and `clipReady: bool` — `clipUrl` appears as soon as recording starts, but play it only when `clipReady` is true (≈ 5–10 s after the alert; false when there is no clip) |
| GET / PATCH | `/api/incidents/{id}` | PATCH `{status, notes}`; status ∈ new, under_review, confirmed, dismissed |
| GET | `/api/dashboard/summary`, `/api/dashboard/trend?days=14` | |
| WS | `/api/ws/events` | `{type:"alert", data: Incident}` and `{type:"camera_status", ...}` |
| GET | `/api/status` | `{running, fps, unknownCount, cameraName, securityLevel, peopleInView}` — live engine state; `securityLevel` = effective level; `peopleInView: [{name, kind}]` one entry per tracked person in the latest frame (static figures excluded), `kind` ∈ `family`, `guest_allowed`, `guest_outside`, `unknown` (name `unknown`) |
| GET | `/api/security` | `{level, effectiveLevel, highReason: "sleep"\|"away"\|null, night: {enabled, start, end}, away: {enabled, from: ISO\|null, to: ISO\|null}, updatedAt: ISO\|null}`. `night` = daily **sleep time**; `away` = **away-from-home** dates (vacation). Either forces `effectiveLevel` = `high`; `highReason` says which (away wins). `updatedAt` null until first change |
| PUT | `/api/security` | `{level?, night?: {enabled?, start?, end?}, away?: {enabled?, from?, to?}}` → same shape as GET. In `away`, omitted = unchanged, `null` = open-ended; turning `enabled` off keeps the dates. 400 on unknown level, bad "HH:MM" (24-hour, zero-padded), bad date, or `from` ≥ `to` |
| POST | `/api/chat` | `{messages: [{role: "user"\|"assistant", content}]}` (last 20 kept) → `{reply, pendingAction: PendingAction\|null}` (shape in Phase 2). 503 `{detail: "Chat is not configured: add GEMINI_API_KEY to .env"}` without a key; free-tier quota → 200 with reply "Viva Bot is busy right now (Gemini free tier). Try again in a minute."; other AI errors → 502 `{detail}`; 400 no user message; 422 bad role. PendingAction dates are ISO UTC `Z` (the model works in Asia/Kuala_Lumpur time). Takes a few seconds: use a long client timeout |
| GET | `/api/people` | `Person[]`, family first then by name (Person JSON in Phase 1 spec; `id` is a number) |
| POST | `/api/people` | multipart `name, role (default family), validFrom?, validTo?, photos` (repeat `photos` per file) → 201 `Person`. 400 bad name/role/date, from > to, no photo, unreadable image or **no face found**; 409 name taken (case-insensitive) |
| PATCH | `/api/people/{id}` | JSON `{role?, validFrom?, validTo?}` → `Person`. Omitted = unchanged, `null` = clear (open-ended). Role `family` clears the window |
| DELETE | `/api/people/{id}` | → 204; removes the row and `faces/<name>/` |
| POST | `/api/people/{id}/photos` | multipart `photos` → `Person` (same photo checks as create) |
| POST | `/api/people/reload` | re-read `faces/` (photos copied in by hand) and re-embed only changed folders → `Person[]`. The People page "Refresh faces" button calls it |
| GET | `/api/people/{id}/photo` | first photo as a JPEG thumbnail (≤ 320 px); 404 if none. `faces/` itself is never served |
| GET | `/api/guard/alerts` | `?limit=50` (1–200) → newest first, only events with `guard_notified = 1`: `[{id: string, timestamp, houseUnit, cameraName, snapshotUrl: string\|null, clipUrl: string\|null, clipReady, acknowledgedAt: ISO\|null, ackNote: string\|null, items: string[]}]`. **No identity or people data.** `houseUnit` = `HOUSE_UNIT` (fallback "This home") |
| POST | `/api/guard/alerts/{id}/ack` | JSON `{note?: string}` (≤ 200 chars, body optional) → that alert. The first ack sets `acknowledgedAt` and sends the homeowner a Telegram text ("🛡 Guard house acknowledged the alert at HH:MM — note"); a repeat keeps the time and only updates the note (if given). 404 if not a guard alert; 400 note too long |
| GET | `/api/source` | `{kind: "camera"\|"file", name, finished, progress: 0..1\|null, videos: [{name, sizeBytes, modifiedAt}]}` — what the engine watches |
| PUT | `/api/source` | `{kind: "camera"}` or `{kind: "file", name}` → same shape as GET. Test videos play **once** in real time (frames skipped if the engine is slower), stamped `TEST VIDEO`, then hold the last frame. Same name again = restart. 404 unknown video |
| POST | `/api/source/videos` | multipart `video` → 201 `{name, sizeBytes, modifiedAt}`, saved in `test_videos/` (renamed `_1`, `_2` if taken). 400 bad type, > 500 MB, or unreadable |

**`events` table:** `id, ts (epoch), camera, track_id, identity, event_type, clip_path, snapshot_path, status, notes, reviewed_at, clip_ready, guard_notified, guard_ack_at, guard_ack_note`.
`guard_notified` = 1 for every `intrusion` at any level (the Guard House view is a channel), even inside the Telegram cooldown and without `GUARD_TG_CHAT_ID`. The guard Telegram copy still needs `GUARD_TG_CHAT_ID` and respects the cooldown. Pure rules: `rules.guard_alert_due`, `rules.should_alert_guard`, `rules.guard_ack_message`. `guard_ack_at` = epoch of the first guard ack.
`clip_ready` = 1 once H.264 conversion of `clip_path` ends (all events sharing that clip); on startup, rows older than 2 min are marked ready.
Clips are written at the engine's measured FPS (`vault_utils.clip_fps`), with 5 s pre-roll (by time) + 5 s post-roll.
`event_type` ∈ `intrusion` (identity `unknown`) | `guest_outside_window` (identity = visitor's name).

Dates in: ISO 8601; with no offset (e.g. `datetime-local` "2026-10-24T14:00") they mean the server's local time.
Dates out: ISO UTC with `Z`. Uploads take ~1 s per photo (face embedding), so use a long client timeout.

**`settings` table:** `key, value, updated_at` — keys `security_level`, `night_enabled` ("0"/"1"), `night_start`, `night_end`,
`away_enabled` ("0"/"1"), `away_from`, `away_to` (epoch as text, "" = open-ended).
Pure security rules: `rules.security_params`, `rules.effective_level`, `rules.high_reason`, `rules.in_night_window`,
`rules.in_away_window`, `rules.valid_away_window`, `rules.valid_hhmm`.
The frame's top-right corner shows only the effective level (`NORMAL` or `HIGH`); the dashboard explains why High is on.

**`people` table:** `id, name (= faces/ folder, unique, case-insensitive), role ('family'|'guest'), valid_from, valid_to, created_at`.
Pure rules live in `rules.py` (`visitor_allowed`, `classify_person`, `valid_person_name`). A guest window bound that is
NULL is open-ended. Live-frame colours: family green, visitor in window cyan (`guest:<name>`), visitor outside window
orange, unknown red. (The static-figure filter was removed Wed 21 Oct: no posters in the demo.)

## Feature map (owner's list, Tue 20 Oct)
| # | Feature | Status | Where in plan |
|---|---|---|---|
| 1 | Real-time person detection & tracking | ✅ done | Phase 3: prune per-track state |
| 2 | Face recognition, homeowner registers faces | ✅ done (register via Residents & Visitors page) | Phase 1: cache fix + `/people` page with upload |
| 3 | Intrusion snapshot + clip | ✅ done (clip race + speed fixed) | Phase 2: `clip_ready` |
| 4 | Telegram alert | ✅ done | Phase 2: guard-house copy, weapon note |
| 5 | Web dashboard (live, history, analytics) | ✅ done (rebranded to Vision Vault) | Phase 0: rebrand, `/api/status` |
| 5.1 | Security level control | ✅ done (Normal / High; auto-High during sleep time and away-from-home dates) | Phase 1: `security_level`; two levels + away dates added Wed 21 Oct |
| 6 | Visitor registration | ✅ done | Phase 1: `people` table + `/people` page — **core** |
| 7 | Guard-house alert & dashboard | ✅ Telegram copy + mock Guard House view (/guard) with acknowledge | Phase 2: alert to guard-house Telegram. Dashboard for many homes = KIV (pitch only) |
| 8 | AI assistant (live feed, locate family) | ✅ Gemini chat with tools + confirm (needs GEMINI_API_KEY) | Phase 1: `lastSeen` per person. Phase 2: chatbot + tools |
| 9 | Path tracking | ✅ done (trail on live frame + snapshot) | Phase 3: trail drawn on live frame + burned into snapshot |
| 10 | Intruder's items detection | ✅ prototype (knife / scissors / baseball bat near an unknown person; untested on a real knife) | Phase 3 (optional): COCO `knife` / `scissors` / `baseball bat` near an unknown person |

"Locate family members" is honest only as **"last seen at the front door at 14:32"** because there is one camera. Say it that way in the UI and chatbot.

## Status (as of Tue 20 Oct 2026)

### Done
- [x] Person detection + ByteTrack tracking, face recognition against `faces/`
- [x] Intrusion rules (min track age, grace period by security level); static-figure filter removed Wed 21 Oct
- [x] Snapshot + pre/post-roll clip recording, H.264 conversion for browser playback
- [x] SQLite event log with review status/notes
- [x] Telegram alerts with photo
- [x] Teammate's frontend wired to backend in live mode (incidents, dashboard, live feed, WebSocket alerts)

### Previously mis-reported, now done
- [x] **Guest whitelisting** — done: people table, visitor time windows, `/api/people` and the Residents & Visitors page.

### Known issues
- ~~Alert WebSocket sends `clipUrl` before the clip is converted~~ — fixed: backend exposes `clipReady`, incident detail and Guard House show "Clip processing…" until ready.
- Incident `confidence` is hard-coded `1.0` (alerts are rule-based).
- ~~Engine per-track dicts grow forever on long runs~~ — fixed Wed 21 Oct: tracks unseen for 30 s are forgotten (`rules.stale_tracks`).
- Project sits in OneDrive — push to GitHub after every feature.
- **Security limitation (state it in the demo):** a printed photo of a family member is accepted (no liveness check).
- **AI assistant privacy:** on the Gemini free tier, Google may use prompts to improve its products. Only text metadata (incident times/status, names, security level) is sent, never camera frames or photos.
- **AI assistant limits:** the free tier has a per-model daily request cap (resets midnight Pacific = 3 pm Malaysia) and is slow under load (10–30 s per reply). Each question uses 2–3 requests. Don't burn the quota on the day; check limits in AI Studio. Gemini function responses go in a `user` turn (role `tool` is rejected).

## Plan to Friday

### Phase 0 — Clean-up & frontend adaptation (Tue 20)
- [x] `git init`, root `.gitignore` adds `node_modules/`, `dist/`, `.env.local`, `*.pt`; first commit; pushed to https://github.com/Arcane2798/vision_vault
- [x] Owner reviews "Pending deletion" list, then delete confirmed items
- [x] Backend: add `GET /api/status` (`running, fps, unknownCount, cameraName`); remove legacy `/status` and `/events` from `main.py`
- [x] Frontend rebrand: `VITE_APP_NAME=Vision Vault` (in `.env.local` and the `env.ts` fallback); sidebar subtitle
      "Smart township home security"; `index.html` title; remove all "theft" wording and "Township CCTV" names
      (`grep -rniE "township|theft" frontend/src frontend/index.html`); follow the Positioning wording rules
- [x] Frontend: remove Cameras page from nav + routes (single fixed camera)
- [x] Frontend: event-type labels in `utils/format.ts` — `intrusion` → "Unknown person", `guest_outside_window` → "Visitor outside allowed time"
- [x] Frontend: incident detail shows identity; hide confidence for rule-based events
- [x] Frontend: dashboard / live page shows FPS + "unknown in view" from `/api/status`
- [x] Rewrite root `README.md` to match reality; replace `frontend/README.md` (and `.env.example` now holds the live Vision Vault settings)
- [x] README: "Why it matters for the Township of Tomorrow" section

### Phase 1 — People & guest whitelisting (Wed 21) — core feature
- [x] **Embedding cache fix:** cache per person with a signature (file names + mtimes); recompute only changed folders
- [x] **`people` table** in `vault.db`: `id, name (= faces/ folder), role ('family'|'guest'), valid_from, valid_to (epoch, NULL for family), created_at`.
      On startup and on reload, insert a `family` row for every `faces/` folder that has no row (back-compat, so every person has an id).
      Names must be folder-safe (letters, digits, space, `-`, `_`; reject anything else with 400).
- [x] **Engine:** `reload_people()` (thread-safe, under `self.lock`) called by the API after changes. After a face match:
      family → allowed (green); guest inside window → allowed (cyan, label `guest:<name>`);
      guest outside window → event `guest_outside_window` + Telegram (orange); no match → `intrusion` (red).
      Window check is a pure function `visitor_allowed(role, valid_from, valid_to, now) -> bool`.
- [x] **Engine:** `last_seen: {name: epoch}` updated whenever a known person is matched (under `self.lock`); exposed as `lastSeen` on people.
- [x] **API** (needs `pip install python-multipart`):
      `GET /api/people`, `POST /api/people` (multipart: name, role, validFrom?, validTo?, photos[]),
      `PATCH /api/people/{id}` (JSON `{role?, validFrom?, validTo?}`), `DELETE /api/people/{id}` (row + folder),
      `POST /api/people/{id}/photos` (multipart photos[]), `GET /api/people/{id}/photo` (first photo as JPEG; `faces/` is never mounted publicly).
      **Person JSON:** `{id, name, role: "family"|"guest", validFrom: ISO|null, validTo: ISO|null, active: bool, photoCount: int,
      photoUrl: "/api/people/{id}/photo", lastSeen: ISO|null, createdAt: ISO}`. `active` = family, or guest whose window contains now.
- [x] **Security level (feature 5.1):** levels `normal` | `high` (owner decision Wed 21 Oct: Home mode dropped because it skipped the
      guard house, which is wrong in a home invasion with residents inside; Away renamed High). Saved `home`/`away` values are
      mapped by `rules.normalize_level`. Stored in a `settings` table (`key, value`), default `normal`.
      Pure function `security_params(level) -> dict` gives the rule thresholds:
      `normal` — GRACE 3 s, MATCH_THRESH 0.40;
      `high` — GRACE 1 s, MATCH_THRESH raised by 0.05 (stricter face match). The guard house is alerted at both levels.
      Engine `set_security_level(level)` under `self.lock`; the current level is drawn in the frame corner.
      **Night schedule (owner request, Tue 20 Oct):** settings `night_enabled` (default off), `night_start` / `night_end` ("HH:MM", default
      "23:00" / "06:00", local machine time, window may cross midnight). Pure function
      `effective_level(level, night_enabled, night_start, night_end, now) -> str` = `high` inside the night window, else `level`.
      The engine uses the **effective** level (re-check about once a second, not per frame) and draws it as `HIGH (night)` when the schedule applies.
      API: `GET /api/security` → `{level, effectiveLevel, night: {enabled, start, end}, updatedAt}`;
      `PUT /api/security` `{level?, night?: {enabled?, start?, end?}}` (400 on unknown level or bad "HH:MM"); `/api/status` adds `securityLevel` (= effective).
- [x] **Frontend `/people` page** ("Residents & Visitors"): list family + visitors (thumbnail, role, window, active badge, "last seen 14:32"),
      add person with photo upload, edit visitor window, delete with confirm. Types in `types/index.ts`, calls in `services/index.ts`.
- [x] **Frontend security level:** segmented control Normal / High (one-line description each) on the Live Monitoring page,
      plus a small badge with the **effective** level in the top bar. Below it, a "Night mode — auto High" toggle with start/end
      time inputs; when it's active now, show "High (night mode until 06:00)". Calls `GET/PUT /api/security`.

### Phase 2 — Chatbot with tool calling + guard-house alert (Thu 22)
- [x] `POST /api/chat` `{messages}` → `{reply, pendingAction?}` using the **Google Gemini API** (`google-genai` SDK; owner switched from
      Anthropic for a free tier), key `GEMINI_API_KEY` in `.env`, model from `CHAT_MODEL` (default `gemini-3.5-flash-lite`; `gemini-3.8-flash` allows only 20 free requests/day).
      Manual tool loop, automatic function calling **off**, max 6 model calls per request. System prompt includes current local time (Asia/Kuala_Lumpur).
      Code lives in a new `chat.py` (tool functions + loop); `api.py` only adds the route. No key → 503 `{detail: "Chat is not configured: add GEMINI_API_KEY to .env"}`.
      Free-tier quota (429), overload (503) or a 40 s timeout → normal reply "Viva Bot is busy right now (Gemini free tier). Try again in a minute." (no silent retries) (never a 500).
      **Request:** `{messages: [{role: "user"|"assistant", content: string}]}` (plain text history, newest last; server caps at the last 20).
      **Response:** `{reply: string, pendingAction: PendingAction | null}`.
- [x] Tools are plain Python functions reusing existing queries:
      read — `get_summary`, `list_incidents(from, to, status, limit)`, `get_incident(id)`, `get_live_status`, `list_people`,
      `where_is(name)` (answers from `lastSeen`: "last seen at the front door at 14:32");
      write — `review_incident(id, status, notes)`, `add_or_update_guest(name, valid_from, valid_to)`, `set_security_level(level)`,
      `set_away_from_home(leaving?, back?, enabled?)` (vacation dates → `PUT /api/security {away}`; a bare "back" date = end of that day).
      `get_live_status` also reports `chosenLevel`, `highBecause`, `sleepTime` and `awayFromHome`.
      `get_live_status` includes **who is in view right now**: engine `get_status()` adds `in_view: [{name, kind}]`
      (kind = family / guest_allowed / guest_outside / unknown) and `/api/status` adds `peopleInView: [{name, kind}]`.
      Text only — **no camera frames are sent to the AI** (keeps the "footage stays in the home" promise).
- [x] Write tools are **never executed by the model**: they return `pendingAction`; the frontend shows a Confirm button,
      and on confirm calls the normal REST endpoint itself. **PendingAction** (one per reply, the latest wins):
      `{summary: string, kind: "request", method: "PATCH"|"PUT", path: string, body: object}` — e.g.
      `PATCH /api/incidents/12 {status, notes}`, `PUT /api/security {level}`, `PATCH /api/people/3 {role:"guest", validFrom, validTo}`;
      or `{summary, kind: "add_person", prefill: {name, role, validFrom, validTo}}` when the visitor is **not enrolled yet**
      (a new person needs photos, so the frontend opens the Add-person form prefilled instead of calling an endpoint).
- [x] Frontend chat panel (slide-over from the top bar), works from every page. Shows the PendingAction as a card with
      Confirm / Cancel; Confirm runs it through the normal services (or opens the prefilled Add-person modal), then shows
      "Done" or the error in the chat. Suggested prompts on an empty chat: "What happened at the door today?",
      "Who is at the door right now?", "Where is Azhad?", "Switch to High security".
      Live status strip may also list `peopleInView` names.
- [x] **Clip speed:** clips are written at a fixed `CLIP_FPS = 20` while the engine runs ~5 fps, so they play ~4× fast.
      Write each clip at the engine's measured FPS (rounded, min 1) and size the pre-roll buffer in seconds, not frames.
- [x] **Guard-house alert** (small, ~1 h): `.env` gets `GUARD_TG_CHAT_ID` and `HOUSE_UNIT` (e.g. "No. 12, Jalan Elmina 3/1").
      On `intrusion` only, send a second Telegram message with the unit address + snapshot to the guard-house chat
      (same cooldown; skip silently if unset). Add `guard_notified` column; incident detail shows "Guard house notified".
      `guest_outside_window` goes to the homeowner only. The guard copy is sent at every security level.
      Incident JSON adds `guardNotified: bool`.
- [x] Fix clip race: add `clip_ready` column, set to 1 when H.264 conversion finishes; API exposes `clipReady`;
      frontend shows "Clip processing…" until ready (incident detail re-fetches every few seconds while `clipReady` is false).

### Phase 2b — Guard House view (owner-approved Tue 20 Oct, ~2–3 h)
A mock guard-house screen on the same backend that shows the township loop: intrusion → guard sees it → guard acknowledges → homeowner sees the acknowledgement.
Real deployment = a separate township server for many homes (KIV); the demo is one page on the same laptop, reached with the bottom-left switch button.
- [x] **Backend:** `guard_notified` = 1 for every `intrusion` (any level). The guard view counts as a channel,
      so this no longer depends on `GUARD_TG_CHAT_ID`; the Telegram guard copy is still sent only when it is configured.
      New `events` columns `guard_ack_at` (epoch), `guard_ack_note`.
      `GET /api/guard/alerts?limit=50` → newest first, only rows with `guard_notified = 1`:
      `[{id, timestamp, houseUnit, cameraName, snapshotUrl, clipUrl, clipReady, acknowledgedAt: ISO|null, ackNote: string|null}]`.
      **No identity, no people data, no faces** — the guard only sees the stranger's snapshot/clip and the address.
      `POST /api/guard/alerts/{id}/ack` `{note?: string (≤ 200 chars)}` → that alert. 404 if it's not a guard alert. The first ack time is kept, and a repeat only updates the note.
      On the first ack, send the homeowner a Telegram text: "🛡 Guard house acknowledged the alert at HH:MM — <note>" (skip silently if Telegram is unset).
      Incident JSON adds `guardAcknowledgedAt: ISO|null`, `guardAckNote: string|null`. `houseUnit` comes from `HOUSE_UNIT` (fallback "This home").
- [x] **Frontend `/guard` page** — rendered **outside** `AppLayout` (no sidebar, nav or chat: it is a different party's screen).
      - Full-screen and high-contrast: a "Guard House — Township Security" header, a live clock, and a count of unacknowledged alerts.
      - Polls `GET /api/guard/alerts` every 2 s.
      - Unacknowledged alerts sit on top with a pulsing red border. Each shows the snapshot, the **house address in large text**, the time and "x min ago".
      - Acknowledge button with quick-note chips ("Guard dispatched", "Checking CCTV", "False alarm") plus a free-text note.
      - Acknowledged alerts are greyed out, with "Acknowledged 21:14 — Guard dispatched".
      - A new alert shows a red banner and a short beep (Web Audio, enabled after the first click).
      - Loading, empty ("All quiet") and error states.
      - Bottom-left switch buttons: "Switch to Guard House view" in the sidebar and "Homeowner dashboard" on `/guard` (same tab).
      - Incident detail shows "Guard house acknowledged at 21:14 — Guard dispatched" when `guardAcknowledgedAt` is set.

### Phase 3 — Polish & demo (Fri 23, morning only)
- [x] Prune engine per-track state for tracks unseen > 30 s (do this together with path trails, which share the same state)
- [x] **Path tracking (feature 9):** keep a `deque(maxlen=60)` of foot points per track; draw the trail as a polyline on the
      live frame (red for unknown, faded for others) and burn the unknown's trail into the intrusion snapshot.
- [x] Optional quick win **(feature 10):** run YOLO on classes person + `knife`, `scissors`, `baseball bat`; if one overlaps an
      unknown person's box, store it in a new `items` column, add "⚠ carrying knife" to the Telegram text, and show it on the incident.
      YOLOv8n finds knives poorly, so present this as a prototype.
- [ ] Demo rehearsal with `test_videos/test1.mp4` and live webcam; tidy sample data in `vault.db`
- [ ] Final README, final commit, tag `v1.0-demo`

**Demo script:** resident walks in (green, no alert) → visitor inside their window (cyan) → same visitor after the window
(orange, homeowner alerted) → stranger (red: homeowner **and guard house** get Telegram photos, incident appears live)
→ open incident, play clip, mark confirmed → ask chatbot "what happened at the door today?" and
"register Ali as a visitor Saturday 2–6pm" (confirm). Close with the township-wide vision slide.

## KIV (after Friday)
Login & roles · liveness / anti-spoofing · dedicated weapon model (guns) · ESP32 buzzer · township-wide guard dashboard
(many homes) · multi-camera · remove frontend mock mode (`src/mocks/`).

## Pending deletion (awaiting owner check — do not delete yet)
| Item | Why |
|---|---|
| Old files in `clips/`, `snapshots/` + their `vault.db` rows | Owner chose to keep for now; may trim before the demo |

Deleted on Tue 20 Oct (owner-approved): `dashboard/`, `Backup/`, `frontend/dist/`, `frontend/.env.local.mock.bak`,
`__pycache__/`, `faces/rdj/`, `faces/embeddings.pkl` (rebuilds on next start), `CamerasPage.tsx`, `CameraFormModal.tsx`
(route, sidebar link and dashboard link removed; typecheck passes).

## Conventions
- **Python:** 4-space indentation (as in existing code), type hints where helpful, small functions, no new frameworks
- **Frontend:** TypeScript, functional components + hooks, Tailwind classes. Pages compose, components display,
  services fetch — pages never call `fetch` directly. New API types go in `src/types/index.ts`.
- **Git:** one commit per feature, descriptive messages; tick the checklist above in the same commit.
