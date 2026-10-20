---
trigger: glob
globs: "frontend/**"
---

# Frontend agent rules (React + TypeScript dashboard)

Read `AGENTS.md` first — especially **Positioning** (wording) and **Current API** (the contract).

## You own
Everything in `frontend/`. Do **not** edit Python files or `tests/`.
If you need a backend change (new field, new endpoint), stop and describe it in your summary — don't invent
an endpoint the backend doesn't have.

## Contract
- The backend is authoritative. Endpoints and fields come from the "Current API" table in `AGENTS.md`
  (cross-check `api.py`). Mirror every response shape in `src/types/index.ts`.
- Pages never call `fetch`. All requests go through `src/services/` (`api()` in `apiClient.ts`).
- The live feed is MJPEG at `/video` — shown with `<img>` (see `CameraFeed.tsx`), never `<video>`.
- Run in live mode (`.env.local` copied from `.env.example`). Mock mode (`src/mocks/`) is not maintained;
  don't add features to it.

## Wording (Township of Tomorrow positioning)
"residents" / "family", **"visitors"** (never "guests"), "guard house". No "theft" wording, no "Township CCTV".
Backend values stay `family` / `guest` / `intrusion` / `guest_outside_window`; map them to display text in
`src/utils/format.ts`.

## Out of scope
Login/roles (KIV — keep `VITE_AUTH_ENABLED=false`, leave `AuthContext` alone), camera management, multi-camera.

## UI conventions
Functional components + hooks, TypeScript, Tailwind using the existing tokens (`bg-surface-1`, `text-ink-2`,
`border-line`, `bg-brand`, `text-danger`, …) and the existing `components/ui/` pieces (Button, Card, Modal,
Field, StatusBadge, States). Every page has loading, empty and error states.

## Verify before you finish
From `frontend/`: `npm run typecheck` and `npm run build` must pass. With the backend running, open
http://localhost:5173 and check the page you changed.

One commit per feature; stage only `frontend/` paths. Tick the `AGENTS.md` checklist in the same commit.
