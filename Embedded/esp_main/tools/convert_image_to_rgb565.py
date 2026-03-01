"""
Convert an input image into a header that Adafruit_GFX can draw with drawRGBBitmap().

Usage:
  py -3 tools/convert_image_to_rgb565.py path\to\image.png include\pet_sprite.h

Notes:
  - Requires Pillow: `py -3 -m pip install pillow`
  - The script resizes to 64x64 by default to fit the 128x128 TFT cleanly.
  - Generate the art externally (for example with Gemini), save it locally, then run this script.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - helper script
    raise SystemExit("Pillow is required. Install it with: py -3 -m pip install pillow") from exc


DEFAULT_SIZE = (64, 64)


def rgb888_to_rgb565(red: int, green: int, blue: int) -> int:
    return ((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: py -3 tools/convert_image_to_rgb565.py INPUT_IMAGE OUTPUT_HEADER")
        return 1

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    image = Image.open(input_path).convert("RGB").resize(DEFAULT_SIZE, Image.Resampling.NEAREST)
    pixels = list(image.getdata())
    rgb565_values = [rgb888_to_rgb565(r, g, b) for r, g, b in pixels]

    lines: list[str] = [
        "#pragma once",
        "",
        "#include <Arduino.h>",
        "",
        f"constexpr int16_t PET_SPRITE_WIDTH = {DEFAULT_SIZE[0]};",
        f"constexpr int16_t PET_SPRITE_HEIGHT = {DEFAULT_SIZE[1]};",
        "",
        "constexpr uint16_t PET_SPRITE_DATA[PET_SPRITE_WIDTH * PET_SPRITE_HEIGHT] = {",
    ]

    chunk_size = 12
    for index in range(0, len(rgb565_values), chunk_size):
        chunk = rgb565_values[index : index + chunk_size]
        line = ", ".join(f"0x{value:04X}" for value in chunk)
        suffix = "," if index + chunk_size < len(rgb565_values) else ""
        lines.append(f"    {line}{suffix}")

    lines.append("};")
    lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
