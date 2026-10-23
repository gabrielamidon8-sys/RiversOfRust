#!/usr/bin/env python3
"""Draws the RiversOfRust launcher icon (a rusted wheel, like the ones in the garage) for Android: the adaptive icon's
background, foreground and themed (monochrome) layers, plus the classic square icons for older phones.
Run: python3 tools/make_icons.py   (writes android/res/mipmap-*)"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'res')
SS = 4  # supersampling

def background(S):
    im = Image.new('RGB', (S, S), (13, 14, 15)); d = ImageDraw.Draw(im)
    for r in range(S, 0, -2):
        k = r / S; c = (int(13 + (58 - 13) * (1 - k) ** 1.6), int(14 + (34 - 14) * (1 - k) ** 1.6), int(15 + (20 - 15) * (1 - k) ** 1.6))
        d.ellipse([S / 2 - r * 0.75, S * 0.42 - r * 0.75, S / 2 + r * 0.75, S * 0.42 + r * 0.75], fill=c)
    rnd = random.Random(7)
    for _ in range(int(S * S / 900)):   # rust speckle
        x, y, s = rnd.random() * S, rnd.random() * S, rnd.random() * S / 160 + 1
        a = rnd.random()
        d.ellipse([x, y, x + s, y + s], fill=(int(60 + 80 * a), int(30 + 30 * a), 18))
    # hazard tape along the bottom edge
    h = S * 0.075; y0 = S - h * 1.6
    for i in range(-2, 14):
        x = i * S / 10
        d.polygon([(x, y0 + h), (x + S / 20, y0 + h), (x + S / 20 + h, y0), (x + h, y0)], fill=(196, 86, 30))
    return im.filter(ImageFilter.GaussianBlur(S / 600))

def wheel(S, mono=False):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx = cy = S / 2
    R = S * 0.30; T = S * 0.085   # tyre outer radius and thickness (inside the adaptive icon's safe circle)
    tyre, lugc, rim, rimd, hub, bolt = ((255,) * 4,) * 6 if mono else ((30, 32, 34, 255), (44, 46, 49, 255), (196, 86, 30, 255), (110, 42, 14, 255), (217, 201, 164, 255), (120, 112, 98, 255))
    n = 18
    for i in range(n):   # chunky lugs standing out of the tread
        a = i / n * math.tau
        pts = []
        for da, rr in ((-0.075, R - T * 0.2), (0.075, R - T * 0.2), (0.06, R + S * 0.028), (-0.06, R + S * 0.028)):
            pts.append((cx + math.cos(a + da) * rr, cy + math.sin(a + da) * rr))
        d.polygon(pts, fill=lugc)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=tyre)
    if not mono:
        d.ellipse([cx - R + T * 0.15, cy - R + T * 0.15, cx + R - T * 0.15, cy + R - T * 0.15], outline=(52, 55, 58, 255), width=max(1, int(S / 180)))
    r2 = R - T
    if mono:   # the themed icon: a ring with the spokes cut out
        d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(0, 0, 0, 0))
        d.ellipse([cx - r2 * 0.86, cy - r2 * 0.86, cx + r2 * 0.86, cy + r2 * 0.86], fill=tyre)
    else:
        d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=rim)
        d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=(232, 120, 60, 255), width=max(1, int(S / 120)))
    # six spoke holes in the rim
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 6
        pts = []
        for da, rr in ((-0.33, r2 * 0.36), (0.33, r2 * 0.36), (0.23, r2 * 0.8), (-0.23, r2 * 0.8)):
            pts.append((cx + math.cos(a + da) * rr, cy + math.sin(a + da) * rr))
        d.polygon(pts, fill=(0, 0, 0, 0) if mono else rimd)
    # beadlock bolts around the rim's edge
    for i in range(12):
        a = i / 12 * math.tau; br = S * 0.011
        x, y = cx + math.cos(a) * r2 * 0.92, cy + math.sin(a) * r2 * 0.92
        d.ellipse([x - br, y - br, x + br, y + br], fill=(0, 0, 0, 0) if mono else bolt)
    hr = r2 * 0.3
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=hub)
    for i in range(5):
        a = i / 5 * math.tau - math.pi / 2; br = S * 0.012
        x, y = cx + math.cos(a) * hr * 0.58, cy + math.sin(a) * hr * 0.58
        d.ellipse([x - br, y - br, x + br, y + br], fill=(0, 0, 0, 0) if mono else bolt)
    return im

def down(im, s): return im.resize((s, s), Image.LANCZOS)

def main():
    big = 432 * SS
    bg, fg, mono = background(big), wheel(big), wheel(big, mono=True)
    out = os.path.join(ROOT, 'mipmap-xxxhdpi'); os.makedirs(out, exist_ok=True)
    down(bg, 432).save(os.path.join(out, 'ic_launcher_background.png'))
    down(fg, 432).save(os.path.join(out, 'ic_launcher_foreground.png'))
    down(mono, 432).save(os.path.join(out, 'ic_launcher_mono.png'))
    # the classic icon: both layers, a little bigger, on a rounded square
    full = bg.convert('RGBA'); z = int(big * 1.22); f2 = fg.resize((z, z), Image.LANCZOS); o = (big - z) // 2
    full.alpha_composite(f2.crop((-o, -o, -o + big, -o + big)) if o < 0 else f2, (max(o, 0), max(o, 0)))
    mask = Image.new('L', (big, big), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.2, fill=255)
    full.putalpha(mask)
    for name, s in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        dd = os.path.join(ROOT, 'mipmap-' + name); os.makedirs(dd, exist_ok=True)
        down(full, s).save(os.path.join(dd, 'ic_launcher.png'))
    anyd = os.path.join(ROOT, 'mipmap-anydpi-v26'); os.makedirs(anyd, exist_ok=True)
    open(os.path.join(anyd, 'ic_launcher.xml'), 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background" />\n    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_mono" />\n</adaptive-icon>\n')
    down(full, 512).save(os.path.join(ROOT, '..', 'icon-512.png'))
    print('icons written')

if __name__ == '__main__':
    main()
