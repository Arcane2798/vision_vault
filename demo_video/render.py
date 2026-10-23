"""Render the cartoon scenes, then join them into a draft with burned-in narration subtitles.

  py demo_video/render.py                      render every scene, then build the draft
  py demo_video/render.py --scenes problem     render only these scenes, then build the draft
  py demo_video/render.py --still problem 5.0  save one frame as PNG (out/still_problem_5.0.png)
  py demo_video/render.py --assemble           only rebuild the draft from rendered scenes
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

sys.path.insert(0, str(Path(__file__).parent))
import scenes as S  # noqa: E402

HERE = Path(__file__).parent
OUT = HERE / "out"
FPS = 30
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def draw_frame(name, t):
    fn, _, _ = S.SCENES[name]
    c = S.Canvas(S.BG.get(name, S.CREAM))
    fn(c, t)
    return c.finish()


ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]


def ffmpeg(args, cwd=OUT):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], cwd=cwd, check=True)


def text_filter(name, text, opts):
    """drawtext reading its text from a file (font copied next to the output), so colons need no escaping."""
    (OUT / f"{name}.txt").write_text(text, encoding="utf-8")
    return f"drawtext=fontfile=font.ttf:textfile={name}.txt:{opts}"


def chip(k, label):
    """A small red label at the top left of a demo clip."""
    text = f"LIVE DEMO  ·  {label}"
    return (f"drawbox=x=24:y=20:w={len(text) * 16 + 50}:h=56:color=0xD52A23@0.95:t=fill,"
            + text_filter(f"chip_{k:02}", text, "x=44:y=34:fontsize=28:fontcolor=white"))


def render_footage(name):
    """Scenes made from real recordings: the break-in footage and the demo clips."""
    import shutil
    shutil.copy(S.BODY_B, OUT / "font.ttf")
    if name == "intro":
        i = S.INTRO
        # phone-size video in the middle (720x1280 source shown 608x1080, so it is only scaled down)
        fc = (f"[0:v]split[a][b];"
              f"[a]scale={S.W}:{S.H}:force_original_aspect_ratio=increase,crop={S.W}:{S.H},boxblur=40:4,eq=brightness=-0.3[bg];"
              f"[b]scale=-2:{S.H}:flags=lanczos[fg];"
              f"[bg][fg]overlay=(W-w)/2:0,setsar=1,"
              + text_filter("credit", i["credit"], "x=w-tw-30:y=30:fontsize=26:fontcolor=white:box=1:boxcolor=0x000000@0.55:boxborderw=10"))
        ffmpeg(["-ss", str(i["start"]), "-to", str(i["end"]), "-i", str(HERE / i["src"]), "-filter_complex", fc, *ENC, "scene_intro.mp4"])
    else:
        parts = []
        for k, (src, a, b, label, _, *crop) in enumerate(S.DEMO):
            part = f"demo_{k:02}.mp4"
            zoom = f"{crop[0]}," if crop else ""
            vf = f"{zoom}scale={S.W}:{S.H}:flags=lanczos,setsar=1,{chip(k, label)}"
            ffmpeg(["-ss", str(a), "-to", str(b), "-i", str(HERE / src), "-vf", vf, *ENC, part])
            parts.append(part)
        (OUT / "demo_list.txt").write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
        ffmpeg(["-f", "concat", "-safe", "0", "-i", "demo_list.txt", "-c", "copy", "scene_demo.mp4"])
    print(f"rendered scene_{name}.mp4")


def render_scene(name):
    fn, dur, _ = S.SCENES[name]
    OUT.mkdir(exist_ok=True)
    if fn is None:
        return render_footage(name)
    dst = OUT / f"scene_{name}.mp4"
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{S.W}x{S.H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", str(dst)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(dur * FPS)
    for i in range(n):
        proc.stdin.write(draw_frame(name, i / FPS).tobytes())
        if i % (FPS * 5) == 0:
            print(f"  {name}: {i / FPS:5.1f}/{dur:.0f} s", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"rendered {dst.name}")


def srt_time(s):
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def write_srt(order, durations):
    lines, t0, k = [], 0.0, 1
    for name in order:
        for a, b, text in S.SCENES[name][2]:
            lines += [str(k), f"{srt_time(t0 + a)} --> {srt_time(t0 + b)}", text, ""]
            k += 1
        t0 += durations[name]
    (OUT / "narration.srt").write_text("\n".join(lines), encoding="utf-8")
    return t0


def assemble(order):
    durations = {n: S.SCENES[n][1] for n in order}
    total = write_srt(order, durations)
    listing = OUT / "concat.txt"
    listing.write_text("".join(f"file 'scene_{n}.mp4'\n" for n in order), encoding="utf-8")
    run = lambda args: subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], cwd=OUT, check=True)
    run(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "draft_no_subs.mp4"])
    style = ("FontName=Segoe UI Semibold,FontSize=12,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
             "BackColour=&H40000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=16,Alignment=2")
    run(["-i", "draft_no_subs.mp4", "-vf", f"subtitles=narration.srt:force_style='{style}'",
         "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "draft_with_subs.mp4"])
    print(f"draft: {OUT / 'draft_with_subs.mp4'}  ({total:.0f} s = {int(total // 60)}:{int(total % 60):02})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", nargs=2, metavar=("SCENE", "SECONDS"))
    ap.add_argument("--scenes", nargs="*")
    ap.add_argument("--assemble", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    if args.still:
        name, t = args.still
        p = OUT / f"still_{name}_{t}.png"
        draw_frame(name, float(t)).save(p)
        print(p)
        sys.exit()
    if not args.assemble:
        for n in (args.scenes or S.ORDER):
            render_scene(n)
    assemble(S.ORDER)
