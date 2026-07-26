import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('dashboard state exists before modules are rendered', () => {
  assert.ok(
    html.indexOf('let reorderEditing = false;') < html.indexOf('applyModules();'),
    'reorderEditing must be initialized before applyModules runs'
  );
});

test('quick access shows four eligible tiles and never duplicates tabs', () => {
  assert.match(
    html,
    /const quickAccessExcluded = new Set\(\['dm', 'watch', 'trip'\]\);/
  );

  const match = html.match(
    /function applyQuickAccess\(\) \{[\s\S]*?\n    \}\n\n    const h/
  );
  assert.ok(match, 'applyQuickAccess not found');
  const source = match[0].replace(/\n\n    const h$/, '');
  const ids = [
    'ski', 'food', 'watch', 'weather',
    'dm', 'trip', 'matura', 'maturatracker'
  ];
  const tiles = ids.map(id => ({
    id,
    dataset: { enabled: '1', trackerTile: id },
    style: {},
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    link: { style: {} },
    querySelector(selector) {
      return selector === '.card' ? this.link : null;
    }
  }));
  const context = {
    reorderEditing: false,
    quickAccessExcluded: new Set(['dm', 'watch', 'trip']),
    document: { querySelectorAll: () => tiles }
  };

  vm.runInNewContext(source, context);
  const visibleIds = () => tiles
    .filter(tile => tile.style.display !== 'none')
    .map(tile => tile.id);

  context.applyQuickAccess();
  assert.deepEqual(visibleIds(), ['ski', 'food', 'weather', 'matura']);

  context.reorderEditing = true;
  context.applyQuickAccess();
  assert.deepEqual(
    visibleIds(),
    ['ski', 'food', 'weather', 'matura', 'maturatracker']
  );

  tiles.unshift(tiles.splice(7, 1)[0]);
  context.reorderEditing = false;
  context.applyQuickAccess();
  assert.deepEqual(
    visibleIds(),
    ['maturatracker', 'ski', 'food', 'weather']
  );
});
