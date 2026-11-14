# Draws the app icons of the scheduling product (a calendar with full and weak cells, like "כן" and "יכולה") as PNG files,
# with nothing but the Python standard library.   python products/shibutz/make-icons.py  -> products/shibutz/static/icon-*.png
import os, zlib, struct

BG, LINE, CELL = (0x1C, 0x1A, 0x17), (0x9D, 0xB0, 0x8F), (0xF3, 0xEE, 0xE4)

def rrect_cover(px, py, x, y, w, h, r):
    """how much of the pixel square (px, py)-(px+1, py+1) is inside a rounded rectangle, by 4x4 samples"""
    n = 0
    for i in range(4):
        for j in range(4):
            sx, sy = px + (i + .5) / 4, py + (j + .5) / 4
            if x <= sx <= x + w and y <= sy <= y + h:
                cx = min(max(sx, x + r), x + w - r); cy = min(max(sy, y + r), y + h - r)
                if (sx - cx) ** 2 + (sy - cy) ** 2 <= r * r: n += 1
    return n / 16

def draw(size, maskable):
    s = size / 512; k = .78 if maskable else 1; o = size * (1 - k) / 2
    S = lambda v: o + v * s * k; L = lambda v: v * s * k
    img = [[(0, 0, 0, 0)] * size for _ in range(size)]
    def paint(shape, color, alpha=1.0):
        x, y, w, h, r = shape
        for py in range(max(0, int(y) - 1), min(size, int(y + h) + 2)):
            row = img[py]
            for px in range(max(0, int(x) - 1), min(size, int(x + w) + 2)):
                a = rrect_cover(px, py, x, y, w, h, r) * alpha
                if a <= 0: continue
                R, G, B, A = row[px]; A /= 255
                na = a + A * (1 - a)
                mix = lambda c, d: (c * a + d * A * (1 - a)) / na if na else 0
                row[px] = (round(mix(color[0], R)), round(mix(color[1], G)), round(mix(color[2], B)), round(na * 255))
    paint((0, 0, size, size, 0 if maskable else 112 * s), BG)
    t = L(26)
    # the frame of the calendar: four thick bars with round ends
    paint((S(104) - t / 2, S(132) - t / 2, L(304) + t, t, t / 2), LINE)
    paint((S(104) - t / 2, S(412) - t / 2, L(304) + t, t, t / 2), LINE)
    paint((S(104) - t / 2, S(132) - t / 2, t, L(280) + t, t / 2), LINE)
    paint((S(408) - t / 2, S(132) - t / 2, t, L(280) + t, t / 2), LINE)
    paint((S(104), S(212) - t / 2, L(304), t, t / 2), LINE)
    for x in (184, 328): paint((S(x) - t / 2, S(100) - t / 2, t, L(60) + t, t / 2), LINE)
    for (x, y, full) in ((148, 250, 1), (230, 250, 0), (312, 250, 1), (148, 330, 0), (230, 330, 1), (312, 330, 0)):
        paint((S(x), S(y), L(52), L(52), L(12)), CELL, 1 if full else .35)
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in img)
    chunk = lambda tag, data: struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
os.makedirs(out, exist_ok=True)
for name, size, mask in (('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True), ('apple-touch-icon.png', 180, True)):
    open(os.path.join(out, name), 'wb').write(draw(size, mask)); print(name)
