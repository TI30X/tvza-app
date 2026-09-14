/* Die Nutzungsbedingungen (v.35.53.0). Michel: "Wir müssen aber auch mal
 * Nutzungsbedingungen schaffen" — und über die Preise: "muss aber
 * nirgends stehen". */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');

test('die Nutzungsbedingungen stehen, und man findet sie, bevor man Ja sagt', async () => {
  const [nb, login, wk, sw] = await Promise.all([
    read('nutzung.html'), read('login.html'), read('willkommen.html'), read('sw.js'),
  ]);
  const text = nb.replace(/<!--[\s\S]*?-->/g, '');
  for (const teil of ['Dein Konto', 'Gruppen und Einladungen', 'Was du hineinstellst',
    'Training und Gesundheit', 'Deine Daten', 'Haftung']) {
    assert.ok(text.includes(teil), `Abschnitt fehlt: ${teil}`);
  }
  // Beim Registrieren sichtbar, beim Anmelden nicht.
  assert.match(login, /id="nutzungHinweis" hidden data-i18n-html="login\.nutzung">[^<]*<a href="nutzung\.html">/);
  assert.match(login, /\$\('nutzungHinweis'\)\.hidden = mode !== 'register';/);
  assert.match(wk, /<a class="wk-fuss__link" href="nutzung\.html"/);
  assert.match(sw, /'\.\/nutzung\.html'/);
});

test('kein Preis und kein Wort darüber, wer was bezahlt', async () => {
  const text = (await read('nutzung.html')).replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(text, /kostenlos|gratis|umsonst|CHF|EUR|€|\bPreis|Abo\b|TVZA-Kreis|ausgew[äa]hlt/i);
  const ohneFuss = text.replace(/<footer[\s\S]*?<\/footer>/, '');
  assert.doesNotMatch(ohneFuss, /TVZA/, 'TVZA steht nur im Fuss ("ein Projekt von TVZA")');
});
