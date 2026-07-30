import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const firebase = await readFile(
  new URL('../assets/js/firebase-config.js', import.meta.url),
  'utf8'
);
const dashboard = await readFile(
  new URL('../index.html', import.meta.url),
  'utf8'
);
const areas = await readFile(
  new URL('../pages/bereiche.html', import.meta.url),
  'utf8'
);
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
  assert.ok(allowedSource && enabledSource, 'module visibility helpers not found');

  const context = {
    MODULES: {
      ski:{}, food:{}, matura:{}, maturatracker:{},
    },
    DEFAULT_MODULES: {
      ski:false, food:true, matura:false, maturatracker:false,
    },
    ALL_MODULES: {
      ski:true, food:true, matura:true, maturatracker:true,
    },
    DEFAULT_VISIBLE_MODULES: {
      ski:false, food:true, matura:true, maturatracker:false,
    },
  };
  vm.runInNewContext(
    `${allowedSource.replace('export ', '')}
     ${enabledSource.replace('export ', '')}
     this.allowedModules = allowedModules;
     this.enabledModules = enabledModules;`,
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
});

test('saved visibility refreshes the dashboard, Bereiche page, and shell navigation', () => {
  assert.match(dashboard, />Meine Bereiche</);
  assert.match(dashboard, /id="moduleToggles"[\s\S]*id="modulesSaveStatus"/);
  assert.match(dashboard, /moduleToggles'\)\.addEventListener\('change'/);
  assert.match(dashboard, /setDoc\(doc\(db, 'users', user\.uid\), \{ modules \}, \{ merge:true \}\)/);
  assert.match(
    dashboard,
    /window\.dispatchEvent\(new CustomEvent\('tvza-modules-change'/
  );
  assert.match(areas, /window\.addEventListener\('tvza-modules-change'/);
  assert.match(areas, /profile = \{ \.\.\.profile, modules:event\.detail \};[\s\S]*renderMine\(\)/);
  assert.match(shell, /export function refreshShellAreaNavigation\(profile\)/);
  assert.match(shell, /window\.tvzaShellModulesHandler = event =>/);
  assert.match(nav, /onSnapshot\(doc\(db, 'users', user\.uid\)/);
});
