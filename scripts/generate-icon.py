"""Generate Vibe-Research app icon assets (SVG, PNG, ICO).

Uses the project brand colors:
  - background: #0a1020 (dark navy)
  - line: #f35d2b (warm orange)
  - highlight dot: #ff8a4c (light orange)

Outputs:
  - frontend/public/app-icon.svg   scalable source
  - frontend/public/app-icon.png   512x512 RGBA
  - frontend/public/app-icon.ico   multi-resolution ICO (16/24/32/48/64/128/256)
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "frontend" / "public"

# Brand colors
BG_COLOR = (10, 16, 32, 255)       # #0a1020
LINE_COLOR = (243, 93, 43, 255)    # #f35d2b (orange end of the gradient)
DOT_COLOR = (255, 138, 76, 255)    # #ff8a4c (lighter orange highlight)

CANVAS_SIZE = 1024
CORNER_RADIUS = int(CANVAS_SIZE * 14 / 64)  # 14px on a 64px artboard
LINE_WIDTH = int(CANVAS_SIZE * 5 / 64)      # 5px stroke

# Chart polyline scaled from the 64x64 artboard
POINTS_64 = [(14, 40), (26, 24), (36, 34), (50, 16)]
POINTS = [
    (int(x * CANVAS_SIZE / 64), int(y * CANVAS_SIZE / 64))
    for x, y in POINTS_64
]


def draw_rounded_background(draw: ImageDraw.ImageDraw, size: int, radius: int) -> None:
    """Draw the dark navy rounded-square background."""
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=BG_COLOR,
    )


def draw_chart_line(draw: ImageDraw.ImageDraw) -> None:
    """Draw the warm-orange trend line with rounded caps/joints."""
    # Thick polyline with rounded joints.
    draw.line(POINTS, fill=LINE_COLOR, width=LINE_WIDTH, joint="curve")

    # Round end caps.
    for point in (POINTS[0], POINTS[-1]):
        r = LINE_WIDTH // 2
        draw.ellipse(
            [(point[0] - r, point[1] - r), (point[0] + r, point[1] + r)],
            fill=LINE_COLOR,
        )


def draw_endpoint_dot(draw: ImageDraw.ImageDraw) -> None:
    """Draw the brighter dot at the top-right end of the trend line."""
    cx, cy = POINTS[-1]
    radius = int(CANVAS_SIZE * 5 / 64)  # 5px radius on 64px artboard
    draw.ellipse(
        [(cx - radius, cy - radius), (cx + radius, cy + radius)],
        fill=DOT_COLOR,
    )


def render_bitmap(size: int) -> Image.Image:
    """Render the icon at the requested pixel size."""
    # Render at full canvas then downsample for clean anti-aliasing.
    img = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw_rounded_background(draw, CANVAS_SIZE, CORNER_RADIUS)
    draw_chart_line(draw)
    draw_endpoint_dot(draw)

    if size != CANVAS_SIZE:
        img = img.resize((size, size), Image.Resampling.LANCZOS)

    return img


def write_svg() -> Path:
    """Write the scalable source SVG matching the raster design."""
    svg_path = OUT_DIR / "app-icon.svg"
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0a1020"/>
  <path d="M14 40 L26 24 L36 34 L50 16"
        fill="none" stroke="#f35d2b" stroke-width="5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="50" cy="16" r="5" fill="#ff8a4c"/>
</svg>
"""
    svg_path.write_text(svg_content, encoding="utf-8")
    return svg_path


def write_png() -> Path:
    """Write a 512x512 PNG."""
    png_path = OUT_DIR / "app-icon.png"
    img = render_bitmap(512)
    img.save(png_path, "PNG")
    return png_path


def write_ico() -> Path:
    """Write a multi-resolution Windows ICO."""
    ico_path = OUT_DIR / "app-icon.ico"
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [render_bitmap(size) for size in sizes]
    # Pillow anchors allowed resolutions to the first image, so start with the
    # largest frame and append the smaller ones.
    images[-1].save(
        ico_path,
        format="ICO",
        sizes=[(img.width, img.height) for img in images],
        append_images=images[:-1],
    )
    return ico_path


def main() -> None:
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        svg = write_svg()
        png = write_png()
        ico = write_ico()
        print(f"Generated icon assets:\n  {svg}\n  {png}\n  {ico}")
    except Exception as exc:  # pragma: no cover - CLI entry point
        print(f"Error generating icon assets: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
