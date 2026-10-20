# Vision Vault

**AI-powered home intrusion detection.** A webcam watches the entrance; Vision Vault detects and tracks every person,
recognises enrolled family members by face, and when an unknown person stays in view it records evidence
and alerts the owner on Telegram and on a live web dashboard.

Built for the ISP634 Software Development Practicum Hackathon 2026.

## Features

| Feature | Status |
|---|---|
| Real-time person detection and tracking (YOLOv8n + ByteTrack) | ✅ |
| Face recognition of enrolled family members (InsightFace) | ✅ |
| Intrusion rules that cut false alarms: minimum track age, movement check (ignores posters/statues), 3 s grace period | ✅ |
| Evidence: snapshot + 10 s clip (5 s before, 5 s after), re-encoded to H.264 for browser playback | ✅ |
| Telegram alert with photo | ✅ |
| Web dashboard: live feed, real-time alerts, incident history with filters, incident review (confirm / dismiss + notes), 14-day trend | ✅ |
| Guest whitelisting with time windows (e.g. "allow Ali Saturday 2–6 pm") | 🚧 in progress |
| AI assistant: ask about incidents and manage guests in plain language (LLM tool calling) | 🚧 in progress |
| Weapon detection, liveness / anti-spoofing, ESP32 buzzer, guard-house alerts, login | 📋 planned |

## How it works

```
 Webcam / video file
        │
        ▼
 VisionEngine (engine.py, background thread)
   1. YOLOv8n detects people, ByteTrack gives each a stable ID
   2. InsightFace checks the head area against enrolled faces
   3. Rules decide: family → green | unknown, moving, in view ≥ 3 s → INTRUSION
        │ annotated frames                     │ intrusion
        ▼                                      ▼
   MJPEG live stream               snapshot + clip → SQLite event log → Telegram alert
        │                                      │
        └────────────── FastAPI ───────────────┘
                    REST + WebSocket
                          │
                          ▼
              React dashboard (frontend/)
```

## Tech stack

- **Vision:** Ultralytics YOLOv8n, ByteTrack, InsightFace (`buffalo_s`), OpenCV — runs on CPU
- **Backend:** Python, FastAPI, SQLite, ffmpeg (via imageio-ffmpeg), Telegram Bot API
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts

## Getting started

**Requirements:** Python 3.9+, Node.js 18+, a USB webcam (or a video file).

### 1. Backend

```bash
pip install ultralytics insightface fastapi uvicorn python-dotenv opencv-python requests imageio-ffmpeg
```

Create a `.env` file in the project root:

```env
TG_TOKEN=your_telegram_bot_token      # optional, for Telegram alerts
TG_CHAT_ID=your_chat_id               # optional
# VIDEO_SOURCE=path/to/video.mp4      # optional, default 0 = first webcam
```

Enroll family members — one folder per person, 3–5 clear face photos each:

```
faces/
├── alice/  photo1.jpg  photo2.jpg ...
└── bob/    photo1.jpg  ...
```

Start the server (YOLOv8n weights download automatically on first run):

```bash
python -m uvicorn main:app --port 8000
```

### 2. Dashboard

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:5173.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/video` | Live annotated MJPEG stream |
| GET | `/api/cameras` | Camera info and status |
| GET | `/api/incidents` | Incident list (`search`, `status`, `from`, `to`, `sort`) |
| GET / PATCH | `/api/incidents/{id}` | Incident details / review (`status`, `notes`) |
| GET | `/api/dashboard/summary` | Counters for the dashboard |
| GET | `/api/dashboard/trend?days=14` | Daily incident trend |
| WS | `/api/ws/events` | Real-time intrusion alerts and camera status |
| GET | `/clips/*`, `/snapshots/*` | Evidence files |

## Project structure

```
vision_vault/
├── engine.py        # vision pipeline: detection, tracking, face recognition, intrusion rules
├── vault_utils.py   # event database, clip recorder, H.264 conversion, Telegram
├── api.py           # REST + WebSocket API for the dashboard
├── main.py          # FastAPI app, live video stream, static evidence files
├── frontend/        # React + TypeScript dashboard
├── AGENTS.md        # development plan and status
└── faces/, clips/, snapshots/, vault.db   # local data (not in the repo)
```

## Privacy

Face photos, recorded clips, snapshots, the event database and API keys are stored locally only and are excluded
from this repository by `.gitignore`.

## Known limitations

- **No liveness check yet:** a printed photo of an enrolled person can be accepted as that person.
- Single camera; everything runs on CPU at 640×480, so frame rate depends on the laptop (shown live on the feed).
- Recognition needs a reasonably clear, front-facing view of the face.
