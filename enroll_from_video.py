"""Enrol a person from camera footage, so recognition compares like with like.

Faces in corner-CCTV video are tiny (13-30 px) and seen from above; matching them only against
close-up phone photos gives low scores. Adding head crops from the camera itself raised the share of
face checks that matched the right person from 0-13 % to 57-77 % (test Thu 22 Oct).

Use a video in which ONLY this person appears: frames with more than one person are skipped, but a
video of someone else would enrol the wrong face.

    py enroll_from_video.py Raju test_videos/bedroom.mp4
Then press "Refresh faces" on the Residents & Visitors page (or restart the backend).
"""
import argparse
import sys
from pathlib import Path

import cv2

from engine import DETECTOR_IMGSZ, MIN_DET_SCORE, MIN_FACE_PX, FaceModel
from rules import valid_person_name
from vault_utils import FACES_DIR

HEAD_FRACTION = 0.55     # same head crop as the engine: top 55 % of the person box


def head_crops(video, step, max_crops, yolo, faces):
    """(frame index, head crop) for frames with exactly one person whose face is usable."""
    cap = cv2.VideoCapture(str(video))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    found = []
    for i in range(0, total, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = cap.read()
        if not ok:
            break
        boxes = yolo(frame, classes=[0], conf=0.4, imgsz=DETECTOR_IMGSZ,
                     verbose=False)[0].boxes.xyxy.int().tolist()
        if len(boxes) != 1:
            continue                       # nobody, or someone else might be in view
        x1, y1, x2, y2 = boxes[0]
        head = frame[max(0, y1):min(frame.shape[0], int(y1 + (y2 - y1) * HEAD_FRACTION)),
                     max(0, x1):x2]
        if head.size == 0:
            continue
        good = [f for f in faces.get(head)
                if f.det_score >= MIN_DET_SCORE and f.bbox[2] - f.bbox[0] >= MIN_FACE_PX]
        if good:
            found.append((i, head))
    cap.release()
    if len(found) > max_crops:             # keep an even spread over the whole video
        found = [found[round(k * (len(found) - 1) / (max_crops - 1))] for k in range(max_crops)]
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name", help="person's folder name in faces/ (must already be registered)")
    ap.add_argument("video", help="video in which only this person appears")
    ap.add_argument("--step", type=int, default=15, help="check every Nth frame (default 15)")
    ap.add_argument("--max", type=int, default=30, help="most crops to save (default 30)")
    args = ap.parse_args()

    folder = Path(FACES_DIR) / args.name
    if not valid_person_name(args.name) or not folder.is_dir():
        sys.exit(f"No registered person '{args.name}' in {FACES_DIR}/ - add them on the Residents & Visitors page first.")
    video = Path(args.video)
    if not video.is_file():
        sys.exit(f"Video not found: {video}")

    from ultralytics import YOLO
    crops = head_crops(video, args.step, args.max, YOLO("yolo11s.pt"), FaceModel())
    for i, head in crops:
        cv2.imwrite(str(folder / f"cam_{video.stem}_{i:06d}.jpg"), head)
    print(f"Saved {len(crops)} camera face crops for {args.name} in {folder}.")
    print('Press "Refresh faces" on the Residents & Visitors page (or restart the backend).')


if __name__ == "__main__":
    main()
