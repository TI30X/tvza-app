# -*- coding: utf-8 -*-
"""Erzeugt assets/i18n/<lang>.json aus den Tabellen in dev/i18n-src/.

    python3 dev/i18n-src/build.py

catalog.py traegt Huelle, Navigation und Einstellungen; die catalog_pages*.py
tragen die Bereichsseiten. Alle Tabellen haben dieselbe Form: Schluessel auf
ein Tupel in der Reihenfolge de, en, fr, it, pl, nl, es.

Die JSON-Dateien werden mitversioniert, damit die App ohne Build-Schritt
auskommt — dieses Skript laeuft nur, wenn jemand am Katalog arbeitet.
"""
import glob
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

import catalog  # noqa: E402

LANGS = catalog.LANGS
merged = {}
sources = {}

modules = ['catalog'] + sorted(
    os.path.splitext(os.path.basename(p))[0]
    for p in glob.glob(os.path.join(HERE, 'catalog_*.py'))
)

for name in modules:
    table = importlib.import_module(name).KEYS
    for key, row in table.items():
        if key in merged:
            raise SystemExit('Schluessel doppelt: %s (%s und %s)' % (key, sources[key], name))
        merged[key] = row
        sources[key] = name

broken = [k for k, row in merged.items() if len(row) != len(LANGS)]
if broken:
    raise SystemExit('Zeilen mit falscher Spaltenzahl: ' + ', '.join(broken))

empty = [k for k, row in merged.items() if any(not str(v).strip() for v in row)]
if empty:
    raise SystemExit('Leere Uebersetzung in: ' + ', '.join(empty))

out_dir = os.path.join(ROOT, 'assets', 'i18n')
os.makedirs(out_dir, exist_ok=True)

for index, lang in enumerate(LANGS):
    data = {key: row[index] for key, row in merged.items()}
    path = os.path.join(out_dir, lang + '.json')
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write('\n')

print('%d Schluessel aus %d Tabellen -> %d Dateien'
      % (len(merged), len(modules), len(LANGS)))
