/* Formatierter Text (v.35.60.0). Michel: "das Formatieren der KI wird
   manchmal nicht richtig geregelt — es nimmt ** nicht wahr" und "sollte
   übrigens auch vom Chat verstanden werden". Dazu die Glocke: "die
   Nachricht von der Maturaarbeit … ich kann sie nicht löschen, weil sie
   immer wieder kommt" — und die Knöpfe des Assistenten am Handy. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import { formatiert } from '../assets/js/formatierung.js';

const read = p => readFile(join(root, p), 'utf8');

test('fett, Listen und Absätze — so, wie Gemini antwortet', () => {
  const html = formatiert('Diese Woche:\n\n* **Heute (15.09.):** Kraft Beine\n  * Aufwärmen: Mobi\n* **Mittwoch:** Rumpf\n\n1. eins\n2. zwei');
  assert.equal(html, '<p>Diese Woche:</p>'
    + '<ul><li><strong>Heute (15.09.):</strong> Kraft Beine</li><li class="fmt-tief">Aufwärmen: Mobi</li><li><strong>Mittwoch:</strong> Rumpf</li></ul>'
    + '<ol><li>eins</li><li>zwei</li></ol>');
  assert.equal(formatiert('## Plan\nZeile eins\nZeile zwei'), '<p class="fmt-titel"><strong>Plan</strong></p><p>Zeile eins<br>Zeile zwei</p>');
  assert.equal(formatiert('*kursiv* und _auch_'), '<p><em>kursiv</em> und <em>auch</em></p>');
});

test('was jemand schreibt, wird nie HTML — und 2*3*4 oder snake_case bleiben, wie sie sind', () => {
  assert.equal(formatiert('<img src=x onerror=alert(1)> **<b>**'), '<p>&lt;img src=x onerror=alert(1)&gt; <strong>&lt;b&gt;</strong></p>');
  assert.equal(formatiert('2*3*4 und snake_case_name'), '<p>2*3*4 und snake_case_name</p>');
  assert.equal(formatiert('`x**y**` **z**'), '<p><code>x**y**</code> <strong>z</strong></p>', 'in Code bleiben Sternchen Sternchen');
  assert.equal(formatiert('Woche 38, 12 Uhr'), '<p>Woche 38, 12 Uhr</p>', 'Zahlen bleiben Zahlen');
  assert.equal(formatiert('"a" & \'b\''), '<p>&quot;a&quot; &amp; &#39;b&#39;</p>');
});

test('der Chat macht aus Einladungslinks weiter Links — im schon maskierten Text', async () => {
  const inline = s => s.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`);
  assert.equal(formatiert('**Komm:** https://ti30x.github.io/tvza-app/?k=K7Q3M9XP', { inline }),
    '<p><strong>Komm:</strong> <a href="https://ti30x.github.io/tvza-app/?k=K7Q3M9XP">https://ti30x.github.io/tvza-app/?k=K7Q3M9XP</a></p>');
  const chat = await read('pages/messages.html');
  assert.match(chat, /import \{ formatiert \} from '\.\.\/assets\/js\/formatierung\.js';/);
  assert.match(chat, /return `<div class="fmt">\$\{formatiert\(text, \{ inline: einladungsLinks \}\)\}<\/div>`;/);
  const pille = await read('assets/js/ki-pille.js');
  assert.match(pille, /if \(wer === 'ki'\) \{ el\.classList\.add\('fmt'\); el\.innerHTML = formatiert\(text\); \} else el\.textContent = text;/,
    'was man selbst schreibt, bleibt Text');
});

test('die Glocke: jede Meldung lässt sich ausblenden, die der Maturaarbeit hängt am Abgabedatum', async () => {
  const g = await read('assets/js/notifications.js');
  assert.match(g, /const WEG = 'tvza-notif-weg';/);
  assert.match(g, /\.filter\(n => !weg\.has\(n\.id\)\)/);
  assert.match(g, /data-weg="\$\{escHtml\(n\.id\)\}"/);
  assert.match(g, /id: 'matura-overdue-' \+ st\.deadline/, 'ein neues Datum ist eine neue Meldung');
});

test('die Knöpfe oben im Assistenten werden am Handy nicht zusammengedrückt', async () => {
  const kit = await read('assets/css/kit.css');
  assert.match(kit, /\.ki-wahl \{\s*flex: none;[^}]*overflow-y: hidden;/);
  for (const k of ['ki-blatt__kopf', 'ki-eingabe', 'ki-vorschlaege', 'ki-stufe']) {
    assert.match(kit, new RegExp(`\\.${k} \\{\\s*flex: none;`), k);
  }
});
