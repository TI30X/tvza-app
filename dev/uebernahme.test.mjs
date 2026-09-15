/* Eine Familie aus dem alten Kalendermodell wird eine Gruppe.

   Michel: "fuehr das alte Familienmodell im Kalender mit den Gruppen
   zusammen." Bis v.35.31.0 gab es zwei Gruppenmodelle mit zwei
   Verwaltungen. Die Uebernahme laeuft beim Kopf der Familie, im Browser,
   gegen die echte Datenbank — ohne Server, der sie einmal fuer alle
   machen koennte. Darum wird die Reihenfolge hier gegen eine Attrappe
   gefahren, die jeden Schreibvorgang mitschreibt. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  gruppeAusFamilie, fehlendeMitglieder, sollUebernehmen, familieUebernehmen, vereinigeGruppen,
} from '../assets/js/uebernahme.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE = ['#7f77dd', '#2f6fed', '#1d9e75'];

const FAMILIE = {
  id: 'fam1', name: 'Familie van Zanten', headUid: 'michel',
  managers: ['michel', 'mama'], members: ['michel', 'mama', 'timo', 'timo'],
  calendarColor: '#1d9e75', inviteToken: 'alt-token-123', pendingRequests: ['fremd'],
};

/* Eine Attrappe der Firestore-Funktionen: Pfade als Zeichenketten, jeder
   commit und jedes update landet im Protokoll. */
function attrappe({ mitglieder = [], scheitertBeim = null } = {}) {
  const protokoll = [];
  const fs = {
    doc: (db, ...teile) => teile.join('/'),
    collection: (db, ...teile) => teile.join('/'),
    serverTimestamp: () => 'JETZT',
    getDocs: async pfad => {
      protokoll.push(['lesen', pfad]);
      return { docs: mitglieder.map(id => ({ id })) };
    },
    writeBatch: () => {
      const saetze = [];
      const stapel = {
        set(pfad, daten) { saetze.push([pfad, daten]); return stapel; },
        async commit() {
          const nr = protokoll.filter(p => p[0] === 'stapel').length + 1;
          if (scheitertBeim === nr) throw new Error('permission-denied');
          protokoll.push(['stapel', saetze]);
        },
      };
      return stapel;
    },
    updateDoc: async (pfad, daten) => { protokoll.push(['update', pfad, daten]); },
  };
  return { fs, protokoll };
}

test('das Gruppendokument traegt nur Felder, die die Regel fuer groups zulaesst', async () => {
  const gruppe = gruppeAusFamilie(FAMILIE, 'michel', { bereiche: { termine: true }, token: 'neu-token-1234', palette: PALETTE });
  assert.deepEqual(gruppe, {
    name: 'Familie van Zanten', art: 'familie', headUid: 'michel',
    bereiche: { termine: true }, inviteToken: 'neu-token-1234', farbe: '#1d9e75',
  });
  /* Gegen die Regel selbst geprueft, nicht gegen eine Abschrift. */
  const rules = await readFile(join(root, 'firestore.rules'), 'utf8');
  const erlaubt = rules.match(/match \/groups\/\{gid\} \{[\s\S]*?allow create:[\s\S]*?keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/)?.[1]
    .match(/'([^']+)'/g).map(s => s.slice(1, -1));
  for (const feld of [...Object.keys(gruppe), 'createdAt']) {
    assert.ok(erlaubt.includes(feld), `${feld} steht nicht in der Regel`);
  }
  /* Eine Farbe ausserhalb der Palette wandert nicht mit. */
  assert.equal(gruppeAusFamilie({ ...FAMILIE, calendarColor: '#000000' }, 'michel', { palette: PALETTE }).farbe, undefined);
  assert.equal(gruppeAusFamilie({ ...FAMILIE, name: '  ' }, 'michel', {}).name, 'Familie');
});

test('die Mitglieder: Verwaltung wird Trainer-Rolle, der Kopf und Doppelte nicht', () => {
  assert.deepEqual(fehlendeMitglieder(FAMILIE), [
    { uid: 'mama', rolle: 'staff' },
    { uid: 'timo', rolle: 'mitglied' },
  ]);
  /* Wer schon drin ist, wird nicht noch einmal aufgenommen — ein zweites
     create auf dasselbe Dokument waere ein update, und das lehnt die
     Regel ab. Der ganze Stapel scheiterte daran. */
  assert.deepEqual(fehlendeMitglieder(FAMILIE, new Set(['mama'])), [{ uid: 'timo', rolle: 'mitglied' }]);
  /* Beitrittsanfragen wandern NICHT mit: angenommen hat sie niemand. */
  assert.ok(!fehlendeMitglieder(FAMILIE).some(m => m.uid === 'fremd'));
});

test('nur der Kopf uebernimmt, und nur einmal', () => {
  assert.equal(sollUebernehmen(FAMILIE, 'michel'), true);
  assert.equal(sollUebernehmen(FAMILIE, 'timo'), false, 'ein Mitglied darf die Gruppe nicht anlegen — es waere danach ihr Kopf');
  assert.equal(sollUebernehmen({ ...FAMILIE, uebernommen: true }, 'michel'), false);
});

test('die Reihenfolge: Gruppe mit Kopf, dann die uebrigen, dann die Marke', async () => {
  const { fs, protokoll } = attrappe({ mitglieder: ['michel'] });
  const ergebnis = await familieUebernehmen({
    db: {}, fs, familie: FAMILIE, uid: 'michel', istGruppe: false,
    bereiche: { termine: true }, token: 'neu-token-1234', palette: PALETTE,
  });
  assert.equal(ergebnis, 'uebernommen');
  assert.deepEqual(protokoll.map(p => p[0]), ['stapel', 'lesen', 'stapel', 'update']);

  /* Stapel 1: Gruppe und Kopf zusammen — die Regel verlangt beides. Die
     Gruppe traegt DIESELBE Kennung wie die Familie. */
  const [, erster] = protokoll[0];
  assert.deepEqual(erster.map(([pfad]) => pfad), ['groups/fam1', 'groups/fam1/members/michel']);
  assert.equal(erster[1][1].rolle, 'head');

  /* Stapel 2: die uebrigen — getrennt, weil "der Kopf ernennt" die Gruppe
     VOR dem Schreiben prueft und es sie im ersten Stapel noch nicht gibt. */
  const [, zweiter] = protokoll[2];
  assert.deepEqual(zweiter.map(([pfad, d]) => [pfad, d.rolle]), [
    ['groups/fam1/members/mama', 'staff'],
    ['groups/fam1/members/timo', 'mitglied'],
  ]);
  assert.deepEqual(protokoll[3], ['update', 'families/fam1', { uebernommen: true }]);
});

test('wiederholbar: steht die Gruppe schon, wird nur ergaenzt, was fehlt', async () => {
  const { fs, protokoll } = attrappe({ mitglieder: ['michel', 'mama'] });
  await familieUebernehmen({ db: {}, fs, familie: FAMILIE, uid: 'michel', istGruppe: true, bereiche: {}, token: 'x-token-123', palette: PALETTE });
  assert.deepEqual(protokoll.map(p => p[0]), ['lesen', 'stapel', 'update']);
  assert.deepEqual(protokoll[1][1].map(([pfad]) => pfad), ['groups/fam1/members/timo']);
});

test('scheitert ein Schritt, bleibt die Familie unmarkiert — beim naechsten Oeffnen geht es weiter', async () => {
  const { fs, protokoll } = attrappe({ mitglieder: ['michel'], scheitertBeim: 2 });
  await assert.rejects(familieUebernehmen({
    db: {}, fs, familie: FAMILIE, uid: 'michel', istGruppe: false, bereiche: {}, token: 'x-token-123', palette: PALETTE,
  }));
  assert.ok(!protokoll.some(p => p[0] === 'update'), 'die Marke darf erst am Ende gesetzt werden');
});

test('ein Mitglied, das nicht Kopf ist, schreibt nichts', async () => {
  const { fs, protokoll } = attrappe();
  assert.equal(await familieUebernehmen({ db: {}, fs, familie: FAMILIE, uid: 'timo', istGruppe: false }), 'nichts');
  assert.deepEqual(protokoll, []);
});

test('der Kalender zeigt jede Gruppe einmal: uebernommene Familien nur als Gruppe', () => {
  const gruppen = [{ id: 'fam1', name: 'Familie van Zanten', art: 'familie' }, { id: 'k1', name: 'BSV Kader', art: 'kader' }];
  const familien = [FAMILIE, { id: 'fam2', name: 'Grosseltern', calendarColor: '#7f77dd', headUid: 'oma' }];
  const liste = vereinigeGruppen(gruppen, familien);
  /* Seit v.35.68.0 in der Folge, in der die Gruppen kommen (die eigene
     Reihenfolge, gruppen-folge.js) — nicht mehr nach dem Namen; die alten
     Familien danach. */
  assert.deepEqual(liste.map(g => g.id), ['fam1', 'k1', 'fam2']);
  const alt = liste.find(g => g.id === 'fam2');
  assert.equal(alt.alt, true, 'eine noch nicht uebernommene Familie bleibt sichtbar');
  assert.equal(alt.farbe, '#7f77dd', 'mit ihrer Kalenderfarbe');
  assert.equal(liste.find(g => g.id === 'fam1').alt, undefined, 'die uebernommene steht als Gruppe da');
});

test('der Kalender uebernimmt beim Oeffnen und verwaltet selbst nichts mehr', async () => {
  /* Seit v.35.49.0 steht der Code des Kalenders in feature/kalender/. */
  const planner = await readFile(join(root, 'assets/js/feature/kalender/kalender.js'), 'utf8');
  assert.match(planner, /groups = vereinigeGruppen\(teams, familien\);/);
  assert.match(planner, /uebernimmFamilien\(teamIds\);/);
  /* Erst vereinigen, wenn BEIDE Listen da sind: sonst hielte der Kalender
     eine Familie fuer "noch keine Gruppe", legte sie ein zweites Mal an —
     und die Regel lehnte das Anlegen ueber eine bestehende Gruppe ab. */
  assert.match(planner, /if \(!teamsGeladen \|\| !familienGeladen\) return;/);
  /* Neue Reisen gehen in die aktive Gruppe — derselbe Merker wie ueberall. */
  assert.match(planner, /group = groups\.find\(item => item\.id === aktiveGruppeId\(\)\) \|\| groups\[0\] \|\| null;/);
});
