export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_LEASE_MS = 5 * 60 * 1000;

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isPendingMail(data = {}, {
  now = Date.now(),
  maxRetries = DEFAULT_MAX_RETRIES,
} = {}) {
  const delivery = data.delivery || {};
  const state = String(delivery.state || '').toUpperCase();
  const attempts = Number(delivery.attempts || 0);

  if (['SUCCESS', 'SENT', 'FAILED'].includes(state)) return false;
  if (attempts >= maxRetries) return false;
  if (state === 'PROCESSING') {
    return timestampMs(delivery.leaseUntil) <= now;
  }
  if (state === 'ERROR' && delivery.nextAttemptAt) {
    return timestampMs(delivery.nextAttemptAt) <= now;
  }
  return true;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inviteUrl(appBaseUrl, inviteCode) {
  const base = String(appBaseUrl || '').trim();
  if (!base) throw new Error('APP_BASE_URL is required for member-invite mail');
  const normalized = base.endsWith('/') ? base : `${base}/`;
  const url = new URL('login.html', normalized);
  url.searchParams.set('invite', inviteCode);
  return url.href;
}

export function buildMailMessage(data = {}, { from, appBaseUrl } = {}) {
  const recipients = Array.isArray(data.to) ? data.to : [data.to];
  const to = recipients.map(value => String(value || '').trim()).filter(Boolean);
  if (!to.length) throw new Error('Mail queue entry has no recipient');
  if (!from) throw new Error('SMTP_FROM is required');

  if (data.message?.subject && (data.message.text || data.message.html)) {
    return {
      from,
      to,
      subject: String(data.message.subject),
      text: data.message.text ? String(data.message.text) : undefined,
      html: data.message.html ? String(data.message.html) : undefined,
      disableFileAccess: true,
      disableUrlAccess: true,
    };
  }

  if (data.template?.name !== 'member-invite') {
    throw new Error(`Unsupported mail template: ${data.template?.name || 'missing'}`);
  }

  const templateData = data.template.data || {};
  const inviteCode = String(templateData.inviteCode || '').trim();
  if (!inviteCode) throw new Error('member-invite has no inviteCode');
  const familyName = String(templateData.familyName || 'TVZA');
  const link = inviteUrl(appBaseUrl, inviteCode);

  return {
    from,
    to,
    subject: `Einladung zu ${familyName}`,
    disableFileAccess: true,
    disableUrlAccess: true,
    text: [
      `Du wurdest zu ${familyName} eingeladen.`,
      '',
      `Einladungscode: ${inviteCode}`,
      `Registrierung: ${link}`,
      '',
      'Falls du diese Einladung nicht erwartest, kannst du diese E-Mail ignorieren.',
    ].join('\n'),
    html: [
      `<p>Du wurdest zu <strong>${escapeHtml(familyName)}</strong> eingeladen.</p>`,
      `<p>Einladungscode: <strong>${escapeHtml(inviteCode)}</strong></p>`,
      `<p><a href="${escapeHtml(link)}">TVZA-Konto erstellen</a></p>`,
      '<p>Falls du diese Einladung nicht erwartest, kannst du diese E-Mail ignorieren.</p>',
    ].join(''),
  };
}

export function createMailProcessor({
  transport,
  claim,
  markSent,
  markFailed,
  from,
  appBaseUrl,
  logger = console,
}) {
  if (!transport?.sendMail) throw new Error('A Nodemailer-compatible transport is required');

  return {
    async process(queueDoc) {
      const claimed = await claim(queueDoc);
      if (!claimed) return { status: 'skipped', id: queueDoc.id };

      try {
        const message = buildMailMessage(claimed, { from, appBaseUrl });
        const result = await transport.sendMail(message);
        await markSent(queueDoc, claimed, result);
        logger.info?.(`[mail] sent ${queueDoc.id}`);
        return { status: 'sent', id: queueDoc.id };
      } catch (error) {
        await markFailed(queueDoc, claimed, error);
        logger.warn?.(`[mail] failed ${queueDoc.id}: ${error?.message || 'send failed'}`);
        return { status: 'failed', id: queueDoc.id };
      }
    },
  };
}
