# -*- coding: utf-8 -*-
"""Erzeugt assets/i18n/<lang>.json aus dev/i18n-src/catalog.py.

    python3 dev/i18n-src/build.py

Die JSON-Dateien werden mitversioniert, damit die App ohne Build-Schritt
auskommt — dieses Skript laeuft nur, wenn jemand am Katalog arbeitet.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

import catalog  # noqa: E402

out_dir = os.path.join(ROOT, 'assets', 'i18n')
os.makedirs(out_dir, exist_ok=True)

broken = [key for key, row in catalog.KEYS.items() if len(row) != len(catalog.LANGS)]
if broken:
    raise SystemExit('Zeilen mit falscher Spaltenzahl: ' + ', '.join(broken))

empty = [key for key, row in catalog.KEYS.items() if any(not str(v).strip() for v in row)]
if empty:
    raise SystemExit('Leere Uebersetzung in: ' + ', '.join(empty))

for index, lang in enumerate(catalog.LANGS):
    data = {key: row[index] for key, row in catalog.KEYS.items()}
    path = os.path.join(out_dir, lang + '.json')
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write('\n')
    print('%s  %d Schluessel' % (os.path.relpath(path, ROOT), len(data)))
