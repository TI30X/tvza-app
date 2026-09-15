/* Mehrere Kalender (v.35.60.0) — kalender-quellen.js und wie der Kalender
   sie benutzt. Michel: "die Gruppe soll mehrere Kalender erstellen können
   … auch persönlich … zwischen Trainings, Trainingslager und Rennen
   unterscheiden — Rennplan". */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import {
  quelleVon, sichtbar, quellenBaum, ausGemerkt, naechsteFarbe, kalenderName,
} from '../assets/js/kalender-quellen.js';

const read = p => readFile(join(root, p), 'utf8');

test('jeder Eintrag gehört zu genau einer Quelle', () => {
  const index = { eigene: new Set(['fam']), jeGruppe: new Map([['g1', new Set(['renn'])]]) };
  assert.equal(quelleVon({ art: 'tag', ref: {} }, index), 'p');
  assert.equal(quelleVon({ art: 'tag', ref: { kalender: 'fam' } }, index), 'pk:fam');
  assert.equal(quelleVon({ art: 'tag', ref: { kalender: 'geloescht' } }, index), 'p', 'ein gelöschter Kalender fällt zurück');
  assert.equal(quelleVon({ art: 'erinnerung', ref: {} }, index), 'r');
  assert.equal(quelleVon({ art: 'team', ref: { gid: 'g1', art: 'rennen' } }, index), 'g:g1:art:rennen');
  assert.equal(quelleVon({ art: 'team', ref: { gid: 'g1', art: 'rennen', kalender: 'renn' } }, index), 'g:g1:k:renn');
  assert.equal(quelleVon({ art: 'team', ref: { gid: 'g1', art: 'lager', kalender: 'weg' } }, index), 'g:g1:art:lager');
  assert.equal(quelleVon({ art: 'training', ref: { gid: 'g1' } }, index), 'g:g1:plaene');
  assert.equal(quelleVon({ art: 'reise', ref: { familyId: 'g1' } }, index), 'g:g1');
});

test('eine Gruppe als Ganzes schaltet alles darunter aus, ein Kalender nur sich', () => {
  const aus = new Set(['g:g1:art:training', 'g:g2']);
  assert.equal(sichtbar('g:g1:art:training', aus), false);
  assert.equal(sichtbar('g:g1:art:rennen', aus), true);
  assert.equal(sichtbar('g:g2:k:renn', aus), false, 'die Gruppe ist aus');
  assert.equal(sichtbar('g:g2:plaene', aus), false);
  assert.equal(sichtbar('p', aus), true);
  assert.equal(sichtbar('pk:fam', new Set(['p'])), true, 'ein eigener Kalender hängt nicht an "Persönlich"');
});

test('die Liste: das Eigene, dann jede Gruppe mit ihren Arten, Kalendern und Plänen', () => {
  const baum = quellenBaum({
    eigene: [{ id: 'fam', name: 'Familie', farbe: '#e0b52f' }],
    gruppen: [{ id: 'g1', name: 'BSV', art: 'kader' }, { id: 'g2', name: 'Familie vZ', art: 'familie' }],
    jeGruppe: new Map([['g1', [{ id: 'renn', name: 'Rennplan', farbe: '#d4537e' }]]]),
    mitPlaenen: new Set(['g1']),
    farbeVon: gid => (gid === 'g1' ? '#1d9e75' : '#2f6fed'),
    arten: art => (art === 'familie' ? ['training', 'lager'] : ['training', 'lager', 'rennen']),
    artWort: (art, g) => `${g}:${art}`,
  });
  assert.deepEqual(baum.map(q => q.schluessel), ['p', 'pk:fam', 'r', 'g:g1', 'g:g2']);
  assert.deepEqual(baum[3].kinder.map(k => k.schluessel),
    ['g:g1:art:training', 'g:g1:art:lager', 'g:g1:art:rennen', 'g:g1:k:renn', 'g:g1:plaene']);
  assert.equal(baum[3].kinder[3].farbe, '#d4537e', 'ein Kalender hat seine Farbe');
  assert.equal(baum[3].kinder[0].farbe, '#1d9e75', 'die Arten die der Gruppe');
  assert.deepEqual(baum[4].kinder.map(k => k.schluessel), ['g:g2:art:training', 'g:g2:art:lager'], 'ohne Pläne keine Zeile dafür');
  assert.equal(baum[1].eigen, true, 'nur eigene Kalender lassen sich hier löschen');
});

test('was das Gerät bis v.35.59.0 gemerkt hat, gilt weiter', () => {
  assert.deepEqual([...ausGemerkt({ personal: false, teamsAus: ['g1'] })].sort(), ['g:g1', 'p', 'r']);
  assert.deepEqual([...ausGemerkt({ aus: ['g:g1:art:lager', 42] })], ['g:g1:art:lager']);
  assert.deepEqual([...ausGemerkt(null)], []);
  assert.equal(naechsteFarbe(['#a', '#b'], ['#a', '#b', '#c']), '#c');
  assert.equal(naechsteFarbe(['#a'], ['#a']), '#a', 'alle vergeben: die erste');
  assert.equal(kalenderName('  Eltern   Anlässe '), 'Eltern Anlässe');
  assert.equal(kalenderName('x'.repeat(60)).length, 40);
});

test('der Kalender filtert und färbt nach Quelle, auch beim Export', async () => {
  const k = await read('assets/js/feature/kalender/kalender.js');
  assert.match(k, /const s = quelleVon\(e, index\);\s*if \(!sichtbar\(s, aus\)\) return \[\];/);
  assert.match(k, /reminders:aus\.has\('r'\) \? \[\] : reminders,/);
  assert.match(k, /collection\(db, 'users', user\.uid, 'kalender'\)/);
  assert.match(k, /kalender:\$\('dKalender'\)\?\.value \|\| ''/, 'der eigene Termin trägt seinen Kalender');
  const html = await read('pages/planner.html');
  assert.match(html, /id="calendarSetupSources"/, 'am Handy dieselbe Liste im Blatt');
  assert.match(html, /id="grpDKalender" hidden/);
});
