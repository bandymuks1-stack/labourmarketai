#!/usr/bin/env python3
"""SCREEN BANDS — is something covering part of the simulator screen?

A signed-in journey runs against production in a PUBLIC repository, so no
screenshot may leave the runner. This takes one, shrinks it to a 12 x 20 pixel
thumbnail, prints only the AVERAGE colour of each of 10 horizontal bands (top
to bottom) as hex, and deletes every image file. Ten averaged colours cannot be
read back into text or a picture; they do show whether, say, the lower half of
the screen is the app's near-black background or a light system sheet.

Usage: ios-screen-bands.py <simulator udid> <work dir>
Never fails the job.
"""
import os
import struct
import subprocess
import sys


def main() -> None:
    udid, work = sys.argv[1], sys.argv[2]
    png = os.path.join(work, "bands-src.png")
    bmp = os.path.join(work, "bands-small.bmp")
    try:
        subprocess.run(["xcrun", "simctl", "io", udid, "screenshot", png],
                       check=True, capture_output=True)
        subprocess.run(["sips", "-s", "format", "bmp", "-z", "20", "12", png,
                        "--out", bmp], check=True, capture_output=True)
        with open(bmp, "rb") as f:
            data = f.read()
        offset = struct.unpack_from("<I", data, 10)[0]
        width = struct.unpack_from("<i", data, 18)[0]
        height = struct.unpack_from("<i", data, 22)[0]
        bpp = struct.unpack_from("<H", data, 28)[0]
        bottom_up = height > 0
        height = abs(height)
        step = bpp // 8
        row_size = (width * step + 3) & ~3
        rows = []
        for y in range(height):
            src_y = height - 1 - y if bottom_up else y
            base = offset + src_y * row_size
            r = g = b = 0
            for x in range(width):
                px = base + x * step
                b += data[px]
                g += data[px + 1]
                r += data[px + 2]
            rows.append((r // width, g // width, b // width))
        bands = 10
        out = []
        for i in range(bands):
            chunk = rows[i * height // bands:(i + 1) * height // bands] or rows[-1:]
            r = sum(c[0] for c in chunk) // len(chunk)
            g = sum(c[1] for c in chunk) // len(chunk)
            b = sum(c[2] for c in chunk) // len(chunk)
            out.append(f"band{i}=#{r:02x}{g:02x}{b:02x}")
        print("screen bands (top to bottom, averaged colour only): " + " ".join(out))
    except Exception as error:  # evidence, never a gate
        print(f"screen bands unavailable: {type(error).__name__}")
    finally:
        for path in (png, bmp):
            try:
                os.remove(path)
            except OSError:
                pass


if __name__ == "__main__":
    main()
