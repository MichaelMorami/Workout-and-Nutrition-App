#!/usr/bin/env bash
# Regenerates the 8 static Archivo font cuts in assets/fonts/ from the upstream Archivo variable
# font, at the exact (wght, wdth) axis coordinates `fontInstances` in src/theme/tokens.ts
# specifies (kept in sync by hand in scripts/cut-fonts.py).
#
# Requires network access and the `fonttools` Python package: pip3 install fonttools
#
# Idempotent: always re-downloads the source and re-cuts all 8 files, overwriting whatever is at
# assets/fonts/*.ttf. Safe to run repeatedly.
. "$(dirname "$0")/lib.sh"
need curl
need python3

python3 -c "import fontTools" >/dev/null 2>&1 \
  || die "fonttools not installed — run: pip3 install fonttools"

SRC_URL="https://raw.githubusercontent.com/Omnibus-Type/Archivo/master/fonts/variable/Archivo%5Bwdth%2Cwght%5D.ttf"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

say "downloading Archivo variable font"
curl -fsSL -o "$WORKDIR/Archivo-variable.ttf" "$SRC_URL" \
  || die "download failed — check network access, or that $SRC_URL still exists"
python3 -c "from fontTools.ttLib import TTFont; TTFont('$WORKDIR/Archivo-variable.ttf')" \
  || die "downloaded file at $SRC_URL is not a valid font"

mkdir -p "$ROOT/assets/fonts"

say "cutting 8 static instances"
python3 "$(dirname "$0")/cut-fonts.py" "$WORKDIR/Archivo-variable.ttf" "$ROOT/assets/fonts"

ok "8 font files written to assets/fonts/"
