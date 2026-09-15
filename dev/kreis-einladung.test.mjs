/* In den TVZA-Kreis einladen — mit einem Link (v.35.56.0).
 *
 * Michel: "Kann ich jemand einfach in TVZA einladen?" — "Ja, bau den
 * TVZA-Einladungslink." Ein Link für eine Person, sieben Tage; wer ihn
 * öffnet — neu oder schon mit Konto —, ist danach im Kreis.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');
const dataUrl = q => 'data:text/javascript;base64,' + Buffer.from(q).toString('base64');

/* Das Modul ohne Firebase: die beiden Importe aus dem Netz werden Stubs,
   einladung.js bleibt das echte. Der Firestore-Stub schreibt mit. */
async function modul() {
  const q = await read('assets/js/kreis-einladung.js');
  globalThis.__kreis = { docs: {}, stapel: [] };
  const fb = `export const db = {}; export const TVZA_BEREICHE = ['matura','maturatracker','food','watch','projects'];
    export const imKreis = p => p?.isTimo === true || p?.kreis === true;`;
  const fs = `const s = () => globalThis.__kreis;
    export const doc = (db, ...p) => ({ path: p.join('/') });
    export const collection = (db, ...p) => ({ path: p.join('/') });
    export const getDoc = async r => ({ exists: () => !!s().docs[r.path], data: () => s().docs[r.path] });
    export const getDocs = async () => ({ docs: [] });
    export const deleteDoc = async r => { delete s().docs[r.path]; };
    export const serverTimestamp = () => 'jetzt';
    export const Timestamp = { fromDate: d => d };
    export const writeBatch = () => { const ops = []; const b = {
      set: (r, d) => (ops.push(['set', r.path, d]), b), update: (r, d) => (ops.push(['update', r.path, d]), b),
      delete: r => (ops.push(['delete', r.path]), b), commit: async () => { s().stapel.push(ops); } }; return b; };`;
  const quelle = q
    .replace(`'./firebase-config.js'`, `'${dataUrl(fb)}'`)
    .replace(`'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'`, `'${dataUrl(fs)}'`)
    .replace(`'./einladung.js'`, `'${pathToFileURL(join(root, 'assets/js/einladung.js')).href}'`);
  return import(dataUrl(quelle + `\n// ${Math.random()}`));
}

test('wer eingeladen ist, bekommt den Kreis, alle TVZA-Bereiche frei und die üblichen gleich eingeschaltet', async () => {
  const { kreisProfil, KREIS_SICHTBAR } = await modul();
  const p = kreisProfil({ allowedModules: { ski: true, food: false }, modules: { ski: true } }, 'K7Q3M9XP');
  assert.equal(p.kreis, true);
  assert.equal(p.kreisCode, 'K7Q3M9XP');
  assert.deepEqual(p.allowedModules, { ski: true, food: true, matura: true, maturatracker: true, watch: true, projects: true });
  assert.deepEqual(p.modules, { ski: true, food: true, watch: true, projects: true },
    'Food, Watchlist, Projekte gleich auf Start — die Maturaarbeit bleibt aus');
  assert.deepEqual([...KREIS_SICHTBAR], ['food', 'watch', 'projects']);
});

test('Einlösen: Profil, Kreisliste und Verbrauch in EINEM Stapel — wer schon drin ist, verbraucht nichts', async () => {
  const { kreisBeitreten } = await modul();
  const bis = new Date(Date.now() + 86400000);
  globalThis.__kreis.docs = { 'kreisEinladungen/K7Q3M9XP': { bis }, 'users/lea': { kreis: false, allowedModules: {} } };
  const r = await kreisBeitreten('k7q3-m9xp', 'lea');
  assert.deepEqual(r, { kreis: true, schon: false });
  const [stapel] = globalThis.__kreis.stapel;
  assert.deepEqual(stapel.map(o => [o[0], o[1]]),
    [['update', 'users/lea'], ['set', 'kreis/lea'], ['delete', 'kreisEinladungen/K7Q3M9XP']]);

  globalThis.__kreis.stapel = [];
  globalThis.__kreis.docs['users/timo'] = { kreis: true,
    allowedModules: { matura: true, maturatracker: true, food: true, watch: true, projects: true } };
  assert.deepEqual(await kreisBeitreten('K7Q3M9XP', 'timo'), { kreis: true, schon: true });
  assert.equal(globalThis.__kreis.stapel.length, 0, 'der Link bleibt für die, für die er gedacht ist');

  globalThis.__kreis.docs['kreisEinladungen/ABCDEFGH'] = { bis: new Date(Date.now() - 1000) };
  await assert.rejects(kreisBeitreten('ABCDEFGH', 'lea'), /abgelaufen/);
  await assert.rejects(kreisBeitreten('ZZZZZZZZ', 'lea'), /gibt es nicht/);
});

test('die Regeln: nur der Admin legt an; einlösen nur man selbst, nur mit einem gültigen Link, der dabei verschwindet', async () => {
  const regeln = await read('firestore.rules');
  const block = regeln.slice(regeln.indexOf('match /kreisEinladungen/{code} {'));
  const einladung = block.slice(0, block.indexOf('\n    }\n') + 6);
  assert.match(einladung, /allow list: if isAdmin\(\);/, 'nie auflistbar für andere');
  assert.match(einladung, /allow create: if isAdmin\(\)\s*&& code\.matches\('\^\[A-HJKMNP-Z2-9\]\{8\}\$'\)/);
  assert.match(einladung, /request\.resource\.data\.bis < request\.time \+ duration\.value\(15, 'd'\)/);

  // Der Selbst-Zweig im Profil.
  assert.match(regeln, /request\.auth\.uid == uid\s*&& request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasOnly\(\['kreis', 'allowedModules', 'kreisCode', 'modules'\]\)\s*&& request\.resource\.data\.kreis == true\s*&& kreisEinladungVerbraucht\(request\.resource\.data\.get\('kreisCode', ''\)\)/);
  // Verbraucht heisst: vorher da, noch gültig, danach weg.
  const verbraucht = regeln.match(/function kreisEinladungVerbraucht\(code\) \{[\s\S]*?\n    \}/)[0];
  assert.ok(verbraucht.includes('&& exists(/databases/$(database)/documents/kreisEinladungen/$(code))'));
  assert.ok(verbraucht.includes('.data.bis > request.time'));
  assert.ok(verbraucht.includes('&& !existsAfter(/databases/$(database)/documents/kreisEinladungen/$(code))'));
  // Die Kreisliste darf man sich nur zusammen damit selbst schreiben.
  const kreis = regeln.slice(regeln.indexOf('match /kreis/{uid} {'));
  assert.match(kreis.slice(0, 1200), /getAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(uid\)\)\.data\.get\('kreis', false\) == true/);

  // tvzaFrei in den Regeln kennt genau die TVZA-Bereiche der App.
  const q = await read('assets/js/firebase-config.js');
  const von = q.indexOf('export const MODULES = {');
  const bis = q.indexOf('\n}\n', q.indexOf('export function enabledModules')) + 3;
  const { TVZA_BEREICHE } = vm.runInNewContext(`${q.slice(von, bis).replace(/^export /gm, '')}
    ({ TVZA_BEREICHE })`);
  const frei = regeln.match(/function tvzaFrei\(m\) \{[\s\S]*?\n    \}/)[0];
  assert.deepEqual([...frei.matchAll(/m\.get\('(\w+)', false\) == true/g)].map(m => m[1]).sort(), [...TVZA_BEREICHE].sort());
});

test('der Link ist derselbe kurze wie für Gruppen; die App weiss beim Einlösen, wohin', async () => {
  const [einladung, start, chat, login, index] = await Promise.all([
    read('assets/js/einladung.js'), read('assets/js/feature/start/start.js'), read('pages/messages.html'),
    read('login.html'), read('index.html')]);
  assert.match(einladung, /if \(await kreis\.istKreisEinladung\(code\)\) return kreis\.kreisBeitreten\(code, uid\);/);
  assert.match(start, /if \(beitritt\.kreis\) \{\s*if \(!beitritt\.schon\) location\.reload\(\);/);
  assert.match(chat, /if \(ergebnis\?\.kreis\) \{ window\.top\.location\.reload\(\); return; \}/);
  assert.match(login, /data-i18n="login\.eingeladen">Du bist eingeladen\. Erstelle/, 'der Hinweis sagt nicht mehr "in eine Gruppe"');
  // Nur der Admin sieht den Abschnitt; der Text nennt keinen Preis und keinen Grund.
  assert.match(index, /id="superAdminKreisSection" hidden/);
  assert.match(start, /document\.getElementById\('superAdminKreisSection'\)\.hidden = false;/);
  const abschnitt = index.slice(index.indexOf('id="superAdminKreisSection"'), index.indexOf('id="superAdminKiSection"'));
  assert.doesNotMatch(abschnitt, /zahl|Preis|kostenlos|gratis/i);
});
