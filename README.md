# Vision Vault

**Smart home security that plugs into the township.** A camera at the door watches who arrives. Vision Vault
recognises residents by face, lets registered visitors in during their allowed time, and when an unknown person
stays in view it records evidence and alerts **both the homeowner and the township guard house** — in seconds,
with a photo.

Built for the **Sime Darby Property University Hackathon 2026 — Township of Tomorrow**.

## Why it matters for the Township of Tomorrow

- **Guard houses see the gate, not the home.** Most township security stops at the entrance. Vision Vault gives every
  home its own AI watcher and connects it back to the guard house, so a break-in at one house is known township-wide
  immediately.
- **Fewer false alarms, less alarm fatigue.** Residents and registered visitors never trigger alerts; brief glimpses are
  filtered out by tracking and a grace period. Guards only hear about real unknowns.
- **Visitor registration that the camera understands.** Homeowners register a visitor with a time window — the same idea
  as a gated community's visitor pass — and the system enforces it automatically.
- **Privacy by design.** Faces, footage and logs stay on the home's own machine. Only alerts leave the house, and the
  guard house sees the address and the stranger's snapshot — never who lives there.
- **Built to scale.** One home today; the same alert stream can feed a township-wide guard dashboard tomorrow.

## Features

| Feature | Status |
|---|---|
| Real-time person detection and tracking (YOLOv8n + ByteTrack), with the path each person walked drawn on the video | ✅ |
| Face recognition of residents: faces cropped from 720p, ResNet-50 recogniser (InsightFace buffalo_l) | ✅ |
| Intrusion rules that cut false alarms: minimum track age and a grace period set by the security level | ✅ |
| Evidence: snapshot (with the intruder's path) + 10 s clip, re-encoded to H.264 for browser playback | ✅ |
| Telegram alert to the homeowner with photo | ✅ |
| Web dashboard: live feed, real-time alerts, incident history and review, 14-day trend | ✅ |
| Security levels Normal / High, switched to High automatically during sleep time and while away from home | ✅ |
| Visitor registration with time windows (e.g. "allow Ali Saturday 2–6 pm") | ✅ |
| Township guard house: alert with house address and photo, Guard House screen with acknowledge | ✅ |
| AI assistant "Viva Bot": ask about incidents, who is home, register visitors, set vacation dates (confirm before any change) | ✅ |
| Intruder's items: knife / scissors / baseball bat near an unknown person (prototype) | ✅ |
| Family tracker: who is home and who is out, from arrivals and departures at the door | ✅ |
| House map + safe path: people per room from several cameras, safest way out avoiding the intruder (concept with recorded videos) | ✅ |
| Township-wide guard dashboard, liveness / anti-spoofing, gun detection model, ESP32 buzzer, account login | 📋 planned |

## How it works

```
 Camera (inside, facing the front door) or a test video
        │
        ▼
 VisionEngine  (engine.py, background thread)
   1. YOLOv8n finds people (and knives / scissors / bats); ByteTrack gives each person a stable ID
   2. Face crop from the 720p frame → InsightFace → resident, visitor (inside / outside their window) or unknown
   3. Rules (rules.py): unknown for the grace period → INTRUSION (3 s at Normal, 1 s at High)
        │ annotated frames (boxes, paths)               │ intrusion
        ▼                                               ▼
   MJPEG live stream                 snapshot + 10 s clip → SQLite event log
        │                            → Telegram: homeowner + guard house
        └───────────────── FastAPI (api.py) ────────────┘
                     REST + WebSocket   │   Viva Bot (chat.py, Gemini tools, text only)
                                        ▼
                         React dashboard (frontend/)   ·   Guard House screen (/guard)
```

## Dashboard pages

| Page | What it shows |
|---|---|
| **Dashboard** | Live engine status (FPS, who is at the door), counters, 14-day trend, recent incidents, **family tracker** (who is home / out) |
| **Live Monitoring** | Live annotated feed, security level (Normal / High), **sleep time** and **away-from-home** schedules that switch to High |
| **Incidents** | History with search and filters; each incident has the snapshot, clip, identity, items carried, guard-house status and review notes |
| **Residents & Visitors** | Register faces by photo upload; give visitors an allowed time window |
| **House map** | Floor plan with people per room, live or replayed from recorded room videos (upload one per room), and a **safe way out** for each resident |
| **Test with Video** | Run the system on a recorded video instead of the camera |
| **Guard House** (bottom-left switch) | The township guard's screen: alerts with house address and snapshot, acknowledge with a note |
| **Viva Bot** (top bar) | Chat assistant: "What happened at the door today?", "Who is home?", "We're away Saturday to Wednesday" |

## Tech stack

- **Vision:** Ultralytics YOLOv8n, ByteTrack, InsightFace (buffalo_s face detector + buffalo_l ResNet-50 recogniser), OpenCV — runs on CPU
- **Backend:** Python, FastAPI, SQLite, ffmpeg (via imageio-ffmpeg), Telegram Bot API
- **AI assistant:** Google Gemini API (`google-genai`), tool calling over the home's own data; text only, no camera frames
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts
- **Tests:** pytest (114 tests, no camera or models needed)

## Getting started

**Requirements:** Python 3.10+, Node.js 18+, a USB webcam (or a video file).

### 1. Backend

```bash
pip install ultralytics insightface fastapi uvicorn python-dotenv opencv-python requests imageio-ffmpeg python-multipart google-genai
```

Create a `.env` file in the project root. Every key is optional:

```env
# Telegram alerts
TG_TOKEN=your_telegram_bot_token
TG_CHAT_ID=your_chat_id
GUARD_TG_CHAT_ID=guard_house_chat_id        # copy of each intrusion for the guard house
HOUSE_UNIT=No. 12, Jalan Elmina 3/1          # address shown to the guard house

# Viva Bot (free key from aistudio.google.com)
GEMINI_API_KEY=your_key

# Camera
# VIDEO_SOURCE=1                              # camera index (default 0) or a video file path
# VISION_MODE=legacy                          # faster, less accurate: 640x480 + small face model
```

Enroll residents — one folder per person, 3–5 clear face photos each (or use the Residents & Visitors page):

```
faces/
├── alice/  photo1.jpg  photo2.jpg ...
└── bob/    photo1.jpg  ...
```

Start the server (model weights download automatically on first run):

```bash
python -m uvicorn main:app --port 8000
```

On Windows, if `python` opens the Microsoft Store, use `py -m uvicorn main:app --port 8000`.

### 2. Dashboard

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:5173.

### 3. Tests

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

The tests use a fake engine and a temporary database, so they never touch the camera, your faces or your data.

## Configuration

| `.env` key | Default | Meaning |
|---|---|---|
| `VIDEO_SOURCE` | `0` | Camera index, or a video file path |
| `CAPTURE_SIZE` | `1280x720` | Capture size. Faces are cropped from this; detection and streaming use a 640-wide copy |
| `FACE_RECOGNIZER` / `FACE_DETECTOR` | `buffalo_l` / `buffalo_s` | InsightFace model packs |
| `FACE_CHECK_FRAMES` | `3` | Frames between face checks while a person is still unknown |
| `VISION_MODE` | — | `legacy` = 640×480, small recogniser, check every 8 frames |
| `DEPARTURE_FILTER` | `1` | Someone who starts next to the (inside) camera and walks out is logged as "left", not as an intruder. `0` = off |
| `CHAT_MODEL` | `gemini-3.5-flash-lite` | Gemini model for Viva Bot |

The house map's rooms, doors, exits and room cameras are in `house_map.json` (edit it to match your home).

## API

All dashboard endpoints are under `/api`.

| Area | Endpoints |
|---|---|
| Live | `GET /video` (MJPEG), `GET /api/status`, `WS /api/ws/events` (new incidents, camera status) |
| Incidents | `GET /api/incidents`, `GET /api/incidents/{id}`, `PATCH /api/incidents/{id}` (review), `GET /api/dashboard/summary`, `GET /api/dashboard/trend` |
| Residents & visitors | `GET/POST /api/people`, `PATCH/DELETE /api/people/{id}`, `POST /api/people/{id}/photos`, `GET /api/people/{id}/photo`, `POST /api/people/reload` |
| Security | `GET/PUT /api/security` (level, sleep time, away-from-home dates) |
| Family tracker | `GET /api/family`, `PUT /api/family/{id}/status`, `GET /api/family/movements` |
| Guard house | `GET /api/guard/alerts`, `POST /api/guard/alerts/{id}/ack` |
| House map | `GET /api/map`, `GET /api/map/state`, `POST /api/map/process`, `GET /api/map/status`, `POST /api/map/cameras/{id}/video`, `PATCH /api/map/cameras/{id}` |
| Viva Bot | `POST /api/chat` |
| Test video | `GET/PUT /api/source`, `POST /api/source/videos` |
| Evidence | `GET /clips/*`, `GET /snapshots/*` |

Full request and response shapes are documented in [AGENTS.md](AGENTS.md#current-api-what-actually-exists).

## Project structure

```
vision_vault/
├── engine.py         # vision pipeline: detection, tracking, face recognition, paths, items, family tracker
├── rules.py          # pure decision rules (visitor windows, security levels, items, arrivals) — unit-tested
├── vault_utils.py    # database, clip recorder, H.264 conversion, Telegram
├── api.py            # REST + WebSocket API for the dashboard and the Guard House screen
├── chat.py           # Viva Bot: tools over the home's data, confirm-before-change actions
├── house.py          # house map: room occupancy, video processing, safe path
├── house_map.json    # floor plan, exits and room cameras (sample house)
├── main.py           # FastAPI app, live video stream, static evidence files
├── tests/            # pytest suite
├── frontend/         # React + TypeScript dashboard
├── AGENTS.md         # development plan, decisions and full API reference
└── faces/, clips/, snapshots/, test_videos/, vault.db   # local data (not in the repo)
```

## Privacy

- Face photos, clips, snapshots, test videos, the event database and API keys stay on the home's machine and are excluded
  from this repository by `.gitignore`.
- The guard house only receives the house address, the time and the stranger's snapshot / clip — no names or photos of
  residents.
- Viva Bot sends Gemini text only (incident times, names, security level), never camera frames or face photos. On the
  free tier, Google may use prompts to improve its products.

## Known limitations

- **No liveness check yet:** a printed photo of an enrolled person can be accepted as that person.
- **One camera:** "where is someone" means "last seen at the front door at 14:32". The house map is a concept that combines
  the live camera with recorded videos of other rooms.
- **Item detection is a prototype:** YOLOv8n misses many knives; a detection is a strong hint, a miss proves nothing.
- **Leaving residents:** someone walking out with their back to the camera is logged as "someone left", not identified.
- Everything runs on a laptop CPU (about 7–10 FPS); recognition needs a reasonably clear view of the face.
