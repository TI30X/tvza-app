import { db, requireAuth, wireOfflineBanner, escHtml, sharesForEmail } from '../../firebase-config.js';
import {
  doc, getDoc, collection, addDoc, onSnapshot, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

wireOfflineBanner();
const user = await requireAuth('../login.html');

/* ── Icon chrome (SVG) ── */
const ICON_CLOSE  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const ICON_PENCIL = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_SKI    = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l4 8 5-5 5 15H2L8 3z"/></svg>`;
const ICON_SKI_LG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l4 8 5-5 5 15H2L8 3z"/></svg>`;
const ICON_WRENCH = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

// ── Zugriff: eigene Daten, oder per Freigabe (?owner=…) ──
let dataUid = user.uid;
let readOnly = false;
let ownerLabel = '';
const ownerParam = new URLSearchParams(location.search).get('owner');

if (ownerParam && ownerParam !== user.uid) {
  const shares = await sharesForEmail(user.email);
  const s = shares.find(x => x.ownerUid === ownerParam && x.module === 'ski');
  if (s) {
    dataUid = ownerParam;
    readOnly = s.role !== 'edit';
    ownerLabel = s.ownerName || 'geteilt';
  } else {
    // Legacy: Elternansicht von Timos Skis
    const profSnap = await getDoc(doc(db, 'users', user.uid));
    const profData = profSnap.exists() ? profSnap.data() : {};
    const cfg = await getDoc(doc(db, 'config', 'tvza'));
    if (profData.isParent === true && cfg.exists() && cfg.data().timoUid === ownerParam) {
      dataUid = ownerParam; readOnly = true; ownerLabel = 'Timo';
    } else {
      alert('Kein Zugriff auf diese Freigabe.');
      if (!window.tvzaNavigate?.('../index.html')) window.location.href = '../index.html';
    }
  }
}

// Read-only / shared UI adjustments
if (dataUid !== user.uid) {
  document.querySelector('.appbar__title').textContent =
    (ownerLabel ? ownerLabel + 's' : 'Geteilte') + ' Skis' + (readOnly ? '' : ' · Bearbeiten');
  const note = document.createElement('div');
  note.className = 'offline-banner visible shared-view-banner';
  note.textContent = readOnly ? `Leseansicht — ${ownerLabel || 'geteilte'} Daten` : `Bearbeiten — ${ownerLabel || 'geteilte'} Daten`;
  document.querySelector('.appbar').after(note);
}
if (readOnly) {
  document.body.classList.add('is-readonly');
}

document.getElementById('logDate').valueAsDate = new Date();

// ── Segmented control helper ──────────────────
function segValue(id) {
  return document.querySelector(`#${id} .seg-opt.on`)?.dataset.val || '';
}
function wireSeg(id) {
  document.querySelectorAll(`#${id} .seg-opt`).forEach(opt =>
    opt.addEventListener('click', () => {
      document.querySelectorAll(`#${id} .seg-opt`).forEach(o => o.classList.remove('on'));
      opt.classList.add('on');
    }));
}
function setSeg(id, val) {
  document.querySelectorAll(`#${id} .seg-opt`).forEach(o =>
    o.classList.toggle('on', o.dataset.val === val));
}
['segDisziplin','segSchliff','segWaxTyp','segWaxFarbe'].forEach(wireSeg);

// ── Stars ─────────────────────────────────────
let schaerfe = 0;
document.querySelectorAll('#starsSchaerfe .star').forEach(s =>
  s.addEventListener('click', () => {
    schaerfe = +s.dataset.v;
    document.querySelectorAll('#starsSchaerfe .star').forEach(st =>
      st.classList.toggle('on', +st.dataset.v <= schaerfe));
  }));

// ── Skis CRUD ─────────────────────────────────
const skiCol = collection(db, 'skitracker', dataUid, 'skis');
const logCol = collection(db, 'skitracker', dataUid, 'logs');
let skis = [], logs = [], editingSkiId = null;

onSnapshot(query(skiCol, orderBy('num', 'asc')), snap => {
  skis = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSkis(); refreshSkiSelect();
});

onSnapshot(query(logCol, orderBy('createdAt', 'desc')), snap => {
  logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderLogs(); renderSkis();
});

function lastLogFor(skiId) {
  return logs.find(l => l.skiId === skiId) || null;
}

function renderSkis() {
  const wrap = document.getElementById('skiList');
  if (!skis.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">${ICON_SKI_LG}</div><p class="empty-text">Noch keine Skis. Füge deine 6 Paar hinzu!</p></div>`;
    return;
  }
  wrap.innerHTML = '<div class="rows">' + skis.map(s => {
    const last = lastLogFor(s.id);
    return `
    <div class="row" data-bereich="ski">
      <span class="row__icon">${ICON_SKI}</span>
      <span class="row__body">
        <span class="row__title">#${s.num ?? '–'} ${escHtml(s.name)} <span class="badge badge-doing">${escHtml(s.disziplin || '?')}</span></span>
        <span class="row__sub">${last
          ? `Letzte Wartung: ${last.date || '–'} · ${escHtml(last.schliff||'')} · ${'★'.repeat(last.schaerfe||0)}${'☆'.repeat(5-(last.schaerfe||0))} · <span class="wax-dot wax-${escHtml(last.waxFarbe||'')}"></span>${escHtml(last.waxTyp||'')}`
          : 'Noch keine Wartung erfasst'}</span>
      </span>
      <span class="row__end">${readOnly ? '' : `<button class="row-icon-btn" data-editski="${s.id}">${ICON_PENCIL}</button><button class="row-icon-btn row-icon-btn--danger" data-delski="${s.id}">${ICON_CLOSE}</button>`}</span>
    </div>`;
  }).join('') + '</div>';

  wrap.querySelectorAll('[data-delski]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Ski löschen? (Wartungseinträge bleiben erhalten)')) deleteDoc(doc(skiCol, b.dataset.delski));
  }));
  wrap.querySelectorAll('[data-editski]').forEach(b => b.addEventListener('click', () => {
    const s = skis.find(x => x.id === b.dataset.editski);
    editingSkiId = s.id;
    document.getElementById('skiName').value = s.name;
    document.getElementById('skiNum').value = s.num ?? '';
    setSeg('segDisziplin', s.disziplin || '');
    document.getElementById('skiFormTitle').textContent = 'Ski bearbeiten';
    document.getElementById('saveSkiBtn').textContent = 'Änderungen speichern';
    document.getElementById('cancelEditBtn').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

document.getElementById('cancelEditBtn').addEventListener('click', resetSkiForm);

function resetSkiForm() {
  editingSkiId = null;
  document.getElementById('skiName').value = '';
  document.getElementById('skiNum').value = '';
  setSeg('segDisziplin', '');
  document.getElementById('skiFormTitle').textContent = 'Ski hinzufügen';
  document.getElementById('saveSkiBtn').innerHTML = '<span class="ui-plus" aria-hidden="true"></span><span>Speichern</span>';
  document.getElementById('cancelEditBtn').hidden = true;
}

document.getElementById('saveSkiBtn').addEventListener('click', async () => {
  const name = document.getElementById('skiName').value.trim();
  const num  = parseInt(document.getElementById('skiNum').value) || null;
  const disziplin = segValue('segDisziplin');
  if (!name)      { alert('Bitte einen Namen eingeben.'); return; }
  if (!disziplin) { alert('Bitte eine Disziplin wählen (SL, GS, SG, Abfahrt).'); return; }

  if (editingSkiId) {
    await updateDoc(doc(skiCol, editingSkiId), { name, num, disziplin });
  } else {
    await addDoc(skiCol, { name, num, disziplin, createdAt: serverTimestamp() });
  }
  resetSkiForm();
});

// ── Log ───────────────────────────────────────
function refreshSkiSelect() {
  const sel = document.getElementById('logSki');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— wählen —</option>' +
    skis.map(s => `<option value="${s.id}">#${s.num ?? ''} ${escHtml(s.name)} (${escHtml(s.disziplin||'')})</option>`).join('');
  sel.value = cur;
}

document.getElementById('addLogBtn').addEventListener('click', async () => {
  const skiId = document.getElementById('logSki').value;
  const ski   = skis.find(s => s.id === skiId);
  const date  = document.getElementById('logDate').value;
  const schliff  = segValue('segSchliff');
  const waxTyp   = segValue('segWaxTyp');
  const waxFarbe = segValue('segWaxFarbe');
  const notes = document.getElementById('logNotes').value.trim();

  if (!skiId)    { alert('Bitte einen Ski wählen.'); return; }
  if (!schliff)  { alert('Bitte Schliff wählen (Feile oder Diamant).'); return; }
  if (!schaerfe) { alert('Bitte Schärfe wählen (1–5 Sterne).'); return; }
  if (!waxTyp)   { alert('Bitte Wachs-Typ wählen.'); return; }
  if (!waxFarbe) { alert('Bitte Wachs-Farbe wählen.'); return; }

  await addDoc(logCol, {
    skiId,
    skiLabel: ski ? `#${ski.num ?? ''} ${ski.name}` : '',
    date, schliff, schaerfe, waxTyp, waxFarbe, notes,
    createdAt: serverTimestamp()
  });

  // Reset only the parts that change every time
  setSeg('segSchliff',''); setSeg('segWaxTyp',''); setSeg('segWaxFarbe','');
  schaerfe = 0;
  document.querySelectorAll('#starsSchaerfe .star').forEach(s => s.classList.remove('on'));
  document.getElementById('logNotes').value = '';
});

function renderLogs() {
  const wrap = document.getElementById('logList');
  if (!logs.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">${ICON_WRENCH}</div><p class="empty-text">Noch keine Einträge.</p></div>`;
    return;
  }
  wrap.innerHTML = '<div class="rows">' + logs.map(l => `
    <div class="row" data-bereich="ski">
      <span class="row__icon">${ICON_SKI}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(l.skiLabel || '?')}</span>
        <span class="row__sub">${l.date || '–'} · ${escHtml(l.schliff||'')} · ${'★'.repeat(l.schaerfe||0)}${'☆'.repeat(5-(l.schaerfe||0))} · <span class="wax-dot wax-${escHtml(l.waxFarbe)}"></span>${escHtml(l.waxTyp)}${l.notes ? ' · ' + escHtml(l.notes) : ''}</span>
      </span>
      <span class="row__end">${readOnly ? '' : `<button class="row-icon-btn row-icon-btn--danger" data-dellog="${l.id}">${ICON_CLOSE}</button>`}</span>
    </div>`).join('') + '</div>';

  wrap.querySelectorAll('[data-dellog]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Eintrag löschen?')) deleteDoc(doc(logCol, b.dataset.dellog));
  }));
}

// ── Tabs ──────────────────────────────────────
window.showTab = tab => {
  document.getElementById('panelSkis').hidden = tab !== 'skis';
  document.getElementById('panelLog').hidden = tab !== 'log';
  document.getElementById('tabSkis').className = 'tab' + (tab==='skis' ? ' active' : '');
  document.getElementById('tabLog').className  = 'tab' + (tab==='log'  ? ' active' : '');
};
