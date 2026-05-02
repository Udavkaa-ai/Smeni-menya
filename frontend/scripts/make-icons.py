#!/usr/bin/env python3
"""Generate app icons for Smeni-menya PWA.

Soft gradient (lavender -> coral pink) rounded square with a calendar +
heart glyph. Outputs iOS apple-touch (180), PWA (192, 512) and a maskable
512 with extra safe-area padding.
"""
from PIL import Image, ImageDraw, ImageFilter
import os
import math

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')

# Brand gradient — lavender to soft coral
TOP    = (177, 156, 233)   # lavender
BOTTOM = (255, 138, 168)   # warm pink

WHITE = (255, 255, 255, 255)
SOFT_WHITE = (255, 255, 255, 235)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, top, bottom):
    img = Image.new('RGB', (size, size), top)
    for y in range(size):
        t = y / (size - 1)
        # ease-in-out
        t = t * t * (3 - 2 * t)
        Image.new('RGB', (size, 1), lerp(top, bottom, t)).paste
        img.paste(lerp(top, bottom, t), (0, y, size, y + 1))
    return img


def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_glyph(canvas, size, glyph_scale=0.56):
    """Draw a calendar with a heart-shaped clip in the center."""
    cx, cy = size / 2, size / 2 + size * 0.02
    g = size * glyph_scale
    # calendar body
    body_w = g
    body_h = g * 0.9
    x0, y0 = cx - body_w / 2, cy - body_h / 2 + g * 0.04
    x1, y1 = cx + body_w / 2, cy + body_h / 2 + g * 0.04
    r = g * 0.14

    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # Soft shadow under calendar
    sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle((x0, y0 + g * 0.06, x1, y1 + g * 0.06), radius=r,
                         fill=(80, 30, 80, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(g * 0.06))
    canvas.alpha_composite(sh)

    # White calendar
    d.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=WHITE)

    # Top header bar (slightly translucent pink)
    head_h = g * 0.22
    head_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(head_layer)
    hd.rounded_rectangle((x0, y0, x1, y0 + head_h), radius=r,
                         fill=(255, 138, 168, 255))
    # Mask the bottom of header to keep only top corners rounded
    bottom_cut = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bottom_cut)
    bd.rectangle((x0, y0 + head_h - r, x1, y0 + head_h), fill=(255, 138, 168, 255))
    head_layer.alpha_composite(bottom_cut)
    layer.alpha_composite(head_layer)

    # Two "rings" on top (binder rings)
    ring_r = g * 0.045
    ring_y = y0 - g * 0.04
    for fx in (0.32, 0.68):
        rx = x0 + body_w * fx
        d2 = ImageDraw.Draw(layer)
        d2.rounded_rectangle((rx - ring_r, ring_y, rx + ring_r, ring_y + g * 0.16),
                             radius=ring_r, fill=(120, 90, 170, 255))

    # Heart in the lower part of calendar
    heart_size = g * 0.46
    hx, hy = cx, y0 + head_h + (y1 - (y0 + head_h)) / 2 + g * 0.02
    draw_heart(layer, hx, hy, heart_size, fill=(255, 99, 145, 255))

    canvas.alpha_composite(layer)


def draw_heart(layer, cx, cy, size, fill):
    """Draw a heart centered at (cx, cy) with given size (width)."""
    d = ImageDraw.Draw(layer)
    r = size / 4
    # Two circles + a triangle
    # left circle
    d.ellipse((cx - size / 2, cy - size / 3, cx - size / 2 + size / 2,
               cy - size / 3 + size / 2), fill=fill)
    # right circle
    d.ellipse((cx, cy - size / 3, cx + size / 2,
               cy - size / 3 + size / 2), fill=fill)
    # bottom triangle
    d.polygon([
        (cx - size / 2, cy + size * 0.02),
        (cx + size / 2, cy + size * 0.02),
        (cx, cy + size * 0.55),
    ], fill=fill)


def add_sparkles(canvas, size):
    """Add subtle white sparkle dots in background."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    sparkles = [
        (0.18, 0.22, 0.025, 90),
        (0.82, 0.18, 0.018, 70),
        (0.12, 0.78, 0.020, 70),
        (0.86, 0.82, 0.028, 100),
        (0.78, 0.42, 0.014, 60),
    ]
    for fx, fy, fr, alpha in sparkles:
        cx, cy = size * fx, size * fy
        rr = size * fr
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr),
                  fill=(255, 255, 255, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(size * 0.004))
    canvas.alpha_composite(layer)


def make_icon(size, radius_ratio=0.22, padding_ratio=0.0, save_as=None):
    # Render at 2x for smoother edges, then downscale
    scale = 2
    s = size * scale
    pad = int(s * padding_ratio)
    inner = s - 2 * pad

    bg = gradient(s, TOP, BOTTOM).convert('RGBA')

    if pad > 0:
        # Maskable: full bleed background, glyph inside safe area
        canvas = bg
    else:
        # Rounded square clip
        rounded = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        rounded.paste(bg, (0, 0), rounded_mask(s, int(s * radius_ratio)))
        canvas = rounded

    add_sparkles(canvas, s)

    # Glyph drawn into a centered square of `inner` size
    glyph_canvas = Image.new('RGBA', (inner, inner), (0, 0, 0, 0))
    draw_glyph(glyph_canvas, inner, glyph_scale=0.62 if pad > 0 else 0.56)
    canvas.alpha_composite(glyph_canvas, (pad, pad))

    canvas = canvas.resize((size, size), Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, save_as)
    canvas.save(out_path, 'PNG', optimize=True)
    print(f'wrote {out_path}')


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    make_icon(192, save_as='icon-192.png')
    make_icon(512, save_as='icon-512.png')
    make_icon(180, save_as='apple-touch-icon.png')
    # Maskable: needs ~10% safe area on all sides; full-bleed background
    make_icon(512, padding_ratio=0.12, save_as='icon-512-maskable.png')
