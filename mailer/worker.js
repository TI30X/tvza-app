import os from 'node:os';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import {
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_RETRIES,
  createMailProcessor,
  isPendingMail,
} from './mail-core.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') });

function integerEnv(name, fallback, minimum = 1) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || undefined;
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const collectionName = process.env.MAIL_COLLECTION?.trim() || 'mail';
const pollIntervalMs = integerEnv('POLL_INTERVAL_MS', 30_000, 1_000);
const maxRetries = integerEnv('MAX_RETRIES', DEFAULT_MAX_RETRIES);
const batchSize = integerEnv('BATCH_SIZE', 25);
const leaseMs = integerEnv('LEASE_MS', DEFAULT_LEASE_MS, 10_000);
const retryBaseMs = integerEnv('RETRY_BASE_MS', 60_000, 1_000);
const workerId = `${os.hostname()}:${process.pid}`;
const smtpPort = integerEnv('SMTP_PORT', 587);

const transport = nodemailer.createTransport({
  host: requiredEnv('SMTP_HOST'),
  port: smtpPort,
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: requiredEnv('SMTP_PASS') }
    : undefined,
});

function safeError(error) {
  return String(error?.message || 'SMTP send failed')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}

async function claim(queueDoc) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(queueDoc.ref);
    if (!snapshot.exists || !isPendingMail(snapshot.data(), { maxRetries })) return null;

    const data = snapshot.data();
    const attempts = Number(data.delivery?.attempts || 0) + 1;
    const delivery = {
      state: 'PROCESSING',
      attempts,
      workerId,
      claimedAt: Timestamp.now(),
      leaseUntil: Timestamp.fromMillis(Date.now() + leaseMs),
    };
    transaction.update(queueDoc.ref, { delivery });
    return { ...data, delivery };
  });
}

async function markSent(queueDoc, claimed, result) {
  await queueDoc.ref.update({
    'delivery.state': 'SUCCESS',
    'delivery.attempts': claimed.delivery.attempts,
    'delivery.sentAt': FieldValue.serverTimestamp(),
    'delivery.messageId': String(result?.messageId || '').slice(0, 250),
    'delivery.workerId': workerId,
    'delivery.error': FieldValue.delete(),
    'delivery.nextAttemptAt': FieldValue.delete(),
    'delivery.leaseUntil': FieldValue.delete(),
  });
}

async function markFailed(queueDoc, claimed, error) {
  const attempts = Number(claimed.delivery.attempts || 1);
  const exhausted = attempts >= maxRetries;
  const delay = retryBaseMs * Math.min(2 ** Math.max(0, attempts - 1), 32);
  await queueDoc.ref.update({
    'delivery.state': exhausted ? 'FAILED' : 'ERROR',
    'delivery.attempts': attempts,
    'delivery.failedAt': FieldValue.serverTimestamp(),
    'delivery.error': safeError(error),
    'delivery.workerId': workerId,
    'delivery.nextAttemptAt': exhausted
      ? FieldValue.delete()
      : Timestamp.fromMillis(Date.now() + delay),
    'delivery.leaseUntil': FieldValue.delete(),
  });
}

const processor = createMailProcessor({
  transport,
  claim,
  markSent,
  markFailed,
  from: requiredEnv('SMTP_FROM'),
  appBaseUrl: requiredEnv('APP_BASE_URL'),
});

let running = false;
let stopping = false;
let timer;

async function poll() {
  if (running || stopping) return;
  running = true;
  try {
    const snapshot = await db.collection(collectionName).get();
    const pending = snapshot.docs.filter(queueDoc =>
      isPendingMail(queueDoc.data(), { maxRetries })
    ).slice(0, batchSize);
    const results = await Promise.allSettled(
      pending.map(queueDoc => processor.process(queueDoc))
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`[mail] queue update failed: ${safeError(result.reason)}`);
      }
    }
  } catch (error) {
    console.error(`[mail] poll failed: ${safeError(error)}`);
  } finally {
    running = false;
  }
}

async function stop(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  console.info(`[mail] stopping after ${signal}`);
  while (running) await new Promise(resolve => setTimeout(resolve, 100));
  transport.close?.();
}

process.on('SIGINT', () => stop('SIGINT').then(() => process.exit(0)));
process.on('SIGTERM', () => stop('SIGTERM').then(() => process.exit(0)));

console.info(`[mail] worker ${workerId} watching ${collectionName}`);
await poll();
timer = setInterval(poll, pollIntervalMs);
