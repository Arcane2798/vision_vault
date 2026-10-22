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
  guard house gets a text alert with the address and time — no images of the home and never who lives there.
- **Built to scale.** One home today; the same alert stream can feed a township-wide guard dashboard tomorrow.

## Features

| Feature | Status |
|---|---|
| Real-time person detection and tracking (YOLO11s on OpenVINO + ByteTrack), with the path each person walked drawn on the video | ✅ |
| Face recognition of residents: faces cropped from 720p, ResNet-50 recogniser (InsightFace buffalo_l); works on small corner-CCTV faces (16 px and up) after adding camera crops with `enroll_from_video.py` | ✅ |
| Intrusion rules that cut false alarms: minimum track age and a 5 s grace period; an intruder who is briefly lost and found again keeps their timer | ✅ |
| Evidence: snapshot (with the intruder's path) + 10 s clip, re-encoded to H.264 for browser playback | ✅ |
| Telegram alert to the homeowner with photo | ✅ |
| Web dashboard: live feed, real-time alerts, incident history, 14-day trend; fully autonomous (no manual review) and shows the guard house's response live | ✅ |
| Security On / Off: Off pauses alerts and recordings, optionally until a set time (e.g. midnight after a party) | ✅ |
| Visitor registration with time windows (e.g. "allow Ali Saturday 2–6 pm") | ✅ |
| Recognition switch per person (for testing: make a resident count as a stranger without deleting their photos) | ✅ |
| Township guard house: text alert with house address and time (no images of the home), Guard House screen with acknowledge | ✅ |
| AI assistant "Viva Bot": ask about incidents and who is at the door, register visitors, turn security on or off (confirm before any change) | ✅ |
| Intruder's items: knife / scissors / baseball bat near an unknown person (prototype, paused: `ITEM_DETECTION=1` turns it on) | ⏸ |
| Family tracker: who is home and who is out, from arrivals and departures at the door (paused) | ⏸ |
| House map + safe path: floor plan of the demo house with one recorded camera per room, a CCTV wall that replays every camera in sync with person boxes drawn, people per room, and the safest way out avoiding the intruder | ✅ |
| Township-wide guard dashboard, liveness / anti-spoofing, gun detection model, ESP32 buzzer, account login | 📋 planned |

## How it works

```
 Camera (inside, facing the front door) or a test video
        │
        ▼
 VisionEngine  (engine.py, background thread)
   1. YOLO11s (OpenVINO, Intel GPU) finds people on the 720p frame; ByteTrack gives each a stable ID
   2. Face crop from the 720p frame → InsightFace → resident, visitor (inside / outside their window) or unknown
   3. Rules (rules.py) by security level:
        On  → unknown for 5 s → INTRUSION (visitor outside their window → homeowner alert)
        Off → people are tracked, nothing is recorded or alerted (e.g. a party, with a timer)
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
| **Dashboard** | Live engine status (FPS, who is at the door), counters (incl. alerts awaiting the guard house), 14-day trend, recent incidents |
| **Live Monitoring** | Live annotated feed and the security switch (On / Off, Off optionally until a time) |
| **Incidents** | History with search and filters; each incident has the snapshot, clip, identity, items carried and the guard house's response |
| **Residents & Visitors** | Register faces by photo upload; give visitors an allowed time window; switch a person's recognition off to test how the camera treats a stranger |
| **House map** | Floor plan with camera positions and view cones; upload one video per camera, press **Process videos**, then **Play**: people move from room to room on the plan, the **CCTV wall** below plays every camera in sync, and each resident gets a **safe way out** when an intruder appears |
| **Test with Video** | Run the system on a recorded video instead of the camera |
| **Guard House** (bottom-left switch) | The township guard's screen: text alerts with house address and time, acknowledge with a note |
| **Viva Bot** (top bar) | Chat assistant: "What happened at the door today?", "Who is at the door right now?", "Turn security off until midnight for a party" |

## Tech stack

- **Vision:** Ultralytics YOLO11s (exported to OpenVINO, runs on the Intel integrated GPU), ByteTrack, InsightFace (buffalo_s face detector + buffalo_l ResNet-50 recogniser), OpenCV
- **Backend:** Python, FastAPI, SQLite, ffmpeg (via imageio-ffmpeg), Telegram Bot API
- **AI assistant:** Google Gemini API (`google-genai`), tool calling over the home's own data; text only, no camera frames
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts
- **Tests:** pytest (120 tests, no camera needed)

## Getting started

**Requirements:** Python 3.10+, Node.js 18+, a USB webcam (or a video file).

### 1. Backend

```bash
pip install ultralytics openvino insightface fastapi uvicorn python-dotenv opencv-python requests imageio-ffmpeg python-multipart google-genai
```

Create a `.env` file in the project root. Every key is optional:

```env
# Telegram alerts
TG_TOKEN=your_telegram_bot_token
TG_CHAT_ID=your_chat_id
GUARD_TG_TOKEN=guard_bot_token              # separate "guard house" bot (optional)
GUARD_TG_CHAT_ID=guard_house_chat_id        # guard's chat; leave out to receive the guard bot on your own chat
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

CCTV cameras high in a corner see small faces that rarely match phone photos. Add crops from the camera itself:
record a short video in which only that person appears, then run `py enroll_from_video.py alice clip.mp4` and press
**Refresh faces** on the Residents & Visitors page.

Start the server. On the first run the model weights download and YOLO11s is exported to OpenVINO once (about a minute):

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
| `CAPTURE_SIZE` | `1280x720` | Capture size. People and faces are found on this frame; streaming and clips use a 640-wide copy |
| `DETECTOR_MODEL` | `yolo11s.pt` | Person detector (downloads automatically) |
| `DETECTOR_BACKEND` / `DETECTOR_DEVICE` | `openvino` / `gpu` | OpenVINO on the Intel integrated GPU (falls back to CPU); `pytorch` = plain Ultralytics |
| `DETECTOR_IMGSZ` | `832` | Detector input width; larger finds smaller people but is slower |
| `FACE_RECOGNIZER` / `FACE_DETECTOR` | `buffalo_l` / `buffalo_s` | InsightFace model packs |
| `FACE_CHECK_FRAMES` | `3` | Frames between face checks while a person is still unknown |
| — | — | Face match threshold 0.30 (cosine similarity), set in `rules.py` |
| `VISION_MODE` | — | `legacy` = 640×480, small recogniser, check every 8 frames |
| `ITEM_DETECTION` | `0` | `1` = look for knives / scissors / bats near an unknown person (prototype, paused) |
| `DEPARTURE_FILTER` | `0` | `1` = someone who starts next to the (inside) camera and walks out is logged as "left", not as an intruder (paused: it could hide a real intruder walking away) |
| `CHAT_MODEL` | `gemini-3.5-flash-lite` | Gemini model for Viva Bot |

The house map is `house_map.json`: rooms (position and size), doors between rooms, exits (`"exit": true`, with
`"via"` naming it in the advice, e.g. "the front door") and cameras (room, video file name, and optional `x`, `y`,
`facing`, `fov` for drawing). Uploaded camera videos go to `test_videos/`; processing writes the replay timeline to
`house_map_timeline.json` and the boxed CCTV-wall videos to `map_videos/`. Switching someone's recognition, adding or
deleting a person marks the replay out of date: press **Re-process videos**.

## API

All dashboard endpoints are under `/api`.

| Area | Endpoints |
|---|---|
| Live | `GET /video` (MJPEG), `GET /api/status`, `WS /api/ws/events` (new incidents, guard-house responses, camera status) |
| Incidents | `GET /api/incidents`, `GET /api/incidents/{id}`, `GET /api/dashboard/summary`, `GET /api/dashboard/trend` |
| Residents & visitors | `GET/POST /api/people`, `PATCH/DELETE /api/people/{id}`, `POST /api/people/{id}/photos`, `GET /api/people/{id}/photo`, `POST /api/people/reload` |
| Security | `GET/PUT /api/security` (On / Off, Off timer) |
| Family tracker (paused) | `GET /api/family`, `PUT /api/family/{id}/status`, `GET /api/family/movements` |
| Guard house | `GET /api/guard/alerts`, `POST /api/guard/alerts/{id}/ack` |
| House map | `GET /api/map`, `GET /api/map/state`, `POST /api/map/process`, `GET /api/map/status`, `POST /api/map/cameras/{id}/video`, `PATCH /api/map/cameras/{id}`, `GET /map_videos/*` (CCTV wall) |
| Viva Bot | `POST /api/chat` |
| Test video | `GET/PUT /api/source`, `POST /api/source/videos` |
| Evidence | `GET /clips/*`, `GET /snapshots/*` |

Full request and response shapes are documented in [AGENTS.md](AGENTS.md#current-api-what-actually-exists).

## Project structure

```
vision_vault/
├── engine.py         # vision pipeline: detection (OpenVINO), tracking, face recognition, paths
├── rules.py          # pure decision rules (visitor windows, security levels, items, arrivals) — unit-tested
├── vault_utils.py    # database, clip recorder, H.264 conversion, Telegram
├── api.py            # REST + WebSocket API for the dashboard and the Guard House screen
├── chat.py           # Viva Bot: tools over the home's data, confirm-before-change actions
├── house.py          # house map: room occupancy, video processing (boxed CCTV-wall videos), safe path
├── house_map.json    # floor plan, doors, exits and cameras of the demo house
├── enroll_from_video.py  # add a resident's face crops from CCTV footage
├── main.py           # FastAPI app, live video stream, static evidence files
├── tests/            # pytest suite
├── frontend/         # React + TypeScript dashboard
├── AGENTS.md         # development plan, decisions and full API reference
└── faces/, clips/, snapshots/, test_videos/, map_videos/, vault.db   # local data (not in the repo)
```

## Privacy

- Face photos, clips, snapshots, test videos, the event database and API keys stay on the home's machine and are excluded
  from this repository by `.gitignore`.
- The guard house only receives a text alert: the house address, the camera and the time — no snapshot, clip, names or photos of
  residents.
- Viva Bot sends Gemini text only (incident times, names, security level), never camera frames or face photos. On the
  free tier, Google may use prompts to improve its products.

## Known limitations

- **No liveness check yet:** a printed photo of an enrolled person can be accepted as that person.
- **One live camera:** "where is someone" means "last seen at the front door at 14:32". The house map is a concept: every
  camera on it plays a recorded video, processed once and replayed together.
- **Item detection is paused:** it was a prototype (small YOLO models miss many knives).
- **Residents walking away:** someone leaving with their back to the camera can't be recognised, so they may be alerted as unknown.
- **Low match threshold (0.30):** catches residents on small CCTV faces, but leaves little margin: a stranger who looks like a resident could be taken for them.
- Runs on a laptop (about 8–9 FPS with the Intel GPU); recognition needs a reasonably clear view of the face.
