"""REST + WebSocket API for the `frontend/` dashboard (contract: "Current API" in AGENTS.md).

Maps Vision Vault's own data (events + people tables, single webcam) onto the
frontend's model. Auth is not implemented: run the frontend with
VITE_AUTH_ENABLED=false.
"""
import asyncio
import shutil
import sqlite3
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np
from fastapi import (APIRouter, File, Form, HTTPException, Query, Request,
                     Response, UploadFile, WebSocket, WebSocketDisconnect)
from pydantic import BaseModel

from rules import FAMILY, ROLES, valid_person_name, visitor_allowed
from vault_utils import DB_PATH, FACES_DIR, sync_people

CAMERA_ID = "cam-01"
STATUSES = {"new", "under_review", "confirmed", "dismissed"}
PHOTO_EXT = {".jpg", ".jpeg", ".png"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_PHOTO_SIDE = 1280     # uploads are downscaled to this before saving
THUMB_SIDE = 320


class StatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class NightUpdate(BaseModel):
    enabled: Optional[bool] = None
    start: Optional[str] = None
    end: Optional[str] = None


class SecurityUpdate(BaseModel):
    level: Optional[str] = None
    night: Optional[NightUpdate] = None


class PersonUpdate(BaseModel):
    role: Optional[str] = None
    validFrom: Optional[str] = None
    validTo: Optional[str] = None


def _rows(sql, args=()):
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, args).fetchall()]
    finally:
        con.close()


def _iso(ts):
    return (datetime.fromtimestamp(ts, timezone.utc)
            .isoformat(timespec="seconds").replace("+00:00", "Z"))


def _local_day(ts):
    return datetime.fromtimestamp(ts).date()


def _parse_iso(value, field):
    """ISO 8601 string -> epoch. No timezone = this machine's local time. ''/None -> None."""
    if value is None or not str(value).strip():
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, f"{field} must be an ISO 8601 date-time, got '{value}'.")
    return dt.timestamp()


def _check_window(role, valid_from, valid_to):
    if role not in ROLES:
        raise HTTPException(400, f"role must be one of {', '.join(ROLES)}.")
    if (valid_from is not None and valid_to is not None
            and valid_from > valid_to):
        raise HTTPException(400, "validFrom must be before validTo.")


def _photo_files(folder: Path):
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir()
                  if p.is_file() and p.suffix.lower() in PHOTO_EXT)


def _fit(img, side):
    h, w = img.shape[:2]
    if max(h, w) <= side:
        return img
    scale = side / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)))


async def _decode_photos(photos):
    """UploadFiles -> list of (filename, BGR image). 400 if a file is not a readable image."""
    out = []
    for up in photos or []:
        data = await up.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(400, f"Photo '{up.filename}' is larger than 10 MB.")
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(400, f"'{up.filename}' is not a JPEG or PNG image.")
        out.append((up.filename or "photo", _fit(img, MAX_PHOTO_SIDE)))
    if not out:
        raise HTTPException(400, "At least one photo is required.")
    return out


def _incident(r, base):
    name = r["camera"] or ""
    location = name.split(": ", 1)[-1]
    clip = f"{base}/clips/{Path(r['clip_path']).name}" if r["clip_path"] else None
    snap = (f"{base}/snapshots/{Path(r['snapshot_path']).name}"
            if r["snapshot_path"] else None)
    out = {"id": str(r["id"]), "cameraId": CAMERA_ID, "cameraName": name,
           "location": location, "timestamp": _iso(r["ts"]),
           "label": r["event_type"] or "intrusion",
           "confidence": 1.0,        # rule-based alert, no model score is logged
           "status": r["status"] or "new", "detections": []}
    if snap:
        out["snapshotUrl"] = snap
    if clip:
        out["clipUrl"] = clip
    if r["notes"]:
        out["notes"] = r["notes"]
    if r["reviewed_at"]:
        out["reviewedBy"] = "Dashboard user"
        out["reviewedAt"] = _iso(r["reviewed_at"])
    return out


def create_router(engine):
    router = APIRouter(prefix="/api")

    def base_url(request: Request):
        return str(request.base_url).rstrip("/")

    # ---------- cameras (single webcam / video source) ----------
    def camera(base):
        return {"id": CAMERA_ID, "name": engine.camera_name,
                "location": engine.camera_name.split(": ", 1)[-1],
                "streamUrl": f"{base}/video",
                "status": "online" if engine.running else "offline",
                "lastSeen": _iso(datetime.now().timestamp())}

    @router.get("/cameras")
    def cameras(request: Request):
        return [camera(base_url(request))]

    @router.post("/cameras")
    @router.put("/cameras/{cam_id}")
    @router.delete("/cameras/{cam_id}")
    def camera_write(cam_id: str = ""):
        raise HTTPException(501, "Camera management is not supported by this backend.")

    # ---------- live engine status ----------
    @router.get("/status")
    def status():
        s = engine.get_status()
        return {"running": s["running"], "fps": s["fps"],
                "unknownCount": s["unknown_count"], "cameraName": s["camera"],
                "securityLevel": s["security_level"]}

    # ---------- security level + night schedule ----------
    def security_json():
        s = engine.get_security()
        return {"level": s["level"], "effectiveLevel": s["effective_level"],
                "night": {"enabled": s["night_enabled"], "start": s["night_start"],
                          "end": s["night_end"]},
                "updatedAt": _iso(s["updated_at"]) if s["updated_at"] else None}

    @router.get("/security")
    def get_security():
        return security_json()

    @router.put("/security")
    def put_security(body: SecurityUpdate):
        night = body.night or NightUpdate()
        try:
            engine.set_security(level=body.level, night_enabled=night.enabled,
                                night_start=night.start, night_end=night.end)
        except ValueError as e:
            raise HTTPException(400, str(e))
        return security_json()

    # ---------- incidents ----------
    @router.get("/incidents")
    def incidents(request: Request, search: str = "", cameraId: str = "",
                  status: str = "", sort: str = "newest",
                  from_: Optional[str] = Query(None, alias="from"),
                  to: Optional[str] = None):
        base = base_url(request)
        out = [_incident(r, base) for r in _rows("SELECT * FROM events")]
        s = search.strip().lower()
        if s:
            out = [i for i in out if any(
                s in str(i[k]).lower()
                for k in ("id", "cameraName", "location", "label"))]
        if cameraId:
            out = [i for i in out if i["cameraId"] == cameraId]
        if status:
            out = [i for i in out if i["status"] == status]
        if from_:
            out = [i for i in out if i["timestamp"][:10] >= from_]
        if to:
            out = [i for i in out if i["timestamp"][:10] <= to]
        out.sort(key=lambda i: i["timestamp"], reverse=(sort != "oldest"))
        return out

    @router.get("/incidents/{inc_id}")
    def incident(inc_id: int, request: Request):
        rows = _rows("SELECT * FROM events WHERE id=?", (inc_id,))
        if not rows:
            raise HTTPException(404, f"Incident {inc_id} was not found.")
        return _incident(rows[0], base_url(request))

    @router.patch("/incidents/{inc_id}")
    def review(inc_id: int, body: StatusUpdate, request: Request):
        if body.status not in STATUSES:
            raise HTTPException(422, f"Invalid status '{body.status}'.")
        con = sqlite3.connect(DB_PATH)
        cur = con.execute(
            "UPDATE events SET status=?, notes=?, reviewed_at=strftime('%s','now')"
            " WHERE id=?", (body.status, body.notes, inc_id))
        con.commit()
        con.close()
        if cur.rowcount == 0:
            raise HTTPException(404, "Incident not found.")
        return _incident(_rows("SELECT * FROM events WHERE id=?", (inc_id,))[0],
                         base_url(request))

    # ---------- dashboard ----------
    @router.get("/dashboard/summary")
    def summary():
        rows = _rows("SELECT ts, status FROM events")
        today = date.today()
        return {"activeCameras": 1 if engine.running else 0, "totalCameras": 1,
                "incidentsToday": sum(_local_day(r["ts"]) == today for r in rows),
                "totalIncidents": len(rows),
                "unresolvedAlerts": sum((r["status"] or "new") in ("new", "under_review")
                                        for r in rows)}

    @router.get("/dashboard/trend")
    def trend(days: int = 14):
        rows = _rows("SELECT ts, status FROM events")
        today = date.today()
        points = []
        for d in range(days - 1, -1, -1):
            day = today - timedelta(days=d)
            same = [r for r in rows if _local_day(r["ts"]) == day]
            confirmed = sum(r["status"] == "confirmed" for r in same)
            points.append({"date": day.isoformat(),
                           "potential": len(same) - confirmed,
                           "confirmed": confirmed})
        return points

    # ---------- people: residents (family) + visitors (guest) ----------
    faces_dir = Path(getattr(engine, "faces_path", FACES_DIR))

    def person_row(person_id):
        rows = _rows("SELECT * FROM people WHERE id=?", (person_id,))
        if not rows:
            raise HTTPException(404, f"Person {person_id} was not found.")
        return rows[0]

    def person_json(r, last_seen, now):
        seen = last_seen.get(r["name"])
        return {"id": r["id"], "name": r["name"], "role": r["role"],
                "validFrom": _iso(r["valid_from"]) if r["valid_from"] is not None else None,
                "validTo": _iso(r["valid_to"]) if r["valid_to"] is not None else None,
                "active": visitor_allowed(r["role"], r["valid_from"], r["valid_to"], now),
                "photoCount": len(_photo_files(faces_dir / r["name"])),
                "photoUrl": f"/api/people/{r['id']}/photo",
                "lastSeen": _iso(seen) if seen else None,
                "createdAt": _iso(r["created_at"] or 0)}

    def one_person(person_id):
        return person_json(person_row(person_id), engine.get_last_seen(), time.time())

    def check_faces(images):
        """400 unless every uploaded photo has a detectable face (else it can never match)."""
        missing = [name for name, img in images if not engine.has_face(img)]
        if missing:
            raise HTTPException(400, "No face found in: " + ", ".join(missing)
                                + ". Use a clear, front-facing photo.")

    def save_photos(folder: Path, images):
        folder.mkdir(parents=True, exist_ok=True)
        stamp = int(time.time() * 1000)
        for i, (_, img) in enumerate(images):
            cv2.imwrite(str(folder / f"photo_{stamp}_{i}.jpg"), img,
                        [cv2.IMWRITE_JPEG_QUALITY, 92])

    def safe_folder(name):
        folder = (faces_dir / name).resolve()
        if folder.parent != faces_dir.resolve():
            raise HTTPException(400, "Invalid person name.")
        return folder

    @router.get("/people")
    def list_people():
        sync_people(faces_dir)
        last_seen, now = engine.get_last_seen(), time.time()
        rows = _rows("SELECT * FROM people")
        rows.sort(key=lambda r: (r["role"] != FAMILY, r["name"].lower()))
        return [person_json(r, last_seen, now) for r in rows]

    @router.post("/people", status_code=201)
    async def create_person(name: str = Form(...), role: str = Form(FAMILY),
                            validFrom: Optional[str] = Form(None),
                            validTo: Optional[str] = Form(None),
                            photos: List[UploadFile] = File(None)):
        name = name.strip()
        if not valid_person_name(name):
            raise HTTPException(400, "Name may only contain letters, digits, spaces, '-' and '_' "
                                     "(max 40 characters), and cannot be 'unknown'.")
        if role == FAMILY:
            valid_from = valid_to = None
        else:
            valid_from = _parse_iso(validFrom, "validFrom")
            valid_to = _parse_iso(validTo, "validTo")
        _check_window(role, valid_from, valid_to)
        folder = safe_folder(name)
        taken = _rows("SELECT id FROM people WHERE name=? COLLATE NOCASE", (name,))
        if taken or any(d.name.lower() == name.lower()
                        for d in faces_dir.iterdir() if d.is_dir()):
            raise HTTPException(409, f"A person named '{name}' already exists.")
        images = await _decode_photos(photos)
        await asyncio.to_thread(check_faces, images)

        # row first, so a concurrent reload cannot claim the new folder as 'family'
        con = sqlite3.connect(DB_PATH)
        cur = con.execute("INSERT INTO people (name, role, valid_from, valid_to, created_at)"
                          " VALUES (?,?,?,?,?)", (name, role, valid_from, valid_to, time.time()))
        con.commit()
        con.close()
        person_id = cur.lastrowid
        try:
            save_photos(folder, images)
        except Exception:
            _delete_person(person_id, folder)
            raise
        await asyncio.to_thread(engine.reload_people)
        return one_person(person_id)

    @router.patch("/people/{person_id}")
    def update_person(person_id: int, body: PersonUpdate):
        r = person_row(person_id)
        given = body.model_fields_set
        role = body.role if ("role" in given and body.role) else r["role"]
        if role == FAMILY:
            valid_from = valid_to = None
        else:
            was_guest = r["role"] != FAMILY
            valid_from = (_parse_iso(body.validFrom, "validFrom") if "validFrom" in given
                          else (r["valid_from"] if was_guest else None))
            valid_to = (_parse_iso(body.validTo, "validTo") if "validTo" in given
                        else (r["valid_to"] if was_guest else None))
        _check_window(role, valid_from, valid_to)
        con = sqlite3.connect(DB_PATH)
        con.execute("UPDATE people SET role=?, valid_from=?, valid_to=? WHERE id=?",
                    (role, valid_from, valid_to, person_id))
        con.commit()
        con.close()
        engine.reload_people()
        return one_person(person_id)

    def _delete_person(person_id, folder):
        # folder first: if it survives, the next sync would re-add it as 'family'
        if folder.is_dir():
            try:
                shutil.rmtree(folder)
            except OSError as e:
                raise HTTPException(500, f"Could not delete photos folder: {e}")
        con = sqlite3.connect(DB_PATH)
        con.execute("DELETE FROM people WHERE id=?", (person_id,))
        con.commit()
        con.close()

    @router.delete("/people/{person_id}", status_code=204)
    def delete_person(person_id: int):
        r = person_row(person_id)
        _delete_person(person_id, safe_folder(r["name"]))
        engine.reload_people()
        return Response(status_code=204)

    @router.post("/people/{person_id}/photos")
    async def add_photos(person_id: int, photos: List[UploadFile] = File(None)):
        r = person_row(person_id)
        images = await _decode_photos(photos)
        await asyncio.to_thread(check_faces, images)
        save_photos(safe_folder(r["name"]), images)
        await asyncio.to_thread(engine.reload_people)
        return one_person(person_id)

    @router.get("/people/{person_id}/photo")
    def person_photo(person_id: int):
        r = person_row(person_id)
        for path in _photo_files(safe_folder(r["name"])):
            img = cv2.imread(str(path))
            if img is None:
                continue
            ok, buf = cv2.imencode(".jpg", _fit(img, THUMB_SIDE),
                                   [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ok:
                return Response(buf.tobytes(), media_type="image/jpeg",
                                headers={"Cache-Control": "no-cache"})
        raise HTTPException(404, f"{r['name']} has no photo.")

    # ---------- real-time: new intrusions + camera status ----------
    @router.websocket("/ws/events")
    async def ws_events(ws: WebSocket):
        await ws.accept()
        base = str(ws.base_url).rstrip("/")
        last = (_rows("SELECT COALESCE(MAX(id),0) AS m FROM events")[0]["m"])
        online = None
        try:
            while True:
                for r in _rows("SELECT * FROM events WHERE id>? ORDER BY id", (last,)):
                    last = r["id"]
                    await ws.send_json({"type": "alert", "data": _incident(r, base)})
                if online != engine.running:
                    online = engine.running
                    await ws.send_json({"type": "camera_status", "data": {
                        "cameraId": CAMERA_ID,
                        "status": "online" if online else "offline"}})
                await asyncio.sleep(1)
        except (WebSocketDisconnect, RuntimeError):
            pass

    return router
