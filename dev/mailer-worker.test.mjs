import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMailMessage,
  createMailProcessor,
  isPendingMail,
} from '../mailer/mail-core.js';

test('a fake pending invite is sent through mocked SMTP and marked successful', async () => {
  const sentMessages = [];
  const marked = [];
  const transport = {
    async sendMail(message) {
      sentMessages.push(message);
      return { messageId: 'mock-message-1' };
    },
  };
  const queueDoc = {
    id: 'fake-invite',
    data: {
      to: ['person@example.test'],
      template: {
        name: 'member-invite',
        data: { inviteCode: 'fake-code', familyName: 'Testfamilie' },
      },
    },
  };
  const processor = createMailProcessor({
    transport,
    claim: async doc => ({ ...doc.data, delivery: { attempts: 1 } }),
    markSent: async (doc, claimed, result) => marked.push({ doc, claimed, result }),
    markFailed: async () => assert.fail('success path must not mark failure'),
    from: 'TVZA <noreply@example.test>',
    appBaseUrl: 'https://example.test/tvza/',
    logger: {},
  });

  const result = await processor.process(queueDoc);

  assert.equal(result.status, 'sent');
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].to, ['person@example.test']);
  assert.match(sentMessages[0].text, /fake-code/);
  assert.match(sentMessages[0].html, /login\.html\?invite=fake-code/);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].result.messageId, 'mock-message-1');
});

test('mocked SMTP failure is recorded without sending real mail', async () => {
  let failed;
  const processor = createMailProcessor({
    transport: { sendMail: async () => { throw new Error('mock SMTP offline'); } },
    claim: async doc => ({ ...doc.data, delivery: { attempts: 2 } }),
    markSent: async () => assert.fail('failure path must not mark success'),
    markFailed: async (_doc, claimed, error) => { failed = { claimed, error }; },
    from: 'TVZA <noreply@example.test>',
    appBaseUrl: 'https://example.test/',
    logger: {},
  });

  const result = await processor.process({
    id: 'fake-failure',
    data: {
      to: ['person@example.test'],
      template: { name: 'member-invite', data: { inviteCode: 'retry-me' } },
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(failed.claimed.delivery.attempts, 2);
  assert.match(failed.error.message, /mock SMTP offline/);
});

test('pending selection respects retry time, lease and maximum attempts', () => {
  const now = Date.now();
  assert.equal(isPendingMail({}, { now, maxRetries: 3 }), true);
  assert.equal(isPendingMail({ delivery: { state: 'SUCCESS' } }, { now }), false);
  assert.equal(isPendingMail({
    delivery: { state: 'ERROR', attempts: 1, nextAttemptAt: new Date(now + 1000) },
  }, { now, maxRetries: 3 }), false);
  assert.equal(isPendingMail({
    delivery: { state: 'ERROR', attempts: 1, nextAttemptAt: new Date(now - 1000) },
  }, { now, maxRetries: 3 }), true);
  assert.equal(isPendingMail({
    delivery: { state: 'PROCESSING', attempts: 1, leaseUntil: new Date(now - 1000) },
  }, { now, maxRetries: 3 }), true);
  assert.equal(isPendingMail({
    delivery: { state: 'ERROR', attempts: 3 },
  }, { now, maxRetries: 3 }), false);
});

test('existing Trigger Email message shape stays supported', () => {
  const message = buildMailMessage({
    to: 'person@example.test',
    message: { subject: 'Hallo', text: 'Test' },
  }, { from: 'noreply@example.test' });
  assert.equal(message.subject, 'Hallo');
  assert.equal(message.text, 'Test');
});
