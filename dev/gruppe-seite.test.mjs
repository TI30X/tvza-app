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

  // 44px, sonst wird ein Segment am Handy zum Zielproblem.
  assert.match(css, /\.seg__item \{[\s\S]*?min-height: 44px/);
});

test('Rollen ändert nur der Kopf — auch in der Oberfläche', async () => {
  const js = await skript();

  // Die Regel besteht darauf; die Oberfläche soll gar nicht erst etwas
  // anbieten, das scheitern würde.
  assert.match(js, /function personOeffnen\(uid\) \{\s*\n\s*if \(!aktiv \|\| !fuehrt\(aktiv\.meineRolle\)\) return;/);

  // Am Kopf lässt sich die Rolle nicht drehen, und entfernen lässt er
  // sich auch nicht — er übergibt zuerst, sonst stünde die Gruppe ohne
  // Kopf da.
  assert.match(js, /btn\.disabled = istKopf/);
  assert.match(js, /\$\('btnEntfernen'\)\.hidden = istKopf/);
  // An sich selbst übergibt niemand.
  assert.match(js, /\$\('btnUebergeben'\)\.hidden = istKopf \|\| ichSelbst/);
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
