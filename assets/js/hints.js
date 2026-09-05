/* ══════════════════════════════════════════════════════════════════
   Der proaktive Hinweis (§8)

   One card at the top of Start that combines *two* data sources into
   something the user would not have worked out by glancing at the list
   underneath. Without the rules below this turns into advertising, so
   the rules are the substance of this file and the copy is the easy
   part:

     1. At most one at a time, at most one per day.
     2. Rather say nothing. No "Alles erledigt!", no empty card.
     3. Always two sources. A single number is not a hint — it is
        already sitting in the Heute list.
     4. Dismissable: X hides it for today, "Später" for a week, and
        being dismissed twice retires that kind for good.
     5. Never a push notification. Push stays for Nachrichten.
     6. Nothing about other people. In a family app that is intrusive.

   The generators are pure: data in, candidate or null out. That keeps
   them testable, which matters because the interesting part of a hint
   is the case where it should *not* appear.
   ══════════════════════════════════════════════════════════════════ */

export const HINT_TYPES = ['kalenderWetter', 'wetterSki', 'maturaTempo', 'geburtstag'];

const DAY = 86400000;

/* ── Suppression state ─────────────────────────────────────────────*/

function storeKey(uid) { return `tvza.hints.${uid}`; }

export function readHintState(uid) {
  try { return JSON.parse(localStorage.getItem(storeKey(uid)) || '{}') || {}; }
  catch { return {}; }
}

export function writeHintState(uid, state) {
  try { localStorage.setItem(storeKey(uid), JSON.stringify(state)); }
  catch { /* private mode — the hint simply reappears, which is harmless */ }
}

/**
 * X = not again today · "Später" = not for a week · twice = never again.
 * @param {string} uid
 * @param {string} type
 * @param {'today'|'later'} mode
 * @param {Date} [now]
 */
export function dismissHint(uid, type, mode, now = new Date()) {
  const state = readHintState(uid);
  const prev = state[type] || { hiddenUntil: 0, dismissCount: 0 };
  const count = prev.dismissCount + 1;
  const until = count >= 2 ? Infinity
    : mode === 'later' ? now.getTime() + 7 * DAY
    : endOfDay(now).getTime();
  state[type] = { hiddenUntil: until === Infinity ? 'never' : until, dismissCount: count };
  writeHintState(uid, state);
  return state;
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rules 1 and 4: filter out what is suppressed, then take the first
 * remaining candidate. Candidates arrive in priority order.
 *
 * @param {Array} candidates
 * @param {object} state     from readHintState
 * @param {Date} [now]
 * @param {string} [lastShownDate] ISO date a hint was last shown
 * @returns {object|null}
 */
export function pickHint(candidates, state = {}, now = new Date(), lastShownDate = '') {
  // Rule 1: at most one per day.
  if (lastShownDate && lastShownDate === isoOf(now)) return null;

  for (const c of candidates) {
    if (!c) continue;
    const s = state[c.type];
    if (!s) return c;
    if (s.hiddenUntil === 'never' || s.dismissCount >= 2) continue;
    if (typeof s.hiddenUntil === 'number' && s.hiddenUntil > now.getTime()) continue;
    return c;
  }
  // Rule 2: rather say nothing.
  return null;
}

/* ── Generators ────────────────────────────────────────────────────
   Each takes what it needs and returns a candidate or null. None of
   them invents a number; every figure comes from data the app already
   holds. */

const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli',
                'August','September','Oktober','November','Dezember'];

function dayWord(iso, now) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date - today) / DAY);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === 2) return 'übermorgen';
  if (diff > 2 && diff < 7) return 'am ' + WEEKDAYS[date.getDay()];
  return `am ${d}. ${MONTHS[m - 1]}`;
}

/**
 * Kalender × Wetter — the cheapest of the four: both sources are
 * already on screen. Only fires when rain is forecast shortly *before*
 * an appointment, which is the part a glance at either list misses.
 *
 * @param {{date:string,time:string,title:string}} event  next appointment
 * @param {Array<{time:string,precipitation:number}>} forecast hourly
 */
export function hintKalenderWetter(event, forecast, now = new Date()) {
  if (!event?.date || !event?.time || !Array.isArray(forecast)) return null;
  const start = new Date(`${event.date}T${event.time}`);
  if (isNaN(start) || start < now) return null;
  if (start - now > 2 * DAY) return null;          // too far off to be useful

  // Rain in the 90 minutes before the appointment.
  const window = forecast.filter(h => {
    const t = new Date(h.time);
    return !isNaN(t) && t <= start && start - t <= 90 * 60000;
  });
  const wet = window.find(h => Number(h.precipitation) >= 0.3);
  if (!wet) return null;

  const at = new Date(wet.time);
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return {
    type: 'kalenderWetter',
    text: `${cap(dayWord(event.date, now))} ${event.time} ${event.title} — und um ${hhmm} ist Regen gemeldet.`,
  };
}

/**
 * Wetter × Ski Tracker — fresh snow coming, and the skis are overdue.
 * Neither fact alone is worth a card.
 *
 * @param {{date:string, snowCm:number, place:string}} snow
 * @param {number} daysSinceService
 */
export function hintWetterSki(snow, daysSinceService, now = new Date()) {
  if (!snow || !(snow.snowCm >= 5)) return null;
  if (!(daysSinceService >= 10)) return null;
  const when = snow.date ? dayWord(snow.date, now) : 'demnächst';
  const place = snow.place ? `In ${snow.place} sind` : 'Es sind';
  return {
    type: 'wetterSki',
    text: `${place} für ${when} ${Math.round(snow.snowCm)} cm Neuschnee gemeldet — ` +
          `deine Ski sind seit ${Math.round(daysSinceService)} Tagen ohne Service.`,
  };
}

/**
 * Maturaarbeit progress × deadline. Projects the current rate onto the
 * remaining work; only speaks when the projection is decided one way or
 * the other, since "you'll finish roughly on time" is not news.
 *
 * @param {{doneCount:number,totalCount:number,firstDoneAt:number,nextChapter:string}} tracker
 * @param {string} dueDate  ISO
 */
export function hintMaturaTempo(tracker, dueDate, now = new Date()) {
  if (!tracker || !dueDate) return null;
  const { doneCount, totalCount, firstDoneAt, nextChapter } = tracker;
  if (!(doneCount >= 3) || !(totalCount > doneCount) || !firstDoneAt) return null;

  const elapsedDays = (now.getTime() - firstDoneAt) / DAY;
  if (elapsedDays < 7) return null;                 // too little history to project
  const perDay = doneCount / elapsedDays;
  if (!(perDay > 0)) return null;

  const remaining = totalCount - doneCount;
  const finish = new Date(now.getTime() + (remaining / perDay) * DAY);
  const due = new Date(`${dueDate}T23:59:59`);
  if (isNaN(due)) return null;
  const slack = Math.round((due - finish) / DAY);

  // Only worth saying when the answer is clear in one direction.
  if (Math.abs(slack) < 3) return null;
  const what = nextChapter ? `mit ${nextChapter}` : 'mit dem letzten Kapitel';
  return {
    type: 'maturaTempo',
    text: slack > 0
      ? `Bei deinem Tempo bist du ${what} ${slack} Tage vor der Abgabe fertig.`
      : `Bei deinem Tempo wirst du ${what} ${Math.abs(slack)} Tage nach der Abgabe fertig.`,
  };
}

/**
 * Recurring calendar entry — the birthday case. Rule 6 forbids
 * commenting on what other people do; noting that a date exists is a
 * fact from the shared calendar, not an observation about a person.
 *
 * @param {Array<{date:string,title:string,recurring:boolean}>} events
 */
export function hintGeburtstag(events, now = new Date()) {
  if (!Array.isArray(events)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soon = events.filter(e => {
    if (!e?.recurring || !e?.date) return false;
    const [y, m, d] = e.date.split('-').map(Number);
    const when = new Date(today.getFullYear(), m - 1, d);
    const diff = Math.round((when - today) / DAY);
    return diff >= 1 && diff <= 7;
  });
  if (soon.length !== 1) return null;               // two is a list, not a hint
  const e = soon[0];
  return { type: 'geburtstag', text: `${e.title} ist ${dayWord(shiftToThisYear(e.date, now), now)}.` };
}

function shiftToThisYear(iso, now) {
  const [, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(now.getFullYear(), m - 1, d));
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Everything together, in priority order: the most time-critical first.
 * Returns the one hint to show, or null.
 */
export function chooseHint(sources, uid, now = new Date()) {
  const candidates = [
    hintKalenderWetter(sources.nextEvent, sources.forecast, now),
    hintWetterSki(sources.snow, sources.daysSinceService, now),
    hintGeburtstag(sources.events, now),
    hintMaturaTempo(sources.matura, sources.maturaDue, now),
  ];
  const state = readHintState(uid);
  return pickHint(candidates, state, now, state.__lastShown || '');
}

/** Remember that something was shown today (rule 1). */
export function markShown(uid, now = new Date()) {
  const state = readHintState(uid);
  state.__lastShown = isoOf(now);
  writeHintState(uid, state);
}

/* ── Rendering ─────────────────────────────────────────────────────*/

/**
 * The card itself. Slides in once, then stands still (§9: the one new
 * animation in the app).
 */
export function renderHint(hint, { onDismiss, onLater } = {}) {
  const el = document.createElement('div');
  el.className = 'hint';
  el.innerHTML = `
    <span class="hint__from firn">Fir<b>n</b></span>
    <span class="hint__text"></span>
    <button class="hint__x" aria-label="Ausblenden">
      <svg class="ic" viewBox="0 0 24 24" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>`;
  el.querySelector('.hint__text').textContent = hint.text;
  el.querySelector('.hint__x').onclick = () => { el.remove(); onDismiss?.(hint.type); };
  if (onLater) {
    const later = document.createElement('button');
    later.className = 'b b--secondary';
    later.style.cssText = 'min-height:38px;margin-top:10px';
    later.textContent = 'Später';
    later.onclick = () => { el.remove(); onLater(hint.type); };
    el.appendChild(later);
  }
  return el;
}
