#!/usr/bin/env bash
# App-local media stack for Immich v3.4.1 / Sharp 0.35.5 on Ubuntu 24.04.
# Run as pholy. Never invokes apt, sudo, ldconfig or system-wide installation.
# Recipes: immich-app/base-images@e6d98454d6e6ed9a24df4ceff048590fbca30cd0.
# libvips 8.18.7 is required by the frozen Sharp lockfile.
set -euo pipefail
umask 022
PHOLY_BASE=/var/www/vhosts/pholy.de
PREFIX="${PHOLY_MEDIA_PREFIX:-$PHOLY_BASE/pholy-toolchain/media}"
WORK="${PHOLY_MEDIA_BUILD_DIR:-$PHOLY_BASE/pholy-toolchain/media-build}"
JOBS="${PHOLY_MEDIA_JOBS:-4}"
BASE_IMAGES_COMMIT=e6d98454d6e6ed9a24df4ceff048590fbca30cd0
DE265_COMMIT=7ba65889d3d6d8a0d99b5360b028243ba843be3a
HEIF_COMMIT=78c9746aea226b22885e8d35241353ce669c4ea5
RAW_COMMIT=e419de08001de28ae6988ecb22df47e52b9c5eaa
MAGICK_COMMIT=c86de049cefb8dd739e16f0e2fdc1ef8d2006d59
VIPS_COMMIT=24ad4d042940e6bf99a68871ba886ca8847c9c82
ASSETS_COMMIT=6742055402de1aa48f93d12ded7d18f4057f9d1f
case "$PREFIX" in "$PHOLY_BASE"/pholy-toolchain/*) ;; *) echo "Prefix must stay in PHOLY's toolchain" >&2; exit 2;; esac
case "$WORK" in "$PHOLY_BASE"/pholy-toolchain/*) ;; *) echo "Build directory must stay in PHOLY's toolchain" >&2; exit 2;; esac
[[ "$PREFIX" != *"/../"* && "$WORK" != *"/../"* ]] || exit 2
[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || { echo "PHOLY_MEDIA_JOBS must be a positive integer" >&2; exit 2; }

print_env() {
  printf 'export PHOLY_MEDIA_PREFIX=%q\n' "$PREFIX"
  printf 'export PATH=%q:"$PATH"\n' "$PREFIX/bin"
  printf 'export PKG_CONFIG_PATH=%q${PKG_CONFIG_PATH:+:"$PKG_CONFIG_PATH"}\n' "$PREFIX/lib/pkgconfig"
  printf 'export LD_LIBRARY_PATH=%q${LD_LIBRARY_PATH:+:"$LD_LIBRARY_PATH"}\n' "$PREFIX/lib"
  printf 'export CMAKE_PREFIX_PATH=%q${CMAKE_PREFIX_PATH:+:"$CMAKE_PREFIX_PATH"}\n' "$PREFIX"
  printf 'export PHOLY_SHARP_MODE=global\nexport SHARP_FORCE_GLOBAL_LIBVIPS=1\nunset SHARP_IGNORE_GLOBAL_LIBVIPS\n'
}
export PATH="$PREFIX/bin:$PATH"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="$PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CMAKE_PREFIX_PATH="$PREFIX${CMAKE_PREFIX_PATH:+:$CMAKE_PREFIX_PATH}"
export CPPFLAGS="-I$PREFIX/include${CPPFLAGS:+ $CPPFLAGS}"
export LDFLAGS="-L$PREFIX/lib -Wl,-rpath,$PREFIX/lib${LDFLAGS:+ $LDFLAGS}"
export MAKEFLAGS="-j$JOBS"
export CMAKE_BUILD_PARALLEL_LEVEL="$JOBS"

require_owner() {
  [[ "$(id -un)" == pholy ]] || { echo "Run this helper as pholy." >&2; exit 2; }
}
source_checkout() {
  local name=$1 repo=$2 commit=$3 dir="$WORK/src/$1"
  if [[ ! -e "$dir" ]]; then
    mkdir -p "$dir"
    git -C "$dir" init --quiet
    git -C "$dir" remote add origin "https://github.com/$repo.git"
    git -C "$dir" fetch --quiet --depth 1 origin "$commit"
    git -C "$dir" checkout --quiet --detach FETCH_HEAD
  fi
  [[ "$(git -C "$dir" rev-parse HEAD)" == "$commit" ]] || {
    echo "Source checkout mismatch: $dir" >&2; exit 1;
  }
}
build_stack() {
  require_owner
  for cmd in git cmake meson ninja pkg-config autoconf automake autoreconf libtoolize make g++ python3 ffmpeg ffprobe; do
    command -v "$cmd" >/dev/null || { echo "Missing prerequisite: $cmd" >&2; exit 1; }
  done
  # Prerequisites (install separately as host administrator):
  # build-essential cmake ninja-build meson pkg-config autoconf automake libtool
  # libltdl-dev libglib2.0-dev libexpat1-dev libexif-dev libjpeg-turbo8-dev
  # libpng-dev libwebp-dev libsharpyuv-dev libtiff-dev liblcms2-dev libopenjp2-7-dev
  # librsvg2-dev libgsf-1-dev libspng-dev libaom-dev libdav1d-dev zlib1g-dev
  # libbz2-dev liblzma-dev libdeflate-dev
  pkg-config --exists glib-2.0 expat libexif libjpeg libpng libwebp libsharpyuv \
    libtiff-4 lcms2 libopenjp2 librsvg-2.0 spng aom dav1d zlib
  mkdir -p "$PREFIX" "$WORK/src" "$WORK/build" "$WORK/done"

  source_checkout libde265 strukturag/libde265 "$DE265_COMMIT"
  if [[ ! -f "$WORK/done/libde265-$DE265_COMMIT" ]]; then
    cmake -S "$WORK/src/libde265" -B "$WORK/build/libde265" \
      -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" \
      -DCMAKE_INSTALL_LIBDIR=lib -DCMAKE_INSTALL_RPATH="$PREFIX/lib" \
      -DENABLE_SDL=OFF -DENABLE_DECODER=OFF -DENABLE_ENCODER=OFF -DBUILD_SHARED_LIBS=ON
    cmake --build "$WORK/build/libde265" --parallel "$JOBS"
    cmake --install "$WORK/build/libde265"
    touch "$WORK/done/libde265-$DE265_COMMIT"
  fi
  pkg-config --atleast-version=1.0.16 libde265

  source_checkout libheif strukturag/libheif "$HEIF_COMMIT"
  if [[ ! -f "$WORK/done/libheif-$HEIF_COMMIT" ]]; then
    cmake --preset=release-noplugins -S "$WORK/src/libheif" -B "$WORK/build/libheif" \
      -DCMAKE_INSTALL_PREFIX="$PREFIX" -DCMAKE_INSTALL_LIBDIR=lib \
      -DCMAKE_INSTALL_RPATH="$PREFIX/lib" -DCMAKE_PREFIX_PATH="$PREFIX" \
      -DWITH_DAV1D=ON -DENABLE_PARALLEL_TILE_DECODING=ON -DWITH_LIBSHARPYUV=ON \
      -DWITH_LIBDE265=ON -DWITH_AOM_DECODER=OFF -DWITH_AOM_ENCODER=ON \
      -DWITH_X265=OFF -DWITH_EXAMPLES=OFF -DBUILD_TESTING=OFF
    cmake --build "$WORK/build/libheif" --parallel "$JOBS"
    cmake --install "$WORK/build/libheif"
    touch "$WORK/done/libheif-$HEIF_COMMIT"
  fi
  pkg-config --atleast-version=1.23.3 libheif

  source_checkout libraw LibRaw/LibRaw "$RAW_COMMIT"
  if [[ ! -f "$WORK/done/libraw-$RAW_COMMIT" ]]; then
    (
      cd "$WORK/src/libraw"
      autoreconf --install
      ./configure --prefix="$PREFIX" --libdir="$PREFIX/lib" \
        --disable-examples --enable-shared --disable-static
      make -j"$JOBS"
      make install
    )
    touch "$WORK/done/libraw-$RAW_COMMIT"
  fi
  # The pinned Immich revision reports 0.22.0 in its own headers/pkg-config;
  # base-images labels the recipe 0.22.2-1. The immutable revision is authoritative.
  pkg-config --atleast-version=0.22.0 libraw_r

  source_checkout imagemagick ImageMagick/ImageMagick "$MAGICK_COMMIT"
  if [[ ! -f "$WORK/done/imagemagick-$MAGICK_COMMIT" ]]; then
    (
      cd "$WORK/src/imagemagick"
      # Same LibRaw ABI-tail override as the pinned official Immich base.
      ./configure --prefix="$PREFIX" --libdir="$PREFIX/lib" \
        --with-modules --enable-shared --disable-static \
        --with-raw=yes --with-heic=yes --without-x --without-perl --without-gslib \
        CPPFLAGS="$CPPFLAGS -DMAGICK_LIBRAW_VERSION_TAIL=202502"
      make -j"$JOBS"
      make install
    )
    touch "$WORK/done/imagemagick-$MAGICK_COMMIT"
  fi
  pkg-config --atleast-version=7.1.2 MagickCore

  source_checkout base-images immich-app/base-images "$BASE_IMAGES_COMMIT"
  source_checkout libvips libvips/libvips "$VIPS_COMMIT"
  # Rebase the official priority-only patch onto 8.18.7. Its newer HEIF
  # trust/security check changed the patch context and must remain intact.
  python3 - "$WORK/src/libvips" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1]) / "libvips/foreign"
for filename, function in [("heifload.c", "vips_foreign_load_heif_class_init"),
                           ("jpegload.c", "vips_foreign_load_jpeg_class_init")]:
    path = root / filename
    text = path.read_text()
    start = text.index(function + "(")
    end = text.index("\nstatic void", start)
    section = text[start:end]
    if "\tforeign_class->priority = 150;" in section:
        continue
    if filename == "heifload.c":
        declaration = "\tVipsObjectClass *object_class = (VipsObjectClass *) class;\n"
        anchor = "\tobject_class->build = vips_foreign_load_heif_build;\n"
        assert section.count(declaration) == section.count(anchor) == 1
        section = section.replace(declaration, declaration +
            "\tVipsForeignClass *foreign_class = (VipsForeignClass *) class;\n")
        section = section.replace(anchor, anchor +
            "\n\t/* Match Immich's cheap HEIF brand-check priority. */\n"
            "\tforeign_class->priority = 150;\n")
        assert "#if !LIBHEIF_HAVE_VERSION(1, 23, 2)" in section
        assert "VIPS_OPERATION_UNTRUSTED" in section
    else:
        assert section.count("\tforeign_class->priority = 50;") == 1
        section = section.replace("\tforeign_class->priority = 50;",
                                  "\tforeign_class->priority = 150;")
    path.write_text(text[:start] + section + text[end:])
PY
  git -C "$WORK/src/libvips" diff --check
  if [[ ! -f "$WORK/done/libvips-$VIPS_COMMIT" ]]; then
    local meson_args=()
    [[ ! -f "$WORK/build/libvips/build.ninja" ]] || meson_args+=(--reconfigure)
    meson setup "${meson_args[@]}" "$WORK/build/libvips" "$WORK/src/libvips" \
      --prefix="$PREFIX" --libdir=lib --buildtype=release \
      -Dintrospection=disabled -Ddocs=false -Dexamples=false \
      -Dmodules=disabled -Dheif=enabled -Draw=enabled -Dmagick=enabled \
      -Djpeg=enabled -Dpng=enabled -Dwebp=enabled -Dlcms=enabled -Dexif=enabled \
      -Dtiff=disabled -Dpoppler=disabled -Dpdfium=disabled -Dopenslide=disabled
    ninja -C "$WORK/build/libvips" -j"$JOBS"
    ninja -C "$WORK/build/libvips" install
    touch "$WORK/done/libvips-$VIPS_COMMIT"
  fi
  pkg-config --atleast-version=8.18.7 vips-cpp
  print_env > "$PREFIX/env.sh"
  cat > "$PREFIX/sources.lock" <<EOF
immich=v3.4.1
sharp=0.35.5
base-images=$BASE_IMAGES_COMMIT
libde265=1.0.16 $DE265_COMMIT
libheif=1.23.3 $HEIF_COMMIT
libraw=0.22.0 $RAW_COMMIT (base-images recipe label: 0.22.2-1)
imagemagick=7.1.2-21 $MAGICK_COMMIT
libvips=8.18.7 $VIPS_COMMIT
test-assets=$ASSETS_COMMIT
EOF
  verify_stack
}
verify_stack() {
  require_owner
  pkg-config --atleast-version=8.18.7 vips-cpp
  "$PREFIX/bin/vips" --version
  "$PREFIX/bin/magick" -version
  "$PREFIX/bin/vips" -l foreign | grep -E 'heifload|dcrawload|magickload'
  export MAGICK_CONFIGURE_PATH="${MAGICK_CONFIGURE_PATH:-$PHOLY_BASE/pholy-app/deployment/pholy/imagemagick}"
  [[ -f "$MAGICK_CONFIGURE_PATH/policy.xml" ]] || { echo "Immich ImageMagick policy.xml missing" >&2; exit 1; }
  local fixtures="$WORK/fixtures" results="$WORK/verification"
  mkdir -p "$fixtures" "$results"
  # Public upstream fixtures only. Git blob IDs verify the exact reviewed bytes.
  python3 - "$fixtures" "$HEIF_COMMIT" "$ASSETS_COMMIT" <<'PY'
import hashlib, pathlib, sys, urllib.request
dest = pathlib.Path(sys.argv[1])
items = [
    ("example.heic", "strukturag/libheif", sys.argv[2], "examples/example.heic",
     "829384037820e545467a4af49aa6414c2b0f2885"),
    ("immich-phone.heic", "immich-app/test-assets", sys.argv[3], "formats/heic/IMG_2682.heic",
     "85cdc07c925bbcd9b35001046d8f5a4c5c72870d"),
    ("EOS_30D.CR2", "immich-app/test-assets", sys.argv[3], "formats/raw/Canon/EOS_30D.CR2",
     "d0d38fb738e1c893e3b40701c2b9bd6163dca5b9"),
]
for name, repo, revision, remote, expected in items:
    path = dest / name
    data = path.read_bytes() if path.exists() else urllib.request.urlopen(
        f"https://raw.githubusercontent.com/{repo}/{revision}/{remote}", timeout=60).read()
    actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if actual != expected:
        raise RuntimeError(f"Fixture checksum mismatch: {name}")
    if not path.exists():
        path.write_bytes(data)
    print(f"Fixture verified: {name} ({len(data)} bytes)")
PY
  "$PREFIX/bin/magick" -size 96x64 gradient:'#112244-#eedd99' "$fixtures/sample.png"
  "$PREFIX/bin/magick" "$fixtures/sample.png" "$fixtures/sample.jpg"
  for sample in sample.png sample.jpg example.heic immich-phone.heic EOS_30D.CR2; do
    "$PREFIX/bin/vips" thumbnail "$fixtures/$sample" "$results/$sample.jpg" 96
    "$PREFIX/bin/magick" identify -format '%f %wx%h\n' "$results/$sample.jpg"
  done
  # Exercise ImageMagick fallback too, with any configured runtime policy.
  "$PREFIX/bin/magick" "$fixtures/EOS_30D.CR2" -thumbnail 96x96 "$results/magick-raw.jpg"
  "$PREFIX/bin/magick" "$fixtures/example.heic" -thumbnail 96x96 "$results/magick-heic.jpg"
  ffmpeg -hide_banner -loglevel error -nostdin -y \
    -f lavfi -i testsrc2=size=160x96:rate=5 -t 1 \
    -c:v libx264 -pix_fmt yuv420p "$fixtures/sample.mp4"
  ffmpeg -hide_banner -loglevel error -nostdin -y \
    -i "$fixtures/sample.mp4" -frames:v 1 "$results/video-frame.jpg"
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height \
    -of json "$fixtures/sample.mp4"
  if [[ -n "${PHOLY_SHARP_PACKAGE:-}" ]]; then
    node - "$PHOLY_SHARP_PACKAGE" "$fixtures" "$results" <<'JS'
const path = require('node:path');
const sharp = require(process.argv[2]);
(async () => {
  console.log(JSON.stringify({ sharp: sharp.versions.sharp, vips: sharp.versions.vips,
    heif: sharp.format.heif, magick: sharp.format.magick }, null, 2));
  for (const file of ['sample.jpg', 'sample.png', 'example.heic', 'immich-phone.heic', 'EOS_30D.CR2']) {
    const info = await sharp(path.join(process.argv[3], file))
      .resize({ width: 96, height: 96, fit: 'inside' })
      .jpeg().toFile(path.join(process.argv[4], 'sharp-' + file + '.jpg'));
    if (!(info.width > 0 && info.height > 0)) throw new Error('Empty output: ' + file);
    console.log('Sharp decoded', file, info.width, info.height);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
  else
    echo "Sharp runtime not tested; rerun with PHOLY_SHARP_PACKAGE=<release>/node_modules/sharp."
  fi
  printf 'PASS: native JPEG, PNG, HEIC, Canon EOS 30D CR2, H.264 decode/frame extraction.\n'
  printf 'RAW verification covers the named camera fixture only; other cameras/codecs need samples.\n'
}
case "${1:-help}" in
  build) build_stack ;;
  verify) verify_stack ;;
  env) print_env ;;
  *)
    cat <<'HELP'
Usage: media-tools.sh build|verify|env
  build   Build pinned media libraries inside PHOLY's toolchain, then decode fixtures.
  verify  Decode JPEG/PNG/HEIC/CR2 fixtures and a synthetic H.264 video.
  env     Print shell exports for the native builder and runtime (no writes).
Run build/verify as pholy, after installing the prerequisite Ubuntu development packages.
Set PHOLY_SHARP_PACKAGE to the deployed Sharp directory to test the actual Node binding.
Source the generated media/env.sh before PHOLY_SHARP_MODE=global builds.
Runtime needs this prefix's bin/lib paths and its separately configured
MAGICK_CONFIGURE_PATH, with the official Immich policy.xml.
No system codecs, services, package installations, application data or user media are changed.
HELP
    [[ "${1:-help}" == help ]] || exit 2
    ;;
esac
