#!/usr/bin/env python3
"""Generate app icons using only the Python stdlib (no PIL).

Produces:
  icons/icon-192.png       (PWA)
  icons/icon-512.png       (PWA / maskable)
  icons/apple-touch-icon.png  (iOS home screen, 180x180)

Run from the project root:
    python3 scripts/generate-icons.py
"""

from __future__ import annotations

import os
import struct
import zlib
from pathlib import Path

BG = (79, 70, 229)         # indigo-600 (matches theme_color)
CARD_BACK = (129, 140, 248)  # indigo-400
CARD_FRONT = (248, 250, 252)  # slate-50
INK = (30, 41, 59)          # slate-800 — for the lines drawn on the front card


def _rounded_rect_mask(w: int, h: int, radius: int) -> list[list[bool]]:
    """True where the pixel is *inside* the rounded rectangle."""
    mask = [[True] * w for _ in range(h)]
    r2 = radius * radius
    corners = [
        (radius, radius),
        (w - 1 - radius, radius),
        (radius, h - 1 - radius),
        (w - 1 - radius, h - 1 - radius),
    ]
    for y in range(h):
        for x in range(w):
            near = None
            if x < radius and y < radius:
                near = corners[0]
            elif x >= w - radius and y < radius:
                near = corners[1]
            elif x < radius and y >= h - radius:
                near = corners[2]
            elif x >= w - radius and y >= h - radius:
                near = corners[3]
            if near is not None:
                dx = x - near[0]
                dy = y - near[1]
                if dx * dx + dy * dy > r2:
                    mask[y][x] = False
    return mask


def _blit(pixels, ox, oy, w, h, mask, color):
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            px, py = ox + x, oy + y
            if 0 <= px < len(pixels[0]) and 0 <= py < len(pixels):
                pixels[py][px] = color


def _hline(pixels, x0, x1, y, color):
    W, H = len(pixels[0]), len(pixels)
    if y < 0 or y >= H:
        return
    for x in range(max(0, x0), min(W, x1)):
        pixels[y][x] = color


def make_icon(size: int) -> bytes:
    W = H = size
    pixels = [[BG] * W for _ in range(H)]

    # rounded background (subtle — most launchers apply their own mask)
    bg_mask = _rounded_rect_mask(W, H, size // 8)
    for y in range(H):
        for x in range(W):
            if not bg_mask[y][x]:
                pixels[y][x] = (255, 255, 255)  # transparent-ish via white; PNGs here are RGB so this reads as a plate. Fine.

    # back card (offset right/down slightly)
    cw = int(size * 0.60)
    ch = int(size * 0.70)
    cx = int(size * 0.28)
    cy = int(size * 0.18)
    r = max(6, size // 24)
    _blit(pixels, cx, cy, cw, ch, _rounded_rect_mask(cw, ch, r), CARD_BACK)

    # front card (offset left/up slightly)
    fx = int(size * 0.12)
    fy = int(size * 0.24)
    _blit(pixels, fx, fy, cw, ch, _rounded_rect_mask(cw, ch, r), CARD_FRONT)

    # three ink lines on the front card
    line_thickness = max(2, size // 60)
    line_left = fx + int(cw * 0.14)
    line_right_full = fx + int(cw * 0.86)
    line_right_short = fx + int(cw * 0.65)
    line_ys = [
        fy + int(ch * 0.30),
        fy + int(ch * 0.50),
        fy + int(ch * 0.70),
    ]
    for i, y in enumerate(line_ys):
        right = line_right_short if i == 2 else line_right_full
        for t in range(line_thickness):
            _hline(pixels, line_left, right, y + t, INK)

    # encode PNG (RGB, 8-bit)
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter: none
        for (r_, g_, b_) in row:
            raw.append(r_)
            raw.append(g_)
            raw.append(b_)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend


def main() -> None:
    here = Path(__file__).resolve().parent.parent
    out_dir = here / 'icons'
    out_dir.mkdir(exist_ok=True)
    for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
        path = out_dir / name
        path.write_bytes(make_icon(size))
        print(f'wrote {path}  ({size}x{size}, {os.path.getsize(path)} bytes)')


if __name__ == '__main__':
    main()
