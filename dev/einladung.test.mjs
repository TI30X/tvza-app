/* Einladung in eine Gruppe — kurzer Link mit Ablauf (v.35.53.0).
 *
 * Michel: "Beim Code teilen sollte wirklich ein Link zum Anmelden direkt
 * mit Code gehen, aber gekürzt … über den Firn-Chat verschicken … auf
 * Teilen und dann das Teilen-Menü öffnen und gleich an mehrere … Wichtig
 * ist, dass dieser Code mal abläuft … und dass es keine Backends zeigt."
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starteGruppe, klick, warte, root } from './gruppe-harness.mjs';
import {
  neuerCode, codeSauber, codeZeigen, einladungsLink, einladungsText, ablaufAb, abgelaufen,
  merken, gemerkt, vergessen, ausAdresseMerken, ALPHABET, CODE_LAENGE, GUELTIG_TAGE,
} from '../assets/js/einladung.js';

const read = p => readFile(join(root, p), 'utf8');

function speicher() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

test('der Code ist kurz, ohne Verwechsler, und gleich verteilt', () => {
  assert.equal(ALPHABET.length, 31);
  assert.doesNotMatch(ALPHABET, /[01ILO]/, 'kein 0/O und kein 1/I/L');
  const codes = Array.from({ length: 400 }, () => neuerCode());
  for (const c of codes) {
    assert.equal(c.length, CODE_LAENGE);
    assert.ok([...c].every(z => ALPHABET.includes(z)), c);
  }
  assert.equal(new Set(codes).size, codes.length, 'keine Wiederholung in 400 Codes');
  // Bytes über dem letzten vollen Block werden verworfen (sonst kämen die
  // ersten Zeichen öfter): 248..255 ergeben kein Zeichen.
  let n = 0;
  const zufall = k => Uint8Array.from({ length: k }, () => (n++ % 2 ? 250 : 0));
  assert.equal(neuerCode(zufall), 'AAAAAAAA');
});

test('eingetippt, mit Strich, klein oder als ganzer Link — derselbe Code', () => {
  assert.equal(codeSauber('K7Q3-M9XP'), 'K7Q3M9XP');
  assert.equal(codeSauber(' k7q3 m9xp '), 'K7Q3M9XP');
  assert.equal(codeSauber('https://ti30x.github.io/tvza-app/?k=K7Q3M9XP'), 'K7Q3M9XP');
  assert.equal(codeSauber('Komm in die Gruppe: https://x.test/?k=K7Q3M9XP\nbis morgen'), 'K7Q3M9XP');
  // Alte Codes (24 Hexzeichen) bleiben klein, wie sie gespeichert sind.
  assert.equal(codeSauber('0123456789ABCDEF01234567'), '0123456789abcdef01234567');
  // Zu kurz, zu lang, mit Verwechslern: kein Code.
  assert.equal(codeSauber('K7Q3'), '');
  assert.equal(codeSauber('K7Q3M9XPZ'), '');
  assert.equal(codeSauber('O1IL0000'), '');
  assert.equal(codeSauber(''), '');
  assert.equal(codeZeigen('K7Q3M9XP'), 'K7Q3-M9XP');
});

test('der Link zeigt nur die App und den Code — keine Gruppe, keinen Dienst', () => {
  const link = einladungsLink('K7Q3M9XP', new URL('https://ti30x.github.io/tvza-app/'));
  assert.equal(link, 'https://ti30x.github.io/tvza-app/?k=K7Q3M9XP');
  assert.doesNotMatch(link, /firebase|firestore|googleapis|groupInvites|gid=|g=|uid/i);
  assert.ok(link.length < 50, 'kurz genug für eine Nachricht');

  const text = einladungsText({ gruppe: 'BSV Kader', link, bis: new Date('2026-09-21T12:00:00') });
  assert.match(text, /BSV Kader/, 'kein nackter Code: der Name der Gruppe steht dabei');
  assert.match(text, /21\. September/, 'und bis wann');
  assert.ok(text.includes(link));
});

test('er läuft ab: sieben Tage, danach nichts mehr wert', () => {
  const jetzt = new Date('2026-09-14T10:00:00');
  const bis = ablaufAb(jetzt);
  assert.equal(GUELTIG_TAGE, 7);
  assert.equal((bis - jetzt) / 86400000, 7);
  assert.equal(abgelaufen({ bis }, jetzt), false);
  assert.equal(abgelaufen({ bis }, new Date('2026-09-21T10:00:01')), true);
  assert.equal(abgelaufen({ bis: { toDate: () => bis } }, jetzt), false, 'auch als Timestamp');
  assert.equal(abgelaufen({}, jetzt), true, 'ohne Ablauf gilt er als abgelaufen');
});

test('der Code wartet auf dem Gerät, bis das Konto steht — aber nicht ewig', () => {
  const s = speicher();
  const t0 = Date.parse('2026-09-14T10:00:00');
  assert.equal(merken('k7q3-m9xp', s, t0), 'K7Q3M9XP');
  assert.equal(gemerkt(s, t0 + 3 * 86400000), 'K7Q3M9XP');
  assert.equal(gemerkt(s, t0 + 15 * 86400000), '', 'nach zwei Wochen vergessen');
  vergessen(s);
  assert.equal(gemerkt(s, t0), '');
  assert.equal(merken('Unsinn', s, t0), '', 'nur ein gültiger Code wird gemerkt');

  // Aus der Adresse: gemerkt und aus der Adresszeile genommen.
  const verlauf = [];
  const win = {
    location: { href: 'https://ti30x.github.io/tvza-app/?k=K7Q3M9XP&x=1#a' },
    history: { state: null, replaceState: (st, _, url) => verlauf.push(url) },
    localStorage: speicher(),
  };
  assert.equal(ausAdresseMerken(win), 'K7Q3M9XP');
  assert.deepEqual(verlauf, ['/tvza-app/?x=1#a']);
  assert.equal(gemerkt(win.localStorage), 'K7Q3M9XP');
});

test('die Regel: kurz, mit Ablauf höchstens 15 Tage, Beitritt nur solange er gilt', async () => {
  const regeln = await read('firestore.rules');
  const block = regeln.slice(regeln.indexOf('match /groupInvites/{code}'));
  const invites = block.slice(0, block.indexOf('\n    }\n') + 6);
  assert.match(invites, /code\.matches\('\^\[A-HJKMNP-Z2-9\]\{8\}\$'\)/);
  assert.match(invites, /keys\(\)\.hasOnly\(\['gid', 'createdBy', 'createdAt', 'bis'\]\)/);
  assert.match(invites, /request\.resource\.data\.bis is timestamp/);
  assert.match(invites, /request\.resource\.data\.bis < request\.time \+ duration\.value\(15, 'd'\)/);
  // Auflisten nur für die Leitung der Gruppe — nie alle Codes des Systems.
  assert.match(invites, /allow list: if isMember\(\) && leadsGroup\(resource\.data\.gid\);/);
  assert.doesNotMatch(invites, /allow list: if isMember\(\);/);
  // Das Alphabet der Regel ist das der App.
  const erlaubt = /^[A-HJKMNP-Z2-9]$/;
  assert.ok([...ALPHABET].every(z => erlaubt.test(z)));
  assert.equal([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].filter(z => erlaubt.test(z)).length, ALPHABET.length);

  const beitritt = regeln.slice(regeln.indexOf('// Selbst beitreten mit einem Code.'));
  assert.match(beitritt.slice(0, 2500),
    /\.data\.get\('bis', timestamp\.date\(2026, 10, 15\)\) > request\.time/,
    'abgelaufene Codes lassen niemanden herein; alte ohne Ablauf noch bis Mitte Oktober');
});

const LEITUNG = [{ id: 'g1', name: 'BSV Kader', art: 'kader', meineRolle: 'head' }];

test('Einladen zeigt den kurzen Link, den Code und bis wann — und nimmt eine gültige wieder', async () => {
  const { doc, zurueck } = await starteGruppe({ gruppen: LEITUNG });
  try {
    await warte(() => !doc.getElementById('secAktionen').hidden);
    klick(doc.getElementById('btnEinladen'));
    await warte(() => !doc.getElementById('einladung').hidden);
    assert.match(doc.getElementById('einladungLink').textContent, /\/\?k=K7Q3M9XP$/);
    assert.doesNotMatch(doc.getElementById('einladungLink').textContent, /^https?:/, 'kurz: ohne https://');
    assert.match(doc.getElementById('einladungMeta').textContent, /K7Q3-M9XP/);
    assert.equal(globalThis.__aufrufe.filter(a => a[0] === 'einladungErzeugen').length, 1);
  } finally { zurueck(); }

  // Gibt es schon eine, die noch länger als einen Tag gilt: dieselbe.
  const zweit = await starteGruppe({ gruppen: LEITUNG });
  try {
    globalThis.__einladungen = [{ code: 'ABCDEFGH', gid: 'g1', bis: new Date(Date.now() + 5 * 86400000) }];
    await warte(() => !zweit.doc.getElementById('secAktionen').hidden);
    klick(zweit.doc.getElementById('btnEinladen'));
    await warte(() => !zweit.doc.getElementById('einladung').hidden);
    assert.match(zweit.doc.getElementById('einladungMeta').textContent, /ABCD-EFGH/);
    assert.equal(globalThis.__aufrufe.filter(a => a[0] === 'einladungErzeugen').length, 0,
      'keine neue, solange die alte gilt');
  } finally { zweit.zurueck(); }
});

test('im Chat an mehrere — nur wer noch nicht in der Gruppe ist', async () => {
  const { doc, zurueck } = await starteGruppe({
    gruppen: LEITUNG,
    mitglieder: [{ uid: 'timo', name: 'Timothy', rolle: 'head' }, { uid: 'lea', name: 'Lea', rolle: 'mitglied' }],
  });
  try {
    globalThis.__bekannte = [
      { uid: 'lea', name: 'Lea', gruppen: ['BSV Kader'] },
      { uid: 'anna', name: 'Anna', gruppen: ['Familie'] },
    ];
    globalThis.__partner = [{ uid: 'max', name: 'Max' }];
    await warte(() => !doc.getElementById('secAktionen').hidden);
    klick(doc.getElementById('btnEinladen'));
    await warte(() => !doc.getElementById('einladung').hidden);
    klick(doc.getElementById('btnEinladungChat'));
    await warte(() => doc.querySelectorAll('dialog [data-mehrere] input').length > 0);
    const namen = [...doc.querySelectorAll('dialog .mehrere__name')].map(n => n.textContent);
    assert.deepEqual(namen, ['Anna', 'Max'], 'Lea ist schon drin');
    doc.querySelectorAll('dialog [data-mehrere] input').forEach(h => { h.checked = true; });
    doc.querySelector('dialog form').dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true }));
    await warte(() => globalThis.__aufrufe.some(a => a[0] === 'anMehrere'));
    const gesendet = globalThis.__aufrufe.find(a => a[0] === 'anMehrere')[1];
    assert.deepEqual(gesendet.empfaenger.map(e => e.uid), ['anna', 'max']);
    assert.match(gesendet.text, /BSV Kader/);
    assert.match(gesendet.text, /\?k=K7Q3M9XP/);
    await warte(() => !doc.getElementById('einladungText').hidden);
  } finally { zurueck(); }
});

test('Teilen öffnet das Menü des Telefons, sonst wird kopiert', async () => {
  const js = await read('assets/js/feature/gruppe/gruppe.js');
  assert.match(js, /navigator\.share\(\{ title: aktiv\?\.name \|\| 'Firn', text: einladungsNachricht\(\) \}\)/);
  assert.match(js, /if \(e\?\.name === 'AbortError'\) return;/, 'abgebrochen ist nicht "kopieren"');
  assert.match(js, /await einladungKopieren\(\);/);
});

test('der Link führt ohne Konto zum Registrieren, mit Konto direkt in die Gruppe', async () => {
  const [start, login, chat, router] = await Promise.all([
    read('assets/js/feature/start/start.js'), read('login.html'), read('pages/messages.html'), read('assets/js/router.js'),
  ]);
  // Gemerkt wird in requireAuth, VOR jeder Umleitung — auf Start rufen
  // mehrere Module requireAuth, zwei verschiedene Ziele wären ein Wettlauf.
  const auth = await read('assets/js/firebase-config.js');
  const fn = auth.slice(auth.indexOf('export function requireAuth('));
  assert.ok(fn.indexOf('ausAdresseMerken();') < fn.indexOf('onAuthStateChanged'));
  assert.match(fn, /gemerkt\(\) \? loginPath\.replace\(\/willkommen\\\.html\$\/, 'login\.html\?neu=1'\) : loginPath/);
  assert.match(start, /requireAuth\('willkommen\.html'\)/);
  assert.match(start, /if \(window\.parent === window\) void \(async \(\) => \{\s*const beitritt = await gemerktEinloesen\(user\.uid\);/);
  // Die Anmeldeseite sagt, warum man da ist, und versteckt das Feld für
  // E-Mail-Einladungen; ein kurzer Code dort wird trotzdem angenommen.
  assert.match(login, /id="einladungHinweis" hidden/);
  assert.match(login, /\$\('inviteGroup'\)\.style\.display = mode === 'register' && !gruppenEinladung \? '' : 'none';/);
  assert.match(login, /if \(mode === 'register' && gruppenCode\.length === CODE_LAENGE\) \{\s*merken\(gruppenCode\);/);
  // Im Chat wird NUR ein Einladungslink der App zum Link.
  assert.match(chat, /const code = roh\.startsWith\(WURZEL\) \? codeSauber\(roh\) : '';/);
  assert.match(chat, /data-einladung="\$\{code\}" data-kein-router/);
  assert.match(router, /anchor\.hasAttribute\('data-kein-router'\)/);
});
