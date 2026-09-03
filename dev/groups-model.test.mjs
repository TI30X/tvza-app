/* Tests für das Gruppen-Datenmodell (Phase 1).
 *
 * Wie rules-regression.test.mjs prüfen diese Tests die Regeldatei
 * statisch. Das ersetzt den Emulator nicht, fängt aber genau die Klasse
 * von Fehlern, die hier teuer ist: eine Zeile, die beim Umbauen
 * verschwindet, ohne dass jemand es merkt — so ist schon einmal der
 * ganze maturaProgress-Block aus den Live-Regeln gefallen.
 *
 * Der Kern des Modells sind zwei Klammern, die nicht aufgehen dürfen:
 *
 *   1. Eine Gruppe existiert nie ohne ihren Kopf.
 *   2. Ein Mitgliedsdokument kann sich nicht selbst zum Kopf erklären.
 *
 * Beide hängen an existsAfter/getAfter, also am Zustand NACH dem
 * Schreiben. Fällt eine davon weg, entstehen kopflose Gruppen oder
 * fremde Köpfe — und beides merkt man erst, wenn es passiert ist.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readRules = () => readFile(join(root, 'firestore.rules'), 'utf8');

function matchBlock(rules, pathPattern) {
  const marker = `match ${pathPattern} {`;
  const start = rules.indexOf(marker);
  assert.notEqual(start, -1, `missing ${pathPattern} rules`);
  let depth = 0;
  for (let index = start + marker.length - 1; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') depth -= 1;
    if (depth === 0) return rules.slice(start, index + 1);
  }
  assert.fail(`unterminated ${pathPattern} rules`);
}

/* Nur den Abschnitt einer einzelnen allow-Regel herausschneiden, damit
   ein Test nicht versehentlich in der Nachbarregel fündig wird. */
function allowClause(block, verbs) {
  const marker = `allow ${verbs}:`;
  const start = block.indexOf(marker);
  assert.notEqual(start, -1, `missing "allow ${verbs}" in block`);
  const rest = block.slice(start + marker.length);
  const end = rest.search(/\n\s*allow /);
  return end === -1 ? rest : rest.slice(0, end);
}

test('eine Gruppe entsteht nie ohne ihren Kopf', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}');
  const create = allowClause(block, 'create');

  // Der Gründer trägt sich selbst als Kopf ein …
  assert.match(create, /request\.resource\.data\.headUid == request\.auth\.uid/);
  // … und das Mitgliedsdokument muss im selben Stapel entstehen.
  assert.match(
    create,
    /existsAfter\(\s*\/databases\/\$\(database\)\/documents\/groups\/\$\(gid\)\/members\/\$\(request\.auth\.uid\)\s*\)/,
    'ohne existsAfter könnten kopflose Gruppen entstehen',
  );
});

test('ein Mitgliedsdokument kann sich nicht zum Kopf einer fremden Gruppe erklären', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}/members/{uid}');
  const create = allowClause(block, 'create');

  // Wer sich selbst als 'head' anlegt, muss von der Gruppe auch als Kopf
  // geführt werden — geprüft am Zustand nach dem Schreiben.
  assert.match(
    create,
    /getAfter\(\/databases\/\$\(database\)\/documents\/groups\/\$\(gid\)\)\s*\n?\s*\.data\.headUid == request\.auth\.uid/,
  );
  // Die Leitung nimmt Athleten auf, mehr nicht.
  assert.match(create, /leadsGroup\(gid\)\s*\n?\s*&& request\.resource\.data\.rolle == 'mitglied'/);
  // Weitere Trainer ernennt allein der Kopf — beliebig viele. Ohne diese
  // Trennung wäre das Aufnehmen lockerer als das Befördern: ein Trainer
  // könnte sich unbegrenzt Mit-Trainer danebenstellen, während er ein
  // bestehendes Mitglied nicht befördern dürfte.
  assert.match(create, /headsGroup\(gid\)\s*\n?\s*&& request\.resource\.data\.rolle in \['staff', 'mitglied'\]/);
  // Und in keinem Zweig entsteht ein zweiter Kopf.
  assert.doesNotMatch(create, /rolle in \['head'/);
});

test('mehrere Trainer sind vorgesehen, mehrere Köpfe nicht', async () => {
  const rules = await readRules();
  const block = matchBlock(rules, '/groups/{gid}/members/{uid}');

  // staff ist unbegrenzt: nirgends steht eine Zählung oder eine Grenze.
  // Begrenzt ist allein der Kopf, und zwar durch headUid auf dem
  // Gruppendokument — ein einzelnes Feld kann nur einen Wert tragen.
  assert.match(rules, /function headsGroup\(gid\) \{[\s\S]*?get\('headUid', ''\) == request\.auth\.uid/);

  // 'head' als Rolle entsteht ausschliesslich im Gründungszweig, der an
  // getAfter gegen genau dieses headUid gebunden ist.
  const headWrites = block.match(/rolle == 'head'/g) || [];
  assert.equal(headWrites.length, 1, 'nur der Gründungszweig darf einen Kopf setzen');

  const create = allowClause(block, 'create');
  const headBranch = create.slice(create.indexOf("rolle == 'head'"));
  assert.match(headBranch, /getAfter\(/, 'der Kopf-Zweig muss an die Gruppe gebunden bleiben');
});

test('Rollen vergibt nur der Kopf, und niemand wird zum zweiten Kopf', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}/members/{uid}');
  const update = allowClause(block, 'update');

  assert.match(update, /headsGroup\(gid\)/);
  assert.doesNotMatch(
    update,
    /leadsGroup\(gid\)/,
    'dürfte die Leitung Rollen ändern, könnten zwei Trainer sich gegenseitig herabstufen',
  );
  assert.match(update, /affectedKeys\(\)\s*\n?\s*\.hasOnly\(\['rolle'\]\)/);
  assert.match(update, /request\.resource\.data\.rolle in \['staff', 'mitglied'\]/);
  assert.match(update, /resource\.data\.get\('rolle', ''\) != 'head'/);
});

test('der Kopf kann weder entfernt werden noch einfach gehen', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}/members/{uid}');
  const remove = allowClause(block, 'delete');

  // Beide Zweige — selbst gehen und entfernt werden — schliessen den
  // Kopf aus. Er muss vorher übergeben.
  const guards = remove.match(/resource\.data\.get\('rolle', ''\) != 'head'/g) || [];
  assert.equal(guards.length, 2, 'beide Löschzweige müssen den Kopf ausschliessen');
  assert.match(remove, /request\.auth\.uid == uid/);
  assert.match(remove, /leadsGroup\(gid\)/);
});

test('die Übergabe geht nur an jemanden, der schon Mitglied ist', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}');
  const update = allowClause(block, 'update');

  assert.match(update, /headsGroup\(gid\)/);
  assert.match(update, /hasOnly\(\['headUid'\]\)/);
  assert.match(
    update,
    /exists\(\s*\/databases\/\$\(database\)\/documents\/groups\/\$\(gid\)\/members\/\$\(request\.resource\.data\.headUid\)\s*\)/,
  );
});

test('die Gruppenart steht nach der Gründung fest', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}');

  assert.match(allowClause(block, 'create'), /request\.resource\.data\.art in \['familie', 'kader'\]/);
  // 'art' darf in keiner Änderungsliste auftauchen: ein Wechsel im
  // Betrieb würde bestehende Termine und Rollen sinnlos machen.
  const update = allowClause(block, 'update');
  const keyLists = update.match(/hasOnly\(\[[^\]]*\]\)/g) || [];
  assert.ok(keyLists.length > 0, 'update ohne begrenzte Schlüsselliste');
  for (const list of keyLists) {
    assert.doesNotMatch(list, /'art'/, `'art' darf nicht änderbar sein: ${list}`);
  }
});

test('Gruppen und ihre Mitglieder bleiben ausserhalb der Gruppe unlesbar', async () => {
  const rules = await readRules();

  for (const path of ['/groups/{gid}', '/groups/{gid}/members/{uid}']) {
    const read = allowClause(matchBlock(rules, path), 'get, list');
    assert.match(read, /inGroup\(gid\)/, `${path} ist nicht auf die Gruppe beschränkt`);
  }
});

test('beide Dokumente haben ein begrenztes Schema', async () => {
  const rules = await readRules();

  const group = allowClause(matchBlock(rules, '/groups/{gid}'), 'create');
  assert.match(
    group,
    /hasOnly\(\[\s*'name', 'art', 'headUid', 'bereiche',\s*'inviteToken', 'farbe', 'createdAt'\s*\]\)/,
  );
  // Der eigentliche Bruch mit families: keine Mitglieder-, Manager- oder
  // Anfrageliste mehr auf dem Gruppendokument. Rollen brauchen ein
  // Dokument pro Person, ein Array kann sie nicht tragen.
  for (const legacy of ['members', 'managers', 'pendingRequests']) {
    assert.doesNotMatch(
      group,
      new RegExp(`'${legacy}'`),
      `'${legacy}' gehört nicht mehr auf das Gruppendokument`,
    );
  }

  const member = allowClause(matchBlock(rules, '/groups/{gid}/members/{uid}'), 'create');
  assert.match(member, /hasOnly\(\['uid', 'rolle', 'seit'\]\)/);
  assert.match(member, /request\.resource\.data\.uid == uid/);
});

test('die Rollenhelfer trennen Kuratieren von Übergeben', async () => {
  const rules = await readRules();

  // leadsGroup deckt Kopf und Trainer ab, headsGroup nur den Kopf.
  assert.match(rules, /function leadsGroup\(gid\) \{[\s\S]*?groupRole\(gid\) in \['head', 'staff'\][\s\S]*?\}/);
  assert.match(rules, /function headsGroup\(gid\) \{[\s\S]*?get\('headUid', ''\) == request\.auth\.uid[\s\S]*?\}/);
  // inGroup fragt die Untersammlung, nicht ein Array auf der Gruppe.
  assert.match(rules, /function inGroup\(gid\) \{[\s\S]*?groups\/\$\(gid\)\/members\/\$\(request\.auth\.uid\)[\s\S]*?\}/);
});

test('families bleibt unberührt, solange nichts migriert ist', async () => {
  const rules = await readRules();

  // Phase 1 stellt das neue Modell daneben, statt das alte zu entfernen.
  // Die Familien-App läuft während des ganzen Umbaus weiter.
  const families = matchBlock(rules, '/families/{id}');
  assert.match(families, /allow get, list: if inFamilyDoc\(\) \|\| managesFamilyDoc\(\)/);
  assert.match(families, /request\.resource\.data\.members == \[request\.auth\.uid\]/);
});

/* ── Termine einer Gruppe (Phase 3) ────────────────────────────────*/

test('Termine schreibt die Leitung, lesen alle Mitglieder', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}/events/{eid}');

  assert.match(allowClause(block, 'get, list'), /inGroup\(gid\)/);
  for (const verb of ['create', 'update', 'delete']) {
    assert.match(allowClause(block, verb), /leadsGroup\(gid\)/,
      `${verb} muss der Leitung vorbehalten bleiben`);
  }
  // Ein Athlet trägt kein Rennen ein.
  assert.doesNotMatch(allowClause(block, 'create'), /request\.auth\.uid == uid/);
});

test('nur die drei Arten, und die Art bleibt nach dem Anlegen stehen', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}/events/{eid}');

  assert.match(allowClause(block, 'create'),
    /request\.resource\.data\.art in \['training', 'lager', 'rennen'\]/);

  // Aus einem Rennen ein Training zu machen liesse Startnummer und
  // Ergebnis sinnlos daneben stehen — dieselbe Überlegung wie bei der
  // Gruppenart.
  const update = allowClause(block, 'update');
  const listen = update.match(/hasOnly\(\[[\s\S]*?\]\)/g) || [];
  assert.ok(listen.length > 0, 'update ohne begrenzte Schlüsselliste');
  for (const liste of listen) {
    assert.doesNotMatch(liste, /'art'/, `'art' darf nicht änderbar sein: ${liste}`);
  }
});

test('das Datum muss ein Datum sein, und das Schema ist begrenzt', async () => {
  const create = allowClause(matchBlock(await readRules(), '/groups/{gid}/events/{eid}'), 'create');

  // 'JJJJ-MM-TT' statt Timestamp: ein Lager vom 3. bis 10. Oktober ist
  // ein Datum, kein Zeitpunkt.
  assert.match(create, /request\.resource\.data\.von\.matches\('\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}'\)/);
  assert.match(create, /request\.resource\.data\.titel\.size\(\) <= 120/);
  assert.match(create, /request\.resource\.data\.createdBy == request\.auth\.uid/);
  assert.match(create, /keys\(\)\.hasOnly\(\[[\s\S]*'ergebnis',[\s\S]*\]\)/);
});

test('eine Zusage kann niemand für jemand anderen abgeben', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}/events/{eid}/zusagen/{uid}');
  const schreiben = allowClause(block, 'create, update');

  // Die Dokument-ID ist die uid — beide Prüfungen zusammen schliessen
  // aus, dass jemand unter fremdem Namen zusagt.
  assert.match(schreiben, /request\.auth\.uid == uid/);
  assert.match(schreiben, /request\.resource\.data\.uid == uid/);
  assert.match(schreiben, /antwort in \['ja', 'nein', 'vielleicht'\]/);
  assert.match(schreiben, /hasOnly\(\['uid', 'antwort', 'am'\]\)/);

  // Auch die Leitung nicht: eine Zusage, die der Trainer selbst
  // eingetragen hat, wäre keine Zusage mehr.
  assert.doesNotMatch(schreiben, /leadsGroup\(gid\)/);

  // Löschen darf sie trotzdem — nach einem ausgeladenen Athleten.
  assert.match(allowClause(block, 'delete'), /leadsGroup\(gid\)/);
});

test('Zusagen sind innerhalb der Gruppe sichtbar', async () => {
  const block = matchBlock(await readRules(), '/groups/{gid}/events/{eid}/zusagen/{uid}');
  assert.match(allowClause(block, 'get, list'), /inGroup\(gid\)/);
});
