/* Der TVZA-Teil — Firn und das Persönliche getrennt.

   Michel: "die Maturaarbeit war für mich und meine Freunde". Firn ist
   der Ort für Gruppen (Kader, Verein, Gym, Familie); Maturaarbeit, Food,
   Watchlist und Projekte sind TVZA — gebaut für Timo und seine Freunde.
   Seit v.35.35.0 stehen sie auf Start in einem eigenen Teil, tragen in
   ihren Seiten das Zeichen TVZA und sind für neue Konten nicht
   freigegeben.

   Eine Liste entscheidet (TVZA_BEREICHE in firebase-config.js). Dieser
   Test rechnet mit genau dieser Liste nach — aus der Quelle gelesen,
   nicht abgeschrieben. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = pfad => readFile(join(root, pfad), 'utf8');

/* Die Registry samt Freigabe-Logik ohne Firebase: vom MODULES-Block bis
   enabledModules, "export" gestrichen, in einem eigenen Kontext. */
async function registry() {
  const q = await lies('assets/js/firebase-config.js');
  const von = q.indexOf('export const MODULES = {');
  const bis = q.indexOf('\n}\n', q.indexOf('export function enabledModules')) + 3;
  assert.ok(von > 0 && bis > von, 'Registry nicht gefunden');
  const quelle = q.slice(von, bis).replace(/^export /gm, '');
  return vm.runInNewContext(`${quelle}
    ({ MODULES, CORE_MODULE_KEYS, TVZA_BEREICHE, istTvza, NEUE_KONTEN, DEFAULT_MODULES, allowedModules, enabledModules })`);
}

test('die Einteilung: persönlich ist, was Timo für sich und seine Freunde gebaut hat', async () => {
  const r = await registry();
  for (const key of r.TVZA_BEREICHE) assert.ok(key in r.MODULES, `${key} ist kein Bereich`);
  assert.deepEqual([...r.TVZA_BEREICHE].sort(), ['food', 'matura', 'maturatracker', 'projects', 'watch']);
  /* Was Gruppen brauchen, bleibt Firn: der Kern, Training, und der Admin
     ist ohnehin kein Bereich. */
  for (const key of [...r.CORE_MODULE_KEYS, 'training', 'admin']) {
    assert.ok(!r.istTvza(key), `${key} darf nicht TVZA sein`);
  }
});

test('ein neues Konto: der Kern an, Firn frei aber aus, TVZA nicht frei', async () => {
  const r = await registry();
  const { erlaubt, sichtbar } = r.NEUE_KONTEN;
  for (const key of Object.keys(r.MODULES)) {
    if (r.CORE_MODULE_KEYS.includes(key)) {
      assert.equal(erlaubt[key], true, `${key} gehört zum Kern`);
      assert.equal(sichtbar[key], true, `${key} gehört zum Kern`);
    } else {
      /* CLAUDE.md, Falle 3: "Für neue Konten aus." Vorher waren Food,
         Watchlist und Wetter für jedes neue Konto an. */
      assert.equal(sichtbar[key], false, `${key} ist für ein neues Konto an`);
      assert.equal(erlaubt[key], !r.istTvza(key) && key !== 'admin', `${key}: falsche Freigabe`);
    }
  }
  /* Und so kommt es an: eingeschaltet ist nur der Kern. */
  const an = r.enabledModules({ allowedModules: { ...erlaubt }, modules: { ...sichtbar } });
  assert.deepEqual(Object.keys(an).filter(k => an[k]).sort(), [...r.CORE_MODULE_KEYS].sort());
  /* Einen Firn-Bereich schaltet man selbst ein — einen TVZA-Bereich nicht. */
  const selbst = r.enabledModules({ allowedModules: { ...erlaubt }, modules: { ...sichtbar, weather: true, food: true } });
  assert.equal(selbst.weather, true);
  assert.equal(selbst.food, false, 'ein neues Konto schaltet sich einen TVZA-Bereich selbst frei');
});

test('bestehende Konten verlieren durch die Trennung nichts', async () => {
  /* DEFAULT_MODULES ist die Rückfallebene für Profile ohne gespeicherte
     Freigabe. Sie bleibt, wie sie war — wer Food bisher hatte, hat es
     weiter. Nur neue Konten starten schlanker. */
  const r = await registry();
  assert.equal(r.DEFAULT_MODULES.food, true);
  assert.equal(r.allowedModules({}).food, true);
  assert.equal(r.allowedModules({ allowedModules: { food: true, watch: true } }).watch, true);
});

test('die Registrierung benutzt die Vorgaben für neue Konten', async () => {
  const login = await lies('login.html');
  assert.match(login, /allowedModules: \{ \.\.\.NEUE_KONTEN\.erlaubt \}/);
  assert.match(login, /modules: \{ \.\.\.NEUE_KONTEN\.sichtbar \}/);
  assert.doesNotMatch(login, /\.\.\.DEFAULT_MODULES/);
});

test('Start: die persönlichen Kacheln stehen im TVZA-Teil, die übrigen bei Firn', async () => {
  const [html, r] = await Promise.all([leserMitStart(root)('index.html'), registry()]);
  const firn = html.match(/<div class="rows" id="trackerGrid">([\s\S]*?)\n        <\/div>\n        <p class="empty-hint" id="noModulesHint"/)?.[1] || '';
  const tvza = html.match(/<div class="rows" id="tvzaGrid">([\s\S]*?)\n        <\/div>\n      <\/section>/)?.[1] || '';
  assert.ok(firn && tvza, 'die beiden Raster fehlen');
  const kacheln = teil => [...teil.matchAll(/data-tracker-tile="([^"]+)"/g)].map(m => m[1]);
  assert.ok(kacheln(tvza).every(k => r.istTvza(k)) && kacheln(tvza).length, 'eine Firn-Kachel steht im TVZA-Teil');
  assert.ok(kacheln(firn).every(k => !r.istTvza(k)), 'eine TVZA-Kachel steht bei Firn');

  /* Der Teil ist anfangs verborgen und wird nur gezeigt, wenn darin
     etwas an ist; er trägt das Zeichen, die Projekte ebenfalls. */
  assert.match(html, /<section class="section" id="tvzaSection" data-overview-section="tvza" hidden>/);
  assert.match(html, /id="tvzaSection"[\s\S]{0,400}<span class="tvza-marke">TVZA<\/span>/);
  assert.match(html, /id="projectsSection"[\s\S]{0,400}<span class="tvza-marke">TVZA<\/span>/);
  assert.match(html, /overviewSectionDefaults = \['tracker', 'shared', 'tvza', 'projects'\]/);
  /* Beim Sortieren geht jede Kachel in ihr Raster zurück. */
  assert.match(html, /\(istTvza\(id\) && tvza \? tvza : firn\)\.appendChild\(tile\)/);
});

test('Einstellungen und Admin trennen Firn und TVZA', async () => {
  const start = await lies('assets/js/feature/start/start.js');
  const toggles = start.match(/function renderModuleToggles\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(toggles, /availableModules\.filter\(m => !istTvza\(m\.key\)\)/);
  assert.match(toggles, /availableModules\.filter\(m => istTvza\(m\.key\)\)/);
  assert.match(toggles, /class="tvza-marke">TVZA</);
  assert.match(start, /\$\{istTvza\(m\.key\) \? '<span class="tvza-marke">TVZA<\/span>' : ''\}/);
});

test('die persönlichen Seiten tragen das Zeichen, die Firn-Seiten nicht', async () => {
  const persoenlich = ['pages/maturaarbeit.html', 'pages/maturaarbeit-tracker.html', 'pages/foodtracker.html', 'pages/watchlist.html'];
  const firn = ['pages/training.html', 'pages/skitracker.html', 'pages/weather.html', 'pages/gruppe.html', 'pages/planner.html'];
  for (const seite of persoenlich) {
    assert.match(await lies(seite), /<span class="tvza-marke"[^>]*>TVZA<\/span>\s*<span class="appbar__title"/, `${seite}: das Zeichen fehlt im Kopf`);
  }
  for (const seite of firn) {
    assert.doesNotMatch(await lies(seite), /tvza-marke/, `${seite} ist Firn, nicht TVZA`);
  }
});

/* ── Das Symbol im Tab (v.35.39.0) ────────────────────────────────
   Die persönlichen Bereiche zeigen das TVZA-Symbol, alle anderen den
   Firn-Berg. Welche Seite welches trägt, folgt aus TVZA_BEREICHE und der
   Seite in MODULES — keine zweite Liste. */

test('jede Bereichsseite zeigt das Symbol ihrer Software', async () => {
  const r = await registry();
  let tvza = 0;
  for (const m of Object.values(r.MODULES)) {
    if (!m.page) continue;
    const html = await lies(m.page);
    const symbol = html.match(/<link rel="icon"[^>]*href="[^"]*icons\/([a-z-]+)\.svg"/)?.[1];
    const touch = html.match(/<link rel="apple-touch-icon" href="[^"]*icons\/([a-z0-9-]+)\.png"/)?.[1];
    const soll = r.istTvza(m.key) ? 'tvza' : 'firn';
    assert.equal(symbol, soll, `${m.page}: Tab-Symbol`);
    assert.equal(touch, `${soll}-192`, `${m.page}: Homescreen-Symbol`);
    if (soll === 'tvza') tvza++;
  }
  assert.equal(tvza, 4, 'Maturaarbeit, Tracker, Food, Watchlist — Projekte haben keine eigene Seite');
  assert.match(await lies('index.html'), /<link rel="icon"[^>]*icons\/firn\.svg"/, 'Start ist Firn');
});

/* Der Router laedt die Bereiche in einen Rahmen, die Seite oben bleibt
   stehen. Ohne symbolFolgen zeigte der Tab in der Maturaarbeit den
   Firn-Berg der Startseite. */
test('der Tab nimmt das Symbol der Seite im Rahmen, zurück auf Start das eigene', async () => {
  const { JSDOM } = await import('jsdom');
  const { symbolFolgen } = await import('../assets/js/router.js');
  const oben = new JSDOM('<link rel="icon" href="https://firn.test/assets/icons/firn.svg">', { url: 'https://firn.test/' }).window.document;
  const link = oben.querySelector('link[rel="icon"]');
  const eigenes = link.href;
  const rahmen = html => ({ contentDocument: new JSDOM(html, { url: 'https://firn.test/pages/x.html' }).window.document });

  symbolFolgen(link, rahmen('<link rel="icon" href="../assets/icons/tvza.svg">'), eigenes);
  assert.equal(link.href, 'https://firn.test/assets/icons/tvza.svg', 'in der Maturaarbeit bleibt der Firn-Berg');

  symbolFolgen(link, rahmen('<link rel="icon" href="../assets/icons/firn.svg">'), eigenes);
  assert.equal(link.href, eigenes, 'zurück in einem Firn-Bereich bleibt das T stehen');

  symbolFolgen(link, rahmen('<link rel="icon" href="../assets/icons/tvza.svg">'), eigenes);
  symbolFolgen(link, null, eigenes);
  assert.equal(link.href, eigenes, 'zurück auf der Startseite (kein Rahmen) bleibt das T stehen');

  symbolFolgen(link, rahmen('<title>ohne Symbol</title>'), eigenes);
  assert.equal(link.href, eigenes);
  symbolFolgen(link, { get contentDocument() { throw new Error('fremder Ursprung'); } }, eigenes);
  assert.equal(link.href, eigenes, 'ein Rahmen, den man nicht lesen darf, bricht nichts');
});
