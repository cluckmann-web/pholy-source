#!/usr/bin/env python3
"""Rasterize the exact PHOLY website logo for native app icons and splash.

Requires Inkscape in PATH. Does not alter the upstream Immich assets.
Run from any working directory: python3 mobile/scripts/generate_pholy_icons.py
"""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "mobile/assets"
mark = (ROOT / "web/static/pholy/logo-icon.svg").read_text().strip()
logo = (ROOT / "web/static/pholy/logo.svg").read_text().strip()


def render(name, svg, width, height, directory=ASSETS):
    with tempfile.TemporaryDirectory(prefix="pholy-icon-") as temporary:
        source = Path(temporary) / "image.svg"
        source.write_text(svg)
        subprocess.run(["inkscape", str(source), "--export-type=png", "--export-area-page",
            f"--export-width={width}", f"--export-height={height}",
            "--export-filename=" + str(directory / name)], check=True)


def icon(background=None, foreground="#102f33"):
    shape = mark.replace('<svg ', '<svg x="256" y="218" width="512" height="588" ', 1)
    shape = shape.replace("#102f33", foreground)
    rect = f'<rect width="1024" height="1024" fill="{background}"/>' if background else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{rect}{shape}</svg>'


render("pholy-app-icon.png", icon("#f7f7f2"), 1024, 1024)
render("pholy-app-icon-dark.png", icon("#101b17", "#9bd9c8"), 1024, 1024)
render("pholy-adaptive-foreground.png", icon(), 1024, 1024)
render("pholy-splash-mark.png", icon(), 1152, 1152)
render("pholy-splash-mark-dark.png", icon(foreground="#9bd9c8"), 1152, 1152)
render("pholy-splash.png", logo, 832, 228)
render("pholy-splash-dark.png", logo.replace("#102f33", "#9bd9c8"), 832, 228)

# Android tints the alpha mask of notification icons; keep the PHOLY mark
# white on transparency, with a two-dp safe area in a 24-dp square.
notification_mark = mark.replace('<svg ', '<svg x="3" y="2" width="18" height="20" ', 1)
notification_mark = notification_mark.replace("#102f33", "#ffffff")
notification = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">{notification_mark}</svg>'
for density, size in (("mdpi", 24), ("hdpi", 36), ("xhdpi", 48), ("xxhdpi", 72), ("xxxhdpi", 96)):
    directory = ROOT / f"mobile/android/app/src/main/res/drawable-{density}"
    render("notification_icon.png", notification, size, size, directory)
