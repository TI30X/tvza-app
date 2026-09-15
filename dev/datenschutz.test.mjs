/* Wer wen sieht (v.35.47.0).

   Bis v.35.46.0 durfte jedes Mitglied jedes Profil lesen und alle
   Profile auflisten. Die Auswahl "Wem schreiben?" im Chat und die
   Vorschläge beim Teilen luden darum bei JEDEM Konto die Profile ALLER
   Konten und zeigten die E-Mail-Adressen — auch die von Minderjährigen
   aus einem Kader, in dem man gar nicht ist.

   Jetzt: das Profil (users/{uid}) lesen nur die Person selbst und der
   Admin. Namen kommen von der Namenskarte (personen/{uid}), die nichts
   trägt als den Namen und die niemand ausser dem Admin auflisten darf.
   Zur Wahl stehen die Leute aus den eigenen Gruppen.

   Die Regeln sind die Sicherung, die Oberfläche fragt gar nicht erst —
   beide Hälften stehen hier. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  NAME_MAX, nameAus, fehlendeKarten, bekannteAus, sucheBekannte,
} from '../assets/js/bekannte.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = datei => readFile(join(root, datei), 'utf8');

function block(rules, kopf) {
  const start = rules.indexOf(kopf);
  assert.notEqual(start, -1, `${kopf} fehlt in firestore.rules`);
  let tiefe = 0;
  for (let i = rules.indexOf('{', start + kopf.length - 1); i < rules.length; i += 1) {
    if (rules[i] === '{') tiefe += 1;
    if (rules[i] === '}') { tiefe -= 1; if (tiefe === 0) return rules.slice(start, i + 1); }
  }
  throw new Error(`${kopf}: Block endet nicht`);
}

async function alleQuellen() {
  const dateien = [];
  async function gehe(ordner) {
    for (const e of await readdir(join(root, ordner), { withFileTypes: true })) {
      const pfad = join(ordner, e.name);
      if (e.isDirectory()) await gehe(pfad);
      else if (/\.(js|html)$/.test(e.name)) dateien.push(pfad.replaceAll('\\', '/'));
    }
  }
  await gehe('assets/js');
  await gehe('pages');
  dateien.push('index.html', 'login.html');
  return Promise.all(dateien.map(async d => [d, await lies(d)]));
}

/* ── Die Regeln ────────────────────────────────────────────────────*/

test('Profile lesen nur die Person selbst und der Admin, auflisten nur der Admin', async () => {
  const users = block(await lies('firestore.rules'), 'match /users/{uid} {');
  assert.match(users, /allow get: if \(signedIn\(\) && request\.auth\.uid == uid\) \|\| isAdmin\(\);/);
  assert.match(users, /allow list: if isAdmin\(\);/);
  assert.doesNotMatch(users, /allow (get|list)[^;]*isMember\(\)/,
    'ein Mitglied darf wieder fremde Profile lesen — samt E-Mail');
});

test('die Namenskarte trägt nur den Namen und ist nicht auflistbar', async () => {
  const karte = block(await lies('firestore.rules'), 'match /personen/{uid} {');
  assert.match(karte, /allow get: if isMember\(\);/);
  assert.match(karte, /allow list: if isAdmin\(\);/,
    'wer die Karten auflisten darf, hat wieder die Liste aller Konten');
  assert.match(karte, /keys\(\)\.hasOnly\(\['name', 'aktualisiert'\]\)/);
  assert.match(karte, /request\.auth\.uid == uid \|\| isAdmin\(\)/, 'fremde Karten schreibt nur der Admin');
  assert.match(karte, new RegExp(`name\\.size\\(\\) <= ${NAME_MAX}`), 'dieselbe Grenze wie bekannte.js');
  assert.doesNotMatch(karte, /email/i);
});

/* ── Die Oberfläche fragt gar nicht erst ───────────────────────────*/

test('kein Modul listet die Profile — ausser dem Admin-Teil', async () => {
  const erlaubt = new Set(['assets/js/personen.js', 'assets/js/feature/start/start.js']);
  for (const [datei, src] of await alleQuellen()) {
    if (!/collection\(db, ['"]users['"]\)/.test(src)) continue;
    assert.ok(erlaubt.has(datei), `${datei} listet alle Profile`);
  }

  // In start.js nur hinter der Admin-Prüfung: loadAppUsers wird von
  // den Einstellungen nicht mehr gerufen, beim Teilen nur für den Admin.
  const start = await lies('assets/js/feature/start/start.js');
  const einstellungen = start.slice(start.indexOf('function openSettings('), start.indexOf('const adminHealthData'));
  assert.doesNotMatch(einstellungen, /loadAppUsers/,
    'die Einstellungen laden wieder alle Profile — für jedes Konto');
  const teilen = start.slice(start.indexOf('async function loadShareTargets('), start.indexOf('async function renderShareTargets('));
  assert.match(teilen, /if \(profile\.isTimo === true\) \{\s*await loadAppUsers\(\);/);
  assert.match(teilen, /shareTargets = await kontakte\(user\.uid, \{ kreis: imKreis\(profile\) \}\);/);

  const personen = await lies('assets/js/personen.js');
  const nachtragen = personen.slice(personen.indexOf('export async function kartenNachtragen'));
  assert.match(nachtragen, /collection\(db, 'users'\)/);
  const nav = await lies('assets/js/nav.js');
  assert.match(nav, /if \(profile\.isTimo === true\) kartenNachtragen\(\)/,
    'kartenNachtragen läuft wieder für jedes Konto — die Regeln lehnen es ab');
});

test('fremde Profile liest niemand mehr einzeln — bis auf drei begründete Stellen', async () => {
  /* Die eigenen (user.uid) sind frei. Begründet sind: der Admin, der
     Freigaben speichert; die Gastseite, die prüft, ob das EIGENE Konto
     ein Profil hat (uid ist dort die eigene); und der Übergang in
     personen.js, der still scheitert, sobald die Regeln gelten. */
  const begruendet = {
    'assets/js/feature/start/start.js': /stapel\.update\(doc\(db, 'users', uid\), \{\s*allowedModules/,
    'assets/js/feature/gast/gast.js': /async function isFamilyAccount\(uid\)/,
    'assets/js/personen.js': /Übergang/,
    /* v.35.56.0: wer einen TVZA-Link einlöst, liest sein EIGENES Profil
       (uid ist dort die eigene, von einloesen(code, user.uid)). */
    'assets/js/kreis-einladung.js': /export async function kreisBeitreten\(code, uid\)/,
  };
  for (const [datei, src] of await alleQuellen()) {
    for (const [, wer] of src.matchAll(/doc\(db, ['"]users['"], ([\w.]+)\)/g)) {
      if (['user.uid', 'cred.user.uid', 'me'].includes(wer)) continue;
      assert.ok(begruendet[datei], `${datei} liest das Profil von ${wer}`);
      assert.match(src, begruendet[datei], `${datei}: die Begründung stimmt nicht mehr`);
    }
  }
});

test('der Chat bietet Leute aus den eigenen Gruppen an, ohne E-Mail', async () => {
  const chat = await lies('pages/messages.html');
  assert.doesNotMatch(chat, /collection\(db, 'users'\)/);
  assert.match(chat, /import \{ kontakte \} from '\.\.\/assets\/js\/groups\.js';/);
  // Seit v.35.62.0 nur die eigenen Gruppen und wer schon schreibt — der
  // TVZA-Kreis nicht mehr (Michel: "nicht einfach alle Leute auflisten").
  // Wer sonst gemeint ist, findet man über die Adresse (emailKarten).
  assert.match(chat, /liste = await kontakte\(me\);/);
  assert.match(chat, /personPerEmail as perAdresse/);
  const auswahl = chat.slice(chat.indexOf('function renderUsers('), chat.indexOf("$('newChatBtn')"));
  assert.doesNotMatch(auswahl, /email/i, 'die Auswahl zeigt wieder E-Mail-Adressen');
  // Wer schon schreibt, bleibt erreichbar — auch ohne gemeinsame Gruppe.
  assert.match(chat, /for \(const c of convs\)/);
  // Der Direktlink ohne Namen fragt die Karte, nicht die Kontoliste.
  assert.match(chat, /const name = await nameVon\(toUid\);\s*if \(name\) openThread\(toUid, name\);/);
});

test('Teilen wählt aus Namen, und die Freigabe trägt keine E-Mail mehr', async () => {
  const [start, seite] = await Promise.all([lies('assets/js/feature/start/start.js'), lies('index.html')]);
  assert.match(seite, /<select class="form-select" id="shareUser"><\/select>/);
  assert.doesNotMatch(seite, /appUserSuggestions/);
  const anlegen = start.slice(start.indexOf("getElementById('shareCreate')"), start.indexOf('async function renderMyShares'));
  assert.doesNotMatch(anlegen, /targetEmail:/);
  assert.match(anlegen, /targetUid: target\.uid, targetName: target\.name,/);
  // Die Regel lässt eine Freigabe ohne targetEmail zu (hasOnly, nicht hasAll).
  const shares = block(await lies('firestore.rules'), 'match /shares/{id} {');
  assert.doesNotMatch(shares, /hasAll\([^)]*targetEmail/);

  /* Zur Wahl stehen nur Bereiche, die die Regel auch annimmt. Bis
     v.35.46.0 stand Training in der Liste — die Regel lehnte die
     Freigabe ab, und seit Training in der Gruppe lebt, gäbe es auch
     nichts zu teilen. */
  const konfig = await lies('assets/js/firebase-config.js');
  const teilbar = [...konfig.matchAll(/key:'(\w+)'[^}]*shareable:true/g)].map(m => m[1]).sort();
  const regel = shares.match(/module in \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map(s => s.slice(1, -1)).sort();
  assert.deepEqual(teilbar, regel);
});

test('jede Person schreibt ihre Karte selbst — auf Start und in der Gruppe', async () => {
  const [nav, gruppe] = await Promise.all([
    lies('assets/js/nav.js'), lies('assets/js/feature/gruppe/gruppe.js'),
  ]);
  assert.match(nav, /void eigeneKarte\(user\.uid, profile\);/);
  // Die Gruppenseite lädt nav.js nicht — sie schreibt die Karte selbst.
  assert.match(gruppe, /void eigeneKarte\(user\.uid, profile\);/);
  const personen = await lies('assets/js/personen.js');
  // Stapel unter der Grenze von 500 Schreibvorgängen.
  assert.match(personen, /i \+= 400/);
  assert.match(personen, /slice\(i, i \+ 400\)/);
});

/* ── Die Rechnungen ────────────────────────────────────────────────*/

test('nameAus: displayName, sonst name, gekürzt, sonst nichts', () => {
  assert.equal(nameAus({ displayName: '  Lea Müller ' }), 'Lea Müller');
  assert.equal(nameAus({ name: 'Timo' }), 'Timo');
  assert.equal(nameAus({ email: 'x@y.ch' }), '', 'aus der E-Mail wird kein Name');
  assert.equal(nameAus(null), '');
  assert.equal(nameAus({ displayName: 'x'.repeat(200) }).length, NAME_MAX);
});

test('fehlendeKarten: fehlend oder veraltet, nie ohne Namen', () => {
  const karten = new Map([['michel', 'Michel van Zanten'], ['timo', 'Timo']]);
  const profile = [
    { uid: 'michel', displayName: 'Michel van Zanten' },   // stimmt
    { uid: 'timo', displayName: 'Timothy van Zanten' },    // veraltet
    { uid: 'lea', displayName: 'Lea Müller' },             // fehlt
    { uid: 'leer', email: 'leer@x.ch' },                    // kein Name
  ];
  assert.deepEqual(fehlendeKarten(profile, karten), [
    { uid: 'timo', name: 'Timothy van Zanten' },
    { uid: 'lea', name: 'Lea Müller' },
  ]);
});

test('bekannteAus: jede Person einmal, nie man selbst, nie ohne Namen, mit Gruppen', () => {
  const liste = bekannteAus([
    { gruppe: 'BSV Perspektivkader', mitglieder: [
      { uid: 'michel', name: 'Michel' }, { uid: 'lea', name: 'Lea' }, { uid: 'noah', name: '' },
    ] },
    { gruppe: 'Familie van Zanten', mitglieder: [
      { uid: 'michel', name: 'Michel' }, { uid: 'timo', name: 'Timo' },
    ] },
  ], 'timo');
  assert.deepEqual(liste, [
    { uid: 'lea', name: 'Lea', gruppen: ['BSV Perspektivkader'] },
    { uid: 'michel', name: 'Michel', gruppen: ['BSV Perspektivkader', 'Familie van Zanten'] },
  ]);
  assert.deepEqual(bekannteAus([], 'timo'), []);
  assert.deepEqual(bekannteAus(undefined, 'timo'), []);
});

test('sucheBekannte: nach Name oder Gruppe, ohne Akzente und Gross/klein', () => {
  const liste = [
    { uid: 'lea', name: 'Léa Müller', gruppen: ['BSV Perspektivkader'] },
    { uid: 'timo', name: 'Timo', gruppen: ['Familie'] },
  ];
  assert.deepEqual(sucheBekannte(liste, 'lea').map(b => b.uid), ['lea']);
  assert.deepEqual(sucheBekannte(liste, 'MÜLL').map(b => b.uid), ['lea']);
  assert.deepEqual(sucheBekannte(liste, 'famil').map(b => b.uid), ['timo']);
  assert.deepEqual(sucheBekannte(liste, '  ').map(b => b.uid), ['lea', 'timo']);
  assert.deepEqual(sucheBekannte(liste, '@'), [], 'nach E-Mail wird nicht mehr gesucht');
});
