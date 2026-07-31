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

test('matura progress remains owner-only with a bounded schema', async () => {
  const rules = await readRules();
  const block = matchBlock(rules, '/users/{uid}/maturaProgress/{progressId}');

  assert.match(block, /request\.auth\.uid == uid/);
  assert.match(block, /hasOnly\(\[\s*'state', 'schema', 'updatedAt'\s*\]\)/);
  assert.match(block, /request\.resource\.data\.state is map/);
  assert.match(block, /request\.resource\.data\.schema == 1/);
});

/* Trainingsdaten gehören nur dem Trainierenden. Der Programmtext ist eine
   JSON-Zeichenkette und muss begrenzt bleiben, sonst sprengt ein Import mit
   vielen Blättern die Dokumentgrenze von Firestore. */
test('training data stays owner-only with bounded documents', async () => {
  const rules = await readRules();
  const programs = matchBlock(rules, '/users/{uid}/trainingPrograms/{programId}');
  const logs = matchBlock(rules, '/users/{uid}/trainingLogs/{trainingDate}');

  assert.match(programs, /request\.auth\.uid == uid/);
  assert.match(programs, /hasOnly\(\[\s*'schema', 'id', 'json', 'updatedAt'\s*\]\)/);
  assert.match(programs, /request\.resource\.data\.json is string/);
  assert.match(programs, /json\.size\(\) <= 900000/);

  assert.match(logs, /request\.auth\.uid == uid/);
  assert.match(logs, /hasOnly\(\[\s*'schema', 'units', 'updatedAt'\s*\]\)/);
  assert.match(logs, /request\.resource\.data\.units is map/);
  /* Die Dokument-ID ist das Datum — ohne Prüfung könnte der Client dort
     beliebige Schlüssel anlegen. */
  assert.match(logs, /trainingDate\.matches\(/);

  assert.doesNotMatch(programs, /allow read, write: if isMember\(\)/);
  assert.doesNotMatch(logs, /allow read, write: if isMember\(\)/);
});

test('activities and attachments remain scoped through calendar membership', async () => {
  const rules = await readRules();
  const activities = matchBlock(rules, '/activities/{id}');
  const attachments = matchBlock(rules, '/attachments/{id}');

  assert.match(rules, /function inFamily\(familyId\)[\s\S]*request\.auth\.uid in familyData\(familyId\)/);
  assert.match(rules, /function canUseTrip\(tripId\)[\s\S]*inFamily\(/);
  assert.match(rules, /function canUseAttachmentParent\(parentId\)[\s\S]*canUseTrip\(parentId\)/);
  assert.match(activities, /canUseTrip\(/);
  assert.match(attachments, /canUseAttachmentParent\(/);
  assert.doesNotMatch(activities, /allow read, write: if isMember\(\)/);
  assert.doesNotMatch(attachments, /allow read, write: if isMember\(\)/);
});
