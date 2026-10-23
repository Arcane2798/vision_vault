"""Save full-size frames from a clip at given times:  py demo_video/frames.py clips/Clip1.mp4 17 31.5"""
import sys
from pathlib import Path

import cv2

HERE = Path(__file__).parent
src = HERE / sys.argv[1]
cap = cv2.VideoCapture(str(src))
for t in map(float, sys.argv[2:]):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    if ok:
        out = HERE / "out" / f"frame_{src.stem}_{t:.1f}.jpg"
        cv2.imwrite(str(out), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        print(out)
