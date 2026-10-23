"""Make a labelled contact sheet of a clip, so its content can be reviewed quickly.

  py demo_video/contact_sheet.py clips/Clip1.mp4 3        one frame every 3 s
  py demo_video/contact_sheet.py clips/Clip1.mp4 1 40 60  every 1 s between 40 s and 60 s
"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
src = HERE / sys.argv[1]
step = float(sys.argv[2])
cap = cv2.VideoCapture(str(src))
fps = cap.get(cv2.CAP_PROP_FPS)
dur = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
start = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
end = float(sys.argv[4]) if len(sys.argv) > 4 else dur

thumbs, t = [], start
while t < end:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    if not ok:
        break
    img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    img.thumbnail((480, 480))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 90, 30], fill=(0, 0, 0))
    d.text((6, 4), f"{t:5.1f}s", fill=(255, 255, 0), font=ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 20))
    thumbs.append(img)
    t += step

cols = 6 if thumbs[0].width > thumbs[0].height else 10
tw, th = thumbs[0].size
rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), (40, 40, 40))
for i, im in enumerate(thumbs):
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
out = HERE / "out" / f"sheet_{src.stem}_{int(start)}.jpg"
sheet.save(out, quality=80)
print(out, f"{len(thumbs)} frames, clip {dur:.1f}s")
