"""纯 Python 生成插件图标（无第三方依赖）：写入 RGBA PNG。"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
SS = 4  # 超采样倍数


def new_buf(n):
    return bytearray(n * n * 4)


def blend(buf, n, x, y, r, g, b, a):
    if a <= 0 or x < 0 or y < 0 or x >= n or y >= n:
        return
    i = (y * n + x) * 4
    sa = a / 255.0
    buf[i] = int(buf[i] * (1 - sa) + r * sa)
    buf[i + 1] = int(buf[i + 1] * (1 - sa) + g * sa)
    buf[i + 2] = int(buf[i + 2] * (1 - sa) + b * sa)
    buf[i + 3] = int(buf[i + 3] * (1 - sa) + 255 * sa)


def rounded_rect(buf, n, x0, y0, x1, y1, rad, color, aa=1.0):
    """带抗锯齿的圆角矩形填充。"""
    r, g, b, a = color
    for y in range(int(y0), int(y1) + 1):
        if y < 0 or y >= n:
            continue
        for x in range(int(x0), int(x1) + 1):
            if x < 0 or x >= n:
                continue
            # 到圆角矩形的带符号距离（>0 在内部）
            cx = min(max(x + 0.5, x0 + rad), x1 - rad)
            cy = min(max(y + 0.5, y0 + rad), y1 - rad)
            d = min(x1 - (x + 0.5), (x + 0.5) - x0, y1 - (y + 0.5), (y + 0.5) - y0)
            if rad > 0:
                dx = (x + 0.5) - cx
                dy = (y + 0.5) - cy
                dd = rad - (dx * dx + dy * dy) ** 0.5
                d = min(d, dd)
            alpha = max(0.0, min(1.0, d * aa + 0.5)) * a
            if alpha > 0:
                blend(buf, n, x, y, r, g, b, alpha)


def draw(size):
    n = size * SS
    buf = new_buf(n)
    m = n * 0.06
    rounded_rect(buf, n, m, m, n - m, n - m, n * 0.24, (48, 96, 235, 255))
    rounded_rect(buf, n, m, m, n - m, n - m, n * 0.24, (120, 165, 255, 70))
    # 两条字幕条
    bw1 = n * 0.56
    bw2 = n * 0.36
    bh = max(1.0, n * 0.10)
    x0 = (n - bw1) / 2
    rounded_rect(buf, n, x0, n * 0.44, x0 + bw1, n * 0.44 + bh, bh / 2, (255, 255, 255, 255))
    rounded_rect(buf, n, x0, n * 0.62, x0 + bw2, n * 0.62 + bh, bh / 2, (255, 255, 255, 210))
    return downsample(buf, n, size)


def downsample(buf, n, size):
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            ar = ag = ab = aa = cnt = 0
            for dy in range(SS):
                for dx in range(SS):
                    i = ((y * SS + dy) * n + (x * SS + dx)) * 4
                    a = buf[i + 3] / 255.0
                    ar += buf[i] * a
                    ag += buf[i + 1] * a
                    ab += buf[i + 2] * a
                    aa += buf[i + 3]
                    cnt += 1
            o = (y * size + x) * 4
            a = aa / cnt  # 0..255
            if a > 0:
                # 累加时按 0..1 的 alpha 预乘过，这里要还原
                out[o] = max(0, min(255, int(ar * 255 / a / cnt)))
                out[o + 1] = max(0, min(255, int(ag * 255 / a / cnt)))
                out[o + 2] = max(0, min(255, int(ab * 255 / a / cnt)))
            else:
                out[o] = out[o + 1] = out[o + 2] = 0
            out[o + 3] = int(a)
    return out


def write_png(path, size, pix):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += pix[y * stride : (y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


for s in (16, 32, 48, 128):
    p = os.path.join(OUT, f"icon{s}.png")
    write_png(p, s, draw(s))
    print("wrote", p, os.path.getsize(p), "bytes")
