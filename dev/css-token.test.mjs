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
  for (const ort of ['.', 'pages', 'assets/js']) {
    const verzeichnis = join(WURZEL, ort);
    for (const name of await readdir(verzeichnis)) {
      if (/[.](html|js)$/.test(name)) raus.push(await readFile(join(verzeichnis, name), 'utf8'));
    }
  }
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
