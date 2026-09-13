/* Der TVZA-Kreis (v.35.48.0).

   Michel: "ich möchte eig TVZA nur für Freunde und Familie aber
   integriert mit dem Firn". Und: zu Firn kommt man eigentlich erst, wenn
   man in die Gruppe geht.

   Also: im Kreis ist, wen Timo oder Michel hineinnehmen (Admin). Für den
   Kreis sind Start, Kalender und Chat TVZA, und die Gruppe ist Firn —
   der Wechsel dazwischen ist die Verwandlung aus wechsel.js. Wer nicht
   im Kreis ist (wer einem Verein beitritt), sieht Firn und von TVZA
   nichts. Niemand, der heute TVZA hat, verliert es. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { kreisAbgleich, bekannteAus } from '../assets/js/bekannte.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = pfad => readFile(join(root, pfad), 'utf8');

/* Die Registry samt Freigabe-Logik ohne Firebase — wie tvza-teil.test. */
async function registry() {
  const q = await lies('assets/js/firebase-config.js');
  const von = q.indexOf('export const MODULES = {');
  const bis = q.indexOf('\n}\n', q.indexOf('export function enabledModules')) + 3;
  const quelle = q.slice(von, bis).replace(/^export /gm, '');
  return vm.runInNewContext(`${quelle}
    ({ TVZA_BEREICHE, NEUE_KONTEN, imKreis, allowedModules, enabledModules })`);
}

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

/* ── Wer im Kreis ist ──────────────────────────────────────────────*/

test('im Kreis: der Admin, wen er hineingenommen hat — und wer schon TVZA hatte', async () => {
  const { imKreis, NEUE_KONTEN } = await registry();
  assert.equal(imKreis({ isTimo: true, kreis: false }), true, 'der Admin ist immer im Kreis');
  assert.equal(imKreis({ kreis: true, allowedModules: NEUE_KONTEN.erlaubt }), true);
  assert.equal(imKreis({ kreis: false, allowedModules: { food: true, matura: true } }), false,
    'hinausgenommen heisst draussen, auch mit alten Freigaben');

  // Nie entschieden: wer schon einen TVZA-Bereich frei hatte, bleibt drin.
  assert.equal(imKreis({ allowedModules: { matura: true } }), true);
  // Ganz alte Profile ohne Freigabe erben die Vorgabe — Food war frei.
  assert.equal(imKreis({}), true, 'ein altes Konto verliert nichts');

  // Wer neu dazukommt — etwa über eine Einladung in einen Kader —, ist draussen.
  assert.equal(imKreis({ allowedModules: NEUE_KONTEN.erlaubt }), false);
});

test('draussen gibt es TVZA nicht — egal was freigegeben ist', async () => {
  const { allowedModules, enabledModules, TVZA_BEREICHE, NEUE_KONTEN } = await registry();
  const draussen = { kreis: false, allowedModules: { ...NEUE_KONTEN.erlaubt, food: true, matura: true }, modules: { food: true, matura: true } };
  for (const key of TVZA_BEREICHE) {
    assert.equal(allowedModules(draussen)[key], false, `${key} ist draussen frei`);
    assert.equal(enabledModules(draussen)[key], false, `${key} ist draussen sichtbar`);
  }
  assert.equal(allowedModules(draussen).training, true, 'Firn bleibt, wie es war');

  const drin = { kreis: true, allowedModules: { ...NEUE_KONTEN.erlaubt, food: true }, modules: { food: true } };
  assert.equal(enabledModules(drin).food, true);
  assert.equal(allowedModules(drin).matura, false, 'im Kreis entscheidet weiter die einzelne Freigabe');
});

/* ── Die Regeln ────────────────────────────────────────────────────*/

test('in den Kreis nimmt nur der Admin — niemand sich selbst', async () => {
  const rules = await lies('firestore.rules');
  const users = block(rules, 'match /users/{uid} {');
  const selbst = users.match(/request\.auth\.uid == uid\s*&& request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasOnly\(\[([^\]]+)\]\)/)?.[1];
  assert.ok(selbst, 'die Selbständerung am Profil nicht gefunden');
  assert.doesNotMatch(selbst, /kreis/, 'wer sein Profil ändern darf, dürfte sich sonst selbst in den Kreis setzen');
  const anlegen = users.match(/allow create:[\s\S]*?keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(anlegen);
  assert.doesNotMatch(anlegen, /kreis/, 'ein neues Konto dürfte sich sonst beim Registrieren hineinschreiben');

  const kreis = block(rules, 'match /kreis/{uid} {');
  assert.match(kreis, /allow list: if imKreis\(\) \|\| isAdmin\(\);/, 'die Liste sehen nur die, die darauf stehen');
  assert.match(kreis, /allow create, update: if isAdmin\(\)/);
  assert.match(kreis, /allow delete: if isAdmin\(\);/);
  assert.match(kreis, /keys\(\)\.hasOnly\(\['seit'\]\)/, 'auf der Liste steht nichts als seit wann');
  assert.match(rules, /function imKreis\(\) \{\s*return isMember\(\)\s*&& exists\(\/databases\/\$\(database\)\/documents\/kreis\/\$\(request\.auth\.uid\)\);/);
});

test('der Admin schreibt Profil und Kreisliste in einem Stapel', async () => {
  const start = await lies('assets/js/feature/start/start.js');
  const admin = start.slice(start.indexOf('async function renderAdminUsers('));
  assert.match(admin, /<input type="checkbox" data-admin-kreis \$\{kreis \? 'checked' : ''\} \/>/);
  assert.match(admin, /const kreis = row\.querySelector\('\[data-admin-kreis\]'\)\.checked;/);
  assert.match(admin, /stapel\.update\(doc\(db, 'users', uid\), \{\s*allowedModules: allowedModulesNext,\s*isTimo,\s*kreis\s*\}\);/);
  assert.match(admin, /if \(kreis \|\| isTimo\) stapel\.set\(doc\(db, 'kreis', uid\), \{ seit: serverTimestamp\(\) \}\);\s*else stapel\.delete\(doc\(db, 'kreis', uid\)\);\s*await stapel\.commit\(\);/);
  // Hinein gibt die TVZA-Bereiche frei, hinaus nimmt sie.
  assert.match(admin, /if \(istTvza\(cb\.dataset\.adminAllowed\)\) cb\.checked = schalter\.checked;/);
});

test('kreisAbgleich: die Liste folgt den Profilen', () => {
  const imKreis = p => p.kreis === true;
  const { hinzu, weg } = kreisAbgleich(
    [{ uid: 'timo', kreis: true }, { uid: 'anna', kreis: true }, { uid: 'lea', kreis: false }],
    new Set(['timo', 'lea', 'geloescht']),
    imKreis,
  );
  assert.deepEqual(hinzu, ['anna']);
  assert.deepEqual(weg, ['lea', 'geloescht'], 'wer hinausgenommen oder gelöscht ist, geht von der Liste');
});

test('im Kreis kennt man einander — auch ohne gemeinsame Gruppe', async () => {
  const groups = await lies('assets/js/groups.js');
  assert.match(groups, /export async function kontakte\(uid, \{ kreis = false \} = \{\}\)/);
  assert.match(groups, /if \(kreis\) jeGruppe\.push\(\{ gruppe: 'TVZA', mitglieder: await kreisMitglieder\(\) \}\);/);
  const liste = bekannteAus([
    { gruppe: 'BSV Perspektivkader', mitglieder: [{ uid: 'michel', name: 'Michel' }] },
    { gruppe: 'TVZA', mitglieder: [{ uid: 'michel', name: 'Michel' }, { uid: 'anna', name: 'Anna' }] },
  ], 'timo');
  assert.deepEqual(liste.map(b => [b.uid, b.gruppen.join(' · ')]), [
    ['anna', 'TVZA'], ['michel', 'BSV Perspektivkader · TVZA'],
  ]);
});

/* ── Das Zuhause ───────────────────────────────────────────────────*/

test('Start, Kalender und Chat sind das Zuhause — sonst keine Seite', async () => {
  const seiten = ['index.html', 'pages/planner.html', 'pages/messages.html'];
  for (const s of seiten) {
    const html = await lies(s);
    assert.match(html, /<body[^>]*\sdata-zuhause[\s>]/, `${s} ist kein Zuhause`);
    assert.doesNotMatch(html, /<body[^>]*data-marke/, `${s} darf nicht fest zu einer Software gehören`);
  }
  for (const s of ['pages/gruppe.html', 'pages/training.html', 'pages/einheit.html', 'pages/maturaarbeit.html']) {
    assert.doesNotMatch(await lies(s), /data-zuhause/, `${s} ist kein Zuhause`);
  }
});

test('im Kreis ist das Zuhause TVZA, draussen Firn — die Gruppe bleibt Firn', async () => {
  const { JSDOM } = await import('jsdom');
  const w = await import('../assets/js/wechsel.js');
  const seite = (body, kopf = '<title>Kalender — Firn</title><link rel="icon" href="../assets/icons/firn.svg">') =>
    new JSDOM(`<head>${kopf}</head><body ${body}><div class="fx-version">Firn · v.35.48.0</div></body>`).window.document;

  w.kreisSetzen(false);
  const draussen = seite('data-zuhause');
  assert.equal(w.softwareVon(draussen), w.FIRN);
  assert.equal(w.zuhauseMarkieren(draussen), false, 'draussen wird nichts umbenannt');
  assert.equal(draussen.title, 'Kalender — Firn');

  w.kreisSetzen(true);
  assert.equal(w.softwareVon(seite('')), w.FIRN, 'die Gruppe ist auch im Kreis Firn');
  assert.equal(w.softwareVon(seite('data-marke="TVZA"')), w.TVZA);

  const start = seite('data-zuhause', '<title data-i18n="home.seitentitel">Firn</title><link rel="icon" href="assets/icons/firn.svg">');
  assert.equal(w.softwareVon(start), w.TVZA);
  assert.equal(w.zuhauseMarkieren(start), true);
  assert.equal(start.body.dataset.marke, 'TVZA');
  assert.equal(start.title, 'TVZA');
  assert.equal(start.querySelector('title').hasAttribute('data-i18n'), false,
    'sonst setzt der Katalog, der später kommt, "Firn" zurück');
  assert.equal(start.querySelector('link[rel="icon"]').getAttribute('href'), 'assets/icons/tvza.svg');
  assert.equal(start.querySelector('.fx-version').textContent, 'TVZA · v.35.48.0');
  w.kreisSetzen(false);
});

test('der Tab folgt dem Zuhause im Rahmen, bevor es sich selbst umbenennt', async () => {
  const { JSDOM } = await import('jsdom');
  const { tabFolgen } = await import('../assets/js/router.js');
  const w = await import('../assets/js/wechsel.js');
  const oben = new JSDOM('<title>TVZA</title><link rel="icon" href="https://firn.test/assets/icons/tvza.svg">',
    { url: 'https://firn.test/' }).window.document;
  const link = oben.querySelector('link[rel="icon"]');
  const eigen = { symbol: link.href, titel: oben.title };
  const rahmen = (body, titel) => ({ contentDocument: new JSDOM(
    `<head><title>${titel}</title><link rel="icon" href="../assets/icons/firn.svg"></head><body ${body}></body>`,
    { url: 'https://firn.test/pages/x.html' }).window.document });

  w.kreisSetzen(true);
  tabFolgen(oben, rahmen('data-zuhause', 'Nachrichten — Firn'), eigen);
  assert.equal(oben.title, 'Nachrichten — TVZA');
  assert.equal(link.href, 'https://firn.test/assets/icons/tvza.svg');

  tabFolgen(oben, rahmen('', 'Gruppe — Firn'), eigen);
  assert.equal(oben.title, 'Gruppe — Firn', 'die Gruppe bleibt Firn');
  assert.equal(link.href, 'https://firn.test/assets/icons/firn.svg');

  w.kreisSetzen(false);
  tabFolgen(oben, rahmen('data-zuhause', 'Nachrichten — Firn'), eigen);
  assert.equal(oben.title, 'Nachrichten — Firn', 'draussen ist das Zuhause Firn');
});

test('die Leiste kennt den Kreis, bevor sie ihr Zeichen wählt', async () => {
  const shell = await lies('assets/js/shell.js');
  const rail = shell.slice(shell.indexOf('export function mountRail('));
  const kreis = rail.indexOf('kreisSetzen(imKreis(profile))');
  const markieren = rail.indexOf('zuhauseMarkieren(document)');
  const zeichen = rail.indexOf('const software = softwareVon(document)');
  assert.ok(kreis > 0 && kreis < markieren && markieren < zeichen,
    'sonst blitzt bei Freunden und Familie erst Firn auf');
  // Ein leeres Profil (nicht geladen) ist keine Entscheidung.
  assert.match(rail, /if \(profile && Object\.keys\(profile\)\.length\) kreisSetzen/);
});

test('Start im Kreis: das Eigene zuerst, die Firn-Bereiche mit ihrem Zeichen', async () => {
  const [start, html] = await Promise.all([lies('assets/js/feature/start/start.js'), lies('index.html')]);
  assert.match(start, /const kreis = imKreis\(profile\);/);
  assert.match(start, /document\.getElementById\('firnMarke'\)\.hidden = !kreis;/);
  assert.match(html, /id="trackerSection"[\s\S]{0,200}<span class="firn-marke" id="firnMarke" hidden>Firn<\/span>/);
  const kit = await lies('assets/css/kit.css');
  assert.match(kit, /\.tvza-marke,\s*\.firn-marke \{/, 'beide Zeichen in derselben Stimme');
});
