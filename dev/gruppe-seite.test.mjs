/* Tests für die Gruppenseite — Markup gegen Skript.
 *
 * Diese Datei fängt eine Fehlerklasse, die weder der Syntaxcheck noch
 * die Regeltests sehen: eine Element-ID, die im Skript steht und im
 * Markup fehlt (oder umgekehrt). Das Ergebnis ist ein Knopf, der nichts
 * tut, oder ein $(...) auf null — und beides fällt erst auf, wenn
 * jemand angemeldet auf der Seite steht.
 *
 * Beim Bauen ist genau so ein Fehler entstanden: eine Shell-Ersetzung
 * hat die Anführungszeichen aus $('fArt') gefressen, woraus $(fArt)
 * wurde. Syntaktisch gültig, zur Laufzeit ein ReferenceError. Der Test
 * unten würde ihn nicht fangen, der letzte in dieser Datei schon.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(join(root, name), 'utf8');
const seite = () => read('pages/gruppe.html');
const skript = () => read('assets/js/feature/gruppe/gruppe.js');

function idsImMarkup(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
}

function idsImSkript(js) {
  return new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
}

test('jede vom Skript gesuchte ID gibt es im Markup', async () => {
  const [html, js] = await Promise.all([seite(), skript()]);
  const vorhanden = idsImMarkup(html);

  const fehlend = [...idsImSkript(js)].filter(id => !vorhanden.has(id));
  assert.deepEqual(fehlend, [], `IDs ohne Element in gruppe.html: ${fehlend}`);
});

test('kein $(...) ohne Anführungszeichen', async () => {
  const js = await skript();

  /* $(fArt) statt $('fArt') ist syntaktisch gültig und zur Laufzeit ein
     ReferenceError. Genau das ist beim Bauen einmal passiert, weil die
     Shell die Anführungszeichen geschluckt hat. */
  const nackt = [...js.matchAll(/\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g)]
    .map(m => m[1])
    .filter(name => name !== 'id');   // die Hilfsfunktion selbst

  assert.deepEqual(nackt, [], `$(...) ohne Anführungszeichen: ${nackt}`);
});

test('jeder data-Haken im Skript hat ein Gegenstück im Markup', async () => {
  const [html, js] = await Promise.all([seite(), skript()]);

  /* closest('[data-…]') sucht etwas, das entweder statisch im Markup
     steht oder vom Skript selbst erzeugt wird. Beides zählt. */
  const gesucht = [...js.matchAll(/closest\('\[data-([a-z-]+)\]'\)/g)].map(m => m[1]);
  assert.ok(gesucht.length > 0, 'keine data-Haken gefunden — Test veraltet?');

  for (const haken of gesucht) {
    const imMarkup = html.includes(`data-${haken}=`);
    const imSkript = js.includes(`data-${haken}="`);
    assert.ok(imMarkup || imSkript, `data-${haken} wird gesucht, aber nirgends gesetzt`);
  }
});

test('die Zusage ist eine Frage mit drei Antworten, keine drei Knöpfe', async () => {
  const [html, css] = await Promise.all([seite(), read('assets/css/kit.css')]);

  // Vorher standen dort drei Knöpfe in voller Breite untereinander. Das
  // las sich wie drei Angebote und kostete am Handy die halbe
  // Bildschirmhöhe für eine Entscheidung aus einem Tippen.
  assert.match(html, /<div class="seg" id="zusageKnoepfe" role="group"/);
  assert.doesNotMatch(html, /b--block" type="button" data-antwort/);

  // Der Zustand hängt an aria-pressed, nicht an einer Klasse: so lesen
  // Auge und Screenreader dieselbe Wahrheit.
  assert.match(css, /\.seg__item\[aria-pressed="true"\]/);
  assert.match(html, /data-antwort="ja" aria-pressed="false"/);

  // Eine Schiene, keine Reihe von Knöpfen mit Trennstrichen: neben
  // einer gefüllten Fläche trennt ein Strich nichts mehr und steht als
  // Balken verloren daneben.
  assert.doesNotMatch(css, /\.seg__item \{[\s\S]*?border-right: 1px/);
  assert.match(css, /\.seg \{[\s\S]*?background: var\(--surface-2\)/);

  // Die Gesamthöhe bleibt bei 46px (40 + 2×3 Polster), sonst wird das
  // Segment am Handy zum Zielproblem.
  assert.match(css, /\.seg__item \{[\s\S]*?min-height: 40px/);
  assert.match(css, /\.seg \{[\s\S]*?padding: 3px/);
});

test('Zurück ist Navigation, keine Handlung', async () => {
  const [html, css] = await Promise.all([seite(), read('assets/css/kit.css')]);

  // Als Knopf über die volle Breite stand es gleichberechtigt neben
  // "Leitung übergeben" — was es ganz sicher nicht ist.
  assert.doesNotMatch(html, /b--block" id="btnZurueck"/);
  assert.doesNotMatch(html, /b--block" id="btnPersonZurueck"/);
  assert.match(html, /class="backlink" id="btnZurueck"/);
  assert.match(html, /class="backlink" id="btnPersonZurueck"/);
  assert.match(css, /\.backlink \{/);
});

test('das Rennergebnis steht nicht bei der Anmeldung', async () => {
  const [html, js] = await Promise.all([seite(), skript()]);

  // Zwei Gründe: eine Anmeldung fragt nach vorn, ein Ergebnis blickt
  // zurück — und ein Rennen hat ein Ergebnis PRO ATHLET, nicht eines
  // für die ganze Gruppe. Das gehört ins Profil des Athleten.
  for (const id of ['grpErgebnis', 'eRang', 'eZeit', 'ePunkte', 'btnErgebnis']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${id} gehört nicht auf die Anmeldung`);
    assert.doesNotMatch(js, new RegExp(`\\$\\('${id}'\\)`), `${id} wird noch angesprochen`);
  }
});

test('die Abstände kommen alle aus einer Skala', async () => {
  const css = await read('assets/css/kit.css');

  // Eine Zeile bestimmt den Rhythmus der ganzen App, und die Stufen
  // sind Vielfache davon — keine freien Zahlen, die zufällig
  // nebeneinanderstehen.
  assert.match(css, /--space: clamp\(/);
  for (const stufe of ['s1', 's2', 's3', 's4', 's5', 's6', 's7']) {
    assert.match(css, new RegExp(`--${stufe}: calc\\(var\\(--space\\)`), `--${stufe} hängt nicht an der Skala`);
  }

  // Untereinander gesetzt wird mit gap, nicht mit margin an jedem Kind:
  // ein vergessenes margin klebt zwei Elemente zusammen, ein gap kann
  // man nicht vergessen.
  assert.match(css, /\.stack \{ display: flex; flex-direction: column; gap: var\(--s3\); \}/);
  assert.match(css, /\.form-card \{[\s\S]*?display: flex; flex-direction: column; gap: var\(--s3\);/);
});

test('das Profil sehen alle, verwalten darf es nur der Kopf', async () => {
  const js = await skript();

  // Ein Kader, in dem niemand weiss, wer wie fährt, ist kein Kader.
  // Das Profil steht deshalb allen offen …
  assert.match(js, /function personOeffnen\(uid\) \{\s*\n\s*if \(!aktiv\) return;/);
  assert.doesNotMatch(js, /if \(!aktiv \|\| !fuehrt\(aktiv\.meineRolle\)\) return;/);

  // … und was man DARF, entscheidet die Rolle, Knopf für Knopf.
  assert.match(js, /const darfVerwalten = fuehrt\(aktiv\.meineRolle\)/);
  assert.match(js, /zeige\('grpRolle', darfVerwalten\)/);
  assert.match(js, /\$\('btnUebergeben'\)\.hidden = !darfVerwalten \|\| istKopf \|\| ichSelbst/);
  assert.match(js, /\$\('btnEntfernen'\)\.hidden = !darfVerwalten \|\| istKopf/);

  // Am Kopf lässt sich die Rolle nicht drehen — er übergibt zuerst,
  // sonst stünde die Gruppe ohne Kopf da.
  assert.match(js, /btn\.disabled = istKopf/);
});

test('FIS-Punkte werden gerechnet, nicht gespeichert', async () => {
  const [js, groups, rules] = await Promise.all([
    skript(), read('assets/js/groups.js'), read('firestore.rules'),
  ]);

  // Gespeichert werden Zeiten. Stünden die Punkte im Dokument, wären
  // sie falsch, sobald die FIS einen Faktor ändert — die Formel gehört
  // an eine Stelle, nicht in jedes Dokument.
  assert.match(js, /rennpunkte\(ergebnis\.zeit, ergebnis\.siegerZeit, rennen\.disziplin\)/);
  const block = rules.slice(rules.indexOf('match /groups/{gid}/ergebnisse/{id}'));
  const schema = block.slice(0, block.indexOf('allow delete'));
  assert.doesNotMatch(schema, /'punkte'/, 'Punkte gehören nicht ins Dokument');
  assert.match(schema, /'zeit', 'siegerZeit'/);

  // Ein Ergebnis pro Athlet UND Rennen — die zusammengesetzte ID
  // verhindert Dubletten, ohne dass jemand danach suchen müsste.
  assert.match(schema, /id == request\.resource\.data\.eventId \+ '__' \+ request\.resource\.data\.uid/);
  assert.match(groups, /return `\$\{eventId\}__\$\{uid\}`/);
});

test('ohne Zuschlag heisst es Rennpunkte und nicht FIS-Punkte', async () => {
  const js = await skript();

  // Der Zuschlag entsteht aus den Punkten des ganzen Feldes und käme
  // aus der FIS-Datenbank. Eine Zahl, die amtlich aussieht und keine
  // ist, wäre schlimmer als gar keine — also wird sie gekennzeichnet.
  assert.match(js, /\$\{punkte\.toFixed\(2\)\}\*/);
  assert.match(js, /nur Rennpunkte — der Zuschlag ist nicht bekannt/);
  assert.match(js, /\$\{gesamt\.toFixed\(2\)\} FIS-Punkte mit Zuschlag/);
});

test('es gibt einen Weg in eine Gruppe hinein', async () => {
  const [html, js, groups] = await Promise.all([
    seite(), skript(), read('assets/js/groups.js'),
  ]);

  // Ohne Beitritt per Code könnte niemand einem Kader beitreten: die
  // Leitung kann Leute nur über ihre uid aufnehmen, und die kennt kein
  // Trainer.
  assert.match(html, /id="btnBeitreten"/);
  assert.match(js, /codeEinloesen/);
  assert.match(groups, /export async function beitreten\(kennung, uid\)/);

  // Wer beitritt, ernennt sich nicht selbst zum Trainer.
  assert.match(groups, /\{ uid, rolle: 'mitglied', seit: serverTimestamp\(\), code: sauber \}/);
});
