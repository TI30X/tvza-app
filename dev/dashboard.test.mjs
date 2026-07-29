import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');

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

test('quick access names stay inside narrow cards', () => {
  assert.match(css, /\.card-grid--quick \.card-content \{[\s\S]*width: 100%;[\s\S]*min-width: 0;[\s\S]*max-width: 100%/);
  assert.match(css, /\.card-grid--quick \.card-content h3 \{[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: normal;[\s\S]*-webkit-line-clamp: 2/);
});

test('Today stays visible and collects every available live row', () => {
  assert.match(html, /<section class="section" id="heuteSection">/);
  assert.match(html, /const HEUTE_ORDER = \['cal', 'weather', 'food', 'matura', 'watch', 'ski'\]/);
  assert.doesNotMatch(html, /HEUTE_ORDER[\s\S]{0,220}\.slice\(0, 5\)/);
  assert.match(html, /pushHeute\('weather'/);
  assert.match(html, /pushHeute\(`cal:\$\{item\.id \|\| index\}`/);
  assert.match(html, /candidates\.filter\(item => item\.date === todayStr\)\.forEach/);
  assert.match(html, /Heute gibt es noch keine Live-Infos/);
});
