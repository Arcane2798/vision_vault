# Vision Vault — Dashboard

The web dashboard for Vision Vault: live camera feed, real-time intrusion alerts, incident history with
snapshots and clips, and incident review. See the [project README](../README.md) for the full system.

**Stack:** React 18 + TypeScript, Vite, Tailwind CSS, React Router, Recharts, lucide-react.

## Run

Requires Node.js 18+ and the backend running on port 8000.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:5173. Restart `npm run dev` after changing `.env.local`
(or use `npm run configure` to change settings interactively).

## Structure

```
src/
├── config/env.ts      # typed settings — the only place that reads .env
├── types/             # data types = backend API contract
├── services/          # the only place that fetches data (REST + WebSocket)
├── context/           # realtime alerts / connection state, auth (login is KIV)
├── components/        # ui, layout, cameras, dashboard, incidents
├── pages/             # Dashboard, Live Monitoring, Incidents, Incident Detail
└── mocks/             # sample data for VITE_DATA_MODE=mock (offline UI work only)
```

Rule of thumb: **pages** put things together, **components** display things, **services** fetch data.

## Backend contract

| Method | Path | Returns |
|---|---|---|
| GET | `/api/dashboard/summary`, `/api/dashboard/trend?days=14` | counters, daily trend |
| GET | `/api/cameras` | the single camera (`streamUrl` = MJPEG `/video`) |
| GET | `/api/incidents?search&cameraId&status&from&to&sort` | `Incident[]` |
| GET / PATCH | `/api/incidents/:id` | `Incident`; PATCH body `{ status, notes }` |
| WS | `/api/ws/events` | `{type:"alert", data: Incident}`, `{type:"camera_status", data}` |

Types are in `src/types/index.ts`. The live feed is MJPEG, so it is shown with `<img>`, not `<video>`.
