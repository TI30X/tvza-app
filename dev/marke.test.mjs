/* Firn ist das Produkt, TVZA der Absender.

   Der Umbenennung sind Reste zweimal durchgerutscht: "TvZ" oben links
   stand als content: in kit.css (v.35.19.0 gefunden), und bis v.35.23.0
   hiessen neun Seiten im Browsertab noch "— TVZA", der Homescreen am
   iPhone ebenfalls, der Bereich "TVZA Watchlist" und der Kalender-Knopf
   "TVZA exportieren". Jedes Mal hat die Suche an der falschen Stelle
   gesucht.

   Dieser Test sucht an den Stellen, die ein Mensch SIEHT: Tab-Titel,
   Homescreen-Name, und jede Beschriftung im Katalog. TVZA darf dort
   genau als Absender stehen — "Firn — ein Projekt von TVZA". Die
   oeffentliche Projektseite (public.html) ist TVZAs eigene Seite und
   bleibt aussen vor. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUSNAHMEN = new Set(['public.html']);

async function seiten() {
  const wurzel = (await readdir(root)).filter(f => f.endsWith('.html')).map(f => f);
  const unter = (await readdir(join(root, 'pages'))).filter(f => f.endsWith('.html')).map(f => `pages/${f}`);
  return [...wurzel, ...unter].filter(f => !AUSNAHMEN.has(f.split('/').pop()));
}

/* Seit v.35.40.0 sind die persönlichen Bereiche TVZA — auch im Titel.
   Die Seite sagt es selbst (<body data-marke="TVZA">), und nur dort darf
   der Titel TVZA nennen. Die Firn-Seiten bleiben frei davon. */
test('der Tab-Titel nennt TVZA genau dort, wo die Seite TVZA ist', async () => {
  const wurzel = (await readdir(root)).filter(f => f.endsWith('.html'));
  const unter = (await readdir(join(root, 'pages'))).filter(f => f.endsWith('.html')).map(f => `pages/${f}`);
  const funde = [];
  for (const f of [...wurzel, ...unter]) {
    const html = await readFile(join(root, f), 'utf8');
    const titel = html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] || '';
    const tvza = /<body[^>]*data-marke="TVZA"/.test(html);
    if (/TvZ\b/.test(titel)) funde.push(`${f}: ${titel} (die alte Schreibweise)`);
    if (tvza && !/TVZA/.test(titel)) funde.push(`${f}: TVZA-Seite, Titel ${titel}`);
    if (!tvza && /TVZA/.test(titel)) funde.push(`${f}: Firn-Seite, Titel ${titel}`);
  }
  assert.deepEqual(funde, []);
});

test('der Homescreen heisst Firn', async () => {
  for (const f of await seiten()) {
    const html = await readFile(join(root, f), 'utf8');
    const name = html.match(/name="apple-mobile-web-app-title" content="([^"]*)"/)?.[1];
    if (name !== undefined) assert.equal(name, 'Firn', `${f}: apple-mobile-web-app-title`);
  }
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  assert.doesNotMatch(`${manifest.name} ${manifest.short_name}`, /TVZA|TvZ/);
});

test('keine Beschriftung im Katalog nennt TVZA, ausser als Absender', async () => {
  const ABSENDER = new Set(['fuss.absender', 'wk.fuss']);
  for (const sprache of ['de', 'en', 'fr', 'it', 'pl', 'nl', 'es']) {
    const katalog = JSON.parse(await readFile(join(root, `assets/i18n/${sprache}.json`), 'utf8'));
    const funde = Object.entries(katalog)
      .filter(([k, v]) => !ABSENDER.has(k) && /TVZA|TvZ/.test(String(v)))
      .map(([k, v]) => `${k}: ${v}`);
    assert.deepEqual(funde, [], `${sprache}.json`);
  }
});

/* ── Das n hat eine Farbe ─────────────────────────────────────────
   Bis v.35.29.0 war das n auf hellem Grund Marken-Blau, in der Leiste
   und auf der Willkommen-Seite Alpengluehen, auf der Projektseite weiss.
   Drei Fassungen desselben Zeichens — das liest sich nicht als Anpassung,
   sondern als drei Marken. Der Grund war Kontrast: Blau faellt gegen
   Navy zusammen, helles Gluehen gegen Weiss. --firn-n traegt auf beiden.

   Dieser Test haelt zweierlei: dass keine Regel dem n eine andere Farbe
   gibt, und dass die eine Farbe auf jedem Grund der App lesbar bleibt. */

function luminanz(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function kontrast(a, b) {
  const [x, y] = [luminanz(a), luminanz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

async function alleStile() {
  const raus = [];
  async function css(verzeichnis) {
    for (const e of await readdir(join(root, verzeichnis), { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${e.name}`;
      if (e.isDirectory()) await css(pfad);
      else if (e.name.endsWith('.css')) raus.push([pfad, await readFile(join(root, pfad), 'utf8')]);
    }
  }
  await css('assets/css');
  const wurzel = (await readdir(root)).filter(f => f.endsWith('.html'));
  const unter = (await readdir(join(root, 'pages'))).filter(f => f.endsWith('.html')).map(f => `pages/${f}`);
  for (const f of [...wurzel, ...unter]) {
    const html = await readFile(join(root, f), 'utf8');
    for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) raus.push([f, m[1]]);
  }
  return raus.map(([f, q]) => [f, q.replace(/\/\*[\s\S]*?\*\//g, '')]);
}

test('das n im Wortzeichen hat auf jeder Seite dieselbe Farbe', async () => {
  const fremd = [];
  const werte = new Set();
  for (const [datei, css] of await alleStile()) {
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selektor = m[1].trim();
      const farbe = m[2].match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1]?.trim();
      if (farbe && /\.firn[^,]*\sb\b|\.firn[^,]*>\s*b\b/.test(selektor) && farbe !== 'var(--firn-n)') {
        fremd.push(`${datei}: ${selektor} { color: ${farbe} }`);
      }
    }
    for (const m of css.matchAll(/--firn-n\s*:\s*([^;]+);/g)) werte.add(m[1].trim());
  }
  assert.deepEqual(fremd, [], 'eine Regel gibt dem n eine eigene Farbe');
  assert.equal(werte.size, 1, `--firn-n hat verschiedene Werte: ${[...werte].join(', ')}`);
});

test('die Farbe des n traegt auf hellem, dunklem und Navy-Grund', async () => {
  const kit = await readFile(join(root, 'assets/css/kit.css'), 'utf8');
  const n = kit.match(/--firn-n:\s*(#[0-9A-Fa-f]{6});/)?.[1];
  assert.ok(n, '--firn-n fehlt in kit.css');
  const alle = name => [...kit.matchAll(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6});`, 'g'))].map(m => m[1]);
  /* Erster Treffer: helles Thema, zweiter: dunkles. Navy ist die Leiste. */
  const gruende = {
    'hell --bg': alle('--bg')[0], 'hell --surface': alle('--surface')[0],
    'dunkel --bg': alle('--bg')[1], 'dunkel --surface': alle('--surface')[1],
    'Leiste --brand-navy': alle('--brand-navy')[0],
  };
  for (const [ort, grund] of Object.entries(gruende)) {
    assert.ok(grund, `${ort} nicht gefunden`);
    /* 3:1 ist die Schwelle fuer grosse, fette Schrift — das n ist 900. */
    assert.ok(kontrast(n, grund) >= 3, `${ort} (${grund}): nur ${kontrast(n, grund).toFixed(2)} : 1`);
  }
});

/* ── Der Name steht einmal ────────────────────────────────────────
   Bis v.35.35.0 stand "Timothy van Zanten" auf der Projektseite viermal
   sichtbar, auf Start und Willkommen nackt unter dem Firn-Zeichen — als
   gehoere der Name zum Logo. Jetzt: je Seite hoechstens einmal, und nur
   als "betrieben von …" (fuss.betrieben). Die Beschreibung im <head>
   sieht niemand auf der Seite; sie bleibt aussen vor. */

test('der Name des Betreibers steht je Seite hoechstens einmal, als „betrieben von"', async () => {
  const wurzel = (await readdir(root)).filter(f => f.endsWith('.html'));
  const unter = (await readdir(join(root, 'pages'))).filter(f => f.endsWith('.html')).map(f => `pages/${f}`);
  const funde = [];
  for (const f of [...wurzel, ...unter]) {
    const html = (await readFile(join(root, f), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
    const koerper = html.slice(html.indexOf('<body'));
    const zeilen = koerper.match(/<[a-z]+[^>]*data-i18n="fuss\.betrieben"[^>]*>[^<]*</g) || [];
    if (zeilen.length > 1) funde.push(`${f}: ${zeilen.length}× betrieben von`);
    const rest = zeilen.reduce((k, z) => k.replace(z, ''), koerper);
    if (/Timothy van Zanten/.test(rest)) funde.push(`${f}: der Name steht ausserhalb von fuss.betrieben`);
  }
  assert.deepEqual(funde, []);

  const katalog = JSON.parse(await readFile(join(root, 'assets/i18n/de.json'), 'utf8'));
  assert.equal(katalog['fuss.betrieben'], 'betrieben von {wer}');
  assert.deepEqual(Object.entries(katalog).filter(([, v]) => /Timothy/.test(v)), [],
    'ein Name gehoert in data-i18n-vars, nicht in den Katalog');
});

/* ── Die Projektseite ist TVZAs ───────────────────────────────────
   Bis v.35.36.0 stand auf public.html — Timos Projekte, TVZAs eigene
   Seite — oben und in der Fusstafel das Firn-Zeichen, und die
   Versionszeile sagte "Firn · v…". Jetzt traegt die Seite TVZA; die
   Versionszeile nimmt ihr Zeichen aus <body data-marke>. */

test('die Projektseite traegt das Zeichen TVZA, nicht Firn', async () => {
  const html = await readFile(join(root, 'public.html'), 'utf8');
  assert.equal((html.match(/<span class="tvza">TVZA<\/span>/g) || []).length, 2, 'Kopf und Fusstafel');
  assert.doesNotMatch(html, /Fir<b>n<\/b>/, 'das Firn-Zeichen steht wieder auf der Projektseite');
  assert.match(html, /<body[^>]*data-marke="TVZA"/);
});

test('die Versionszeile nimmt das Zeichen der Seite, sonst Firn', async () => {
  const { JSDOM } = await import('jsdom');
  const fx = await readFile(join(root, 'assets/js/ui-fx.js'), 'utf8');
  const version = fx.match(/APP_VERSION = "([^"]+)"/)[1];
  const zeile = async seite => {
    const html = (await readFile(join(root, seite), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const { window } = new JSDOM(html, { runScripts: 'outside-only', url: 'https://firn.test/' + seite });
    window.matchMedia = () => ({ matches: true, addEventListener() {}, addListener() {} });
    window.eval(fx);
    /* ui-fx.js wartet auf DOMContentLoaded, solange die Seite noch laedt. */
    if (window.document.readyState === 'loading') {
      await new Promise(r => window.document.addEventListener('DOMContentLoaded', r));
    }
    return window.document.querySelector('.fx-version')?.textContent;
  };
  assert.equal(await zeile('public.html'), `TVZA · ${version}`);
  assert.equal(await zeile('pages/guest.html'), `Firn · ${version}`);
});

/* ── Das TVZA-Symbol (v.35.38.0) ──────────────────────────────────
   Bis dahin zeigte der Tab der Projektseite das Firn-Symbol. Jetzt
   hat TVZA ein eigenes: ein T, dessen Balken glueht. Die PNG fuers
   iPhone rechnet dev/tvza-symbol-png.mjs aus den Zahlen im SVG — dieser
   Test prueft, dass sie genau das ist, also nicht vom SVG abweicht. */

test('die Projektseite zeigt im Tab das TVZA-Symbol', async () => {
  const html = await readFile(join(root, 'public.html'), 'utf8');
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="assets\/icons\/tvza\.svg"/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/icons\/tvza-192\.png"/);
  assert.doesNotMatch(html, /icons\/firn/, 'ein Firn-Symbol haengt noch an der Projektseite');
});

test('das TVZA-Symbol ist maskierbar, und die PNG ist das SVG', async () => {
  const { leseSymbol, zeichne, png } = await import('./tvza-symbol-png.mjs');
  const svg = await readFile(join(root, 'assets/icons/tvza.svg'), 'utf8');
  const symbol = leseSymbol(svg);

  /* Android schneidet einen Kreis mit Radius 25.6 um die Mitte (32, 32). */
  for (const r of symbol.rechtecke) {
    for (const [x, y] of [[r.x, r.y], [r.x + r.b, r.y], [r.x, r.y + r.h], [r.x + r.b, r.y + r.h]]) {
      assert.ok(Math.hypot(x - 32, y - 32) <= 25.6, `Ecke (${x}, ${y}) liegt ausserhalb der Maske`);
    }
  }

  const datei = await readFile(join(root, 'assets/icons/tvza-192.png'));
  assert.equal(datei.readUInt32BE(16), 192);
  assert.equal(datei.readUInt32BE(20), 192);
  assert.ok(png(zeichne(symbol)).equals(datei),
    'tvza-192.png passt nicht zum SVG — node dev/tvza-symbol-png.mjs laufen lassen');
});
