/* Die Anmeldeseite in sieben Sprachen.
 *
 * Sie ist die Haustuer: der erste Schritt hinter der Willkommen-Seite.
 * Bis v.35.6.0 hatte sie genau EINEN Schluessel und war ansonsten
 * deutsch — und sie trug "TVZA", obwohl der Besucher gerade Firn
 * gelesen hatte.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const lies = name => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('das Wortzeichen steht auf der Anmeldeseite', async () => {
  const html = await lies('login.html');
  assert.match(html, /class="firn">Fir<b>n<\/b>/,
    'die Anmeldeseite zeigt nicht das Wortzeichen');
  assert.doesNotMatch(html, /<div class="login-logo">TVZA<\/div>/,
    'sie zeigt noch TVZA, obwohl der Besucher gerade Firn gesehen hat');
});

test('kein Produktname mehr in den Saetzen', async () => {
  /* Ein Produktname mitten in einem Satz muss bei jeder Umbenennung
     in sieben Sprachen nachgezogen werden. Die Saetze kommen ohne
     aus. */
  const de = JSON.parse(await lies('assets/i18n/de.json'));
  for (const [key, wert] of Object.entries(de)) {
    if (!key.startsWith('login.') || key === 'login.titel') continue;
    assert.doesNotMatch(wert, /TVZA|Firn/,
      `${key} nennt das Produkt im Satz: ${wert}`);
  }
});

test('der Moduswechsel ueberlebt den Katalog', async () => {
  const html = await lies('login.html');

  /* Der Katalog kommt asynchron, und applyTo() setzt danach jedes
     Element mit data-i18n neu — auch die zwei, die setMode() gerade
     gesetzt hat. Ohne diese beiden Zeilen steht das Formular im
     Registrier-Modus da und traegt "Anmelden" auf dem Knopf. */
  assert.match(html, /TVZAI18n\?\.ready\?\.then\(\(\) => setMode\(mode\)\)/,
    'nach dem ersten Anwenden des Katalogs wird der Modus nicht neu gesetzt');
  assert.match(html, /addEventListener\('tvza-lang-change', \(\) => setMode\(mode\)\)/,
    'nach einem Sprachwechsel wird der Modus nicht neu gesetzt');

  /* Die Beschriftung neben dem Link haengt an einer id und nicht an
     firstChild: seit sie in einem span mit Schluessel steht, ist
     firstChild ein Leerraum-Knoten. */
  assert.match(html, /id="switchLabel"/, 'die Beschriftung hat keine id');
  assert.doesNotMatch(html, /switchText'\)\.firstChild/,
    'der Moduswechsel beschriftet wieder einen Leerraum-Knoten');
});

test('die Fehlermeldung beim Anmelden bleibt unbestimmt', async () => {
  /* Wer "unbekannte Adresse" von "falsches Passwort" unterscheidet,
     verraet Fremden, welche Adressen ein Konto haben. Das muss in
     JEDER Sprache so bleiben — eine hilfsbereitere Uebersetzung waere
     hier ein Sicherheitsfehler. */
  const verraeterisch = /(nicht gefunden|not found|unbekannt|unknown|introuvable|non trovat|nie znaleziono|niet gevonden|no encontrad|no existe|kein Konto|no account)/i;

  for (const sprache of ['de', 'en', 'fr', 'it', 'pl', 'nl', 'es']) {
    const katalog = JSON.parse(await lies(`assets/i18n/${sprache}.json`));
    assert.doesNotMatch(katalog['login.fehler.anmelden'], verraeterisch,
      `login.fehler.anmelden in ${sprache} verraet, ob es das Konto gibt`);
  }
});

test('jede Meldung im Modul haengt an einem Schluessel', async () => {
  const html = await lies('login.html');
  const modul = html.slice(html.indexOf('<script type="module">'));

  /* showErr() und die Knopfbeschriftung duerfen keinen nackten
     deutschen Satz mehr bekommen. */
  const nackt = [...modul.matchAll(/showErr\('([^']{12,})'\)/g)].map(m => m[1]);
  assert.deepEqual(nackt, [],
    'showErr() bekommt einen deutschen Satz ohne Schluessel');
});
