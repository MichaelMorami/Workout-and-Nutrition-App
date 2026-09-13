#!/usr/bin/env python3
"""Cuts the 8 static Archivo instances at the (wght, wdth) coordinates `fontInstances` in
src/theme/tokens.ts specifies, from the upstream Archivo variable font.

Not meant to be run directly — called by scripts/fonts.sh, which supplies the source variable
font and the output directory.

    python3 scripts/cut-fonts.py <source-variable.ttf> <out-dir>

Keep this list in sync with `fontInstances` in src/theme/tokens.ts by hand — there is no shared
source of truth between the TypeScript object and this script.
"""
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC, OUT_DIR = sys.argv[1], sys.argv[2]

# (file stem == fontInstances key, human family name, wght, wdth)
INSTANCES = [
    ("Archivo-Book", "Archivo Book", 450, 100),
    ("Archivo-Medium", "Archivo Medium", 500, 100),
    ("Archivo-SemiBold", "Archivo SemiBold", 650, 100),
    ("Archivo-Bold", "Archivo Bold", 700, 100),
    ("Archivo-Title", "Archivo Title", 700, 104),
    ("Archivo-Numeric", "Archivo Numeric", 700, 108),
    ("Archivo-Display", "Archivo Display", 700, 116),
    ("Archivo-DisplayXl", "Archivo Display XL", 700, 118),
]

# platformID, encodingID, langID for the two name-table records worth setting: Windows/Unicode
# BMP/US-English, and classic Mac/Roman/English.
NAME_TABLE_LOCALES = ((3, 1, 0x409), (1, 0, 0))

base = TTFont(SRC)

for stem, family, wght, wdth in INSTANCES:
    # inplace=False (the default): `base` is left untouched so the next iteration cuts from the
    # original variable font, not from a font some previous iteration already pinned.
    inst = instancer.instantiateVariableFont(base, {"wght": wght, "wdth": wdth})

    # A static font has no business keeping a STAT table — that table exists to describe a
    # variable font's axes, and this instance no longer has any.
    if "STAT" in inst:
        del inst["STAT"]

    # Give every instance its own family/PostScript name. Without this, fontTools leaves the
    # name table's nearest-named-instance strings in place, so two unrelated cuts (e.g. wght=450
    # and wght=700, both nearest to the source's "SemiBold" named instance) round-trip with an
    # *identical* PostScript name — a collision iOS font registration will not tolerate.
    name = inst["name"]
    for plat_id, enc_id, lang_id in NAME_TABLE_LOCALES:
        name.setName(family, 1, plat_id, enc_id, lang_id)  # Family
        name.setName("Regular", 2, plat_id, enc_id, lang_id)  # Subfamily
        name.setName(family, 4, plat_id, enc_id, lang_id)  # Full name
        name.setName(stem, 6, plat_id, enc_id, lang_id)  # PostScript name
        name.setName(family, 16, plat_id, enc_id, lang_id)  # Typographic family
        name.setName("Regular", 17, plat_id, enc_id, lang_id)  # Typographic subfamily

    out_path = f"{OUT_DIR}/{stem}.ttf"
    inst.save(out_path)
    print(f"  {stem}.ttf  (wght={wght}, wdth={wdth})")
