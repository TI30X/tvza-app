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
