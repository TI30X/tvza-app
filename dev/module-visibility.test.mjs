import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

const firebase = await readFile(
  new URL('../assets/js/firebase-config.js', import.meta.url),
  'utf8'
);
/* Samt der Module — siehe dev/start-quelle.mjs. */
const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = await leserMitStart(wurzel)('index.html');
const shell = await readFile(
  new URL('../assets/js/shell.js', import.meta.url),
  'utf8'
);
const nav = await readFile(
  new URL('../assets/js/nav.js', import.meta.url),
  'utf8'
);

function visibilityHelpers() {
  const allowedSource = firebase.match(
    /export function allowedModules\(profile\) \{[\s\S]*?\n\}/
  )?.[0];
  const enabledSource = firebase.match(
    /export function enabledModules\(profile\) \{[\s\S]*?\n\}/
  )?.[0];
  /* Seit v.35.48.0 fragt allowedModules den TVZA-Kreis (kreis.test.mjs). */
  const kreisSource = firebase.match(
    /export function imKreis\(profile\) \{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(allowedSource && enabledSource && kreisSource, 'module visibility helpers not found');

  const context = {
    MODULES: {
      ski:{}, food:{}, trip:{}, dm:{}, matura:{}, maturatracker:{}, admin:{},
    },
    DEFAULT_MODULES: {
      ski:false, food:true, trip:true, dm:true, matura:false, maturatracker:false, admin:false,
    },
    ALL_MODULES: {
      ski:true, food:true, trip:true, dm:true, matura:true, maturatracker:true, admin:true,
    },
    DEFAULT_VISIBLE_MODULES: {
      ski:false, food:true, trip:true, dm:true, matura:true, maturatracker:false, admin:true,
    },
    CORE_MODULE_KEYS: ['trip', 'dm'],
    TVZA_BEREICHE: ['matura', 'maturatracker', 'food'],
  };
  vm.runInNewContext(
    `${kreisSource.replace('export ', '')}
     ${allowedSource.replace('export ', '')}
     ${enabledSource.replace('export ', '')}
     this.allowedModules = allowedModules;
     this.enabledModules = enabledModules;
     this.imKreis = imKreis;`,
    context
  );
  return context;
}

test('personal visibility can hide an allowed module, including for the admin', () => {
  const { enabledModules } = visibilityHelpers();

  const admin = enabledModules({
    isTimo:true,
    modules:{ matura:true, maturatracker:false },
  });
  assert.equal(admin.matura, true);
  assert.equal(admin.maturatracker, false);

  const member = enabledModules({
    allowedModules:{ ski:true },
    modules:{ ski:false, food:true },
  });
  assert.equal(member.ski, false);
  assert.equal(member.food, true);
});

test('personal visibility never grants access or auto-shows a newly allowed option', () => {
  const { enabledModules } = visibilityHelpers();

  assert.equal(
    enabledModules({
      allowedModules:{ matura:false },
      modules:{ matura:true },
    }).matura,
    false
  );

  const legacy = enabledModules({ allowedModules:{ ski:true } });
  assert.equal(legacy.ski, false);
  assert.equal(legacy.food, true);
});

test('admin defaults to Maturaarbeit without the optional tracker', () => {
  const { enabledModules } = visibilityHelpers();
  const admin = enabledModules({ isTimo:true });
  assert.equal(admin.matura, true);
  assert.equal(admin.maturatracker, false);
  assert.equal(admin.admin, true);
  assert.equal(enabledModules({ allowedModules:{ admin:true } }).admin, false);
});

test('calendar and direct messages remain enabled regardless of saved flags', () => {
  const { allowedModules, enabledModules } = visibilityHelpers();
  const profile = {
    allowedModules:{ trip:false, dm:false },
    modules:{ trip:false, dm:false },
  };
  assert.equal(allowedModules(profile).trip, true);
  assert.equal(allowedModules(profile).dm, true);
  assert.equal(enabledModules(profile).trip, true);
  assert.equal(enabledModules(profile).dm, true);
});

/* Die Bereiche-Seite ist geloescht — ihr Inhalt steht auf Start.
   Geprueft wird darum nur noch, dass eine gespeicherte Auswahl die
   Startseite UND die Huelle erreicht. */
test('eine gespeicherte Auswahl erreicht Start und die Huelle', () => {
  assert.match(dashboard, />Meine Bereiche</);
  assert.match(dashboard, /id="modulesSaveStatus"[\s\S]*id="moduleToggles"/);
  assert.match(dashboard, /moduleToggles'\)\.addEventListener\('change'/);
  /* Bis v.35.22.0 stand hier { modules } — der Zustand ALLER Schalter.
     Genau das hat die Projekte ausgeblendet: jede Vorgabe fror beim
     naechsten Umschalten im Profil ein. Der Test hielt den Fehler fest,
     statt ihn zu verhindern; gespeichert wird jetzt nur der eine
     Schluessel (siehe "ein Schalter speichert nur sich selbst"). */
  assert.match(dashboard, /setDoc\(doc\(db, 'users', user\.uid\), \{ modules: \{ \[key\]: an \} \}, \{ merge:true \}\)/);
  assert.match(
    dashboard,
    /window\.dispatchEvent\(new CustomEvent\('tvza-modules-change'/
  );
  assert.match(shell, /window\.addEventListener\('tvza-modules-change'/);
  /* Die Huelle MERKT sich die neue Auswahl, zeichnet aber nichts
     nach — in der Leiste steht kein Bereich mehr. Die Startseite
     hoert auf dasselbe Ereignis und zieht ihre Liste nach. */
  assert.doesNotMatch(shell, /refreshShellAreaNavigation\(/,
    'die Huelle zeichnet wieder eine Bereichsliste');
  assert.match(shell, /window\.tvzaShellModulesHandler = event =>/);
  assert.match(nav, /onSnapshot\(doc\(db, 'users', user\.uid\)/);
});

/* ── Projekte ──────────────────────────────────────────────────────
   "Meine Projekte" stand fest verdrahtet auf der Startseite: kein
   Modul, kein Schalter, fuer jedes Konto sichtbar. Ein neues, leeres
   Konto sah damit einen Abschnitt mit einer leeren Liste und einem
   Knopf "Link kopieren" fuer eine oeffentliche Seite, die es gar
   nicht hat — genau der Fall, den Regel 4 aus CLAUDE.md (Tag-eins-
   Test) ausschliesst.

   Projekte ist darum ein Bereich wie publicProjects: aus, bis jemand
   ihn einschaltet. */

function realVisible() {
  const vorgabe = firebase.match(/export const DEFAULT_MODULES = (\{[^}]*\});/)?.[1];
  const quelle = firebase.match(/export const DEFAULT_VISIBLE_MODULES = (\{[\s\S]*?\n\});/)?.[1];
  assert.ok(vorgabe && quelle, 'DEFAULT_VISIBLE_MODULES nicht gefunden');
  return vm.runInNewContext(`const DEFAULT_MODULES = (${vorgabe}); (${quelle})`);
}

function realDefaults() {
  const quelle = firebase.match(/export const DEFAULT_MODULES = (\{[^}]*\});/)?.[1];
  assert.ok(quelle, 'DEFAULT_MODULES nicht gefunden');
  return vm.runInNewContext(`(${quelle})`);
}

test('Projekte ist ein Modul und fuer neue Konten aus', () => {
  assert.equal(realDefaults().projects, false,
    'Projekte darf fuer ein frisches Konto nicht an sein — es hat noch keine');

  const eintrag = firebase.match(/^\s*projects:\s*\{[^}]*\}/m)?.[0];
  assert.ok(eintrag, 'kein projects-Eintrag in MODULES');
  assert.ok(!/\bpage\s*:/.test(eintrag),
    'projects darf keine page haben: der Abschnitt wohnt auf Start und bekaeme '
    + 'sonst zusaetzlich eine Zeile in der Bereiche-Liste (Regel 3, eine Sache, ein Ort)');
});

test('die Startseite zeigt Projekte nur mit dem Modul', () => {
  assert.match(dashboard,
    /getElementById\('projectsSection'\)\.style\.display = mods\.projects \? '' : 'none';/,
    'der Projekte-Abschnitt haengt an keinem Modulschalter');

  const abschnitt = dashboard.match(/<section[^>]*id="projectsSection"[^>]*>/)?.[0];
  assert.ok(abschnitt, 'projectsSection nicht gefunden');
  assert.match(abschnitt, /display:\s*none/,
    'der Abschnitt muss verborgen starten, sonst blitzt er auf, bevor der '
    + 'Schalter greift');
});

test('Projekte bleibt fuer TvZ sichtbar, obwohl es fuer neue Konten aus ist', () => {
  /* Off by default heisst nicht "auch fuer den, dem es gehoert". Es ist
     sein privater Bereich — er soll ihn sehen, ohne ihn erst
     einzuschalten. Genau die Trennung, die es fuer matura schon gibt:
     DEFAULT_MODULES steuert die Freigabe, DEFAULT_VISIBLE_MODULES die
     persoenliche Ansicht. */
  assert.equal(realDefaults().projects, false, 'die Freigabe muss aus bleiben');
  assert.equal(realVisible().projects, true,
    'TvZ (isTimo -> alles erlaubt) saehe seine eigenen Projekte sonst nicht mehr');
});

/* ── Kein globaler Feed mehr ───────────────────────────────────────
   "Öffentliche Projekte · von allen" zeigte in der App die
   freigegebenen Projekte ALLER Konten. Das ist weg.

   Was bleibt, ist die oeffentliche Seite: public.html liest dieselbe
   Sammlung, index.html schreibt weiter hinein. Darueber teilt TvZ
   seine Projekte per Link mit Freunden — die Sammlung ist der
   Speicher dafuer und darf nicht mitverschwinden. */

test('die App hat keinen globalen Projekt-Feed mehr', async () => {

  /* In diesen Dateien darf der Name gar nicht mehr vorkommen. */
  for (const [name, quelle] of [['firebase-config.js', firebase],
                                ['shell.js', shell], ['nav.js', nav]]) {
    assert.ok(!quelle.includes('publicProjects'),
      `${name} kennt publicProjects noch — der Feed sollte weg sein`);
  }

  /* index.html ist der Sonderfall: der SAMMLUNGSNAME bleibt, weil die
     Seite weiter hineinschreibt. Weg muss nur das Modul und der
     Abschnitt, der den Feed anzeigte. */
  assert.ok(!dashboard.includes('mods.publicProjects'),
    'index.html schaltet noch etwas an mods.publicProjects');
  assert.ok(!dashboard.includes('publicFeed'),
    'publicFeedSection steht noch in index.html');
  assert.ok(!dashboard.includes("publicProjects: '"),
    'index.html fuehrt publicProjects noch in einer Zuordnung');
});

test('die oeffentliche Seite bleibt und behaelt ihren Speicher', async () => {
  const oeffentlich = await leserMitStart(wurzel)('public.html');
  assert.match(oeffentlich, /collection\(db, 'publicProjects'\)/,
    'public.html liest die Sammlung nicht mehr — ohne sie ist die geteilte Seite leer');
  assert.match(dashboard, /doc\(db, 'publicProjects'/,
    'index.html schreibt nicht mehr hinein — dann fuellt sich die Seite nie');
  assert.match(dashboard, /id="publicPageLink"/,
    'der Knopf zum Teilen des Links fehlt');
});

/* ── Die verschwundenen Projekte ───────────────────────────────────
   Bis v.35.22.0 schrieb das Umlegen EINES Schalters den Zustand ALLER
   Schalter ins Profil. Als Projekte am 3. September fuer ein paar
   Stunden per Vorgabe aus war, fror dieses "aus" bei jedem ein, der in
   dem Fenster irgendetwas umschaltete — und blieb, obwohl die Vorgabe
   laengst wieder stimmte. */

function reparatur() {
  const quelle = firebase.match(/export function projekteReparatur\(profile\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(quelle, 'projekteReparatur nicht gefunden');
  return vm.runInNewContext(`(${quelle.replace('export ', '')})`);
}

test('die Reparatur holt die Projekte fuer TvZ zurueck, genau einmal', () => {
  const repariere = reparatur();

  const kaputt = { isTimo: true, modules: { projects: false, food: true } };
  const heil = repariere(kaputt);
  assert.equal(heil.projects, true);
  assert.equal(heil.food, true, 'die anderen Schalter bleiben, wie sie sind');
  assert.equal(heil.projekteRepariert, true);

  /* Wer Projekte nach der Reparatur bewusst ausblendet, bleibt
     ausgeblendet. Sonst waere der Schalter eine Attrappe. */
  assert.equal(repariere({ isTimo: true, modules: { ...heil, projects: false } }), null);
});

test('die Reparatur fasst niemanden sonst an', () => {
  const repariere = reparatur();
  /* Fuer andere Konten ist Projekte gar nicht freigegeben — ein
     gespeichertes false ist dort richtig. */
  assert.equal(repariere({ isTimo: false, modules: { projects: false } }), null);
  assert.equal(repariere({ modules: { projects: false } }), null);
  /* Nichts gespeichert, oder schon an: nichts zu reparieren. */
  assert.equal(repariere({ isTimo: true }), null);
  assert.equal(repariere({ isTimo: true, modules: { projects: true } }), null);
  assert.equal(repariere({ isTimo: true, modules: {} }), null);
});

test('die Marke der Reparatur macht keinen Bereich sichtbar', () => {
  /* Sie steht IN modules, weil die Regeln am eigenen Profil kein
     neues Feld erlauben. enabledModules darf sie darum nicht als
     Modul lesen. */
  const { enabledModules } = visibilityHelpers();
  const sichtbar = enabledModules({ modules: { projekteRepariert: true } });
  assert.equal('projekteRepariert' in sichtbar, false);
});

test('ein Schalter speichert nur sich selbst, nicht alle', async () => {
  const start = await readFile(join(wurzel, 'assets/js/feature/start/start.js'), 'utf8');
  const speichern = start.match(/function savePersonalModules\(key, an\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(speichern, 'savePersonalModules(key, an) nicht gefunden');

  /* Geschrieben wird genau der eine Schluessel. Eine Vorgabe ist keine
     Entscheidung und gehoert nicht ins Profil. */
  assert.match(speichern, /setDoc\(doc\(db, 'users', user\.uid\), \{ modules: \{ \[key\]: an \} \}, \{ merge:true \}\)/);
  assert.doesNotMatch(start, /selectedPersonalModules/,
    'die Funktion, die alle Schalter einsammelte, ist weg');
  assert.match(start, /savePersonalModules\(event\.target\.dataset\.mod, event\.target\.checked\)/);

  /* Die Reparatur laeuft beim Laden des Profils. */
  assert.match(start, /projekteReparatur\(profile\)/);
});
