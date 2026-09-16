/* Die Nutzungsbedingungen (v.35.53.0, Fassung 2 in v.35.70.0). Michel:
 * "Wir müssen aber auch mal Nutzungsbedingungen schaffen" — und über die
 * Preise: "muss aber nirgends stehen".
 *
 * Fassung 2 ist Michels Entwurf. Drei Zusagen dieses Tests haben sich
 * damit geändert, und zwar mit Grund:
 *
 * 1. Die Abschnitte heissen anders (Betreiber, Angebot und Testphase,
 *    Dein Konto, …). Geprüft wird weiterhin, DASS die Themen dastehen,
 *    nicht wie sie überschrieben sind.
 * 2. Das Wort "Preis" ist jetzt erlaubt — in genau einem Satz, der
 *    sagt, dass Kosten eine ausdrückliche Vereinbarung voraussetzen.
 *    Verboten bleibt, was es nicht gibt: eine ZAHL. Der alte Test
 *    verbot das Wort und hätte damit auch den Schutz verboten.
 * 3. Neu: die Haftung. Ein vorgängiger Ausschluss für Vorsatz und
 *    grobe Fahrlässigkeit ist nach Art. 100 OR nichtig — Fassung 1
 *    stand hart an dieser Grenze ("Im Übrigen haften wir nicht").
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');
const ohneKommentare = s => s.replace(/<!--[\s\S]*?-->/g, '');

test('die Nutzungsbedingungen stehen, und man findet sie, bevor man Ja sagt', async () => {
  const [nb, login, wk, sw] = await Promise.all([
    read('nutzung.html'), read('login.html'), read('willkommen.html'), read('sw.js'),
  ]);
  const text = ohneKommentare(nb);
  for (const teil of ['Betreiber', 'Testphase', 'Dein Konto', 'Gruppen und Berechtigungen',
    'Eigene Inhalte', 'Zulässige Nutzung', 'Training und Gesundheit', 'KI-Assistent',
    'Datenschutz', 'Beendigung und Sperrung', 'Haftung', 'Anwendbares Recht']) {
    assert.ok(text.includes(teil), `Abschnitt fehlt: ${teil}`);
  }

  /* Zustimmen ist eine Handlung (v.35.70.0): ein Häkchen, nicht ein
     Satz unter dem Knopf. Michel: die Datenschutzerklärung gehört
     daneben und nicht in dieselbe pauschale Einwilligung. */
  assert.match(login, /id="nutzungHinweis" hidden/);
  assert.match(login, /<input type="checkbox" id="fNutzung" \/>/);
  assert.match(login, /data-i18n-html="login\.nutzungCheck"/);
  assert.match(login, /data-i18n-html="login\.datenschutzHinweis"/);
  assert.match(login, /\$\('nutzungHinweis'\)\.hidden = mode !== 'register';/);
  assert.match(login, /if \(mode === 'register' && !\$\('fNutzung'\)\.checked\)/,
    'ohne Häkchen entsteht trotzdem ein Konto');

  assert.match(wk, /<a class="wk-fuss__link" href="nutzung\.html"/);
  assert.match(sw, /'\.\/nutzung\.html'/);
});

test('kein Preis, nur die Zusage, dass nichts ungefragt kostet', async () => {
  const text = ohneKommentare(await read('nutzung.html'));

  /* Eine Zahl mit Währung gibt es nicht — es gibt keinen Tarif. */
  assert.deepEqual(text.match(/(CHF|EUR|€|\$)\s*\d/g) || [], []);
  assert.doesNotMatch(text, /kostenlos|gratis|umsonst/i,
    '"kostenlos" ist eine Aussage über einen Tarif, den es nicht gibt');

  /* Der Schutz selbst muss dastehen. */
  assert.match(text, /ausdrückliche\s*\n?\s*Vereinbarung über Preis und Leistungsumfang/,
    'der Satz fehlt, dass Kosten eine ausdrückliche Vereinbarung voraussetzen');

  const ohneFuss = text.replace(/<footer[\s\S]*?<\/footer>/, '');
  assert.doesNotMatch(ohneFuss, /TVZA/, 'TVZA steht nur im Fuss ("ein Projekt von TVZA")');
});

test('die Haftung für Vorsatz und grobe Fahrlässigkeit wird nicht ausgeschlossen', async () => {
  /* Art. 100 Abs. 1 OR: eine zum Voraus getroffene Verabredung, die
     Haftung für rechtswidrige Absicht oder grobe Fahrlässigkeit
     auszuschliessen, ist nichtig. Eine Klausel, die das trotzdem
     versucht, schützt niemanden — sie fällt einfach weg. */
  const text = ohneKommentare(await read('nutzung.html'));

  assert.match(text, /haftet nach den gesetzlichen Vorschriften für vorsätzlich\s*\n?\s*oder grobfahrlässig/,
    'die Haftung für Vorsatz und grobe Fahrlässigkeit steht nicht ausdrücklich da');
  assert.match(text, /Personenschäden/,
    'die Haftung für Personenschäden ist nicht vorbehalten');
  assert.match(text, /leicht fahrlässig/,
    'der Ausschluss unterscheidet nicht nach dem Verschulden');
});

test('die Bedingungen ersetzen den Datenschutz nicht, sondern verweisen', async () => {
  const text = ohneKommentare(await read('nutzung.html'));

  assert.match(text, /href="datenschutz\.html"/, 'kein Weg zur Datenschutzerklärung');
  assert.match(text, /href="betreiber\.html"/, 'kein Weg zum Betreiber');

  /* Fassung 1 sagte "Die Daten liegen bei Google Firebase. Wir geben
     sie nicht weiter" — im selben Atemzug mit der Bearbeitung durch
     Firebase und Gemini. Beides zusammen stimmte nicht. */
  assert.doesNotMatch(text, /geben sie nicht weiter|verkaufen sie nicht/,
    'die Bedingungen behaupten wieder etwas über die Datenweitergabe');
});
