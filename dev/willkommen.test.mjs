/* Die Willkommen-Seite.
 *
 * Sie ist das Erste, was jemand von Firn sieht, der noch kein Konto
 * hat. Zwei Dinge muss sie koennen: sagen, was das ist, und den Weg
 * zum Konto zeigen.
 *
 * Was hier geprueft wird, sind nicht die Formulierungen — die aendern
 * sich. Geprueft wird, dass die Seite nichts verspricht, was die App
 * nicht kann, und dass die Wege stimmen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const lies = name => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('die Seite haelt die Seiten-Invariante', async () => {
  const html = await lies('willkommen.html');

  assert.doesNotMatch(html, /<style[\s>]/, 'style-Block auf der Seite');
  assert.doesNotMatch(html, /\sstyle="/, 'style-Attribut auf der Seite');
  assert.doesNotMatch(html, /<script type="module">/, 'Inline-Modul auf der Seite');

  /* Hex-Farben nur in theme-color: der Rest kommt aus dem Kit, sonst
     laeuft die Marke auf einer Seite anders als in der App. */
  const hex = [...html.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map(m => m[0]);
  const erlaubt = [...html.matchAll(/theme-color" content="(#[0-9A-Fa-f]{3,8})"/g)].map(m => m[1]);
  assert.deepEqual(hex.filter(h => !erlaubt.includes(h) && h !== '#beta'), [],
    'Hex-Farbe ausserhalb von theme-color');
});

test('sie fuehrt zum Konto und nicht zu den Projekten', async () => {
  const html = await lies('willkommen.html');

  assert.match(html, /href="login\.html\?neu=1"/,
    'kein Weg zur Kontoerstellung');
  assert.match(html, /href="login\.html"/, 'kein Weg zur Anmeldung');

  /* Die oeffentliche Projektseite ist ein Link, den man verschickt.
     Sie darf von hier aus nicht erreichbar sein — sonst landet jeder
     Besucher doch wieder dort. */
  assert.doesNotMatch(html, /public\.html/,
    'die Willkommen-Seite verlinkt die Projektseite');
});

test('login.html oeffnet bei ?neu=1 die Registrierung', async () => {
  const login = await lies('login.html');
  assert.match(login, /params\.get\('neu'\) === '1'\) setMode\('register'\)/,
    'der Link von der Willkommen-Seite landet im Anmelde-Modus');
});

test('sie verspricht nur, was die App heute kann', async () => {
  const html = await lies('willkommen.html');

  /* Einladungsmails werden nicht zugestellt — es laeuft kein Worker,
     der die mail-Sammlung leert. Wer das hier verspricht, verliert
     den ersten Nutzer am ersten Tag. */
  assert.doesNotMatch(html, /per (E-?Mail|Mail) ein(laden|geladen)/i,
    'die Seite verspricht Einladungen per Mail — die kommen nicht an');

  /* Das Kalender-Abo braucht den Worker, und der ist nirgends
     ausgerollt. */
  assert.doesNotMatch(html, /abonnier/i,
    'die Seite verspricht ein Kalender-Abo — dafuer laeuft kein Worker');

  /* Und der Satz zum Video muss der dauerhaft wahre bleiben: die
     AUSWERTUNG laeuft im Browser. Das Video selbst wird sehr wohl
     gespeichert. */
  assert.match(html, /Auswertung läuft im Browser/,
    'der Satz zur Videoanalyse fehlt oder behauptet mehr als er darf');
  assert.doesNotMatch(html, /nicht hochgeladen/,
    'die Seite behauptet, das Video werde nicht hochgeladen — das stimmt nicht');
});

test('kein Preis, solange es keinen gibt', async () => {
  const html = await lies('willkommen.html');

  const preise = html.match(/(CHF|EUR|€|\$)\s*\d/g) || [];
  assert.deepEqual(preise, [],
    'eine Zahl auf der Seite, die es noch nicht gibt — der Abo-Teil ist Beta');
  assert.match(html, /Beta/, 'die Seite sagt nicht, dass Firn Beta ist');
});

test('sie steht im Vorrat des Service Workers', async () => {
  const sw = await lies('sw.js');
  assert.match(sw, /'\.\/willkommen\.html'/,
    'die Willkommen-Seite fehlt im Vorrat — offline ist sie dann leer');
  assert.match(sw, /willkommen\.css/,
    'das Stylesheet fehlt im Vorrat — die Seite kaeme ohne Layout');
});
