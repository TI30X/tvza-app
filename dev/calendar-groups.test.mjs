/* Der Kalender und die Gruppen — und was er am Handy verspricht.

   Seit v.35.49.0 steht der Code in assets/js/feature/kalender/ (der
   Leser holt ihn über start-quelle.mjs zur Seite dazu). Bis dahin
   hielten die Tests hier vor allem Zeichenketten aus 1500 Zeilen CSS
   fest — "grid-template-columns:repeat(11,…)" und dergleichen. Das
   schützte keinen Code, es fror ihn ein (CLAUDE.md, Falle 9). Jetzt
   stehen hier die Zusagen; was die Ansichten rechnen, prüft
   kalender-eintraege.test.mjs, was sie zeichnen, kalender-ansicht.test.mjs. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Liest eine Seite samt ihren Modulen — siehe start-quelle.mjs. */
const read = leserMitStart(root);
const kalender = () => readFile(join(root, 'assets/js/feature/kalender/kalender.js'), 'utf8');

test('calendar discovers every group membership instead of one profile familyId', async () => {
  const planner = await read('pages/planner.html');
  assert.match(planner, /where\('members','array-contains',user\.uid\)/);
  assert.match(planner, /visibleGroupIds/);
  /* Seit v.35.50.0 gibt es keine Reise als eigenes Blatt mehr — sie ist
     ein Termin der Gruppe (termine-reisen.test.mjs). */
  assert.doesNotMatch(planner, /id="tripSheet"|id="tripDetail"|id="tGroup"/);
  assert.doesNotMatch(planner, /async function approve\(uid\)\{[^}]*users/);
});

test('dashboard calendar includes trips from all memberships', async () => {
  const dashboard = await read('index.html');
  assert.match(dashboard, /where\('members','array-contains',uid\)/);
  assert.match(dashboard, /familyIds\.has\(x\.familyId\)/);
});

/* Bis v.35.31.0 stand hier: "group management has real controls" — der
   Test verlangte renameGroup, toggleGroupManager, transferGroupHead und
   removeGroupMember im Kalender. Das war die zweite Gruppenverwaltung
   (families) neben dem Gruppe-Tab. Seit v.35.32.0 gibt es EIN Modell;
   der Test haelt jetzt fest, dass die zweite nicht zurueckkommt. */
test('der Kalender verwaltet keine eigenen Gruppen mehr — das tut der Gruppe-Tab', async () => {
  const planner = await read('pages/planner.html');
  for (const fn of ['renameGroup', 'toggleGroupManager', 'transferGroupHead', 'removeGroupMember',
                    'createGroup', 'joinGroup', 'leaveGroup', 'approve', 'renderGroupCard']) {
    assert.doesNotMatch(planner, new RegExp(`function ${fn}\\(`), `${fn} ist zurueck`);
  }
  assert.doesNotMatch(planner, /(updateDoc|addDoc|setDoc)\(\s*(doc|collection)\(db,\s*'families'/,
    'der Kalender schreibt wieder in families');
  assert.doesNotMatch(planner, /'familyDirectory'/, 'Beitritt per Namenssuche ist zurueck');
  assert.match(planner, /function zurGruppenseite\(\) \{ zurSeite\('\.\/gruppe\.html'\); \}/);
  /* Über den Router (v.35.53.0): location.href lud die Gruppe in den
     Rahmen des Kalenders — mit zweiter Leiste und zweitem Kopf darin. */
  assert.match(planner, /function zurSeite\(ziel\) \{\s*if \(!window\.tvzaNavigate\?\.\(new URL\(ziel, location\.href\)\.href\)\) location\.href = ziel;/);
  assert.doesNotMatch(planner, /location\.href = [`']\.\/gruppe\.html/, 'eine Stelle geht wieder am Router vorbei');
  assert.match(planner, /\$\('manageGroupsBtn'\)\.onclick=zurGruppenseite/);
  assert.match(planner, /\$\('settingsGroupsBtn'\)\.onclick=zurGruppenseite/);
  /* Eine Farbe je Gruppe, fuer Reisen und Termine dieselbe — und
     dieselbe wie im Gruppenwechsler. */
  assert.match(planner, /gruppenFarben = teamFarben\(groups, GROUP_COLORS\)/);
  assert.doesNotMatch(planner, /id="tSwatch"|id="dSwatch"/);
});

/* Michel: "Nur Trainer oder Admins einer Gruppe sollten in der Lage sein,
   Termine in die Gruppe zu setzen. Und was ist, wenn man Teil mehrerer
   Gruppen ist?" (v.35.49.0) */
test('in eine Gruppe trägt nur ihre Leitung ein — wer mehrere leitet, wählt', async () => {
  const quelle = await kalender();
  // Den Knopf gibt es nur, wenn man etwas leitet — und eine Reise ist
  // seit v.35.50.0 ein Gruppentermin, kein zweiter Knopf.
  assert.match(quelle, /\$\('createGroupEventOption'\)\.hidden = !geleiteteTeams\(\)\.length;/);
  assert.doesNotMatch(quelle, /createTripOption|openTripForm/);
  // Wer mehrere leitet, wählt; die aktive steht vorne.
  const waehlen = quelle.match(/async function gruppeZumEintragen\(liste\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(waehlen, /if \(liste\.length <= 1\) return liste\[0\]\?\.id \|\| null;/);
  assert.match(waehlen, /waehle\(\{/);
  // Ein Gruppentermin entsteht im Gruppe-Tab, nicht als Reise im Kalender.
  assert.match(quelle, /zurSeite\(`\.\/gruppe\.html\?g=\$\{encodeURIComponent\(gid\)\}&neu=\$\{encodeURIComponent\(tag\)\}`\);/);
  const gruppe = await readFile(join(root, 'assets/js/feature/gruppe/gruppe.js'), 'utf8');
  assert.match(gruppe, /if \(neuAusAdresse && aktiv\) \{[\s\S]*?if \(leitet\(aktiv\.meineRolle\)\) formOeffnen\(tag\);/);
  // Bearbeiten und Gast-Link: nur die Leitung (die Regel verlangt es).
  assert.match(gruppe, /\$\('btnBearbeiten'\)\.hidden = !darfFuehren;/);
  assert.match(gruppe, /\$\('btnGastLink'\)\.hidden = !darfFuehren;/);

  // Und die Regel, die es hält.
  const rules = await readFile(join(root, 'firestore.rules'), 'utf8');
  const trips = rules.match(/match \/trips\/\{tripId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(trips, /allow create: if tripLeitung\(request\.resource\.data\.get\('familyId', ''\)\)/);
  assert.match(trips, /allow delete: if tripLeitung\(resource\.data\.get\('familyId', ''\)\);/);
  assert.match(trips, /affectedKeys\(\)\s*\.hasOnly\(\['itineraryDone', 'itineraryUpdatedAt'\]\)/,
    'Mitglieder haken Programmpunkte ab — und sonst nichts');
  assert.match(rules, /function tripLeitung\(gid\) \{[\s\S]*?leadsGroup\(gid\)\s*\|\| \(!exists\(\/databases\/\$\(database\)\/documents\/groups\/\$\(gid\)\) && managesFamily\(gid\)\)/);
});

test('Blätter stehen am Laptop in der Mitte, und der Mini-Monat wählt Wochen', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/planner.css'),
  ]);
  assert.match(planner, /id="miniCalendars"/);
  assert.match(planner, /data-mini-week/);
  assert.match(css, /\.planner-page \.sheet \{[^}]*top: 50%/s);
  assert.match(css, /transform: translate\(-50%, -50%\)/);
});

test('Knöpfe tragen das eine Plus, und Kleines bleibt lesbar', async () => {
  const [planner, blaetter, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/planner.css'),
    read('assets/css/feature/calendar.css'),
  ]);
  assert.doesNotMatch(planner, />\+\s*(?:Neuer Termin|Erinnerung|Termin|Gruppe)/);
  assert.match(planner, /class="ui-plus calendar-action-icon/);
  assert.match(blaetter, /\.calendar-action-icon::before,[\s\S]*top:\s*50%;[\s\S]*left:\s*50%/);
  assert.match(css, /\.mini-tag \{[\s\S]*?font-size: 12px/);
  assert.match(css, /\.kal-balken \{[\s\S]*?font-size: 12px/);
});

/* Hier stand bis v.35.31.0 ein Test auf die Avatare in der Mitglieder-
   liste und den Beitrittsanfragen der Kalendergruppen. Beides gibt es im
   Kalender nicht mehr (die Mitglieder zeigt der Gruppe-Tab). Was bleibt:
   keine toten Reste — kein Markup, keine Helfer, keine Stile. */
test('von der alten Mitgliederliste bleibt nichts zurueck', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);
  assert.doesNotMatch(planner, /personAvatar|group-avatar-stack|group-request-copy|id="groupManageSheet"|id="groupSheet"/);
  assert.doesNotMatch(css, /\.group-(manage|member|avatar|request)/);
});

test('imported programs stay in TVZA and share completion state live', async () => {
  const planner = await read('pages/planner.html');
  const programm = await readFile(join(root, 'assets/js/programm.js'), 'utf8');
  const groups = await readFile(join(root, 'assets/js/groups.js'), 'utf8');

  // Die alten Reisen bleiben live, bis sie übernommen sind.
  assert.match(planner, /function watchTrips\(\)/);
  assert.match(planner, /onSnapshot\(\s*query\(collection\(db,'trips'\)/);
  // Abgehakt wird ein Programm nicht mehr (Michel, v.35.50.0) — weder im
  // Termin noch in einer alten Reise; was vorbei ist, blendet sich ab.
  assert.doesNotMatch(planner + groups, /itineraryDone\.|programmErledigt/);
  assert.match(programm, /export function punktVorbei\(punkt, jetzt\)/);
  // EIN Programm-Blatt für Kalender und Gruppe, mit dem Original daneben.
  assert.match(programm, /export function programmZeigen\(o\)/);
  assert.match(programm, /tt\('prog\.original', 'Original ansehen'\)/);
  assert.match(planner, /import \{[^}]*programmZeigen[^}]*\} from '\.\.\/\.\.\/programm\.js';/);
  assert.doesNotMatch(planner, /function renderPlanViewer\(|function openPlanFull\(/);
  // Ein Punkt in der Liste öffnet das Programm; vorbei ist er nach der Uhr.
  assert.match(planner, /const vorbeiVon = \(eintrag, stop\) => punktVorbei\(stop, jetztFuer\(new Date\(\)\)\);/);
  assert.match(planner, /beiProgramm:programmOeffnen,/);
  // Ein offenes Programm zieht Änderungen der anderen nach.
  assert.match(planner, /teamTermine\.set\(gid, termine\);\s*renderCurrentView\(\);\s*offenesProgrammNeu\(\);/);
});

test('am Handy beginnt der Kalender mit der Liste, auf heute gestellt', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);
  assert.match(planner, /const isMobileCalendar = \(\) => matchMedia\('\(max-width:899px\)'\)\.matches/);
  assert.match(planner, /return erlaubt\.includes\(view\) \? view : \(handy \? 'agenda' : 'month'\);/);
  assert.match(planner, /data-calendar-view="agenda"[^>]*>Liste</);
  // Die Hülle wartet, bis die Liste steht.
  assert.match(planner, /dataset\.routeReady = 'false'/);
  assert.match(planner, /dataset\.routeReady = 'true'/);
  // Heute steht oben — auch wenn danach wenig kommt (der Auslauf).
  assert.match(planner, /el\.querySelector\('\.kal-tag\.is-heute'\)/);
  assert.match(planner, /auslauf\.style\.height = `\$\{Math\.max\(0, el\.clientHeight - rest - 8\)\}px`;/);
  // Ein neues Zeichnen, das inzwischen kam, reisst die Liste nicht nach oben.
  assert.match(planner, /if \(ziel && !ziel\.isConnected\) return;/);
  assert.doesNotMatch(planner, /scrollIntoView/, 'im Rahmen des Routers scrollte das die Seite dahinter mit');
  // Die Bühne scrollt, Leiste und Ansichten bleiben stehen.
  assert.match(css, /@media \(max-width: 899px\) \{[\s\S]*body\.planner-page\[data-calendar-workspace="true"\] \{\s*height: 100vh;\s*overflow: hidden;/);
  assert.match(css, /\.kal-buehne \{\s*flex: 1;\s*overflow-y: auto;/);
});

test('am Handy: Erstellen und Erinnerungen bleiben erreichbar', async () => {
  const [planner, css, blaetter] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
    read('assets/css/feature/planner.css'),
  ]);
  for (const id of ['createEventOption', 'createGroupEventOption', 'createReminderOption',
                    'mobileRemindersBtn', 'mobileReminderCount', 'mobileCalAddBtn', 'reminderHubList', 'reminderHubAdd', 'reminderComplete']) {
    assert.match(planner, new RegExp(`id="${id}"`), `${id} fehlt`);
  }
  assert.match(planner, /id="reminderHubList"[\s\S]*id="reminderHubAdd"/);
  assert.match(planner, /document\.body\.dataset\.calendarView = curView/);
  assert.match(planner, /setReminderCompletion\(existing, !existing\.completed\)/);
  assert.match(planner, /item\.completed = completed;\s*renderReminders\(\);/);
  assert.match(planner, /requestedAction === 'reminder-new'/);
  assert.match(planner, /setTimeout\(openReminderHub, 100\)/);
  // Der runde Knopf steht über der Tab-Leiste, im Rahmen am Rand.
  assert.match(css, /\.kal-fab \{[\s\S]*?position: fixed;[\s\S]*?bottom: calc\(var\(--tvza-shell-bottom, calc\(var\(--nav-hoehe\) \+ env\(safe-area-inset-bottom\)\)\) \+ var\(--s4\)\);/);
  assert.match(css, /html\.tvza-content-frame \.kal-fab \{ bottom: var\(--s4\); \}/);
  // Blätter öffnen über der Tab-Leiste, nicht dahinter.
  assert.match(blaetter, /\.planner-page \.sheet \{\s*bottom: var\(--tvza-shell-bottom/);
  assert.match(blaetter, /\.sheet \{[\s\S]*?visibility: hidden;/, 'ein geschlossenes Blatt lag über der Tab-Leiste (v.35.46.0)');
});

test('der Monat am Handy: Punkte je Tag, die Einträge des Tags darunter', async () => {
  const [planner, css] = await Promise.all([
    read('pages/planner.html'),
    read('assets/css/feature/calendar.css'),
  ]);
  const monat = planner.match(/function renderMonat\(el, liste\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(monat, /const kompakt = isMobileCalendar\(\);/);
  assert.match(monat, /tagesListeHtml\(anchorKey, liste, \{ vorbeiVon \}\)/);
  // Ein Tag im Monat wählt am Handy den Tag, am Laptop öffnet er ihn.
  assert.match(planner, /if \(curView === 'month' && isMobileCalendar\(\)\) renderCurrentView\(\);\s*else setView\('day'\);/);
  assert.match(css, /\.kal-monatsraster\.is-kompakt \.kal-mtag\.is-gewaehlt \.kal-mtag__num/);
});
