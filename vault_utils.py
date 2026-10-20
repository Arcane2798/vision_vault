import os, sqlite3, time, threading
from collections import deque
from pathlib import Path
import cv2
import requests
import subprocess
import imageio_ffmpeg

CAMERA_NAME = "Camera #1: Front Door"
DB_PATH = "vault.db"
CLIP_DIR = Path("clips"); CLIP_DIR.mkdir(exist_ok=True)
SNAP_DIR = Path("snapshots"); SNAP_DIR.mkdir(exist_ok=True)
FACES_DIR = Path("faces")       # enrollment photos, one folder per person (never served publicly)
STALE_CLIP_SEC = 120            # on startup, clips older than this are marked ready


# ---------- event log ----------
def init_db():
    con = sqlite3.connect(DB_PATH)
    con.execute("""CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts REAL, camera TEXT, track_id INTEGER, identity TEXT,
        event_type TEXT, clip_path TEXT, snapshot_path TEXT)""")
    # review fields used by the frontend (added later, so migrate old databases)
    have = {r[1] for r in con.execute("PRAGMA table_info(events)")}
    for col, ddl in (("status", "TEXT DEFAULT 'new'"), ("notes", "TEXT"),
                     ("reviewed_at", "REAL"),
                     ("clip_ready", "INTEGER DEFAULT 0"),    # 1 once the H.264 clip is playable
                     ("guard_notified", "INTEGER DEFAULT 0"),   # 1 = shown to the guard house
                     ("guard_ack_at", "REAL"),                   # epoch of the guard's first ack
                     ("guard_ack_note", "TEXT")):
        if col not in have:
            con.execute(f"ALTER TABLE events ADD COLUMN {col} {ddl}")
    # clips older than this were finished (or abandoned by a crash/restart): don't show "processing" forever
    con.execute("UPDATE events SET clip_ready=1 WHERE clip_ready=0 AND clip_path IS NOT NULL"
                " AND ts < ?", (time.time() - STALE_CLIP_SEC,))
    # residents and visitors; name = folder in faces/, window only for guests
    con.execute("""CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        role TEXT NOT NULL DEFAULT 'family',
        valid_from REAL, valid_to REAL, created_at REAL)""")
    # key/value settings (security level, night schedule); updated_at = epoch of last change
    con.execute("""CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT, updated_at REAL)""")
    con.commit()
    con.close()


# ---------- settings ----------
def get_settings():
    """{key: (value, updated_at)} for every stored setting."""
    con = sqlite3.connect(DB_PATH)
    try:
        return {k: (v, t) for k, v, t in
                con.execute("SELECT key, value, updated_at FROM settings")}
    finally:
        con.close()


def set_settings(values):
    """Upsert {key: value} (values stored as text). Returns the update time (epoch)."""
    now = time.time()
    con = sqlite3.connect(DB_PATH)
    try:
        con.executemany(
            "INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)"
            " ON CONFLICT(key) DO UPDATE SET value=excluded.value,"
            " updated_at=excluded.updated_at",
            [(k, str(val), now) for k, val in values.items()])
        con.commit()
    finally:
        con.close()
    return now


# ---------- people (residents + visitors) ----------
def sync_people(faces_dir=None):
    """Insert a 'family' row for every faces/ folder that has no row yet (back-compat)."""
    faces_dir = Path(faces_dir or FACES_DIR)
    faces_dir.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    try:
        have = {r[0].lower() for r in con.execute("SELECT name FROM people")}
        for d in sorted(faces_dir.iterdir()):
            if d.is_dir() and d.name.lower() not in have:   # no INSERT OR IGNORE: it burns ids
                con.execute("INSERT INTO people (name, role, created_at)"
                            " VALUES (?, 'family', ?)", (d.name, time.time()))
        con.commit()
    finally:
        con.close()


def load_people():
    """{name: {id, name, role, valid_from, valid_to, created_at}} from the people table."""
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        return {r["name"]: dict(r) for r in con.execute("SELECT * FROM people")}
    finally:
        con.close()

def log_event(camera, track_id, identity, event_type,
              clip_path=None, snapshot_path=None, guard_notified=False):
    """Insert an event row; returns its id."""
    con = sqlite3.connect(DB_PATH)
    try:
        cur = con.execute(
            "INSERT INTO events (ts, camera, track_id, identity, event_type,"
            " clip_path, snapshot_path, guard_notified) VALUES (?,?,?,?,?,?,?,?)",
            (time.time(), camera, track_id, identity, event_type,
             clip_path, snapshot_path, int(bool(guard_notified))))
        con.commit()
        return cur.lastrowid
    finally:
        con.close()


def mark_clip_ready(clip_path):
    """Flag every event that shares this clip as playable (called when H.264 conversion ends)."""
    con = sqlite3.connect(DB_PATH, timeout=10)
    try:
        con.execute("UPDATE events SET clip_ready=1 WHERE clip_path=?", (clip_path,))
        con.commit()
    finally:
        con.close()


def _load_env():
    # 1. Try python-dotenv if installed
    try:
        from dotenv import load_dotenv
        env_file = Path(__file__).resolve().parent / ".env"
        if env_file.exists():
            load_dotenv(dotenv_path=env_file)
        else:
            load_dotenv()
    except Exception:
        pass

    # 2. Manual fallback parser in case python-dotenv is not installed
    candidates = [
        Path(__file__).resolve().parent / ".env",
        Path.cwd() / ".env"
    ]
    for env_path in candidates:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip("'\"")
                        if k and not os.getenv(k):
                            os.environ[k] = v
            except Exception:
                pass

_load_env()


# ---------- telegram ----------
def env(key, default=None):
    """os.getenv, re-reading .env once if the key is missing."""
    value = os.getenv(key)
    if not value:
        _load_env()
        value = os.getenv(key)
    return value or default


def guard_chat_id():
    """Guard-house Telegram chat (GUARD_TG_CHAT_ID), or None if unset."""
    return env("GUARD_TG_CHAT_ID")


def house_unit():
    """This home's address for the guard house (HOUSE_UNIT)."""
    return env("HOUSE_UNIT", "This home")


def _send(text, photo_path, chat_id=None):
    """Send to `chat_id` (default TG_CHAT_ID). Returns True if Telegram accepted it."""
    token, chat = env("TG_TOKEN"), chat_id or env("TG_CHAT_ID")
    if not token or not chat:
        print("[telegram] TG_TOKEN / chat id not set, skipping")
        return False
    try:
        base = f"https://api.telegram.org/bot{token}"
        if photo_path:
            with open(photo_path, "rb") as f:
                r = requests.post(f"{base}/sendPhoto",
                                  data={"chat_id": chat, "caption": text},
                                  files={"photo": f}, timeout=15)
        else:
            r = requests.post(f"{base}/sendMessage",
                              data={"chat_id": chat, "text": text}, timeout=15)
    except Exception as e:
        print("[telegram] failed:", e)
        return False
    if not r.ok:
        print(f"[telegram] failed: HTTP {r.status_code}")
        return False
    return True


def send_telegram(text, photo_path=None, chat_id=None, on_sent=None):
    """Send in a background thread so the video loop never freezes.
    on_sent() runs only if Telegram accepted the message."""
    def _run():
        if _send(text, photo_path, chat_id) and on_sent:
            try:
                on_sent()
            except Exception as e:
                print("[telegram] on_sent failed:", e)
    threading.Thread(target=_run, daemon=True).start()

def convert_to_h264(path, on_done=None):
    """Re-encode `path` to browser-playable H.264 in a daemon thread, then call on_done(path).
    on_done also runs if conversion fails (the mp4v file is kept), so a clip never stays "processing"."""
    def _run():
        tmp = path + ".h264.mp4"
        try:
            subprocess.run(
                [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", path,
                 "-vcodec", "libx264", "-pix_fmt", "yuv420p",
                 "-preset", "veryfast", "-movflags", "+faststart", tmp],
                check=True, capture_output=True)
            os.replace(tmp, path)
        except Exception as e:
            print("[ffmpeg] conversion failed:", e)
        if on_done:
            try:
                on_done(path)
            except Exception as e:
                print("[ffmpeg] on_done failed:", e)
    threading.Thread(target=_run, daemon=True).start()


def clip_fps(measured_fps):
    """Frame rate to write a clip at: the engine's measured FPS, rounded, at least 1."""
    try:
        return max(1, int(round(float(measured_fps))))
    except (TypeError, ValueError):
        return 1


# ---------- clip recorder (pre-roll + post-roll) ----------
class ClipRecorder:
    """Keeps the last `pre_sec` seconds of frames; on trigger, writes them plus `post_sec`
    seconds more at the engine's measured FPS, so the clip plays at real speed."""
    MAX_BUFFER = 600     # safety cap on buffered frames (e.g. 5 s at 120 fps)

    def __init__(self, pre_sec=5, post_sec=5, on_ready=mark_clip_ready):
        self.pre_sec = pre_sec
        self.post_sec = post_sec
        self.on_ready = on_ready             # called with the path once the clip is playable
        self.buffer = deque(maxlen=self.MAX_BUFFER)   # (time, frame)
        self.fps = 1
        self.post_frames = 0
        self.writer = None
        self.remaining = 0
        self.path = None

    def add(self, frame, now=None):
        if self.writer is not None:
            self.writer.write(frame)
            self.remaining -= 1
            if self.remaining <= 0:
                self.writer.release()
                self.writer = None
                convert_to_h264(self.path, self.on_ready)
        else:
            now = time.time() if now is None else now
            self.buffer.append((now, frame.copy()))
            while self.buffer and now - self.buffer[0][0] > self.pre_sec:
                self.buffer.popleft()

    def trigger(self, path, fps):
        """Start (or extend) a clip at `fps` (the engine's measured FPS).
        Returns the file that will hold it, or None if there are no frames yet."""
        if self.writer is not None:        # already recording: extend it (keeps its fps)
            self.remaining = self.post_frames
            return self.path
        if not self.buffer:
            return None
        self.fps = clip_fps(fps)
        self.post_frames = self.fps * self.post_sec
        h, w = self.buffer[-1][1].shape[:2]
        self.path = path
        self.writer = cv2.VideoWriter(
            path, cv2.VideoWriter_fourcc(*"mp4v"), self.fps, (w, h))
        for _, f in self.buffer:
            self.writer.write(f)
        self.buffer.clear()
        self.remaining = self.post_frames
        return path