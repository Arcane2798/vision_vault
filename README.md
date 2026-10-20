# Vision Vault 🏠

An AI-powered home intrusion detection system using CCTV footage and deep learning for real-time person detection, face recognition, and security alerts.

## Features

- **Real-time Person Detection** — YOLOv8-based person detection with 99%+ accuracy
- **Face Recognition** — InsightFace-powered facial recognition to identify family members and guests
- **Intrusion Detection** — Automatic detection of unauthorized individuals
- **Guest Whitelisting** — Safely allow known guests during specific time windows
- **Event Logging** — Detailed database of all detected events with timestamps
- **Clip Recording** — Automatic recording of intrusion events for review
- **Telegram Alerts** — Real-time push notifications on mobile devices
- **Web Dashboard** — Modern React UI for monitoring and event management

## Tech Stack

### Backend
- **Python 3.9+** with FastAPI web framework
- **YOLOv8** for person detection
- **InsightFace** for face recognition and embedding
- **OpenCV** for video processing
- **SQLite** for event logging
- **Telegram API** for alerts

### Frontend
- **React 18** with Vite build tooling
- **Modern JavaScript** (ES6+)
- **Simple CSS** styling

### Hardware
- USB webcam or connected camera
- Telegram bot (optional, for alerts)

## Quick Start

### Prerequisites
- Python 3.9 or higher
- Node.js v20 or higher
- A USB webcam connected to your system

### Installation

1. **Clone/download the project:**
   ```bash
   cd vision_vault
   ```

2. **Install Python dependencies:**
   ```bash
   pip install ultralytics insightface fastapi uvicorn python-dotenv opencv-python requests imageio-ffmpeg
   ```

3. **Install Node.js dependencies:**
   ```bash
   cd dashboard
   npm install
   cd ..
   ```

4. **Enroll family members** — Create a `faces/` directory and organize photos:
   ```
   faces/
   ├── john/
   │   ├── photo1.jpg
   │   └── photo2.jpg
   └── alice/
       ├── photo1.jpg
       └── photo2.jpg
   ```

5. **Configure Telegram** (optional for alerts):
   - Create a `.env` file in the root directory
   - Add your Telegram bot token and chat ID:
     ```env
     TG_TOKEN=your_telegram_bot_token
     TG_CHAT_ID=your_chat_id
     ```

### Running the System

**Terminal 1 — Start the backend server:**
```bash
python -m uvicorn main:app --port 8000
```

**Terminal 2 — Start the frontend dashboard:**
```bash
cd dashboard
npm run dev
```

The dashboard will be available at `http://localhost:5173`

## Project Structure

```
vision_vault/
├── main.py              # FastAPI server entry point
├── engine.py            # Core vision pipeline and detection logic
├── api.py               # API endpoints for dashboard
├── vault_utils.py       # Utilities: logging, recording, Telegram alerts
├── dashboard/           # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── faces/               # Enrolled family member photos
├── vault.db             # SQLite event database
└── yolov8n.pt          # Pre-trained YOLOv8 model weights
```

### Key Files

- **`engine.py`** — Vision pipeline: person detection, face recognition, tracking
- **`main.py`** — FastAPI server with core endpoints
- **`api.py`** — REST API endpoints for the dashboard
- **`vault_utils.py`** — Event logging, clip recording, Telegram notifications
- **`dashboard/`** — React-based web interface for monitoring

## Development Status

### ✅ Completed (Days 1–3)
- Real-time person detection (YOLOv8)
- Face recognition and family member identification
- Guest whitelisting with time windows
- Event database with SQLite
- Web dashboard with live monitoring
- Event filtering and search
- Intrusion detection logic

### 🚀 In Progress (Day 4)
- AI chatbot with tool calling for natural language queries
- Clip playback conversion (convert recordings for browser playback)

### 📋 Future Enhancements (KIV)
- Weapon detection using secondary model
- ESP32 buzzer/siren integration
- Guard house alert notifications
- Path tracking and trajectory analysis
- Liveness detection to prevent photo/video spoofing

## API Endpoints

### Core Endpoints
- `GET /` — Health check
- `GET /events` — Fetch logged events
- `POST /events` — Create a new event
- `GET /events/{event_id}` — Get event details
- `DELETE /events/{event_id}` — Delete an event

### Recognition
- `POST /recognize` — Recognize person from image
- `POST /enroll` — Enroll new face from image

### Configuration
- `GET /config` — Current system configuration
- `POST /config` — Update system settings

## Development Conventions

### Python
- 8-space indentation
- Type hints where helpful
- Clear variable naming

### React/JavaScript
- Functional components with hooks
- Simple, maintainable styling
- No unnecessary abstractions

### Git
- One commit per feature
- Descriptive commit messages
- Clear branch naming

## Troubleshooting

**Camera not detected:**
- Ensure the USB camera is connected and accessible
- Check device permissions on Windows/Linux
- Try reconnecting the camera

**Face recognition not working:**
- Verify photos in `faces/` directory are clear and well-lit
- Use multiple angles and expressions for each person
- Ensure face takes up at least 50% of the image

**Telegram alerts not sending:**
- Verify `TG_TOKEN` and `TG_CHAT_ID` are correct in `.env`
- Test the bot token independently
- Check internet connectivity

**Performance issues:**
- The system uses CPU-based inference by default
- For faster detection, consider running on a machine with GPU support
- Reduce frame processing rate if needed

## Contributing

When contributing to this project:
1. Follow the coding conventions listed above
2. Write clear commit messages
3. Test changes locally before committing
4. Update this README if adding new features

## License

This project is part of the ISP634 Software Development Practicum Hackathon 2026.

---

**Need help?** Check the CLAUDE.md file for additional project context and architecture notes.
