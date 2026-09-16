/* v.35.62.0 — Michels Rundgang:
   - "beim Gruppenchat sollten nicht einfach alle Leute aufgelistet sein
     … da sollte man die E-Mail eintragen können … die Leute, die bereits
     einen Chat mit dir angefangen haben, sowie die Leute in deiner Gruppe"
   - "auf dem Handy verschwindet die Textbox, wenn man die Tastatur ausfährt"
   - "dieser Bereich sieht nicht gerade super schön aus" (noch in keiner Gruppe) */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteGruppe, warte, root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');

test('eine Person über ihre Adresse finden — ohne dass die Adresse irgendwo steht', async () => {
  const p = await read('assets/js/personen.js');
  assert.match(p, /crypto\.subtle\.digest\('SHA-256', new TextEncoder\(\)\.encode\(sauber\)\)/);
  assert.match(p, /const sauber = String\(email \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(p, /setDoc\(doc\(db, 'emailKarten', await emailHash\(email\)\), \{ uid, name, aktualisiert: serverTimestamp\(\) \}\)/,
    'die Karte trägt uid und Namen, nie die Adresse');
  assert.match(p, /void eigeneEmailKarte\(uid, name\);/, 'jede Person legt ihre Karte selbst an');

  const r = await read('firestore.rules');
  assert.match(r, /match \/emailKarten\/\{hash\} \{\s*allow get: if isMember\(\);\s*allow list: if false;/, 'lesen nur, wer die Adresse kennt');
  assert.match(r, /hash == hashing\.sha256\(request\.auth\.token\.email\.lower\(\)\)\.toHexString\(\)\.lower\(\)/,
    'niemand legt eine Karte unter fremder Adresse ab');
  assert.match(r, /request\.resource\.data\.keys\(\)\.hasOnly\(\['uid', 'name', 'aktualisiert'\]\);\s*allow delete/);
});

test('die Auswahl: eigene Gruppen und wer schon schreibt, dazu die Adresse — zu zweit oder mit Häkchen', async () => {
  const chat = await read('pages/messages.html');
  assert.match(chat, /liste = await kontakte\(me\);/, 'der TVZA-Kreis steht nicht mehr in der Auswahl');
  assert.match(chat, /const person = await perAdresse\(text\);\s*if \(lauf !== suchLauf\) return;/, 'nur die letzte Frage zählt');
  assert.match(chat, /\$\('newRundeBtn'\)\.addEventListener\('click', \(\) => auswahlOeffnen\('runde'\)\);/);
  assert.match(chat, /weiter\.disabled = gewaehlte\.size < RUNDE_MIN - 1;/, 'ein Gruppenchat braucht zwei andere');
  assert.match(chat, /id="userWeiter" type="button" hidden disabled/);
  assert.doesNotMatch(chat, /import \{[^}]*mehrere[^}]*\} from '\.\.\/assets\/js\/dialog\.js'/, 'kein zweiter Weg über die lange Liste');
});

test('die Tastatur deckt das Eingabefeld nicht mehr zu', async () => {
  /* Seit v.35.69.0 misst jede Seite selbst (tastatur.js) — bis dahin stand
     der Beobachter in nav.js, das Gruppe, Training, Einheit und Video nicht
     laden. Die Zusagen sind dieselben geblieben. */
  const [tastatur, router, kit] = await Promise.all([
    read('assets/js/tastatur.js'), read('assets/js/router.js'), read('assets/css/kit.css'),
  ]);
  // Der Rahmen sagt es nach oben, und oben zählt der Fokus im Rahmen.
  assert.match(tastatur, /win\.parent\.document\.body\.classList\.toggle\('kb-open', offen\);/);
  assert.match(tastatur, /if \(el\.tagName === 'IFRAME'\) \{\s*try \{ return schreibfeld\(el\.contentDocument\?\.activeElement\); \}/);
  // Die Überdeckung ist, was vom Layout unter dem sichtbaren Ausschnitt liegt.
  assert.match(tastatur, /Math\.max\(0, Math\.round\(win\.innerHeight - vv\.height - vv\.offsetTop\)\)/);
  assert.match(router, /return Math\.max\(0, Math\.round\(innerHeight - vv\.height - vv\.offsetTop\)\);/);
  assert.match(router, /\? Math\.max\(tastatur\(\), nav\.getBoundingClientRect\(\)\.height \|\| 0\)/);
  assert.match(router, /window\.visualViewport\?\.addEventListener\('resize', syncShellBounds/);
  assert.match(kit, /max-height: min\(78dvh, 640px, calc\(var\(--vv-hoehe, 100dvh\) - var\(--s3\)\)\);/);
});

test('noch in keiner Gruppe: in der Mitte, ein Satz, zwei Wege als Karten', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: [] });
  try {
    await warte(() => !doc.getElementById('secLeer').hidden);
    const leer = doc.getElementById('secLeer');
    assert.ok(leer.classList.contains('grp-leer'));
    assert.equal(leer.querySelectorAll('.grp-leer__weg').length, 2);
    assert.ok(doc.getElementById('btnNeu').classList.contains('grp-leer__weg--haupt'));
  } finally { zurueck(); }
  const css = await read('assets/css/feature/gruppe.css');
  assert.match(css, /\.grp-leer__wege \{ display: grid; grid-template-columns: 1fr 1fr;/);
  assert.match(css, /@media \(max-width: 560px\) \{ \.grp-leer__wege \{ grid-template-columns: 1fr; \} \}/);
});
