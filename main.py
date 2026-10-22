from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from pathlib import Path
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from api import create_router
from engine import VisionEngine
import house

import os
_src = os.getenv("VIDEO_SOURCE", "0")
engine = VisionEngine(source=int(_src) if _src.isdigit() else _src)


@asynccontextmanager
async def lifespan(app):
    engine.start()
    yield
    engine.stop()


app = FastAPI(lifespan=lifespan)
# dev frontend on this machine or a private-LAN address (e.g. a phone opening /guard on the same Wi-Fi)
app.add_middleware(CORSMiddleware,
                   allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+"
                                      r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):5173",
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(create_router(engine))
Path("clips").mkdir(exist_ok=True)
Path("snapshots").mkdir(exist_ok=True)
app.mount("/clips", StaticFiles(directory="clips"), name="clips")
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")
house.ANNOTATED_DIR.mkdir(exist_ok=True)
app.mount("/map_videos", StaticFiles(directory=house.ANNOTATED_DIR), name="map_videos")   # CCTV wall


def mjpeg():
    while True:
        jpg = engine.get_jpeg()
        if jpg is None:
            time.sleep(0.05)
            continue
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + jpg + b"\r\n")
        time.sleep(0.04)


@app.get("/video")
def video():
    return StreamingResponse(
        mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame")

