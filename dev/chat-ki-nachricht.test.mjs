/* Chat: "Sag Hallo", Nachrichten über den Assistenten, die Suche nach
   Namen und Gruppen (v.35.67.0).

   Michel: "'Sag Hallo' soll einen kurzen Gruss ins Feld setzen und es
   fokussieren" — "Nachrichten über den KI-Assistenten senden, wenn
   ausdrücklich darum gebeten: Bestätigung mit Empfänger, vollem Text und
   Absender; Bearbeiten, Abbrechen, Senden; bei mehrdeutigen Namen wählen;
   genau den gezeigten Text senden, keine Dubletten" — "Mitglieder
   gemeinsamer Gruppen über den Namen finden (Teiltreffer, gross/klein,
   Umlaute), Gruppen über ihren Namen; die E-Mail-Suche bleibt, keine
   globale Suche". */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';
import { treffer, empfaengerFinden, namenAus, sendebereit, ohneDoppelte } from '../assets/js/nachricht-ki.js';
import { sucheBekannte, sucheGruppen } from '../assets/js/bekannte.js';
import { aktionPruefen, werkzeugeFuer, ICH } from '../assets/js/ki.js';

const read = p => readFile(join(root, p), 'utf8');

const PERSONEN = [
  { uid: 'lea1', name: 'Lea Müller', gruppen: ['BSV Perspektivkader'] },
  { uid: 'lea2', name: 'Lea Meier', gruppen: ['Skiclub'] },
  { uid: 'max', name: 'Max Muster', gruppen: ['BSV Perspektivkader'] },
  { uid: 'leandra', name: 'Leandra Ott', gruppen: ['Skiclub'] },
];
const GRUPPEN = [{ id: 'g1', name: 'BSV Perspektivkader' }, { id: 'g2', name: 'Skiclub' }];

test('ein Name, zwei Leute: gewählt wird, nicht geraten — der Gruppenname unterscheidet sie', () => {
  const lea = treffer('Lea', { personen: PERSONEN, gruppen: GRUPPEN });
  assert.deepEqual(lea.map(x => x.id).sort(), ['lea1', 'lea2'], '"Lea" ist nicht auch "Leandra"');
  assert.deepEqual(lea.map(x => x.sub).sort(), ['BSV Perspektivkader', 'Skiclub']);
  assert.deepEqual(treffer('lea mueller', { personen: PERSONEN }).map(x => x.id), ['lea1'], 'Umlaut als ue, klein');
  assert.deepEqual(treffer('Max', { personen: PERSONEN }).map(x => x.id), ['max']);
  assert.deepEqual(treffer('den Skiclub', { personen: PERSONEN, gruppen: GRUPPEN }).map(x => [x.art, x.id]), [['gruppe', 'g2']]);
  assert.deepEqual(treffer('Unbekannt', { personen: PERSONEN, gruppen: GRUPPEN }), []);
});

test('mehrere Empfänger, eindeutig oder zu wählen; der Assistent einer Gruppe schreibt nur in sie', () => {
  assert.deepEqual(namenAus('Lea und Max, Tim & Anna'), ['Lea', 'Max', 'Tim', 'Anna']);
  const e = empfaengerFinden('Lea und Max', { personen: PERSONEN, gruppen: GRUPPEN });
  assert.equal(e[0].gewaehlt, null, 'bei zwei Leas darf nichts vorgewählt sein');
  assert.equal(e[1].gewaehlt.id, 'max');
  assert.equal(sendebereit(e, 'Hallo'), false, 'ohne Wahl kein Senden');
  e[0].gewaehlt = e[0].treffer.find(x => x.id === 'lea1');
  assert.equal(sendebereit(e, 'Hallo'), true);
  assert.equal(sendebereit(e, '   '), false, 'ohne Text kein Senden');

  /* Im Assistenten von "BSV": nur BSV-Leute und der BSV-Chat. */
  const nurBsv = empfaengerFinden('Lea', { personen: PERSONEN, gruppen: GRUPPEN, nurGruppe: 'g1' });
  assert.deepEqual(nurBsv[0].treffer.map(x => x.id), ['lea1']);
  assert.deepEqual(empfaengerFinden('Skiclub', { personen: PERSONEN, gruppen: GRUPPEN, nurGruppe: 'g1' })[0].treffer, []);

  /* Dieselbe Person zweimal genannt: einmal senden. */
  const doppelt = empfaengerFinden('Max, Max Muster', { personen: PERSONEN });
  assert.equal(ohneDoppelte(doppelt).length, 1);
});

test('der Assistent bereitet eine Nachricht nur vor — Empfänger und Text, geprüft', () => {
  assert.ok(werkzeugeFuer(ICH).includes('nachricht_senden'));
  assert.ok(werkzeugeFuer('g1').includes('nachricht_senden'));
  const ok = aktionPruefen({ name: 'nachricht_senden', args: { an: 'Lea', text: 'Bin 10 Minuten später da.' } }, { wer: ICH });
  assert.deepEqual(ok, { ok: true, art: 'nachricht', daten: { an: 'Lea', text: 'Bin 10 Minuten später da.' } });
  assert.equal(aktionPruefen({ name: 'nachricht_senden', args: { an: 'Lea', text: '' } }, { wer: ICH }).ok, false);
  assert.equal(aktionPruefen({ name: 'nachricht_senden', args: { text: 'x' } }, { wer: ICH }).ok, false);
});

test('der Worker kennt das Werkzeug und sagt dem Modell, dass nur auf Wunsch und nie "gesendet"', async () => {
  const w = await read('worker/ki.js');
  assert.match(w, /name: 'nachricht_senden',/);
  assert.match(w, /NUR, wenn sie ausdrücklich darum bittet/);
  assert.match(w, /Sag nie, sie sei gesendet/);
  /* Der Kontext trägt weiter keine Namen anderer — die löst der Browser auf. */
  const k = await read('assets/js/ki.js');
  assert.doesNotMatch(k.slice(k.indexOf('export function kontextBauen'), k.indexOf('export function kontextBauen') + 3000), /kontakte|personen/);
});

test('die Karte: An, Von, Text; Bearbeiten, Abbrechen, Senden — Erfolg erst nach dem Senden', async () => {
  const p = await read('assets/js/ki-pille.js');
  assert.match(p, /if \(pruefung\.ok && pruefung\.art === 'nachricht'\) \{ void nachrichtKarte\(pruefung\); return; \}/);
  for (const k of ['data-senden', 'data-bearbeiten', 'data-abbrechen']) assert.match(p, new RegExp(k));
  assert.match(p, /t\('ki\.an', 'An'\)/);
  assert.match(p, /t\('ki\.von', 'Von'\)/);
  assert.match(p, /t\('ki\.vonDir', '\{name\} \(du\)'/);
  /* Einmal: solange gesendet wird, gibt es keinen Knopf. */
  assert.match(p, /if \(z\.sendet \|\| z\.fertig \|\| z\.abgebrochen\) return;/);
  assert.match(p, /z\.sendet = true;\s*z\.bearbeiten = false;\s*nachrichtZeichnen\(el, z\);\s*const text = z\.text\.trim\(\);/);
  /* Dieselben Wege wie im Chat, und "Gesendet" erst, wenn alle angekommen sind. */
  assert.match(p, /gruppenNachricht\(\{ gid: x\.id, ich: uid, meinName, text \}\)/);
  assert.match(p, /nachrichtSenden\(\{ ich: uid, meinName, an: x\.id, anName: x\.name, text \}\)/);
  assert.match(p, /z\.fertig = \[\.\.\.z\.ergebnisse\.values\(\)\]\.every\(r => r\.ok\)/);
  /* Wer schon angekommen ist, bekommt beim erneuten Senden nichts doppelt. */
  assert.match(p, /const ziele = ohneDoppelte\(z\.empfaenger\)\.filter\(x => !z\.ergebnisse\.get\(`\$\{x\.art\}:\$\{x\.id\}`\)\?\.ok\);/);
});

test('"Sag Hallo" setzt einen Gruss ins Feld und fokussiert es — gesendet wird erst mit "Senden"', async () => {
  const html = await read('pages/messages.html');
  assert.match(html, /<button class="dm-hallo" type="button" data-hallo>/);
  assert.doesNotMatch(html, /<div class="dm-empty" style="border:0">Sag Hallo/);
  const fn = html.slice(html.indexOf('function halloEinsetzen'), html.indexOf('function halloEinsetzen') + 700);
  assert.match(fn, /input\.value = /);
  assert.match(fn, /input\.focus\(\);/);
  assert.doesNotMatch(fn, /send\(\)|schreiben\(/, 'Hallo schickte gleich ab');
  /* Der Link aus der Karte öffnet den Chat einer Gruppe. */
  assert.match(html, /let gruppeAusAdresse = new URLSearchParams\(location\.search\)\.get\('gruppe'\) \|\| '';/);
  /* Gruppen findet man in der Auswahl über den Namen. */
  assert.match(html, /sucheGruppen\(meineGruppen, s\)/);
});

test('die Suche: Teile des Namens, gross/klein, Umlaute, mehrere Wörter — und Gruppen', () => {
  const liste = PERSONEN;
  assert.deepEqual(sucheBekannte(liste, 'MUELLER').map(x => x.uid), ['lea1']);
  assert.deepEqual(sucheBekannte(liste, 'müll').map(x => x.uid), ['lea1']);
  assert.deepEqual(sucheBekannte(liste, 'muster max').map(x => x.uid), ['max'], 'Folge der Wörter egal');
  /* "lea" ist ein Teiltreffer — Leandra aus dem Skiclub gehört dazu. */
  assert.deepEqual(sucheBekannte(liste, 'lea skiclub').map(x => x.uid), ['lea2', 'leandra'], 'die Gruppe unterscheidet');
  assert.deepEqual(sucheBekannte(liste, '').length, 4, 'ohne Suche alle aus den eigenen Gruppen');
  assert.deepEqual(sucheGruppen(GRUPPEN, 'perspektiv').map(g => g.id), ['g1']);
  assert.deepEqual(sucheGruppen(GRUPPEN, ''), []);
});

test('die Kontakte im Chat kommen aus derselben Gruppenliste wie die Leiste', async () => {
  const g = await read('assets/js/groups.js');
  assert.match(g, /export async function kontakte\(uid, \{ kreis = false \} = \{\}\) \{\s*const gruppen = await gruppenJetzt\(uid\);/);
  assert.match(g, /if \(Array\.isArray\(liste\) && !liste\.unvollstaendig\) return liste;\s*return meineGruppen\(uid\);/);
});
