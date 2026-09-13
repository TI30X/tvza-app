/* Der Kopf zeigt auf Start den Gruss — auch wenn die App woanders
   geöffnet wurde (v.35.45.0).

   Michel am Handy: "dann steht oben links Start statt welchem Name".
   Wurde die App auf einer Unterseite geöffnet (neu geladen in der
   Gruppe, ein Link), bleibt deren Kopf stehen; er hatte nur einen Titel,
   und der Router schrieb "Start" hinein. Jetzt bekommt ein solcher Kopf
   Gruss und Datum dazu. In der Attrappe nachgestellt und behoben. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

async function kopf(markup, url = 'https://firn.test/pages/gruppe.html') {
  const { window } = new JSDOM(`<body>${markup}</body>`, { url });
  for (const k of ['window', 'document', 'localStorage', 'location']) globalThis[k] = window[k];
  window.localStorage.setItem('tvza-name', 'Michel');
  const { headerController } = await import('../assets/js/router.js');
  return { h: headerController(() => {}), doc: window.document };
}
const zeigt = el => !!el && !el.hidden;

test('ein Kopf mit nur einem Titel grüsst auf Start und nennt sonst die Seite', async () => {
  const { h, doc } = await kopf(`
    <header class="appbar"><div class="appbar__inner"><div class="appbar__spacer">
      <span class="appbar__title">BSV Perspektivkader</span></div><span class="appbar__end"></span></div></header>`);
  const titel = doc.querySelector('.appbar__title');

  h.show(new URL('https://firn.test/index.html'), 'Start');
  const gruss = doc.querySelector('.appbar__greet');
  assert.ok(zeigt(gruss), 'auf Start steht kein Gruss');
  assert.match(gruss.textContent, /^Gute[nr]? \w+, Michel$/);
  assert.equal(titel.hidden, true, 'das Wort "Start" steht noch da');
  assert.ok(zeigt(doc.querySelector('.appbar__date')), 'das Datum fehlt');

  h.show(new URL('https://firn.test/pages/planner.html'), 'Kalender');
  assert.equal(titel.textContent, 'Kalender');
  assert.ok(zeigt(titel));
  assert.equal(gruss.hidden, true);
  assert.equal(doc.querySelector('.appbar__date').hidden, true);
});

test('der Kopf von Start selbst behält seinen Gruss', async () => {
  const { h, doc } = await kopf(`
    <header class="appbar"><div class="appbar__inner"><div class="appbar__spacer">
      <span class="appbar__title" hidden></span>
      <div class="appbar__greet">Guten Morgen, Michel</div><div class="appbar__date">Montag</div>
    </div><span class="appbar__end"></span></div></header>`, 'https://firn.test/index.html');
  h.show(new URL('https://firn.test/pages/gruppe.html'), 'Gruppe');
  h.show(new URL('https://firn.test/index.html'), 'Start');
  assert.equal(doc.querySelectorAll('.appbar__greet').length, 1, 'ein zweiter Gruss daneben');
  assert.equal(doc.querySelector('.appbar__greet').textContent, 'Guten Morgen, Michel');
});
