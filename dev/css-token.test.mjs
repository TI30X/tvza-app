/* Tests fuer die CSS-Variablen — gegen den Fehler, der still bleibt.
 *
 * ── Warum es diese Datei gibt ─────────────────────────────────────
 * Seit v.33.7.0 stand ueber der Abstands-Skala in kit.css ein
 * Kommentar, der ein Ende zu frueh setzte. Der Rest des Textes landete damit
 * als Deklaration im :root-Block, und CSS verwirft eine kaputte
 * Deklaration bis zum naechsten Semikolon — das war der von
 *
 *     --space: clamp(3.4px, 0.25vw + 2.5px, 4px);
 *
 * Also war --space undefiniert. Also waren --s1 bis --s7 alle
 * calc(var(--space) * N) und damit ungueltig. Also fiel JEDES
 * padding: var(--sN) in der ganzen App auf 0 zurueck.
 *
 * Sichtbar war das als "die Schrift haftet an allen Ecken": die
 * Anmeldekarte hatte gemessene padding: 0px, obwohl in der Regel
 * var(--s6) stand. Kein Fehler in der Konsole, kein roter Test —
 * die Seite sah nur falsch aus, und zwar ueberall gleichzeitig.
 *
 * Ein Zeichen, das die halbe Oberflaeche umwirft und sich nirgends
 * meldet, gehoert in einen Test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');

async function alleStile(verzeichnis = join(WURZEL, 'assets', 'css')) {
  const raus = [];
  for (const eintrag of await readdir(verzeichnis, { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) raus.push(...await alleStile(pfad));
    else if (eintrag.name.endsWith('.css')) {
      raus.push([relative(WURZEL, pfad).split(sep).join('/'), await readFile(pfad, 'utf8')]);
    }
  }
  return raus;
}

/** CSS-Kommentare schachteln NICHT: ein Anfang im Rumpf ist nur Text. */
function kommentarFehler(quelle) {
  const raus = { verwaist: [], offen: null };
  let drin = false, anfang = 0, i = 0;
  const zeile = pos => quelle.slice(0, pos).split('\n').length;

  while (i < quelle.length) {
    if (!drin && quelle.startsWith('/*', i)) { drin = true; anfang = i; i += 2; continue; }
    if (!drin && quelle.startsWith('*/', i)) { raus.verwaist.push(zeile(i)); i += 2; continue; }
    if (drin && quelle.startsWith('*/', i)) { drin = false; i += 2; continue; }
    i += 1;
  }
  if (drin) raus.offen = zeile(anfang);
  return raus;
}

const ohneKommentare = q => q.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Alles, was eine Variable setzen kann: Markup inline, Module per setProperty. */
async function markup() {
  const raus = [];
  /* assets/js samt Unterordnern: die Seitenmodule in feature/ setzen
     ihre Variablen genauso (seit v.35.49.0 etwa --farbe je Eintrag im
     Kalender). */
  async function lesen(ort, tief) {
    const verzeichnis = join(WURZEL, ort);
    for (const e of await readdir(verzeichnis, { withFileTypes: true })) {
      if (e.isDirectory() && tief) await lesen(join(ort, e.name), tief);
      else if (/[.](html|js)$/.test(e.name)) raus.push(await readFile(join(verzeichnis, e.name), 'utf8'));
    }
  }
  await lesen('.', false);
  await lesen('pages', false);
  await lesen('assets/js', true);
  return raus;
}

test('kein Kommentar endet zu frueh oder gar nicht', async () => {
  /* DER Test. Ein verwaistes Kommentarende mitten in :root frisst die naechste
     Deklaration mit auf, und die naechste war die Abstands-Skala. */
  for (const [name, quelle] of await alleStile()) {
    const fehler = kommentarFehler(quelle);
    assert.deepEqual(fehler.verwaist, [],
      `${name}: Kommentarende ohne offenen Kommentar in Zeile ${fehler.verwaist.join(', ')} — `
      + 'alles danach bis zum naechsten Semikolon wird von CSS verworfen');
    assert.equal(fehler.offen, null,
      `${name}: Kommentar ab Zeile ${fehler.offen} wird nie geschlossen`);
  }
});

test('jede benutzte Variable ohne Rueckfallwert ist auch definiert', async () => {
  /* var(--x, 64px) ist in Ordnung: --tvza-shell-top und -bottom setzt
     die Huelle zur Laufzeit, darum steht dort ein Rueckfall. var(--x)
     ohne Rueckfall ist dagegen ein Versprechen, das die Dateien
     zusammen halten muessen.

     Das Markup zaehlt als Definitionsort mit — planner.html setzt
     --source-color je Kalenderquelle inline am Element. */
  const stile = await alleStile();
  const definiert = new Set();

  for (const [, quelle] of stile) {
    for (const m of ohneKommentare(quelle).matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) definiert.add(m[1]);
  }
  for (const seite of await markup()) {
    for (const m of seite.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) definiert.add(m[1]);
    for (const t of seite.matchAll(/setProperty\(\s*['"`](--[A-Za-z0-9-]+)/g)) definiert.add(t[1]);
  }

  for (const [name, quelle] of stile) {
    for (const m of ohneKommentare(quelle).matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*([,)])/g)) {
      if (m[2] === ',') continue;                       // hat einen Rueckfallwert
      assert.ok(definiert.has(m[1]), `${name}: var(${m[1]}) ist nirgends definiert`);
    }
  }
});

test('die Abstands-Skala steht vollstaendig und haengt an einem Grundwert', async () => {
  const kit = ohneKommentare(await readFile(join(WURZEL, 'assets/css/kit.css'), 'utf8'));

  assert.match(kit, /--space:\s*clamp\(/,
    '--space fehlt oder ist nicht mehr fluid — ohne clamp() waechst die '
    + 'Skala auf grossen Bildschirmen ins Alberne');

  for (const stufe of ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7']) {
    const treffer = kit.match(new RegExp(`${stufe}:\s*([^;]+);`));
    assert.ok(treffer, `${stufe} fehlt`);
    assert.match(treffer[1], /var\(--space\)/,
      `${stufe} rechnet nicht mehr mit --space — dann ist die Skala keine Skala mehr`);
  }
});

test('die Anmeldeseite rechnet in Stufen, nicht in erfundenen Zahlen', async () => {
  /* Die Seite hatte padding: var(--s6) 28px, margin-bottom: 14px,
     margin-top: 18px — Werte, die zu nichts sonst in der App passen
     und auf keiner Bildschirmgroesse mitwachsen. */
  const html = await readFile(join(WURZEL, 'login.html'), 'utf8');
  const stil = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  assert.ok(stil.trim(), 'kein <style>-Block in login.html gefunden');

  const treffer = [...ohneKommentare(stil)
    .matchAll(/\b(padding|margin|gap|inset)[a-z-]*\s*:\s*([^;}]+)/g)]
    .filter(m => /\d+(\.\d+)?px/.test(m[2]));

  assert.deepEqual(treffer.map(m => `${m[1]}: ${m[2].trim()}`), [],
    'harte px-Werte im Stil der Anmeldeseite — dafuer gibt es --s1 bis --s7');
});

/* ── Jeder Abstand im Kit kommt aus der Skala ─────────────────────
   Bis v.35.23.0 standen in kit.css 137 Abstaende mit freien Pixeln —
   6, 10, 13, 14 … — neben 125 aus der Skala. Mehr als die Haelfte. Das
   Auge sieht das nicht als einzelnen Fehler, sondern als Unruhe: der
   Leertext beginnt woanders als die Ueberschrift, eine Zeile hat 13
   Pixel Luft, die naechste 12, der Knopf darunter 20.

   Die Regel, die dieser Test haelt:
   - padding, margin und gap ab 4 Pixeln nehmen eine Stufe --s1…--s7
     (oder rechnen mit ihnen in calc);
   - clamp(…) bleibt frei — das ist absichtlich fliessend;
   - unter 4 Pixeln und negative Werte sind Geometrie, keine Abstaende
     (ein Haarstrich, ein Punkt, der ueber einer Ecke sitzt).

   Er gilt fuer kit.css, das Bauteil jeder Seite. Die Seiten-Stile in
   feature/ sind der naechste Schritt. */
/* Freie Pixel in padding, margin und gap — ab 4 Pixeln, ausserhalb von
   clamp() und var(). */
function freiePixel(roh) {
  const code = roh.replace(/\/\*[\s\S]*?\*\//g, '');
  const funde = [];
  const re = /(?:^|[;{\s])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g;
  for (const m of code.matchAll(re)) {
    const frei = m[2].replace(/clamp\((?:[^()]|\([^()]*\))*\)|var\([^()]*\)/g, '');
    for (const px of frei.matchAll(/(^|[^\w.-])(\d+(?:\.\d+)?)px\b/g)) {
      if (Number(px[2]) > 3) funde.push(`${m[1]}: ${m[2].trim()}`);
    }
  }
  return funde;
}

test('jeder Abstand in kit.css kommt aus der Skala', async () => {
  const funde = freiePixel(await readFile(join(WURZEL, 'assets', 'css', 'kit.css'), 'utf8'));
  assert.deepEqual(funde, [], `Abstaende mit freien Pixeln:\n  ${funde.join('\n  ')}`);
});

/* Seit v.35.28.0 auch die Seiten-Stile. Dort standen noch 273 freie
   Werte, fast alle im Kalender und in der Maturaarbeit. Nachgemessen,
   Element fuer Element: der Kalender-Monat verschob sich am Handy an drei
   Stellen um hoechstens 3 Pixel, die Monatszellen blieben gleich hoch;
   die Maturaarbeit wurde um 2,4 % luftiger, weil Werte wie 10 und 20 bei
   Gleichstand auf die groessere Stufe gehen. */
test('jeder Abstand in den Seiten-Stilen kommt aus der Skala', async () => {
  const funde = [];
  for (const [datei, roh] of await alleStile()) {
    if (!datei.startsWith('assets/css/feature/')) continue;
    for (const f of freiePixel(roh)) funde.push(`${datei} — ${f}`);
  }
  assert.deepEqual(funde, [], `Abstaende mit freien Pixeln:\n  ${funde.join('\n  ')}`);
});
