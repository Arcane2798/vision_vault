"""Cartoon scenes for the Vision Vault demo video.

Each scene is a function draw(c, t) plus a duration and narration cues (seconds from the scene start).
Render with:  py demo_video/render.py            (all scenes)
              py demo_video/render.py --still problem 5.0   (one frame as PNG, for checking)
"""
import math
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
SS = 2  # supersampling: draw at 2x, shrink at the end for smooth edges

FONT_DIR = "C:/Windows/Fonts/"
DISPLAY = FONT_DIR + "impact.ttf"
BODY = FONT_DIR + "segoeui.ttf"
BODY_B = FONT_DIR + "segoeuib.ttf"
BODY_SB = FONT_DIR + "seguisb.ttf"

# palette (matches the deck)
RED = (213, 42, 35)
DARK_RED = (112, 2, 15)
ORANGE = (245, 140, 31)
CREAM = (255, 247, 239)
WHITE = (255, 255, 255)
INK = (34, 30, 36)
GREY = (120, 120, 128)
LIGHT = (236, 230, 224)
NIGHT = (24, 33, 62)
NIGHT2 = (38, 50, 88)
GREEN = (46, 157, 91)
CYAN = (31, 181, 201)
SKIN = (241, 196, 160)
SKIN2 = (196, 140, 100)
SDG11 = (253, 157, 36)
SDG16 = (0, 104, 157)


# ---------- easing ----------
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur)


def ease_out(x):
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def pop(x):
    """Overshoot ease for things that pop in."""
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2 if x > 0 else 0.0


def lerp(a, b, x):
    return a + (b - a) * x


def mix(c1, c2, x):
    return tuple(int(lerp(a, b, x)) for a, b in zip(c1, c2))


# ---------- canvas ----------
class Canvas:
    _fonts = {}

    def __init__(self, bg):
        self.img = Image.new("RGB", (W * SS, H * SS), bg)
        self.d = ImageDraw.Draw(self.img, "RGBA")

    def font(self, path, size):
        key = (path, int(size * SS))
        if key not in self._fonts:
            self._fonts[key] = ImageFont.truetype(path, key[1])
        return self._fonts[key]

    @staticmethod
    def _c(col, a):
        return tuple(col[:3]) + (int(255 * clamp(a)),)

    def rect(self, x, y, w, h, fill, a=1.0, r=0, outline=None, width=0):
        box = [x * SS, y * SS, (x + w) * SS, (y + h) * SS]
        ol = self._c(outline, a) if outline else None
        if r:
            self.d.rounded_rectangle(box, radius=r * SS, fill=self._c(fill, a) if fill else None, outline=ol, width=int(width * SS))
        else:
            self.d.rectangle(box, fill=self._c(fill, a) if fill else None, outline=ol, width=int(width * SS))

    def circle(self, x, y, r, fill, a=1.0, outline=None, width=0):
        box = [(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS]
        self.d.ellipse(box, fill=self._c(fill, a) if fill else None, outline=self._c(outline, a) if outline else None, width=int(width * SS))

    def arc(self, x, y, r, start, end, col, width, a=1.0):
        box = [(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS]
        self.d.arc(box, start, end, fill=self._c(col, a), width=int(width * SS))

    def poly(self, pts, fill, a=1.0):
        self.d.polygon([(px * SS, py * SS) for px, py in pts], fill=self._c(fill, a))

    def line(self, pts, col, width, a=1.0):
        self.d.line([(px * SS, py * SS) for px, py in pts], fill=self._c(col, a), width=int(width * SS), joint="curve")

    def text(self, x, y, s, size, col, a=1.0, font=BODY_B, anchor="la"):
        a = clamp(a)
        if a <= 0.004 or size <= 0:
            return
        f = self.font(font, size)
        if a >= 0.996:
            self.d.text((x * SS, y * SS), s, font=f, fill=tuple(col[:3]), anchor=anchor)
            return
        # ImageDraw ignores alpha for text, so draw a mask and paste it with the faded opacity
        l, t_, r, b = self.d.textbbox((x * SS, y * SS), s, font=f, anchor=anchor)
        l, t_ = int(l) - 2, int(t_) - 2
        mask = Image.new("L", (int(r) - l + 4, int(b) - t_ + 4), 0)
        ImageDraw.Draw(mask).text((x * SS - l, y * SS - t_), s, font=f, fill=int(255 * a), anchor=anchor)
        self.img.paste(tuple(col[:3]), (l, t_), mask)

    def text_w(self, s, size, font=BODY_B):
        return self.d.textlength(s, font=self.font(font, size)) / SS

    def wrap(self, x, y, s, size, col, max_w, a=1.0, font=BODY, line_h=1.3, anchor="la"):
        """Word-wrapped text; returns the y below the last line."""
        words, lines, cur = s.split(), [], ""
        for w_ in words:
            test = (cur + " " + w_).strip()
            if self.text_w(test, size, font) <= max_w:
                cur = test
            else:
                lines.append(cur)
                cur = w_
        if cur:
            lines.append(cur)
        for i, ln in enumerate(lines):
            self.text(x, y + i * size * line_h, ln, size, col, a, font, anchor)
        return y + len(lines) * size * line_h

    def finish(self):
        return self.img.reduce(SS)


# ---------- props ----------
def person(c, x, y, h, body, a=1.0, skin=SKIN, hood=False, cap=None, hair=(60, 40, 30), wave=0.0):
    """Simple cartoon person; (x, y) = feet centre."""
    head_r = h * 0.13
    bw, bh = h * 0.38, h * 0.42
    leg_h = h * 0.30
    # legs
    c.rect(x - bw * 0.36, y - leg_h, bw * 0.28, leg_h, mix(body, INK, 0.55), a, r=bw * 0.1)
    c.rect(x + bw * 0.08, y - leg_h, bw * 0.28, leg_h, mix(body, INK, 0.55), a, r=bw * 0.1)
    # body
    c.rect(x - bw / 2, y - leg_h - bh, bw, bh, body, a, r=bw * 0.35)
    # arm (waving if wave > 0)
    ax, ay = x + bw * 0.45, y - leg_h - bh * 0.8
    ang = -math.radians(40 + 50 * math.sin(wave * 6)) if wave else math.radians(75)
    c.line([(ax, ay), (ax + math.cos(ang) * h * 0.25, ay + math.sin(ang) * h * 0.25)], body, h * 0.08, a)
    # head
    hy = y - leg_h - bh - head_r * 0.85
    if hood:
        c.circle(x, hy, head_r * 1.25, mix(body, INK, 0.2), a)
        c.circle(x, hy + head_r * 0.15, head_r * 0.85, (30, 30, 34), a)
        c.circle(x - head_r * 0.3, hy + head_r * 0.1, head_r * 0.12, WHITE, a)
        c.circle(x + head_r * 0.3, hy + head_r * 0.1, head_r * 0.12, WHITE, a)
        return
    c.circle(x, hy, head_r, skin, a)
    c.rect(x - head_r, hy - head_r * 1.05, head_r * 2, head_r * 0.85, hair, a, r=head_r * 0.6)
    if cap:
        c.rect(x - head_r * 1.05, hy - head_r * 1.15, head_r * 2.1, head_r * 0.7, cap, a, r=head_r * 0.2)
        c.rect(x - head_r * 0.2, hy - head_r * 0.55, head_r * 1.5, head_r * 0.22, cap, a, r=head_r * 0.1)
    c.circle(x - head_r * 0.35, hy + head_r * 0.05, head_r * 0.11, INK, a)
    c.circle(x + head_r * 0.35, hy + head_r * 0.05, head_r * 0.11, INK, a)
    c.arc(x, hy + head_r * 0.25, head_r * 0.35, 20, 160, INK, max(2, head_r * 0.08), a)


def house(c, x, y, w, h, wall=(250, 236, 220), roof=RED, lit=0.0, a=1.0, door=True):
    """(x, y) = bottom-left corner."""
    c.rect(x, y - h, w, h, wall, a)
    c.poly([(x - w * 0.08, y - h), (x + w / 2, y - h - w * 0.42), (x + w * 1.08, y - h)], roof, a)
    win = mix((60, 72, 110), (255, 214, 120), lit)
    for i in range(2):
        c.rect(x + w * (0.14 + 0.46 * i), y - h * 0.82, w * 0.26, h * 0.26, win, a, r=4)
    if door:
        c.rect(x + w * 0.4, y - h * 0.42, w * 0.2, h * 0.42, mix(roof, INK, 0.4), a, r=3)


def camera(c, x, y, s=1.0, a=1.0, cone=0.0, cone_col=WHITE, facing=1):
    """Wall camera; cone = 0..1 opacity of its view cone."""
    if cone:
        c.poly([(x, y), (x + facing * 420 * s, y + 120 * s), (x + facing * 420 * s, y + 340 * s)], cone_col, a * cone * 0.18)
    c.rect(x - 34 * s if facing > 0 else x - 6 * s, y - 16 * s, 40 * s, 30 * s, WHITE, a, r=8 * s, outline=INK, width=3 * s)
    c.circle(x + facing * 6 * s, y - 1 * s, 9 * s, INK, a)
    c.circle(x + facing * 6 * s, y - 1 * s, 4 * s, RED, a)


def phone(c, x, y, s=1.0, a=1.0):
    """(x, y) = top-left. Returns screen box."""
    pw, ph = 230 * s, 430 * s
    c.rect(x, y, pw, ph, INK, a, r=34 * s)
    c.rect(x + 12 * s, y + 40 * s, pw - 24 * s, ph - 70 * s, (232, 240, 247), a, r=10 * s)
    c.rect(x + pw / 2 - 30 * s, y + 16 * s, 60 * s, 10 * s, (70, 70, 80), a, r=5 * s)
    return x + 12 * s, y + 40 * s, pw - 24 * s, ph - 70 * s


def guard_booth(c, x, y, s=1.0, a=1.0, alarm=0.0):
    """(x, y) = bottom-left."""
    bw, bh = 260 * s, 200 * s
    c.rect(x, y - bh, bw, bh, (226, 232, 240), a)
    c.rect(x - 15 * s, y - bh - 30 * s, bw + 30 * s, 34 * s, mix(DARK_RED, RED, alarm), a, r=6 * s)
    c.text(x + bw / 2, y - bh - 13 * s, "GUARD HOUSE", 22 * s, WHITE, a, BODY_B, "mm")
    c.rect(x + 30 * s, y - bh + 40 * s, bw - 60 * s, 80 * s, (150, 190, 220), a, r=6 * s)
    # barrier arm
    c.rect(x + bw, y - 70 * s, 300 * s, 16 * s, WHITE, a, r=6 * s, outline=RED, width=4 * s)
    c.rect(x + bw - 10 * s, y - 90 * s, 20 * s, 90 * s, GREY, a)


def pc_box(c, x, y, s=1.0, a=1.0, t=0.0):
    c.rect(x, y, 110 * s, 70 * s, (52, 56, 66), a, r=10 * s)
    c.circle(x + 92 * s, y + 52 * s, 6 * s, GREEN, a * (0.6 + 0.4 * math.sin(t * 6)))
    c.text(x + 45 * s, y + 35 * s, "AI", 26 * s, WHITE, a, BODY_B, "mm")


_logo = None


def logo_image():
    """The team's logo (black on white) as a cropped black-on-transparent image."""
    global _logo
    if _logo is None:
        from pathlib import Path
        src = Image.open(Path(__file__).parent / "assets" / "logo.jpg").convert("L")
        alpha = src.point(lambda v: 0 if v > 235 else min(255, int((235 - v) * 1.3)))
        alpha = alpha.crop(alpha.getbbox())
        _logo = Image.new("RGBA", alpha.size, INK + (255,))
        _logo.putalpha(alpha)
    return _logo


def paste_logo(c, cx, cy, h, a=1.0):
    """Paste the logo centred on (cx, cy), h pixels tall."""
    lg = logo_image()
    w = int(lg.width * h / lg.height)
    im = lg.resize((int(w * SS), int(h * SS)), Image.LANCZOS)
    if a < 1:
        im.putalpha(im.getchannel("A").point(lambda v: int(v * clamp(a))))
    c.img.paste(im, (int((cx - w / 2) * SS), int((cy - h / 2) * SS)), im)


def s_closing(c, t):
    c.rect(0, 0, W, H, WHITE, 1)
    c.rect(0, H - 24, W, 24, RED, 1)
    p = ease_out(prog(t, 0.2, 0.9))
    if p > 0:
        paste_logo(c, W / 2, lerp(400, 380, p), lerp(410, 450, p), p)
    a2 = ease_out(prog(t, 1.4, 0.8))
    c.text(W / 2, 735, "Safer homes. Connected townships.", 46, DARK_RED, a2, BODY_B, "mm")
    a3 = ease_out(prog(t, 4.0, 0.8))
    c.text(W / 2, 815, "Team 100+ Ping  ·  Universiti Teknologi MARA (UiTM)", 30, INK, a3, BODY_SB, "mm")
    c.text(W / 2, 860, "Azhad Danish · Ammar Haziq · Haziq Fahim · Muhammad Aniqfahmi", 25, GREY, a3, BODY, "mm")


def lock(c, x, y, s=1.0, a=1.0, col=GREEN):
    c.arc(x, y - 18 * s, 26 * s, 180, 360, col, 10 * s, a)
    c.line([(x - 26 * s, y - 18 * s), (x - 26 * s, y)], col, 10 * s, a)
    c.line([(x + 26 * s, y - 18 * s), (x + 26 * s, y)], col, 10 * s, a)
    c.rect(x - 40 * s, y - 4 * s, 80 * s, 62 * s, col, a, r=10 * s)
    c.circle(x, y + 22 * s, 8 * s, WHITE, a)


def label_tag(c, x, y, s, col, a=1.0, size=26):
    tw = c.text_w(s, size)
    c.rect(x - tw / 2 - 14, y - size * 0.75, tw + 28, size * 1.5, col, a, r=10)
    c.text(x, y, s, size, WHITE, a, BODY_B, "mm")


def box_around(c, x, y, w, h, col, a=1.0, width=5):
    c.rect(x, y, w, h, None, a, outline=col, width=width)


def scene_title(c, s, a=1.0, col=RED, y=70):
    c.text(110, y, s.upper(), 96, col, a, DISPLAY)


def stars(c, t, a=1.0):
    pts = [(120, 90), (300, 200), (520, 70), (760, 160), (980, 60), (1220, 180), (1450, 90), (1700, 150), (1820, 60), (640, 260), (1100, 280), (210, 330)]
    for i, (sx, sy) in enumerate(pts):
        tw = 0.55 + 0.45 * math.sin(t * 2.2 + i * 1.7)
        c.circle(sx, sy, 3.5, WHITE, a * tw)


# ---------- scenes ----------
def s_title(c, t, closing=False):
    c.poly([(0, 0), (W * 0.55, 0), (W * 0.38, H), (0, H)], RED, 1.0)
    c.poly([(W * 0.55, 0), (W * 0.58, 0), (W * 0.41, H), (W * 0.38, H)], ORANGE, 1.0)
    # shield with camera eye
    p = pop(prog(t, 0.2, 0.8))
    sx, sy, s = 480, 470, 1.6 * p
    if p > 0:
        c.poly([(sx - 150 * s, sy - 170 * s), (sx + 150 * s, sy - 170 * s), (sx + 150 * s, sy + 10 * s), (sx, sy + 190 * s), (sx - 150 * s, sy + 10 * s)], WHITE, 1)
        c.circle(sx, sy - 20 * s, 70 * s, RED, 1)
        c.circle(sx, sy - 20 * s, 34 * s, INK, 1)
        c.circle(sx + 12 * s, sy - 32 * s, 10 * s, WHITE, 1)
    a1 = ease_out(prog(t, 0.6, 0.8))
    x0 = lerp(1180, 1100, a1)
    c.text(x0, 330, "VISION", 190, RED, a1, DISPLAY)
    c.text(x0, 520, "VAULT", 190, INK, a1, DISPLAY)
    a2 = ease_out(prog(t, 1.4, 0.8))
    if closing:
        c.text(1105, 760, "Safer homes. Connected townships.", 44, DARK_RED, a2, BODY_B)
        a3 = ease_out(prog(t, 4.5, 0.8))
        c.text(1105, 850, "Team 100+ Ping  ·  Universiti Teknologi MARA (UiTM)", 30, INK, a3, BODY_SB)
        c.text(1105, 900, "Azhad Danish · Ammar Haziq · Haziq Fahim · Muhammad Aniqfahmi", 23, GREY, a3, BODY)
    else:
        c.text(1105, 760, "Smart home security that plugs", 44, DARK_RED, a2, BODY_B)
        c.text(1105, 815, "into the township", 44, DARK_RED, a2, BODY_B)
        c.text(1105, 910, "Sime Darby Property University Hackathon 2026  ·  Team 100+ Ping", 26, GREY, a2, BODY_SB)


def night_scene(c, t, fade):
    c.rect(0, 0, W, H, NIGHT, 1)
    c.rect(0, 0, W, H * 0.55, NIGHT2, 0.5)
    stars(c, t, fade)
    c.circle(1650, 170, 70, (250, 240, 200), fade)
    c.circle(1680, 150, 62, NIGHT, fade)
    c.rect(0, 860, W, 220, (30, 42, 58), fade)
    for hx in [80, 1460]:
        house(c, hx, 860, 380, 300, (70, 78, 104), (90, 40, 50), 0.0, fade)
    house(c, 640, 860, 560, 420, (236, 222, 206), RED, 0.0, fade)
    for i in range(3):
        zp = (t * 0.5 + i / 3) % 1
        c.text(760 + zp * 70, 520 - zp * 120, "z", 40 + i * 8, WHITE, fade * (1 - zp) * 0.9, BODY_B)
    c.rect(110, 90, 270, 110, (0, 0, 0), fade * 0.35, r=18)
    c.text(245, 145, "3:00 AM", 56, (255, 214, 120), fade, DISPLAY, "mm")


def q_icon(c, kind, x, y, a):
    """Small icons for the four problem questions, centred on (x, y)."""
    c.circle(x, y, 62, (253, 236, 226), a)
    if kind == "who":
        person(c, x - 8, y + 48, 100, (45, 45, 52), a, hood=True)
        c.circle(x + 34, y - 30, 20, RED, a)
        c.text(x + 34, y - 30, "?", 28, WHITE, a, BODY_B, "mm")
    elif kind == "asleep":
        c.circle(x - 6, y, 34, (250, 214, 120), a)
        c.circle(x + 10, y - 12, 30, (253, 236, 226), a)
        c.text(x + 26, y - 26, "z", 26, NIGHT2, a, BODY_B, "mm")
        c.text(x + 40, y - 46, "z", 20, NIGHT2, a, BODY_B, "mm")
    elif kind == "guard":
        c.rect(x - 40, y - 16, 80, 52, (210, 220, 232), a)
        c.rect(x - 48, y - 30, 96, 18, DARK_RED, a, r=4)
        c.rect(x - 26, y - 4, 52, 22, (150, 190, 220), a, r=3)
        c.circle(x + 36, y - 40, 18, RED, a)
        c.text(x + 36, y - 40, "?", 24, WHITE, a, BODY_B, "mm")
    else:  # help on the way
        c.rect(x - 26, y + 6, 52, 22, GREY, a, r=4)
        c.arc(x, y + 6, 26, 180, 360, RED, 26, a)
        c.circle(x, y - 6, 26, RED, a)
        for ang in (200, 250, 290, 340):
            r0, r1 = 38, 54
            ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            c.line([(x + ca * r0, y - 6 + sa * r0), (x + ca * r1, y - 6 + sa * r1)], ORANGE, 6, a)


def s_problem(c, t):
    # 0..8 s: a night break-in; 8..22 s: the four questions homeowners can't answer
    fade = 1 - prog(t, 7.6, 0.6)
    if fade > 0:
        night_scene(c, t, fade)
        c.rect(1250, 700, 24, 160, GREY, fade)
        c.rect(1380, 700, 24, 160, GREY, fade)
        gate = prog(t, 4.0, 0.6)
        for gx in range(1280, 1380, 18):
            c.rect(gx, 710 + gate * 30 * (1 if gx % 36 else -1), 8, 140, (150, 150, 160), fade * (1 - gate * 0.6))
        if 0 < gate < 1:
            c.text(1328, 670, "SNIP!", 34, ORANGE, fade, DISPLAY, "mm")
        walk = ease_in_out(prog(t, 2.6, 4.0))
        bob = math.sin(t * 9) * 4 if 0 < walk < 1 else 0
        inside = prog(t, 6.6, 0.6)
        person(c, lerp(1900, 1080, walk), 860 + bob, 230, (45, 45, 52), fade * (1 - inside), hood=True)
    if t < 7.6:
        return
    c.rect(0, 0, W, H, CREAM, ease_out(prog(t, 7.6, 0.6)))
    scene_title(c, "the problem", ease_out(prog(t, 8.0, 0.6)))
    c.text(110, 205, "Critical questions homeowners can't answer:", 36, DARK_RED, ease_out(prog(t, 8.2, 0.6)), BODY_B)
    qs = [
        (8.4, "who", "Who just came into my home: a resident, a visitor or a stranger?"),
        (12.4, "asleep", "Would I even know if it happened while I'm asleep or away?"),
        (15.9, "guard", "Does the guard house know which house needs help?"),
        (19.2, "help", "Is help actually on the way?"),
    ]
    for i, (st, kind, q) in enumerate(qs):
        p = ease_out(prog(t, st, 0.6))
        if p <= 0:
            continue
        x = 110 + (i % 2) * 870
        y = 290 + (i // 2) * 300 + (1 - p) * 40
        c.rect(x, y, 830, 260, WHITE, p, r=28)
        c.text(x + 40, y + 40, f"{i + 1}.", 60, RED, p, DISPLAY)
        q_icon(c, kind, x + 700, y + 130, p)
        c.wrap(x + 40, y + 120, q, 34, INK, 560, p, BODY_SB, 1.2)


def s_stats(c, t):
    c.rect(0, 0, W, H, CREAM, 1)
    scene_title(c, "break-ins in malaysia", ease_out(prog(t, 0, 0.6)))
    stats = [
        (0.3, 47188, "{:,}", "property crime cases in Malaysia in 2024", "up 12.4%  ·  DOSM", RED),
        (5.5, 77.6, "{:.1f}%", "of house break-ins happen at night", "DOSM", DARK_RED),
        (9.5, 2415, "{:,}", "house break-ins in Selangor in one year", "losses of almost RM22 million  ·  Sinar Harian", ORANGE),
    ]
    shift = ease_in_out(prog(t, 14.6, 0.8))
    for i, (st, val, fmt, cap, src, col) in enumerate(stats):
        p = ease_out(prog(t, st, 0.7))
        if p <= 0:
            continue
        cx = 120 + i * 580
        y0 = lerp(320, 260, p) - shift * 30
        h = lerp(440, 330, shift)
        c.rect(cx, y0, 520, h, WHITE, p, r=28)
        c.rect(cx, y0, 520, 14, col, p, r=6)
        n = val * ease_out(prog(t, st, 1.6))
        c.text(cx + 260, y0 + lerp(140, 100, shift), fmt.format(n if "%" in fmt else int(n)), lerp(120, 96, shift), col, p, DISPLAY, "mm")
        yy = c.wrap(cx + 260, y0 + lerp(250, 175, shift), cap, lerp(34, 28, shift), INK, 440, p, BODY_SB, anchor="ma")
        c.wrap(cx + 260, yy + 10, src, 22, GREY, 460, p, BODY, anchor="ma")
    # news card: a recent high-profile case
    np_ = ease_out(prog(t, 14.8, 0.7))
    if np_ > 0:
        y = lerp(760, 650, np_)
        c.rect(120, y, 1680, 230, WHITE, np_, r=28)
        c.rect(120, y, 20, 230, RED, np_, r=8)
        c.text(180, y + 40, "NEWS  ·  KUALA LUMPUR, 2025", 24, RED, np_, BODY_B)
        c.wrap(180, y + 82, "Home in Bukit Ledang broken into: the rear gate was cut, a bedroom ransacked, losses of about RM1.8 million.", 34, INK, 1560, np_, BODY_SB, 1.2)
        c.text(180, y + 190, "New Straits Times, 2025", 22, GREY, np_, BODY)


def s_features(c, t):
    c.rect(0, 0, W, H, CREAM, 1)
    scene_title(c, "the solution", ease_out(prog(t, 0, 0.6)))
    c.wrap(110, 200, "An AI home security system connected to the township guard house.", 36, DARK_RED, 1700,
           ease_out(prog(t, 0.4, 0.6)), BODY_B)

    def ic_face(x, y, a):
        c.circle(x, y, 44, SKIN, a)
        c.circle(x - 15, y - 6, 5, INK, a)
        c.circle(x + 15, y - 6, 5, INK, a)
        c.arc(x, y + 8, 16, 20, 160, INK, 4, a)
        for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            c.line([(x + sx * 62, y + sy * 40), (x + sx * 62, y + sy * 62), (x + sx * 40, y + sy * 62)], GREEN, 7, a)

    def ic_alert(x, y, a):
        c.rect(x - 34, y - 58, 68, 116, INK, a, r=12)
        c.rect(x - 26, y - 44, 52, 84, (232, 240, 247), a, r=4)
        c.rect(x - 20, y - 36, 40, 26, (60, 60, 70), a, r=3)
        c.circle(x + 30, y - 54, 16, RED, a)
        c.text(x + 30, y - 54, "!", 20, WHITE, a, BODY_B, "mm")

    def ic_guard(x, y, a):
        c.rect(x - 52, y - 24, 104, 70, (210, 220, 232), a)
        c.rect(x - 62, y - 44, 124, 24, DARK_RED, a, r=5)
        c.rect(x - 34, y - 6, 68, 30, (150, 190, 220), a, r=4)
        c.circle(x + 52, y - 56, 18, RED, a * (0.6 + 0.4 * math.sin(t * 8)))

    def ic_check(x, y, a):
        c.circle(x, y, 52, GREEN, a)
        c.line([(x - 24, y + 2), (x - 6, y + 20), (x + 26, y - 18)], WHITE, 12, a)

    feats = [
        (4.5, "Face recognition", "Knows your family, and lets visitors in at their allowed times.", ic_face),
        (9.0, "Instant alerts", "A photo the moment a stranger is detected, even when you're away.", ic_alert),
        (13.0, "Guard house link", "Tells the guards exactly which house needs help.", ic_guard),
        (17.0, "Help confirmation", "Shows you when the guards are on their way.", ic_check),
    ]
    for i, (st, title, body, icon) in enumerate(feats):
        p = pop(prog(t, st, 0.6))
        if p <= 0:
            continue
        x = 110 + i * 430
        a = clamp(p)
        c.rect(x, 300, 400, 470, WHITE, a, r=28)
        c.text(x + 30, 330, f"{i + 1}", 40, ORANGE, a, DISPLAY)
        icon(x + 200, 440, a)
        c.wrap(x + 200, 545, title, 34, RED, 360, a, BODY_B, 1.1, "ma")
        c.wrap(x + 200, 605, body, 26, INK, 340, a, BODY, 1.25, "ma")
    ep = ease_out(prog(t, 20.5, 0.6))
    if ep > 0:
        c.text(110, 820, "PLUS", 26, ORANGE, ep, BODY_B)
        for i, s in enumerate(["Security On / Off, with a timer", "Viva Bot: \"What happened today?\""]):
            x = 200 + i * 640
            c.rect(x, 805, 600, 64, WHITE, ep, r=32, outline=ORANGE, width=3)
            c.text(x + 300, 837, s, 28, INK, ep, BODY_SB, "mm")


def s_whywin(c, t):
    c.rect(0, 0, W, H, CREAM, 1)
    scene_title(c, "why our team should win", ease_out(prog(t, 0, 0.6)))
    c.wrap(110, 200, "Vision Vault bridges home security and township security.", 38, DARK_RED, 1700,
           ease_out(prog(t, 0.6, 0.6)), BODY_B)

    def ic_laptop(x, y, a):
        c.rect(x - 90, y - 60, 180, 110, INK, a, r=10)
        c.rect(x - 78, y - 48, 156, 86, (232, 240, 247), a, r=4)
        c.rect(x - 110, y + 50, 220, 16, (90, 90, 100), a, r=6)
        c.circle(x, y - 5, 30, GREEN, a)
        c.line([(x - 14, y - 4), (x - 4, y + 7), (x + 15, y - 14)], WHITE, 7, a)

    def ic_lock(x, y, a):
        lock(c, x, y - 20, 1.1, a)

    def ic_scale(x, y, a):
        n = 1 + int(4 * ease_out(prog(t, 15.8, 2.5)))
        for k in range(n):
            house(c, x - 120 + k * 62, y + 50, 50, 46, (250, 236, 220), RED, 0.0, a)

    pillars = [
        (5.0, "Working prototype", "Runs end to end today, built on low-cost, open-source tools.", ic_laptop),
        (10.5, "Privacy-first", "Faces and live video never leave the home.", ic_lock),
        (15.5, "Ready to scale", "From a single home to an entire township.", ic_scale),
    ]
    for i, (st, title, body, icon) in enumerate(pillars):
        p = ease_out(prog(t, st, 0.7))
        if p <= 0:
            continue
        x = 110 + i * 580
        y = lerp(340, 290, p)
        c.rect(x, y, 540, 520, WHITE, p, r=28)
        c.rect(x, y, 540, 14, RED, p, r=6)
        icon(x + 270, y + 150, p)
        c.text(x + 270, y + 290, title.upper(), 54, RED, p, DISPLAY, "mm")
        c.wrap(x + 270, y + 350, body, 30, INK, 460, p, BODY, 1.25, "ma")
    tp = ease_out(prog(t, 21.0, 0.6))
    if tp > 0:
        c.rect(110, 860, 1700, 76, DARK_RED, tp, r=20)
        c.text(W / 2, 898, "A safer, smarter and more connected Township of Tomorrow", 34, WHITE, tp, BODY_SB, "mm")


def s_intro_placeholder(c, t):
    c.rect(0, 0, W, H, (20, 20, 24), 1)
    c.text(W / 2, H / 2 - 30, "[ REAL BREAK-IN FOOTAGE GOES HERE ]", 76, WHITE, 1, DISPLAY, "mm")
    c.text(W / 2, H / 2 + 60, "save it as demo_video/clips/intro_breakin.mp4", 32, LIGHT, 1, BODY, "mm")


def card_user(c, x, y, w, h, title, need, gets, a, illo):
    c.rect(x, y, w, h, WHITE, a, r=30)
    c.rect(x, y, w, 230, (253, 236, 226), a, r=30)
    c.rect(x, y + 200, w, 30, (253, 236, 226), a)
    illo(x + w / 2, y + 215, a)
    c.wrap(x + w / 2, y + 260, title, 38, RED, w - 60, a, BODY_B, 1.15, "ma")
    yy = c.wrap(x + 40, y + 370, need, 27, INK, w - 80, a, BODY)
    c.text(x + 40, yy + 18, "GETS", 24, ORANGE, a, BODY_B)
    c.wrap(x + 40, yy + 52, gets, 27, INK, w - 80, a, BODY_SB)


def s_users(c, t):
    c.rect(0, 0, W, H, CREAM, 1)
    scene_title(c, "target users", ease_out(prog(t, 0, 0.6)))

    def fam(x, y, a):
        person(c, x - 90, y, 170, (60, 110, 190), a)
        person(c, x + 10, y, 160, (220, 90, 120), a, hair=(40, 25, 20))
        person(c, x + 95, y, 100, ORANGE, a)

    def guard(x, y, a):
        person(c, x, y, 180, (40, 70, 120), a, cap=(30, 50, 90))
        c.rect(x + 60, y - 120, 70, 50, WHITE, a, r=8, outline=INK, width=3)
        c.text(x + 95, y - 95, "!", 30, RED, a, BODY_B, "mm")

    def dev(x, y, a):
        for i, (bx, bh) in enumerate([(-130, 120), (-50, 180), (40, 150), (120, 100)]):
            c.rect(x + bx, y - bh, 70, bh, mix(RED, CREAM, i * 0.2), a, r=4)
            for wy in range(int(y - bh + 18), int(y - 14), 30):
                c.rect(x + bx + 14, wy, 16, 14, WHITE, a * 0.8)
                c.rect(x + bx + 40, wy, 16, 14, WHITE, a * 0.8)

    cards = [
        (2.5, "Homeowners & families", "Asleep or away, they can't tell who comes in, and motion alarms go off for nothing.", "A photo alert only when a real stranger is inside.", fam),
        (9.0, "Township guard house", "Guards watch the gate, not each home.", "The exact house and time, and one tap to confirm help is on the way.", guard),
        (14.5, "Sime Darby Property", "Needs security that builds resident trust and scales across townships.", "A low-cost system that works with the existing guard house.", dev),
    ]
    for i, (st, title, need, gets, illo) in enumerate(cards):
        p = ease_out(prog(t, st, 0.7))
        if p <= 0:
            continue
        card_user(c, 110 + i * 580, lerp(330, 250, p), 540, 620, title, need, gets, p, illo)


def s_how(c, t):
    c.rect(0, 0, W, H, CREAM, 1)
    scene_title(c, "how it works", ease_out(prog(t, 0, 0.6)))
    # the four steps from the deck, lit up as the story reaches them
    steps = [(4.6, "Detect & track"), (6.4, "Recognise"), (10.6, "Decide"), (15.4, "Alert & respond")]
    for i, (st, name) in enumerate(steps):
        on = ease_out(prog(t, st, 0.4))
        x = 110 + i * 290
        col = mix(LIGHT, RED, on)
        c.rect(x, 195, 270, 60, col, 1, r=30)
        c.text(x + 135, 225, f"{i + 1}  {name}", 26, mix(GREY, WHITE, on), 1, BODY_B, "mm")
    # house cross-section (left)
    a = ease_out(prog(t, 0.3, 0.7))
    hx, hy, hw, hh = 110, 930, 980, 520
    c.poly([(hx - 40, hy - hh), (hx + hw / 2, hy - hh - 120), (hx + hw + 40, hy - hh)], RED, a)
    c.rect(hx, hy - hh, hw, hh, (250, 240, 228), a)
    c.rect(hx, hy - 20, hw, 20, (200, 170, 140), a)
    c.rect(hx + hw - 20, hy - 300, 20, 280, DARK_RED, a)  # front door
    c.text(hx + hw - 10, hy - 320, "DOOR", 20, DARK_RED, a, BODY_B, "mm")
    cam_on = ease_out(prog(t, 1.2, 0.6))
    camera(c, hx + 70, hy - hh + 70, 1.15, cam_on, cone=cam_on, cone_col=ORANGE, facing=1)
    pc_box(c, hx + 40, hy - 120, 1.0, ease_out(prog(t, 2.0, 0.6)), t)
    if prog(t, 2.0, 0.6) > 0:
        c.line([(hx + 70, hy - hh + 90), (hx + 70, hy - 120)], GREY, 4, ease_out(prog(t, 2.0, 0.6)) * 0.7)
    # people walking in through the door
    def walker(start, col, label, tag_col, stop_x, extra=None):
        wp = ease_in_out(prog(t, start, 2.2))
        if wp <= 0:
            return None
        leave = prog(t, start + 4.6, 0.5) if extra is None else 0
        px = lerp(hx + hw + 60, stop_x, wp)
        alpha = a * (1 - leave)
        if alpha <= 0:
            return None
        person(c, px, hy - 20, 260, col, alpha, hood=extra is not None)
        bx, by = px - 90, hy - 300
        box_around(c, bx, by, 180, 285, tag_col, alpha * prog(t, start + 1.6, 0.3), 6)
        if prog(t, start + 1.8, 0.3) > 0:
            label_tag(c, px, by - 28, label, tag_col, alpha * prog(t, start + 1.8, 0.3))
        return px

    walker(4.6, (60, 110, 190), "Azhad · resident", GREEN, 620)
    walker(7.6, (150, 90, 170), "Visitor · 2–6 pm", CYAN, 820)
    sx = walker(10.8, (45, 45, 52), "UNKNOWN", RED, 640, extra=True)
    if sx:
        ring = prog(t, 12.6, 2.6)
        if 0 < ring < 1:
            c.circle(sx + 150, hy - 330, 46, WHITE, a)
            c.arc(sx + 150, hy - 330, 40, -90, -90 + 360 * ring, RED, 10, a)
        if ring >= 1:
            c.text(sx + 150, hy - 330, "!", 70, RED, a * (0.6 + 0.4 * math.sin(t * 10)), BODY_B, "mm")
    # signals out to phone and guard house (right)
    sig = prog(t, 15.4, 1.0)
    if sig > 0:
        for k, ty in enumerate([260, 640]):
            for j in range(5):
                d = (sig * 1.2 + j * 0.2 - 0.2)
                if 0 < d < 1:
                    c.circle(lerp(hx + hw + 10, 1340, d), lerp(hy - 360, ty + 60, d), 10, RED, 0.9)
        pa = ease_out(prog(t, 16.0, 0.6))
        sxs = phone(c, 1375, 130, 0.85, pa)
        c.rect(sxs[0] + 12, sxs[1] + 20, sxs[2] - 24, 150, WHITE, pa, r=12)
        c.rect(sxs[0] + 22, sxs[1] + 30, sxs[2] - 44, 90, (60, 60, 70), pa, r=6)
        person(c, sxs[0] + sxs[2] / 2, sxs[1] + 118, 80, (45, 45, 52), pa, hood=True)
        c.text(sxs[0] + 24, sxs[1] + 145, "Unknown person inside", 13, RED, pa, BODY_B)
        c.text(1470, 530, "Homeowner", 30, INK, pa, BODY_B, "mm")
        c.text(1470, 566, "photo alert", 24, GREY, pa, BODY, "mm")
        ga = ease_out(prog(t, 17.6, 0.6))
        c.rect(1600, 610, 270, 150, WHITE, ga, r=16, outline=RED, width=4)
        c.text(1620, 640, "INTRUSION ALERT", 22, RED, ga, BODY_B)
        c.text(1620, 680, "No. 12, Jalan Elmina 3/1", 19, INK, ga, BODY_SB)
        c.text(1620, 710, "03:02 AM", 19, GREY, ga, BODY)
        guard_booth(c, 1330, 880, 0.85, ga, alarm=(math.sin(t * 8) > 0) * ga)
        c.text(1470, 915, "Guard house: text alert", 24, GREY, ga, BODY, "mm")
    lk = pop(prog(t, 21.0, 0.6))
    if lk > 0:
        c.rect(320, 440, 580, 110, WHITE, 1, r=24, outline=GREEN, width=3)
        lock(c, 390, 485, 0.75 * lk, 1)
        c.text(450, 495, "Video & faces stay home", 36, GREEN, clamp(lk), BODY_B, "lm")
    ip = ease_out(prog(t, 24.3, 0.6))
    if ip > 0:
        c.rect(0, 0, W, H, RED, ip * 0.92)
        c.text(W / 2, H / 2, "LET'S SEE IT IN ACTION", 120, WHITE, ip, DISPLAY, "mm")


def s_demo_placeholder(c, t):
    c.rect(0, 0, W, H, (40, 40, 48), 1)
    c.text(W / 2, H / 2 - 40, "[ LIVE DEMO CLIPS GO HERE ]", 80, WHITE, 1, DISPLAY, "mm")
    c.text(W / 2, H / 2 + 60, "about 2 minutes 20 seconds of screen and camera recordings", 34, LIGHT, 1, BODY, "mm")


# Real footage. Times are seconds in the source file; cues are seconds from the segment start.
# shown at phone size (the whole vertical news video) over a blurred copy of itself
INTRO = {"src": "clips/intro_breakin.mp4", "start": 0.0, "end": 12.0,
         "credit": "Footage: Berita RTM, Muar (July 2026)"}

# (source, start, end, on-screen label, narration cues[, ffmpeg filters run first, e.g. a crop])
DEMO = [
    ("clips/Clip2.mp4", 0.0, 7.0, "Homeowner dashboard", [
        (0.3, 6.8, "This is the homeowner's dashboard: today's alerts, and any the guard house hasn't answered yet."),
    ]),
    ("clips/Clip2.mp4", 35.0, 47.0, "Residents & visitors", [
        (0.3, 6.0, "Family and visitors are registered here. Visitors are only allowed inside their time window."),
        (6.0, 11.8, "For this demo, two people have recognition switched off, so the camera treats them as strangers."),
    ]),
    ("clips/Clip2.mp4", 95.0, 107.0, "Live camera: a resident", [
        (0.3, 6.0, "Raju lives here. The camera recognises his face."),
        (6.0, 11.8, "Green box, his name, and no alert."),
    ]),
    # the page switches to the kitchen test video at 1:24, so the shot ends just before it
    ("clips/Clip2.mp4", 55.0, 83.5, "Cameras: intruder and resident", [
        (0.3, 6.5, "Now a stranger walks in while Raju is home. Raju stays green, the stranger gets a red box."),
        (6.5, 13.8, "If they stay unrecognised for a few seconds, an intruder alert goes out with a photo and a short clip."),
        (14.5, 21.0, "Every camera in the house is watched at the same time,"),
        (21.0, 28.2, "so the system knows which rooms the intruder has been in, and where the family is."),
    ], "crop=1050:200:195:290,scale=1920:-2,pad=1920:1080:0:(oh-ih)/2:color=0x16161C"),  # the three camera tiles, enlarged
    ("clips/Clip2.mp4", 171.5, 179.5, "Guard House view", [
        (0.2, 7.8, "At the same moment, the guard house sees exactly which house needs help, and confirms with one tap."),
    ]),
    ("clips/Clip1.mp4", 72.0, 83.0, "Incident evidence", [
        (0.3, 10.8, "The homeowner gets the photo on Telegram, and every incident is saved on the dashboard with its clip."),
    ]),
    ("clips/Clip1.mp4", 46.0, 57.0, "Security On / Off", [
        (0.3, 10.8, "Having guests over? Turn security off with a timer, and it switches back on by itself."),
    ]),
    ("clips/Clip3.mp4", 3.0, 19.0, "House map", [
        (0.3, 7.5, "With a camera in each room, the house map shows which room the intruder is in,"),
        (7.5, 15.8, "and suggests a safe way out for each family member."),
    ]),
    ("clips/Clip1.mp4", 15.6, 19.6, "Viva Bot", [
        (0.2, 3.9, "And Viva Bot answers questions about your home:"),
    ]),
    ("clips/Clip1.mp4", 21.0, 31.0, "Viva Bot", [
        (0.2, 9.8, "what happened at the door today, or who is at the door right now."),
    ]),
]


def demo_cues():
    cues, t0 = [], 0.0
    for _, a, b, _, seg, *_ in DEMO:
        cues += [(t0 + s, t0 + e, text) for s, e, text in seg]
        t0 += b - a
    return t0, cues


DEMO_LEN, DEMO_CUES = demo_cues()

# name: (draw, seconds, narration cues [(start, end, text)]); draw None = built from real footage
SCENES = {
    "intro": (None, INTRO["end"] - INTRO["start"], [
        (0.5, 5.5, "This break-in in Muar, Johor, was caught on CCTV in July."),
        (5.5, 11.5, "But by the time anyone watches the footage, it's already too late."),
    ]),
    "problem": (s_problem, 22.0, [
        (0.3, 3.0, "Now imagine it's your home, at 3 a.m."),
        (3.0, 7.6, "Your family is asleep, and someone cuts through the back gate."),
        (8.4, 12.4, "Who just came in: a resident, a visitor, or a stranger?"),
        (12.4, 15.9, "Would you even know, while you're asleep or away?"),
        (15.9, 19.2, "Does the guard house know which house needs help?"),
        (19.2, 21.8, "And is help actually on the way?"),
    ]),
    "stats": (s_stats, 22.0, [
        (0.3, 5.5, "In 2024, Malaysia recorded 47,188 property crime cases, up 12.4 percent."),
        (5.5, 9.5, "77.6 percent of house break-ins happen at night."),
        (9.5, 14.6, "In Selangor alone, 2,415 homes were broken into in one year, with losses of almost 22 million ringgit."),
        (14.6, 21.8, "And in 2025, a home in Bukit Ledang lost about 1.8 million ringgit after its rear gate was cut."),
    ]),
    "users": (s_users, 22.0, [
        (0.3, 2.8, "Vision Vault is built for three groups."),
        (2.8, 9.0, "Families who are asleep or away, and tired of motion alarms that go off for nothing."),
        (9.0, 14.5, "The township guard house, who need to know exactly which home needs help."),
        (14.5, 21.7, "And Sime Darby Property, who want security that builds trust and scales across townships."),
    ]),
    "solution": (s_features, 25.0, [
        (0.3, 4.5, "Vision Vault is an AI home security system, connected to the township guard house."),
        (4.5, 9.0, "Face recognition: it knows your family, and lets visitors in at their allowed times."),
        (9.0, 13.0, "Instant alerts: a photo the moment a stranger is detected, even when you're away."),
        (13.0, 17.0, "Guard house link: the guards know exactly which house needs help."),
        (17.0, 20.5, "Help confirmation: you see when the guards are on their way."),
        (20.5, 24.7, "Plus a security on and off timer, and Viva Bot to tell you what happened today."),
    ]),
    "how": (s_how, 27.0, [
        (0.3, 4.6, "Here's how it works. Cameras inside the home connect to one small PC running the AI."),
        (4.6, 10.6, "It tracks each person and checks their face: a resident, or a visitor inside their allowed time."),
        (10.6, 15.4, "If someone isn't recognised within a few seconds, it's treated as an intruder."),
        (15.4, 21.0, "The homeowner gets a photo on Telegram, and the guard house gets the address and time."),
        (21.0, 24.2, "Video and faces stay on the home's PC."),
        (24.2, 26.8, "Let's see it in action."),
    ]),
    "demo": (None, DEMO_LEN, DEMO_CUES),
    "whywin": (s_whywin, 25.0, [
        (0.3, 5.0, "So why should our team win? Vision Vault bridges home security and township security."),
        (5.0, 10.5, "It's a working prototype, running end to end today, built on low-cost, open-source tools."),
        (10.5, 15.5, "It's privacy-first: faces and live video never leave the home."),
        (15.5, 21.0, "And it's ready to scale, from a single home to an entire township."),
        (21.0, 24.8, "A safer, smarter and more connected Township of Tomorrow."),
    ]),
    "closing": (s_closing, 9.0, [
        (0.5, 4.0, "Vision Vault. Safer homes, connected townships."),
        (4.0, 8.8, "Thank you, from team 100+ Ping, Universiti Teknologi MARA."),
    ]),
}

ORDER = ["intro", "problem", "stats", "users", "solution", "how", "demo", "whywin", "closing"]
BG = {"closing": CREAM}
