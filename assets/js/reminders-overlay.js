import { auth, db, reportClientError } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const HIDDEN_ON = new Set(['planner.html', 'messages.html']);
const bellIcon = `
  <svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
    <path d="M10 21h4"/>
  </svg>`;
const closeIcon = `
  <svg class="ic" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>`;
const backIcon = `
  <svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M15 18l-6-6 6-6"/>
  </svg>`;

let user = null;
let reminders = [];
let unsubscribe = null;
let editingId = null;
let mounted = false;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const todayKey = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const reminderCollection = () => collection(db, 'users', user.uid, 'reminders');
const currentFile = () => location.pathname.split('/').pop() || 'index.html';

function setContext(file = currentFile()) {
  const trigger = $('globalReminderFab');
  if (!trigger) return;
  trigger.hidden = HIDDEN_ON.has(file);
  if (trigger.hidden) closeOverlay();
}

function setCount(value, state = 'ready') {
  const trigger = $('globalReminderFab');
  const badge = $('globalReminderCount');
  if (!trigger || !badge) return;
  const openCount = Number(value) || 0;
  badge.textContent = state === 'error' ? '!' : state === 'loading' ? '…' : String(Math.min(openCount, 99));
  badge.classList.toggle('has-open', state === 'ready' && openCount > 0);
  const label = state === 'error'
    ? 'Erinnerungen konnten nicht geladen werden'
    : state === 'loading'
      ? 'Erinnerungen werden geladen'
      : openCount
        ? `${openCount} offene Erinnerung${openCount === 1 ? '' : 'en'}`
        : 'Keine offenen Erinnerungen';
  trigger.setAttribute('aria-label', `${label}. Erinnerungen öffnen`);
  trigger.title = label;
}

function whenText(item) {
  if (!item.date) return 'Ohne Datum';
  const today = todayKey();
  const date = item.date === today
    ? 'Heute'
    : new Intl.DateTimeFormat('de-CH', { weekday:'short', day:'numeric', month:'short' })
      .format(new Date(`${item.date}T12:00:00`));
  return `${date}${item.time ? ` · ${item.time}` : ''}`;
}

function visibleReminders() {
  return [
    ...reminders.filter(item => !item.completed),
    ...reminders.filter(item => item.completed).slice(-3)
  ];
}

function renderList() {
  const list = $('globalReminderList');
  if (!list) return;
  const visible = visibleReminders();
  if (!visible.length) {
    list.innerHTML = `
      <div class="global-reminder-empty">
        ${bellIcon}
        <strong>Alles erledigt</strong>
        <span>Du hast keine offenen Erinnerungen.</span>
      </div>`;
    return;
  }
  const today = todayKey();
  list.innerHTML = visible.map(item => `
    <div class="global-reminder-row${item.completed ? ' is-done' : ''}${!item.completed && item.date < today ? ' is-overdue' : ''}">
      <button class="global-reminder-check${item.completed ? ' is-done' : ''}" type="button"
        data-global-reminder-check="${esc(item.id)}"
        aria-label="${item.completed ? 'Als offen markieren' : 'Als erledigt markieren'}">${item.completed ? '✓' : ''}</button>
      <button class="global-reminder-row__body" type="button" data-global-reminder-edit="${esc(item.id)}">
        <span class="global-reminder-row__title">${esc(item.title || 'Erinnerung')}</span>
        <span class="global-reminder-row__meta">${esc(whenText(item))}</span>
      </button>
      <button class="global-reminder-edit" type="button" data-global-reminder-edit="${esc(item.id)}"
        aria-label="Erinnerung bearbeiten">✎</button>
    </div>`).join('');

  list.querySelectorAll('[data-global-reminder-check]').forEach(button => {
    button.onclick = async () => {
      const item = reminders.find(entry => entry.id === button.dataset.globalReminderCheck);
      if (!item) return;
      button.disabled = true;
      await setCompleted(item, !item.completed);
      button.disabled = false;
    };
  });
  list.querySelectorAll('[data-global-reminder-edit]').forEach(button => {
    button.onclick = () => {
      const item = reminders.find(entry => entry.id === button.dataset.globalReminderEdit);
      if (item) showForm(item);
    };
  });
}

function renderState() {
  const openCount = reminders.filter(item => !item.completed).length;
  setCount(openCount);
  renderList();
}

function watchUserReminders(nextUser) {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  user = nextUser;
  if (!user) {
    reminders = [];
    setCount(0);
    renderList();
    return;
  }
  setCount(0, 'loading');
  unsubscribe = onSnapshot(reminderCollection(), snapshot => {
    reminders = snapshot.docs.map(item => ({ id:item.id, ...item.data() }))
      .sort((a, b) =>
        Number(!!a.completed) - Number(!!b.completed) ||
        `${a.date || '9999'} ${a.time || ''}`.localeCompare(`${b.date || '9999'} ${b.time || ''}`)
      );
    renderState();
  }, error => {
    reportClientError('global-reminders-load', error);
    setCount(0, 'error');
    $('globalReminderList').innerHTML =
      '<p class="global-reminder-error">Erinnerungen konnten gerade nicht geladen werden.</p>';
  });
}

async function setCompleted(item, completed) {
  if (!user || !item?.id) return false;
  try {
    await updateDoc(doc(reminderCollection(), item.id), {
      completed,
      completedAt: completed ? serverTimestamp() : null,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    reportClientError('global-reminder-completion', error);
    alert('Erinnerung konnte nicht aktualisiert werden.');
    return false;
  }
}

function openOverlay() {
  renderList();
  showList();
  $('globalReminderBackdrop').classList.add('visible');
  $('globalReminderSheet').classList.add('visible');
  document.body.classList.add('global-reminders-open');
}

function closeOverlay() {
  $('globalReminderBackdrop')?.classList.remove('visible');
  $('globalReminderSheet')?.classList.remove('visible');
  document.body.classList.remove('global-reminders-open');
  showList();
}

function showList() {
  editingId = null;
  $('globalReminderListView')?.removeAttribute('hidden');
  if ($('globalReminderFormView')) $('globalReminderFormView').hidden = true;
}

function showForm(item = null) {
  editingId = item?.id || null;
  $('globalReminderListView').hidden = true;
  $('globalReminderFormView').hidden = false;
  $('globalReminderFormTitle').textContent = item ? 'Erinnerung bearbeiten' : 'Neue Erinnerung';
  $('globalReminderTitle').value = item?.title || '';
  $('globalReminderDate').value = item?.date || todayKey();
  $('globalReminderTime').value = item?.time || '';
  $('globalReminderNotes').value = item?.notes || '';
  $('globalReminderComplete').hidden = !item;
  $('globalReminderComplete').classList.toggle('is-completed', item?.completed === true);
  $('globalReminderCompleteLabel').textContent = item?.completed
    ? 'Wieder als offen markieren'
    : 'Als erledigt markieren';
  $('globalReminderDelete').hidden = !item;
  setTimeout(() => $('globalReminderTitle').focus(), 50);
}

async function saveForm() {
  if (!user) return;
  const title = $('globalReminderTitle').value.trim();
  const date = $('globalReminderDate').value;
  if (!title) { alert('Bitte einen Titel eingeben.'); return; }
  if (!date) { alert('Bitte ein Datum wählen.'); return; }
  const existing = reminders.find(item => item.id === editingId);
  const data = {
    title,
    date,
    time:$('globalReminderTime').value,
    notes:$('globalReminderNotes').value.trim(),
    completed:existing?.completed === true,
    updatedAt:serverTimestamp()
  };
  const button = $('globalReminderSave');
  button.disabled = true;
  try {
    if (editingId) await updateDoc(doc(reminderCollection(), editingId), data);
    else await addDoc(reminderCollection(), { ...data, createdAt:serverTimestamp() });
    showList();
  } catch (error) {
    reportClientError('global-reminder-save', error);
    alert('Erinnerung konnte nicht gespeichert werden.');
  } finally {
    button.disabled = false;
  }
}

function buildOverlay() {
  const trigger = document.createElement('button');
  trigger.className = 'global-reminder-fab';
  trigger.id = 'globalReminderFab';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Erinnerungen werden geladen. Erinnerungen öffnen');
  trigger.title = 'Erinnerungen werden geladen';
  trigger.innerHTML = `${bellIcon}<span class="global-reminder-fab__count" id="globalReminderCount">…</span>`;

  const backdrop = document.createElement('div');
  backdrop.className = 'global-reminder-backdrop';
  backdrop.id = 'globalReminderBackdrop';

  const sheet = document.createElement('section');
  sheet.className = 'global-reminder-sheet';
  sheet.id = 'globalReminderSheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Erinnerungen');
  sheet.innerHTML = `
    <div class="global-reminder-list-view" id="globalReminderListView">
      <div class="global-reminder-sheet__head">
        <div>
          <span class="global-reminder-sheet__eyebrow">Persönlich</span>
          <h2>Erinnerungen</h2>
        </div>
        <button class="global-reminder-icon-button" id="globalReminderClose" type="button" aria-label="Schliessen">${closeIcon}</button>
      </div>
      <div class="global-reminder-list" id="globalReminderList"></div>
      <button class="global-reminder-add" id="globalReminderAdd" type="button">
        <span aria-hidden="true">＋</span><span>Neue Erinnerung</span>
      </button>
    </div>
    <div class="global-reminder-form-view" id="globalReminderFormView" hidden>
      <div class="global-reminder-sheet__head">
        <button class="global-reminder-icon-button" id="globalReminderBack" type="button" aria-label="Zurück">${backIcon}</button>
        <h2 id="globalReminderFormTitle">Neue Erinnerung</h2>
        <button class="global-reminder-icon-button" id="globalReminderFormClose" type="button" aria-label="Schliessen">${closeIcon}</button>
      </div>
      <label class="global-reminder-field"><span>Titel</span><input id="globalReminderTitle" type="text"></label>
      <div class="global-reminder-fields">
        <label class="global-reminder-field"><span>Datum</span><input id="globalReminderDate" type="date"></label>
        <label class="global-reminder-field"><span>Zeit (optional)</span><input id="globalReminderTime" type="time"></label>
      </div>
      <label class="global-reminder-field"><span>Notiz (optional)</span><textarea id="globalReminderNotes" rows="3"></textarea></label>
      <button class="global-reminder-save" id="globalReminderSave" type="button">Speichern</button>
      <button class="global-reminder-complete" id="globalReminderComplete" type="button" hidden>
        <span aria-hidden="true">✓</span><span id="globalReminderCompleteLabel">Als erledigt markieren</span>
      </button>
      <button class="global-reminder-delete" id="globalReminderDelete" type="button" hidden>Erinnerung löschen</button>
    </div>`;

  document.body.append(trigger, backdrop, sheet);
  trigger.onclick = openOverlay;
  backdrop.onclick = closeOverlay;
  $('globalReminderClose').onclick = closeOverlay;
  $('globalReminderFormClose').onclick = closeOverlay;
  $('globalReminderBack').onclick = showList;
  $('globalReminderAdd').onclick = () => showForm();
  $('globalReminderSave').onclick = saveForm;
  $('globalReminderComplete').onclick = async () => {
    const item = reminders.find(entry => entry.id === editingId);
    if (item && await setCompleted(item, !item.completed)) showList();
  };
  $('globalReminderDelete').onclick = async () => {
    if (!editingId || !confirm('Diese Erinnerung löschen?')) return;
    try {
      await deleteDoc(doc(reminderCollection(), editingId));
      showList();
    } catch (error) {
      reportClientError('global-reminder-delete', error);
      alert('Erinnerung konnte nicht gelöscht werden.');
    }
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sheet.classList.contains('visible')) closeOverlay();
  });
}

export function mountGlobalReminderOverlay({ activeFile = currentFile() } = {}) {
  if (window.parent !== window) return;
  if (!mounted) {
    mounted = true;
    buildOverlay();
    onAuthStateChanged(auth, watchUserReminders);
    window.tvzaReminderOverlay = { open:openOverlay, close:closeOverlay, setContext };
  }
  setContext(activeFile);
}
