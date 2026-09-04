import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

/* Samt der Module: der Code der Startseite liegt seit v.35.11.0
   in assets/js/feature/start/, die Zusagen gelten weiter. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await leserMitStart(root)('index.html');

test('dashboard state exists before modules are rendered', () => {
  assert.ok(
    html.indexOf('let reorderEditing = false;') < html.indexOf('applyModules();'),
    'reorderEditing must be initialized before applyModules runs'
  );
});

/* Frueher zeigte Start nur die ersten VIER Bereiche; "der Rest" sollte
   im Bereiche-Tab wohnen. Den Tab gibt es seit v.33 nicht mehr, und
   pages/bereiche.html verlinkt niemand — fuenf eingeschaltete Module
   waren damit von Start aus schlicht nicht erreichbar.

   Die Liste traegt alle. Was BLEIBT, ist der Ausschluss der drei mit
   eigenem Tab: "eine Sache, ein Ort" (§6.4). */
test('jeder eingeschaltete Bereich steht in der Liste, ausser den Tabs', () => {
  assert.match(
    html,
    /const quickAccessExcluded = new Set\(\['dm', 'watch', 'trip'\]\);/
  );

  const match = html.match(
    /function zeigeBereiche\(\) \{[\s\S]*?\n\}/
  );
  assert.ok(match, 'zeigeBereiche nicht gefunden');

  const ids = [
    'ski', 'food', 'watch', 'weather',
    'dm', 'trip', 'matura', 'maturatracker'
  ];
  const tiles = ids.map(id => ({
    id,
    dataset: { enabled: '1', trackerTile: id },
    hidden: false,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    link: { hidden: false },
    querySelector(selector) {
      return selector === '.row' ? this.link : null;
    }
  }));
  const context = {
    quickAccessExcluded: new Set(['dm', 'watch', 'trip']),
    document: { querySelectorAll: () => tiles }
  };

  vm.runInNewContext(match[0], context);
  const sichtbar = () => tiles.filter(t => !t.hidden).map(t => t.id);

  context.zeigeBereiche();
  assert.deepEqual(sichtbar(),
    ['ski', 'food', 'weather', 'matura', 'maturatracker'],
    'ein eingeschalteter Bereich fehlt in der Liste');

  /* Und die Zeile selbst wird mit versteckt, nicht nur ihr Rahmen —
     sonst bliebe ein anklickbarer Streifen stehen. */
  const aus = tiles.find(t => t.id === 'dm');
  assert.equal(aus.hidden, true);
  assert.equal(aus.link.hidden, true);

  /* Ein ausgeschaltetes Modul verschwindet, auch wenn es keinen Tab hat. */
  tiles.find(t => t.id === 'food').dataset.enabled = '0';
  context.zeigeBereiche();
  assert.deepEqual(sichtbar(), ['ski', 'weather', 'matura', 'maturatracker']);
});
