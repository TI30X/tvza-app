# -*- coding: utf-8 -*-
"""Setzt data-i18n-Attribute auf das statische Markup einer Seite.

    python3 dev/i18n-src/apply_keys.py [seite ...]

Vorgehen bewusst konservativ: angefasst wird nur ein Element, dessen
Inhalt reiner Text ist und genau einer deutschen Beschriftung aus dem
Katalog entspricht. Alles in <script> und <style> bleibt unberuehrt —
was Seiten zur Laufzeit erzeugen, ist ein eigener Durchgang.

Weil jeder Seite nur ihre eigenen Namensraeume zugestanden werden, kann
"Datum" auf der Ski-Seite auf ski.datum zeigen und im Kalender auf
cal.datum, ohne dass sich die beiden ins Gehege kommen.

Alle Ausdruecke sind absichtlich linear ([^<>]*, kein verschachtelter
Quantor): auf planner.html mit 160 kB laeuft sonst das Backtracking aus
dem Ruder.
"""
import html
import io
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SHARED = ['common.', 'a11y.', 'pg.', 'app.']

PAGES = {
    'index.html':                     ['home.', 'set.', 'acct.', 'lang.', 'nav.', 'mod.'],
    'login.html':                     ['lg.'],
    'public.html':                    ['pub.'],
    'pages/bereiche.html':            ['br.', 'home.', 'nav.', 'mod.'],
    'pages/messages.html':            ['msg.', 'mod.dm.'],
    'pages/weather.html':             ['wt.', 'mod.weather.'],
    'pages/watchlist.html':           ['wl.', 'mod.watch.'],
    'pages/admin.html':               ['adm.', 'mod.admin.'],
    'pages/training.html':            ['tr.', 'mod.training.'],
    'pages/skitracker.html':          ['ski.', 'mod.ski.'],
    'pages/foodtracker.html':         ['fd.', 'home.', 'mod.food.'],
    'pages/maturaarbeit-tracker.html':['mt.', 'mod.maturatracker.'],
    'pages/planner.html':             ['cal.', 'home.', 'mod.trip.'],
    'pages/guest.html':               ['gst.'],
    'pages/maturaarbeit.html':        ['ma.', 'mod.matura.'],
}

ATTRS = ('placeholder', 'title', 'aria-label', 'alt')
MASK = re.compile(r'<(script|style)\b[^>]*>.*?</\1>', re.S | re.I)
OPEN_TAG = re.compile(r'<([a-zA-Z][\w-]*)([^<>]*)>')
ELEMENT = re.compile(r'<([a-zA-Z][\w-]*)([^<>]*)>([^<>]+)</\1>')
ATTR_IN_TAG = re.compile(r'\b(%s)="([^"]{2,300})"' % '|'.join(ATTRS))

norm = lambda text: ' '.join(html.unescape(text).split())


def mapping_for(prefixes, de):
    """Deutsch -> Schluessel, seiteneigene Namensraeume zuerst."""
    table = {}
    for group in list(prefixes) + SHARED:
        for key, value in de.items():
            if key.startswith(group):
                table.setdefault(norm(value), key)
    return table


def apply(path, prefixes, de):
    full = os.path.join(ROOT, path)
    original = io.open(full, encoding='utf-8').read()

    blocks = []

    def hide(match):
        blocks.append(match.group(0))
        return '\x00%d\x00' % (len(blocks) - 1)

    text = MASK.sub(hide, original)
    split = text.index('<body') if '<body' in text else 0
    head, body = text[:split], text[split:]

    table = mapping_for(prefixes, de)
    counts = {'attr': 0, 'text': 0}

    # ── Attribute: ein Durchgang je oeffnendem Tag ────────────────
    def do_tag(match):
        name, attrs = match.group(1), match.group(2)
        if name.lower() in ('script', 'style') or 'data-i18n-attr=' in attrs:
            return match.group(0)
        pairs = []
        for attr in ATTR_IN_TAG.finditer(attrs):
            key = table.get(norm(attr.group(2)))
            if key:
                pairs.append('%s:%s' % (attr.group(1), key))
        if not pairs:
            return match.group(0)
        counts['attr'] += len(pairs)
        # Selbstschliessende Tags behalten ihren Schraegstrich am Ende —
        # sonst wird aus <input /> ein <input / data-i18n-attr="…">.
        body, close = (attrs[:-1].rstrip(), ' /') if attrs.rstrip().endswith('/') else (attrs, '')
        return '<%s%s data-i18n-attr="%s"%s>' % (name, body, ';'.join(pairs), close)

    body = OPEN_TAG.sub(do_tag, body)

    # ── Textknoten ───────────────────────────────────────────────
    def do_text(match):
        name, attrs, inner = match.group(1), match.group(2), match.group(3)
        if name.lower() in ('script', 'style', 'textarea') or 'data-i18n=' in attrs:
            return match.group(0)
        key = table.get(norm(inner))
        if not key:
            return match.group(0)
        counts['text'] += 1
        return '<%s%s data-i18n="%s">%s</%s>' % (name, attrs, key, inner, name)

    for _ in range(3):          # verschachtelte Elemente in mehreren Laeufen
        body = ELEMENT.sub(do_text, body)

    result = head + body
    for index, block in enumerate(blocks):
        result = result.replace('\x00%d\x00' % index, block)

    if result != original:
        io.open(full, 'w', encoding='utf-8').write(result)
    return '%-34s Text %3d  Attribute %3d' % (path, counts['text'], counts['attr'])


de = json.load(io.open(os.path.join(ROOT, 'assets/i18n/de.json'), encoding='utf-8'))
wanted = sys.argv[1:] or list(PAGES)
for path in wanted:
    if path in PAGES and os.path.exists(os.path.join(ROOT, path)):
        print(apply(path, PAGES[path], de))
