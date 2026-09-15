/* Der Weg zur Admin-Seite (v.35.63.1). Michel: "wo soll der Bereich Admin
   auftauchen? bei mir ist er nirgends". Start nimmt den Admin aus der
   Bereichsliste (key !== 'admin'), und das Kontomenü kannte nur
   Einstellungen und Abmelden — für ein Admin-Konto führte kein Link mehr
   zu pages/admin.html. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './gruppe-harness.mjs';

const read = p => readFile(join(root, p), 'utf8');

test('Admin steht im Kontomenü — nur für ein Admin-Konto', async () => {
  const shell = await read('assets/js/shell.js');
  assert.match(shell, /data-act="admin" data-konto-admin type="button" role="menuitem"\$\{konto\.admin \? '' : ' hidden'\}/);
  assert.match(shell, /const admin = profile \? profile\.isTimo === true : !!konto\.admin;/);
  assert.match(shell, /document\.querySelectorAll\('\[data-konto-admin\]'\)\.forEach\(el => \{ el\.hidden = !admin; \}\);/);
  assert.match(shell, /if \(act === 'admin'\) \{\s*const ziel = new URL\(base\(\) \+ 'pages\/admin\.html', location\.href\)\.href;\s*if \(!window\.tvzaNavigate\?\.\(ziel\)\) location\.href = ziel;/);
  // Die Rechte bleiben, wo sie sind: isTimo setzt kein Konto bei sich selbst.
  const regeln = await read('firestore.rules');
  assert.match(regeln, /\.hasOnly\(\['displayName', 'modules', 'projectsSeeded', 'familyId', 'role'\]\)/);
});
