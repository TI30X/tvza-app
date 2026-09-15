/* Der Chat (v.35.61.0). Michel: "Im Chat sollte es die Möglichkeit für
   Gruppenchats geben und zusätzlich immer einen Chat für jede Gruppe …
   Tags wie beim Eintragen von Terminen beim KI-Assistenten — oder gleich
   von der KI beim Eintragen versendet, zum Informieren … man sollte
   bestimmte Chats stummschalten können." */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import {
  unterhaltungen, ungelesenGesamt, rundePruefen, terminKarte, karteText, standSchluessel,
} from '../assets/js/chat-modell.js';

const read = p => readFile(join(root, p), 'utf8');

test('eine Liste: zu zweit, Gruppenchats und der Chat jeder Gruppe — die jüngste oben', () => {
  const dms = [
    { id: 'lea__michel', participants: ['lea', 'michel'], participantNames: { lea: 'Lea', michel: 'Michel' },
      lastMessage: 'Hoi', lastSender: 'lea', lastAt: 3000, unread: { michel: 2 } },
    { id: 'r1', art: 'runde', titel: 'Techniktraining', participants: ['anna', 'lea', 'michel'],
      participantNames: { anna: 'Anna vZ', lea: 'Lea Müller', michel: 'Michel' }, lastMessage: 'Wer fährt?', lastSender: 'anna', lastAt: 2000, unread: { michel: 1 } },
  ];
  const gruppen = [{ id: 'g1', name: 'BSV' }, { id: 'g2', name: 'Familie' }];
  const meta = new Map([['g1', { text: 'Kondi', sender: 'timo', senderName: 'Timothy vZ', at: 4000 }]]);
  const stand = new Map([[standSchluessel('dm', 'r1'), { stumm: true }], [standSchluessel('gruppe', 'g1'), { gelesen: 1000 }]]);
  const liste = unterhaltungen({ ich: 'michel', dms, gruppen, meta, stand });

  assert.deepEqual(liste.map(u => [u.art, u.name]), [['gruppe', 'BSV'], ['dm', 'Lea'], ['runde', 'Techniktraining'], ['gruppe', 'Familie']]);
  assert.equal(liste[0].vorschau, 'Timothy: Kondi');
  assert.equal(liste[0].ungelesen, 1, 'nach dem eigenen Stand neu — ein Punkt');
  assert.equal(liste[2].vorschau, 'Anna: Wer fährt?', 'im Gruppenchat steht, wer schrieb');
  assert.equal(liste[2].stumm, true);
  assert.equal(liste[3].vorschau, '', 'den Chat einer Gruppe gibt es auch ohne Nachricht');
  assert.equal(ungelesenGesamt(liste), 3, 'stumme Chats zählen nicht (2 + 1, ohne die 1 der Runde)');

  // Selbst geschrieben ist nie neu, gelesen ist gelesen.
  const gelesen = unterhaltungen({ ich: 'michel', gruppen, meta, stand: new Map([['g_g1', { gelesen: 5000 }]]) });
  assert.equal(gelesen[0].ungelesen, 0);
  const selbst = unterhaltungen({ ich: 'timo', gruppen, meta });
  assert.equal(selbst[0].ungelesen, 0);
});

test('ein Gruppenchat braucht zwei andere und einen Titel', () => {
  assert.deepEqual(rundePruefen({ ich: 'm', andere: ['a'], titel: 'x' }), { ok: false, grund: 'wenige' });
  assert.deepEqual(rundePruefen({ ich: 'm', andere: ['a', 'b'], titel: '  ' }), { ok: false, grund: 'titel' });
  assert.deepEqual(rundePruefen({ ich: 'm', andere: ['b', 'a', 'a'], titel: ' Lager  2026 ' }), { ok: true, leute: ['a', 'b', 'm'], titel: 'Lager 2026' });
  assert.equal(rundePruefen({ ich: 'm', andere: Array.from({ length: 30 }, (_, i) => `u${i}`), titel: 'x' }).grund, 'viele');
});

test('die Karte eines Termins trägt nur, was jede Person im Chat sehen darf', () => {
  const termin = { id: 'e1', titel: 'Kondi', von: '2026-09-21', zeit: '18:00', ort: 'Halle', art: 'training',
    notiz: 'nur Leitung', abfahrten: { lea: { zeit: '17:00' } }, gastToken: 'geheim', bis: '' };
  const k = terminKarte(termin, { id: 'g1', name: 'BSV' }, 'neu');
  assert.deepEqual(k, { gid: 'g1', eid: 'e1', titel: 'Kondi', von: '2026-09-21', art: 'training', gruppe: 'BSV', zeit: '18:00', ort: 'Halle', was: 'neu' });
  assert.equal(terminKarte({ id: 'e1', von: 'morgen' }, { id: 'g1' }), null, 'ohne Datum keine Karte');
  assert.equal(karteText(k, { artWort: () => 'Training' }), 'Neu: Training «Kondi» · 2026-09-21 18:00 · Halle');
});

test('die Regeln: Gruppenchat nur mit festen Leuten, der Chat der Gruppe nur für ihre Mitglieder, stumm nur für sich', async () => {
  const r = await read('firestore.rules');
  assert.match(r, /request\.resource\.data\.get\('art', ''\) == 'runde'\s*&& request\.resource\.data\.participants\.size\(\) >= 3\s*&& request\.resource\.data\.participants\.size\(\) <= 30/);
  assert.match(r, /&& !convId\.matches\('\.\*__\.\*'\)/, 'eine Runde kann keine Unterhaltung zu zweit belegen');
  assert.match(r, /allow update: if signedIn\(\)\s*&& request\.auth\.uid in resource\.data\.participants\s*&& request\.resource\.data\.participants == resource\.data\.participants/,
    'wer drin ist, ändert niemand im Nachhinein');
  assert.match(r, /match \/groups\/\{gid\}\/chat\/\{msgId\} \{\s*allow get, list: if inGroup\(gid\);\s*allow create: if inGroup\(gid\)\s*&& request\.resource\.data\.sender == request\.auth\.uid/);
  assert.match(r, /match \/groups\/\{gid\}\/chatMeta\/\{docId\} \{\s*allow get, list: if inGroup\(gid\);/);
  assert.match(r, /match \/users\/\{uid\}\/chat\/\{schluessel\} \{\s*allow read, delete: if isMember\(\) && request\.auth\.uid == uid;/);
  assert.match(r, /d\.termin\.keys\(\)\.hasOnly\(\['gid', 'eid', 'titel', 'von', 'bis', 'zeit', 'ort', 'art', 'gruppe', 'was'\]\)/);
});

test('der Chat: Gruppenchat anlegen, stumm schalten, Termin teilen — und die Pille tritt zurück', async () => {
  const chat = await read('pages/messages.html');
  assert.match(chat, /import \{ beobachteUnterhaltungen, standSetzen, gruppenNachricht \} from '\.\.\/assets\/js\/chat-stand\.js';/);
  assert.match(chat, /id="newRundeBtn"/);
  assert.match(chat, /id="threadStumm"/);
  assert.match(chat, /id="terminTeilen"/);
  assert.match(chat, /await standSetzen\(me, schluesselVon\(aktiv\), \{ stumm: !u\?\.stumm \}\);/);
  assert.match(chat, /query\(collection\(db, 'groups', u\.id, 'chat'\), orderBy\('createdAt', 'asc'\), limitToLast\(300\)\)/);
  assert.match(chat, /art: 'runde', titel: pruefung\.titel, erstelltVon: me,/);
  assert.match(chat, /const inhalt = m\.termin \? karteHtml\(m\.termin\) : mitEinladung\(m\.text\);/);
  // "Zum Termin" nur in der eigenen Gruppe.
  assert.match(chat, /const link = gruppe\s*\?/);
  assert.match(chat, /window\.top\.document\.body\.classList\.toggle\('chat-offen', !!an\)/);
  assert.match(await read('assets/css/kit.css'), /body\.chat-offen \.ki-pille,/);
});

test('Tab und Start zählen dieselben Unterhaltungen, ohne die stummen', async () => {
  const [nav, start, senden] = await Promise.all([read('assets/js/nav.js'), read('assets/js/feature/start/start.js'), read('assets/js/chat-senden.js')]);
  assert.match(nav, /beobachteUnterhaltungen\(user\.uid, liste => setUnread\(ungelesenGesamt\(liste\)\)\);/);
  assert.match(start, /dmUnsub = beobachteUnterhaltungen\(user\.uid, liste => \{\s*const total = ungelesenGesamt\(liste\);/);
  assert.match(senden, /if \(daten\.art === 'runde'\) return null;/, 'ein Gruppenchat ist keine Person');
});

test('was der Assistent in eine Gruppe einträgt oder verschiebt, geht als Karte in ihren Chat', async () => {
  const p = await read('assets/js/ki-pille.js');
  assert.match(p, /const eid = await groups\.terminAnlegen\(pruefung\.ziel\.gid, uid, d\);\s*await imChatAnkuendigen\(\{ uid, gid: pruefung\.ziel\.gid, gruppe: pruefung\.ziel\.gruppe, termin: \{ \.\.\.d, id: eid \}, was: 'neu' \}\);/);
  assert.match(p, /await groups\.terminAendern\(z\.gid, z\.eid, d\);[\s\S]{0,200}await imChatAnkuendigen\(\{ uid, gid: z\.gid, gruppe: gruppe\?\.name, was: 'geaendert',/);
  // Scheitert der Chat, ist der Termin trotzdem eingetragen.
  assert.match(p, /async function imChatAnkuendigen\([\s\S]*?\} catch \(fehler\) \{\s*reportClientError\('ki-chat', fehler\);/);
});
