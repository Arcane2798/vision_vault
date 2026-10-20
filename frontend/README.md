# Township CCTV — Theft Detection Frontend

A web dashboard for monitoring the township's CCTV cameras and reviewing **potential** theft incidents flagged by the AI model.
Built from `cctv_theft_detection_frontend_requirements.md`.

**Stack:** React 18 + TypeScript, Vite, Tailwind CSS, Recharts, Lucide icons, React Router.

---

## Quick start

You need **Node.js 18 or newer** ([nodejs.org](https://nodejs.org), LTS version).

```powershell
cd C:\Users\haziq\Documents\frontend-township
npm run setup        # install packages + answer the configuration questions
npm run dev          # opens http://localhost:5173
```

The default **mock mode** runs without a backend and uses clearly labelled sample data. Sample logins:

| Email | Password | Role |
|---|---|---|
| admin@township.local | admin123 | Administrator (everything, incl. camera management) |
| operator@township.local | operator123 | Security operator (monitor + review incidents) |
| viewer@township.local | viewer123 | Viewer (dashboard + incident list, no evidence) |

---

## Configuration — one command

```powershell
npm run configure                     # interactive: asks each setting, press Enter to keep the current one
npm run configure -- --mock           # demo with sample data (no backend)
npm run configure -- --live --api http://192.168.1.10:8000/api --realtime websocket --ws ws://192.168.1.10:8000/ws/events
npm run configure -- --auth false     # turn off login (local demo only)
npm run configure -- --show           # print the current settings
```

It writes `.env.local`. **Restart `npm run dev` after changing it.**

| Setting | Flag | Default | Meaning |
|---|---|---|---|
| `VITE_APP_NAME` | `--name` | Township CCTV | Name in sidebar and tab |
| `VITE_DATA_MODE` | `--mock` / `--live` | mock | Sample data or real backend |
| `VITE_API_BASE_URL` | `--api` | http://localhost:8000/api | Backend REST API |
| `VITE_REALTIME` | `--realtime` | mock | `websocket`, `sse`, `mock` or `off` |
| `VITE_REALTIME_URL` | `--ws` | ws://localhost:8000/ws/events | WebSocket or SSE endpoint |
| `VITE_AUTH_ENABLED` | `--auth` | true | Require login |
| `VITE_REFRESH_INTERVAL_MS` | `--refresh` | 15000 | Auto-refresh of dashboard and lists |
| `VITE_MIN_CONFIDENCE` | `--confidence` | 0.5 | Hide live AI boxes below this score |
| `VITE_TIMEZONE` | `--timezone` | Asia/Kuala_Lumpur | Time zone for every timestamp |
| `PORT` | `--port` | 5173 | Dev server port |

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | `npm install` + `configure` (first time) |
| `npm run configure` | Change settings |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript check only |

---

## Project structure

```
frontend-township/
├── scripts/configure.mjs        # the configuration command
├── .env.example                 # every setting, documented
├── public/                      # static files (favicon)
└── src/
    ├── main.tsx                 # entry: router + providers
    ├── App.tsx                  # routes (pages are lazy-loaded)
    ├── config/env.ts            # typed settings - the only place that reads .env
    ├── types/                   # domain types = backend API contract
    ├── services/
    │   ├── apiClient.ts         # fetch wrapper: token, timeout, error messages, 401 handling
    │   ├── index.ts             # authService, dashboardService, cameraService, incidentService
    │   └── realtime.ts          # WebSocket / SSE / mock client with auto-reconnect
    ├── mocks/                   # sample data + in-memory fake backend (mock mode only)
    ├── context/
    │   ├── AuthContext.tsx      # login, logout, session restore, permissions
    │   └── RealtimeContext.tsx  # alerts, live detections, camera status, connection state
    ├── hooks/useAsync.ts        # loading / error / data + auto refresh
    ├── utils/                   # formatting (one timestamp format), role permissions
    ├── components/
    │   ├── ui/                  # Button, Card, Modal, ConfirmDialog, Field, StatusBadge, States
    │   ├── layout/              # AppLayout, Sidebar, Topbar (alerts bell, connection status)
    │   ├── auth/                # ProtectedRoute
    │   ├── cameras/             # CameraFeed, DetectionOverlay, CameraFormModal
    │   ├── dashboard/           # StatCard, TrendChart
    │   └── incidents/           # IncidentFilters, IncidentList
    └── pages/                   # Login, Dashboard, LiveMonitoring, Incidents, IncidentDetail, Cameras, NotFound
```

Rule of thumb: **pages** put things together, **components** display things, **services** fetch data. Pages never call `fetch` directly.

---

## Requirements coverage

| Requirement | Where |
|---|---|
| FR-01 Dashboard | `pages/DashboardPage.tsx`: camera / incident / unresolved counters, recent activity, 14-day trend chart, shortcuts |
| FR-02 Live monitoring | `pages/LiveMonitoringPage.tsx`, `components/cameras/CameraFeed.tsx`: grid (1/2/3 columns), camera selector, status, "offline" / "stream unavailable" messages |
| FR-03 Detection display | `components/cameras/DetectionOverlay.tsx`: boxes, label, confidence, timestamp; dashed amber + "AI" tag = prediction, not proof |
| FR-04 Alerts | `context/RealtimeContext.tsx`, bell in `Topbar.tsx`, toast in `AppLayout.tsx` |
| FR-05 Incident history | `pages/IncidentsPage.tsx`: search, camera / status / date filters, sort by time, pagination; filters kept in the URL |
| FR-06 Camera management | `pages/CamerasPage.tsx`: list, status, add / edit / remove (admin only, remove asks for confirmation) |
| FR-07 Incident details | `pages/IncidentDetailPage.tsx`: timestamp, camera, AI details, snapshot, clip, review status + notes |
| FR-08 Authentication | `context/AuthContext.tsx`, `pages/LoginPage.tsx`, `utils/permissions.ts` (admin / operator / viewer) |
| NFR-02 Responsive | sidebar becomes a drawer on mobile; incident table becomes cards |
| NFR-04/07 Security & privacy | token in sessionStorage (cleared when tab closes), evidence hidden from viewers, 401 → back to login |
| NFR-05 Reliability | connection indicator in the top bar, automatic reconnect, offline cameras clearly marked |
| NFR-06 Accessibility | status = icon + text + colour, keyboard focus styles, labelled controls, skip link, screen-reader text for detections |
| NFR-08 Feedback | loading, empty, error (with retry) and success states on every page |

---

## Backend API contract (live mode)

All requests send `Authorization: Bearer <token>`. Types are in `src/types/index.ts`.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | | `User` |
| POST | `/auth/logout` | | 204 |
| GET | `/dashboard/summary` | | `DashboardSummary` |
| GET | `/dashboard/trend` | `?days=14` | `TrendPoint[]` |
| GET | `/cameras` | | `Camera[]` |
| POST | `/cameras` | `{ name, location, streamUrl }` | `Camera` |
| PUT | `/cameras/:id` | `{ name, location, streamUrl }` | `Camera` |
| DELETE | `/cameras/:id` | | 204 |
| GET | `/incidents` | `?search&cameraId&status&from&to&sort` | `Incident[]` |
| GET | `/incidents/:id` | | `Incident` |
| PATCH | `/incidents/:id` | `{ status, notes }` | `Incident` |

**Real-time events** (WebSocket or SSE at `VITE_REALTIME_URL`, token passed as `?token=`), one JSON message per event:

```json
{ "type": "alert",         "data": { ...Incident } }
{ "type": "detection",     "data": { "id": "…", "cameraId": "cam-01", "label": "bag_snatch", "confidence": 0.87,
                                     "bbox": { "x": 0.42, "y": 0.30, "width": 0.15, "height": 0.40 }, "timestamp": "2026-10-19T08:15:02Z" } }
{ "type": "camera_status", "data": { "cameraId": "cam-04", "status": "offline" } }
```

`bbox` values are **0–1 fractions of the frame**, so they work at any video size.

**Video:** `Camera.streamUrl` must be playable by an HTML5 `<video>` element (MP4/WebM, or HLS in Safari). RTSP from IP cameras must be converted by the backend first (for example with MediaMTX or FFmpeg to HLS/WebRTC).

---

## Items to confirm with the backend team (requirements §10)

1. Live CCTV, prerecorded video, or uploads? (the frontend handles any browser-playable URL)
2. Does the AI detect objects or classify actions? (labels are shown as received)
3. API and streaming protocol (set them with `npm run configure`)
4. Are login and roles required? (`--auth true|false`; roles admin / operator / viewer)
5. Are snapshots and clips saved? (`snapshotUrl` / `clipUrl` are optional)
6. Alerts by email or other channels? (backend; the frontend shows in-app alerts)
