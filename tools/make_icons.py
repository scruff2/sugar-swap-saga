"""Generate app icons (wrapped-candy style) without external libraries."""
import math, struct, zlib, sys, os

def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def icon(size, maskable):
    px = bytearray(size * size * 4)
    cx = cy = size / 2
    R = size * (0.26 if maskable else 0.30)
    for y in range(size):
        for x in range(size):
            u, v = (x + .5 - cx) / size, (y + .5 - cy) / size
            # background: pink -> purple radial
            d = math.hypot(u, v) / 0.71
            col = mix((255, 140, 205), (90, 30, 150), min(1, d))
            a = 255
            if not maskable:
                # rounded square background
                q = max(abs(u), abs(v))
                k = 0.42
                if q > 0.5 or (abs(u) > k and abs(v) > k and math.hypot(abs(u) - k, abs(v) - k) > 0.08):
                    a = 0
            dx, dy = x + .5 - cx, y + .5 - cy
            # wrapper ends (bow-tie)
            ax = abs(dx)
            if R * 0.6 < ax < R * 1.45 and abs(dy) < (ax - R * 0.6) * 0.75 + R * 0.05:
                t = (dy / R + 0.6) / 1.2
                col = mix((255, 230, 120), (230, 120, 0), max(0, min(1, t)))
                a = 255
            # candy body
            r = math.hypot(dx, dy) / R
            if r < 1:
                lx, ly = dx / R + 0.35, dy / R + 0.4
                l = math.hypot(lx, ly) / 1.4
                col = mix((255, 245, 170), (255, 150, 10), min(1, l))
                if r > 0.9:
                    col = mix(col, (150, 60, 0), (r - 0.9) / 0.1)
                # stripes
                if int((dx + dy + size) / (R * 0.36)) % 2 == 0 and r < 0.9:
                    col = mix(col, (255, 255, 255), 0.75)
                # gloss
                gx, gy = dx / R + 0.3, dy / R + 0.45
                if (gx / 0.35) ** 2 + (gy / 0.17) ** 2 < 1:
                    col = mix(col, (255, 255, 255), 0.7)
                a = 255
            i = (y * size + x) * 4
            px[i:i + 4] = bytes((*col, a))
    return px

out = sys.argv[1]
for s in (192, 512):
    png(os.path.join(out, f'icon-{s}.png'), s, s, icon(s, False))
    png(os.path.join(out, f'maskable-{s}.png'), s, s, icon(s, True))
print('icons written')
