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
from typing import List, Literal, Optional

import cv2
import numpy as np
from fastapi import (APIRouter, File, Form, HTTPException, Query, Request,
                     Response, UploadFile, WebSocket, WebSocketDisconnect)
from pydantic import BaseModel, ConfigDict, Field

from rules import (FAMILY, MAX_ACK_NOTE, ROLES, guard_ack_message,
                   valid_person_name, visitor_allowed)
from vault_utils import DB_PATH, FACES_DIR, house_unit, send_telegram, sync_people

CAMERA_ID = "cam-01"
STATUSES = {"new", "under_review", "confirmed", "dismissed"}
PHOTO_EXT = {".jpg", ".jpeg", ".png"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_PHOTO_SIDE = 1280     # uploads are downscaled to this before saving
THUMB_SIDE = 320
VIDEO_DIR = Path("test_videos")    # recorded test videos (git-ignored)
VIDEO_EXT = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
MAX_VIDEO_BYTES = 500 * 1024 * 1024


class StatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class NightUpdate(BaseModel):
    enabled: Optional[bool] = None
    start: Optional[str] = None
    end: Optional[str] = None


class AwayUpdate(BaseModel):
    """Away-from-home dates (e.g. a vacation). Omitted = unchanged, null/"" = open-ended."""
    model_config = ConfigDict(populate_by_name=True)
    enabled: Optional[bool] = None
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[str] = None


class SecurityUpdate(BaseModel):
    level: Optional[str] = None
    night: Optional[NightUpdate] = None
    away: Optional[AwayUpdate] = None


class SourceUpdate(BaseModel):
    kind: str                    # "camera" | "file"
    name: Optional[str] = None   # file name in test_videos/ when kind == "file"


class PersonUpdate(BaseModel):
    role: Optional[str] = None
    validFrom: Optional[str] = None
    validTo: Optional[str] = None


class GuardAck(BaseModel):
    note: Optional[str] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]     # plain-text history, newest last (server keeps the last 20)


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


def _video_json(p: Path):
    st = p.stat()
    return {"name": p.name, "sizeBytes": st.st_size, "modifiedAt": _iso(st.st_mtime)}


def _videos():
    VIDEO_DIR.mkdir(exist_ok=True)
    files = [p for p in VIDEO_DIR.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_EXT]
    return [_video_json(p) for p in sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)]


def _video_path(name: str) -> Path:
    """test_videos/<name>, or 404. Plain file names only (no folders)."""
    p = VIDEO_DIR / name
    if Path(name).name != name or p.suffix.lower() not in VIDEO_EXT or not p.is_file():
        raise HTTPException(404, f"No test video named {name!r}.")
    return p


def _free_video_name(filename: str) -> Path:
    """Safe, unused file name in test_videos/ for an upload ("my clip.mp4" -> "my clip_1.mp4" if taken)."""
    stem = "".join(c if c.isalnum() or c in " -_" else "_" for c in Path(filename).stem).strip() or "video"
    suffix = Path(filename).suffix.lower()
    p, n = VIDEO_DIR / f"{stem}{suffix}", 1
    while p.exists():
        p, n = VIDEO_DIR / f"{stem}_{n}{suffix}", n + 1
    return p


def _readable_video(p: Path) -> bool:
    cap = cv2.VideoCapture(str(p))
    try:
        return cap.isOpened() and cap.read()[0]
    finally:
        cap.release()


def _incident(r, base):
    name = r["camera"] or ""
    location = name.split(": ", 1)[-1]
    clip = f"{base}/clips/{Path(r['clip_path']).name}" if r["clip_path"] else None
    snap = (f"{base}/snapshots/{Path(r['snapshot_path']).name}"
            if r["snapshot_path"] else None)
    out = {"id": str(r["id"]), "cameraId": CAMERA_ID, "cameraName": name,
           "location": location, "timestamp": _iso(r["ts"]),
           "label": r["event_type"] or "intrusion",
           "identity": r["identity"] or "unknown",   # visitor name for guest_outside_window
           "confidence": 1.0,        # rule-based alert, no model score is logged
           "status": r["status"] or "new", "detections": [],
           # clipUrl exists as soon as recording starts; play it only once this is true
           "clipReady": bool(clip and r.get("clip_ready")),
           "guardNotified": bool(r.get("guard_notified")),   # shown to the guard house
           "guardAcknowledgedAt": _iso(r["guard_ack_at"]) if r.get("guard_ack_at") else None,
           "guardAckNote": r.get("guard_ack_note")}
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


def _guard_alert(r, base):
    """events row -> guard alert JSON. No identity or people data: the guard house only sees
    the address, time and the stranger's snapshot/clip."""
    clip = f"{base}/clips/{Path(r['clip_path']).name}" if r["clip_path"] else None
    snap = (f"{base}/snapshots/{Path(r['snapshot_path']).name}"
            if r["snapshot_path"] else None)
    return {"id": str(r["id"]), "timestamp": _iso(r["ts"]), "houseUnit": house_unit(),
            "cameraName": r["camera"] or "", "snapshotUrl": snap, "clipUrl": clip,
            "clipReady": bool(clip and r.get("clip_ready")),
            "acknowledgedAt": _iso(r["guard_ack_at"]) if r.get("guard_ack_at") else None,
            "ackNote": r.get("guard_ack_note")}


def dashboard_summary(running):
    """Counts for the dashboard cards (also used by the chat assistant)."""
    rows = _rows("SELECT ts, status FROM events")
    today = date.today()
    return {"activeCameras": 1 if running else 0, "totalCameras": 1,
            "incidentsToday": sum(_local_day(r["ts"]) == today for r in rows),
            "totalIncidents": len(rows),
            "unresolvedAlerts": sum((r["status"] or "new") in ("new", "under_review")
                                    for r in rows)}


def person_json(r, last_seen, now, faces_dir):
    """people row -> Person JSON (also used by the chat assistant)."""
    seen = last_seen.get(r["name"])
    return {"id": r["id"], "name": r["name"], "role": r["role"],
            "validFrom": _iso(r["valid_from"]) if r["valid_from"] is not None else None,
            "validTo": _iso(r["valid_to"]) if r["valid_to"] is not None else None,
            "active": visitor_allowed(r["role"], r["valid_from"], r["valid_to"], now),
            "photoCount": len(_photo_files(Path(faces_dir) / r["name"])),
            "photoUrl": f"/api/people/{r['id']}/photo",
            "lastSeen": _iso(seen) if seen else None,
            "createdAt": _iso(r["created_at"] or 0)}


def people_list(engine, faces_dir):
    """All people as Person JSON, family first then by name."""
    sync_people(faces_dir)
    last_seen, now = engine.get_last_seen(), time.time()
    rows = _rows("SELECT * FROM people")
    rows.sort(key=lambda r: (r["role"] != FAMILY, r["name"].lower()))
    return [person_json(r, last_seen, now, faces_dir) for r in rows]


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
                "securityLevel": s["security_level"],
                "peopleInView": s.get("in_view", [])}

    # ---------- security level + night schedule ----------
    def security_json():
        s = engine.get_security()
        return {"level": s["level"], "effectiveLevel": s["effective_level"],
                "highReason": s.get("high_reason"),
                "night": {"enabled": s["night_enabled"], "start": s["night_start"],
                          "end": s["night_end"]},
                "away": {"enabled": s["away_enabled"],
                         "from": _iso(s["away_from"]) if s["away_from"] is not None else None,
                         "to": _iso(s["away_to"]) if s["away_to"] is not None else None},
                "updatedAt": _iso(s["updated_at"]) if s["updated_at"] else None}

    @router.get("/security")
    def get_security():
        return security_json()

    @router.put("/security")
    def put_security(body: SecurityUpdate):
        night = body.night or NightUpdate()
        away = {}
        if body.away is not None:
            given = body.away.model_fields_set
            if body.away.enabled is not None:
                away["away_enabled"] = body.away.enabled
            if "from_" in given:
                away["away_from"] = _parse_iso(body.away.from_, "away.from")
            if "to" in given:
                away["away_to"] = _parse_iso(body.away.to, "away.to")
        try:
            engine.set_security(level=body.level, night_enabled=night.enabled,
                                night_start=night.start, night_end=night.end, **away)
        except ValueError as e:
            raise HTTPException(400, str(e))
        return security_json()

    # ---------- video source: live camera or a recorded test video ----------
    def source_json():
        s = engine.get_source()
        test = s["is_file"] and not s["is_default"]
        return {"kind": "file" if test else "camera",
                "name": Path(s["source"]).name if test else None,
                "finished": s["finished"] if test else False,
                "progress": s["progress"] if test else None,
                "videos": _videos()}

    @router.get("/source")
    def get_source():
        return source_json()

    @router.put("/source")
    def put_source(body: SourceUpdate):
        if body.kind == "camera":
            engine.set_source(None)
        elif body.kind == "file":
            engine.set_source(_video_path(body.name or ""))
        else:
            raise HTTPException(400, "kind must be 'camera' or 'file'.")
        return source_json()

    @router.post("/source/videos", status_code=201)
    async def upload_video(video: UploadFile = File(...)):
        if Path(video.filename or "").suffix.lower() not in VIDEO_EXT:
            raise HTTPException(400, f"Unsupported video type. Use one of: {', '.join(sorted(VIDEO_EXT))}.")
        VIDEO_DIR.mkdir(exist_ok=True)
        dest, size = _free_video_name(video.filename), 0
        try:
            with open(dest, "wb") as f:
                while chunk := await video.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_VIDEO_BYTES:
                        raise HTTPException(400, "Video is larger than 500 MB.")
                    f.write(chunk)
            if not await asyncio.to_thread(_readable_video, dest):
                raise HTTPException(400, "Could not read that video. Try an .mp4 (H.264) file.")
        except BaseException:
            dest.unlink(missing_ok=True)
            raise
        return _video_json(dest)

    # ---------- incidents ----------
    @router.get("/incidents")
    def incidents(request: Request, search: str = "", cameraId: str = "",
                  status: str = "", sort: str = "newest",
                  from_: Optional[str] = Query(None, alias="from"),
                  to: Optional[str] = None):
        base = base_url(request)
        rows = _rows("SELECT * FROM events")
        # from/to are local calendar days (yyyy-mm-dd); compare against each event's local day, not its UTC date
        if from_:
            rows = [r for r in rows if _local_day(r["ts"]).isoformat() >= from_[:10]]
        if to:
            rows = [r for r in rows if _local_day(r["ts"]).isoformat() <= to[:10]]
        out = [_incident(r, base) for r in rows]
        s = search.strip().lower()
        if s:
            out = [i for i in out if any(
                s in str(i[k]).lower()
                for k in ("id", "cameraName", "location", "label", "identity"))]
        if cameraId:
            out = [i for i in out if i["cameraId"] == cameraId]
        if status:
            out = [i for i in out if i["status"] == status]
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
        return dashboard_summary(engine.running)

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

    def one_person(person_id):
        return person_json(person_row(person_id), engine.get_last_seen(), time.time(),
                           faces_dir)

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
        return people_list(engine, faces_dir)

    @router.post("/people/reload")
    async def reload_people():
        """Re-read faces/ (e.g. photos copied in by hand) and re-embed only folders that changed."""
        await asyncio.to_thread(engine.reload_people)
        return people_list(engine, faces_dir)

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

    # ---------- Guard House view (mock township guard screen) ----------
    def guard_row(alert_id):
        rows = _rows("SELECT * FROM events WHERE id=? AND guard_notified=1", (alert_id,))
        if not rows:
            raise HTTPException(404, f"Guard alert {alert_id} was not found.")
        return rows[0]

    @router.get("/guard/alerts")
    def guard_alerts(request: Request, limit: int = 50):
        limit = max(1, min(limit, 200))
        rows = _rows("SELECT * FROM events WHERE guard_notified=1 ORDER BY ts DESC, id DESC"
                     " LIMIT ?", (limit,))
        base = base_url(request)
        return [_guard_alert(r, base) for r in rows]

    @router.post("/guard/alerts/{alert_id}/ack")
    def guard_ack(alert_id: int, request: Request, body: Optional[GuardAck] = None):
        note = ((body.note if body else None) or "").strip() or None
        if note and len(note) > MAX_ACK_NOTE:
            raise HTTPException(400, f"note must be at most {MAX_ACK_NOTE} characters.")
        guard_row(alert_id)
        now = time.time()
        con = sqlite3.connect(DB_PATH)
        try:
            # the first ack wins its time; a repeat only updates the note
            first = con.execute("UPDATE events SET guard_ack_at=?, guard_ack_note=?"
                                " WHERE id=? AND guard_ack_at IS NULL",
                                (now, note, alert_id)).rowcount == 1
            if not first and note is not None:
                con.execute("UPDATE events SET guard_ack_note=? WHERE id=?", (note, alert_id))
            con.commit()
        finally:
            con.close()
        if first:
            send_telegram(guard_ack_message(datetime.fromtimestamp(now).strftime("%H:%M"), note))
        return _guard_alert(guard_row(alert_id), base_url(request))

    # ---------- AI assistant (tools + loop live in chat.py) ----------
    @router.post("/chat")
    def chat(body: ChatRequest):
        import chat as chat_mod      # imported here: chat.py imports this module
        try:
            client = chat_mod.make_client()
        except chat_mod.ChatNotConfigured as e:
            raise HTTPException(503, str(e))
        model = chat_mod.env("CHAT_MODEL", chat_mod.DEFAULT_MODEL)
        try:
            return chat_mod.run_chat(
                [m.model_dump() for m in body.messages], engine,
                generate=lambda h, s: chat_mod._generate(client, model, h, s))
        except ValueError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            mapped = chat_mod.provider_error(e)   # quota -> 200 busy reply, others -> 502
            if mapped is None:
                raise
            status, payload = mapped
            if status == 200:
                return payload
            raise HTTPException(status, payload["detail"])

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
