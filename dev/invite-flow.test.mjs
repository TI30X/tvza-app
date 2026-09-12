import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { leserMitStart } from './start-quelle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Liest index.html samt ihren Modulen — der Code der Startseite
   liegt seit v.35.11.0 in assets/js/feature/start/. */
const read = leserMitStart(root);

test('invite codes contain 128 bits from Web Crypto', async () => {
  const index = await read('index.html');
  assert.match(index, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.match(index, /padStart\(2, '0'\)/);
});

/* Bis v.35.32.0 lud eine E-Mail-Einladung in eine Kalendergruppe
   (families) ein — das Modell, das v.35.32.0 in die Gruppen ueberfuehrt
   hat. Seit v.35.33.0 zeigt sie auf eine GRUPPE (gid). */
test('eine Einladung waehlt eine Gruppe, die man leitet, und stellt eine Mail bereit', async () => {
  const [index, rules] = await Promise.all([
    read('index.html'),
    read('firestore.rules'),
  ]);
  assert.match(index, /id="memberInviteFamily"/);
  assert.match(index, /inviteGroups = \(await meineGruppen\(user\.uid\)\)\.filter\(g => leitet\(g\.meineRolle\)\)/);
  /* Nur der Einladungsteil — heute.js liest families weiterhin, fuer die
     Reisen noch nicht uebernommener Familien auf der Startseite. */
  const einladen = index.match(/async function loadInviteGroups\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(einladen, 'loadInviteGroups fehlt');
  assert.doesNotMatch(einladen, /'families'/, 'der Admin-Bereich liest wieder Kalendergruppen');
  assert.doesNotMatch(index, /loadInviteFamilies|inviteFamilies/);
  /* gid nur, wenn es eine Gruppe ist — "nur Firn" ohne das Feld. */
  assert.match(index, /\.\.\.\(gid \? \{ gid \} : \{\}\)/);
  assert.doesNotMatch(index, /familyId,\n\s*createdBy/, 'neue Einladungen tragen wieder familyId');
  assert.match(index, /doc\(db, 'mail', `member-invite-\$\{code\}`\)/);
  assert.match(index, /name: 'member-invite'/);
  assert.match(rules, /match \/mail\/\{mailId\}/);
  assert.match(rules, /template\.name == 'member-invite'/);
});

test('die Regel: in eine Gruppe laedt nur ein, wer sie leitet — neue Kalendergruppen-Einladungen gibt es nicht', async () => {
  const rules = await read('firestore.rules');
  const invites = rules.match(/match \/memberInvites\/\{code\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  const anlegen = invites.match(/allow create:([\s\S]*?);\n/)?.[1] || '';
  assert.match(anlegen, /keys\(\)\.hasOnly\(\[\s*'email', 'gid', 'createdBy', 'createdAt'\s*\]\)/);
  assert.match(anlegen, /request\.resource\.data\.gid is string\s*&& leadsGroup\(request\.resource\.data\.gid\)/);
  assert.match(anlegen, /!\('gid' in request\.resource\.data\)\s*&& isAdmin\(\)/, '"nur Firn" bleibt dem Admin');
  assert.doesNotMatch(anlegen, /managesFamily/, 'neue Einladungen in eine Kalendergruppe sind wieder moeglich');
});

test('registrieren mit Gruppeneinladung: Profil, Mitgliedschaft und Verbrauch in einem Stapel', async () => {
  const [login, rules] = await Promise.all([
    read('login.html'),
    read('firestore.rules'),
  ]);
  assert.match(login, /const batch = writeBatch\(db\)/);
  assert.match(login, /batch\.set\(doc\(db, 'groups', gid, 'members', cred\.user\.uid\), \{/);
  assert.match(login, /batch\.delete\(inviteRef\)/);
  /* Die Reihenfolge im Quelltext ist die im Stapel: Mitglied vor commit. */
  assert.ok(login.indexOf("'groups', gid, 'members'") < login.indexOf('await batch.commit()'));

  /* Was login.html schreibt, muss die Regel zulassen — Feld fuer Feld. */
  const felder = login.match(/batch\.set\(doc\(db, 'groups', gid, 'members', cred\.user\.uid\), \{([\s\S]*?)\}\);/)?.[1]
    .match(/(\w+):/g).map(f => f.slice(0, -1));
  assert.deepEqual(felder, ['uid', 'rolle', 'seit', 'code']);
  assert.match(login, /rolle: 'mitglied'/, 'wer eingeladen wird, ernennt sich nicht selbst zum Trainer');

  /* Alte, offene Einladungen in eine Kalendergruppe gehen weiter. */
  assert.match(login, /members: arrayUnion\(cred\.user\.uid\)/);
  assert.match(rules, /function invitedAutoJoin\(familyId\)/);
  assert.match(rules, /function consumesInvite\(code\)/);
});

test('die Regel fuer den Beitritt beim Registrieren: E-Mail, Gruppe, Rolle, verbraucht', async () => {
  const rules = await read('firestore.rules');
  const fn = rules.match(/function einladungsBeitritt\(gid, uid\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.ok(fn, 'einladungsBeitritt fehlt');
  /* Das Profil entsteht im selben Stapel — isMember() waere dort falsch. */
  assert.match(fn, /!exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(uid\)\)/);
  assert.match(fn, /existsAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(uid\)\)/);
  assert.match(fn, /request\.auth\.uid == uid/);
  assert.match(fn, /request\.resource\.data\.rolle == 'mitglied'/);
  assert.match(fn, /registrationInviteCode\(\) == request\.resource\.data\.code/);
  assert.match(fn, /\.data\.email == request\.auth\.token\.email\.lower\(\)/, 'an die E-Mail gebunden');
  assert.match(fn, /\.data\.get\('gid', ''\) == gid/, 'nur in DIE Gruppe der Einladung');
  assert.match(fn, /!existsAfter\(\/databases\/\$\(database\)\/documents\/memberInvites\//, 'im selben Stapel verbraucht');

  const mitglieder = rules.match(/match \/groups\/\{gid\}\/members\/\{uid\} \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(mitglieder, /\)\)\s*\|\| einladungsBeitritt\(gid, uid\);/);
  /* Verbraucht ist eine Gruppeneinladung erst mit der Mitgliedschaft. */
  const verbrauch = rules.match(/function consumesInvite\(code\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(verbrauch, /!\('gid' in resource\.data\)\s*\|\| existsAfter\(\s*\/databases\/\$\(database\)\/documents\/groups\/\$\(resource\.data\.gid\)\/members\/\$\(request\.auth\.uid\)/);
});

test('invite query parameter opens registration and fills the code', async () => {
  const login = await read('login.html');
  assert.match(login, /params\.get\('invite'\)/);
  assert.match(login, /setMode\('register'\)/);
  assert.match(login, /\$\('fInvite'\)\.value = inviteParam/);
});
