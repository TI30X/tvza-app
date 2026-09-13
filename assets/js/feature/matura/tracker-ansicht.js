/* ══════════════════════════════════════════════════════════════════
   Der Maturaarbeit-Tracker — dieselben Vorgaben für alle.

   Bis v.35.33.0 stand dieser Code als klassisches Inline-Skript in
   pages/maturaarbeit-tracker.html, mit onclick im erzeugten Markup.
   Seit v.35.34.0 hält die Seite die Seiten-Invariante: der Code ist
   derselbe — verschoben, nicht neu geschrieben —, die Handler sind
   Datenattribute mit EINEM Zuhörer je Ereignis, und das Zurücksetzen
   fragt mit frage() statt mit confirm().

   Kein Firebase hier; das steht in tracker.js.
   ══════════════════════════════════════════════════════════════════ */

import { frage } from '../../dialog.js';

export function richteTrackerEin() {
  // ── SPRACHE ────────────────────────────────────────────────────────
  // Der Rahmen kommt aus dem Katalog; die Vorgaben der Schule darunter
  // bleiben deutsch. tOr statt t(): bis der Katalog da ist, steht Deutsch.
  function T(key, deutsch, vars){
    const i18n = window.TVZAI18n;
    if (i18n) return i18n.tOr(key, deutsch, vars);
    return String(deutsch).replace(/\{(\w+)\}/g, (ganz, name) => vars && vars[name] !== undefined ? vars[name] : ganz);
  }

  // ── STANDARD-VORGABEN (für alle gleich) ──────────────────────────────
  const phases = [
    { cls:'p1', num:'Phase 1', title:'Grundlagen & Konzept', items:[
      {id:'p1a', text:'Thema festlegen'},
      {id:'p1b', text:'Fragestellung & Hypothesen formulieren', desc:'Hypothesen VOR der Analyse aufstellen.'},
      {id:'p1c', text:'Konzept / Disposition schreiben'},
      {id:'p1d', text:'Arbeits- & Zeitplan erstellen'},
    ]},
    { cls:'p2', num:'Phase 2', title:'Recherche & Methodik', items:[
      {id:'p2a', text:'Literatur & Quellen recherchieren', desc:'Mind. 5–8 wissenschaftliche Quellen.'},
      {id:'p2b', text:'Methodik festlegen & begründen'},
      {id:'p2c', text:'Material / Daten sammeln & strukturieren'},
    ]},
    { cls:'p3', num:'Phase 3', title:'Analyse & Ergebnisse', items:[
      {id:'p3a', text:'Analyse durchführen'},
      {id:'p3b', text:'Ergebnisse interpretieren', desc:'Hypothesen überprüfen – bestätigt oder widerlegt?'},
    ]},
    { cls:'p4', num:'Phase 4', title:'Schreiben, Finalisieren & Abgabe', items:[
      {id:'p4a', text:'Vollständigen Textentwurf schreiben', desc:'Abstract, Einleitung, Hauptteil, Schluss.'},
      {id:'p4b', text:'Roten Faden durchgängig prüfen'},
      {id:'p4c', text:'Überarbeitung: Sprache, Quellen (APA), Formatierung'},
      {id:'p4d', text:'Abgabe: PDF + Plagiatversion + Journal + Abstract'},
      {id:'p4e', text:'Mündliche Präsentation vorbereiten'},
    ]},
  ];

  const vorgaben = [
    {id:'vg1', text:'Am «Roten Faden» teilgenommen', tag:'pflicht', desc:'Schulinterne Pflichtveranstaltung zum Schreibprozess.'},
    {id:'vg2', text:'Zwei frühere KSA-Maturaarbeiten studiert', tag:'pflicht', desc:'Erkenntnisse zu Aufbau, Zitierung & Stil ins Journal.'},
    {id:'vg3', text:'Fragen vor jeder Besprechung vorab per Mail', tag:'pflicht'},
    {id:'vg4', text:'Alle Aussagen mit Quellen belegt (APA)', tag:'pflicht', desc:'Keine Online-Ratgeber/Wikipedia – nur Primär- & Fachquellen.'},
    {id:'vg5', text:'KISS-Prinzip: präzise, sachlich, kurze Sätze', tag:'format'},
    {id:'vg6', text:'Formatierung: Blocksatz, Zeilenabstand 1.5, max. 3 Ebenen', tag:'format'},
    {id:'vg7', text:'Abbildungen selbst erstellt & korrekt beschriftet', tag:'format'},
    {id:'vg8', text:'Arbeitsjournal laufend geführt', tag:'inhalt', desc:'Vorgehen, methodische Entscheide, Lust & Frust, Protokolle.'},
  ];

  // ── STATE (pro angemeldetem Schüler, eigener Key) ──────────────────
  let KEY = null;
  let state = {};
  let cloudStateWriter = null;
  const openPhases = new Set();
  const trackerTagLabels={
    pflicht:()=>T('ma.tag.pflicht','Pflicht'), inhalt:()=>T('ma.tag.inhalt','Inhalt'), format:()=>T('ma.tag.format','Format'),
  };
  let trackerLabel='';
  function storeLocalState(){
    if(!KEY) return;
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }
    catch(e){ console.warn('[matura-tracker-storage] save-failed'); }
  }
  function save(changedKey=null, options={}){
    storeLocalState();
    if(cloudStateWriter) void cloudStateWriter(state,changedKey,options);
  }

  // ── RENDER MEETINGS ────────────────────────────────────────────────
  function renderMeetings(){
    const labels=[
      T('mt.gespraech.1','Thema & Fragestellung'),T('mt.gespraech.2','Zwischenbilanz'),
      T('mt.gespraech.3','Inhaltl. Feedback'),T('mt.gespraech.4','Letzte Rückfragen'),
    ];
    document.getElementById('meetings-row').innerHTML = labels.map((lab,i)=>{
      const n=i+1, done=!!state['meeting_'+n];
      const storedDate=String(state['meeting_'+n+'_d']||'');
      const safeDate=/^\d{4}-\d{2}-\d{2}$/.test(storedDate)?storedDate:'';
      return `<div class="meeting-card ${done?'done':''}" role="checkbox" tabindex="0" aria-checked="${done}" data-meeting="${n}">
        <span class="mc-status-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${done?'<path d="M5 12l4 4L19 6"/>':'<circle cx="12" cy="12" r="8"/>'}</svg></span>
        <span class="mc-num">${T('ma.gespraechNr','Gespräch {n}',{n})}</span>
        <span class="mc-label">${lab}</span>
        <input type="date" class="mc-date" value="${safeDate}" aria-label="${T('mt.gespraechDatum','Datum für Gespräch {n}',{n})}" data-meet-date="${n}">
      </div>`;
    }).join('');
    const md=[1,2,3,4].filter(n=>state['meeting_'+n]).length;
    document.getElementById('meet-badge').textContent = md+' / 4';
  }
  function toggleMeeting(n){ const key='meeting_'+n; state[key]=!state[key]; save(key); renderMeetings(); renderGlobal(); }
  function setMeetDate(n,v){ const key='meeting_'+n+'_d'; state[key]=v; save(key); }

  // ── RENDER PHASES ──────────────────────────────────────────────────
  function renderPhases(){
    document.getElementById('phases').innerHTML = phases.map((p,pi)=>{
      const done=p.items.filter(i=>state[i.id]).length;
      const open=openPhases.has(pi);
      const items=p.items.map(it=>`
        <div class="check-item ${state[it.id]?'checked':''}" role="checkbox" tabindex="0" aria-checked="${!!state[it.id]}" data-item="${it.id}">
          <div class="custom-check"></div>
          <div class="ch-body"><div class="ch-main">${it.text}</div>${it.desc?`<div class="ch-desc">${it.desc}</div>`:''}</div>
        </div>`).join('');
      return `<div class="phase ${p.cls}">
        <button type="button" class="phase-head" data-phase="${pi}" aria-expanded="${open}">
          <span class="phase-stripe"></span>
          <span class="ph-body"><span class="ph-top"><span class="ph-num">${T('ma.phaseNr','Phase {n}',{n:pi+1})}</span><span class="ph-title">${p.title}</span></span>
            <span class="ph-count">${T('mt.erledigtZahl','{done}/{total} erledigt',{done,total:p.items.length})}</span></span>
          <span class="phase-toggle" aria-hidden="true"><svg class="ic${open?' is-open':''}" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>
        </button>
        <div class="phase-list ${open?'open':''}"><div class="checklist">${items}</div></div>
      </div>`;
    }).join('');
  }
  function togglePhase(i){ openPhases.has(i)?openPhases.delete(i):openPhases.add(i); renderPhases(); }
  function toggleItem(id){ state[id]=!state[id]; save(id); renderPhases(); renderGlobal(); }

  // ── RENDER VORGABEN ────────────────────────────────────────────────
  function renderVorgaben(){
    document.getElementById('cl-vorgaben').innerHTML = vorgaben.map(it=>`
      <div class="check-item ${state[it.id]?'checked':''}" role="checkbox" tabindex="0" aria-checked="${!!state[it.id]}" data-item="${it.id}">
        <div class="custom-check"></div>
        <div class="ch-body"><div class="ch-main">${it.text}</div>${it.desc?`<div class="ch-desc">${it.desc}</div>`:''}</div>
        <span class="ch-tag tag-${it.tag}">${trackerTagLabels[it.tag]?trackerTagLabels[it.tag]():it.tag}</span>
      </div>`).join('');
    const done=vorgaben.filter(i=>state[i.id]).length;
    document.getElementById('sp-vorgaben').style.width = Math.round(done/vorgaben.length*100)+'%';
    document.getElementById('sl-vorgaben').textContent = done+'/'+vorgaben.length;
  }

  // ── DEADLINE + GLOBAL PROGRESS ─────────────────────────────────────
  function renderDeadline(){
    const el=document.getElementById('days-el');
    if(!state.deadline){ el.textContent='–'; el.className='matura-metric__value days'; return; }
    const today=new Date(); today.setHours(0,0,0,0);
    const diff=Math.ceil((new Date(state.deadline)-today)/86400000);
    el.textContent = Math.max(0,diff);
    el.className='matura-metric__value days '+(diff<60?'urgent':diff<150?'warn':'ok');
  }
  function allIds(){
    return [...phases.flatMap(p=>p.items.map(i=>i.id)), ...vorgaben.map(i=>i.id), 'meeting_1','meeting_2','meeting_3','meeting_4'];
  }
  function renderGlobal(){
    const ids=allIds(), done=ids.filter(id=>state[id]).length;
    const pct=Math.round(done/ids.length*100);
    document.getElementById('gp-fill').style.width=pct+'%';
    document.getElementById('gp-pct').textContent=pct+' %';
    document.getElementById('tracker-progress-summary').textContent=done
      ?T('ma.punkteErledigt','{done} von {total} Punkten erledigt',{done,total:ids.length})
      :T('mt.keineErledigt','Noch keine Aufgaben erledigt.');
    document.querySelector('.matura-progress-track')?.setAttribute('aria-valuenow',String(pct));
    renderVorgaben();
    // Persist a compact summary so the dashboard tile can show progress + countdown.
    try {
      let days=null;
      if(state.deadline){ const t=new Date(); t.setHours(0,0,0,0); days=Math.max(0,Math.ceil((new Date(state.deadline)-t)/86400000)); }
      if(KEY) localStorage.setItem(KEY+'_summary', JSON.stringify({ pct, done, total:ids.length, deadline:state.deadline||null, days, ts:Date.now() }));
    } catch(e){}
  }

  // ── RESET ──────────────────────────────────────────────────────────
  async function resetAll(){
    if(await frage({
      titel:T('mt.zuruecksetzenFrage','Alle Häkchen, Termine und das Abgabedatum zurücksetzen?'),
      ja:T('mt.zuruecksetzen','Fortschritt zurücksetzen'), nein:T('common.abbrechen','Abbrechen'), gefahr:true,
    })){
      state={}; save(null,{reset:true}); document.getElementById('deadline-input').value='';
      openPhases.clear(); openPhases.add(0);
      renderAll();
    }
  }

  function renderWho(){
    if(!KEY) return;
    document.getElementById('who-line').textContent = T('mt.angemeldet','Angemeldet: {wer}',{wer:trackerLabel || T('mt.schueler','Schüler:in')});
  }
  function renderAll(){ renderMeetings(); renderPhases(); renderVorgaben(); renderDeadline(); renderGlobal(); renderWho(); }
  // Der Katalog kommt asynchron, und die Sprache laesst sich umschalten:
  // beide Male zeichnet der Code seine eigenen Beschriftungen neu.
  if(window.TVZAI18n) window.TVZAI18n.ready.then(renderAll, ()=>{});
  window.addEventListener('tvza-lang-change', renderAll);

  // ── START (nach Login aufgerufen, eigener Speicher pro Schüler) ─────
  function startTracker(uid, label){
    KEY = 'matura_tracker_' + uid;
    try{
      const parsed=JSON.parse(localStorage.getItem(KEY) || '{}');
      state=parsed && typeof parsed==='object' && !Array.isArray(parsed)?parsed:{};
    }catch(e){
      state={};
      console.warn('[matura-tracker-storage] invalid-local-state');
    }
    if(!state.deadline) state.deadline='2026-08-17';
    openPhases.clear();
    const firstOpen=phases.findIndex(p=>p.items.some(item=>!state[item.id]));
    openPhases.add(firstOpen>=0?firstOpen:phases.length-1);
    const di=document.getElementById('deadline-input');
    di.value=state.deadline||'';
    di.onchange=()=>{ state.deadline=di.value; save('deadline'); renderDeadline(); renderGlobal(); };
    trackerLabel = label || '';
    renderAll();
  }
  const bridge={
    storageKey:()=>KEY,
    allowedKeys:()=>[
      ...allIds(),
      ...[1,2,3,4].map(n=>`meeting_${n}_d`),
      'deadline',
    ],
    getState:()=>({...state}),
    applyState:next=>{
      state=next && typeof next==='object' && !Array.isArray(next)?{...next}:{};
      if(!state.deadline) state.deadline='2026-08-17';
      storeLocalState();
      const deadlineInput=document.getElementById('deadline-input');
      if(deadlineInput) deadlineInput.value=state.deadline;
      renderAll();
    },
    connect:writer=>{ cloudStateWriter=writer; },
  };

  /* Ein Zuhörer für die ganze Seite. Das Datumsfeld in einer
     Gesprächskarte darf die Karte nicht umschalten — vorher hielt das
     stopPropagation() im Markup auf. */
  document.addEventListener('click', event => {
    if (event.target.closest?.('input')) return;
    const ziel = event.target.closest?.('[data-meeting],[data-item],[data-phase]');
    if (!ziel) return;
    const d = ziel.dataset;
    if (d.meeting) toggleMeeting(Number(d.meeting));
    else if (d.item) toggleItem(d.item);
    else if (d.phase !== undefined) togglePhase(Number(d.phase));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest?.('input')) return;
    const ziel = event.target.closest?.('[data-meeting],[data-item]');
    if (!ziel) return;
    event.preventDefault();
    if (ziel.dataset.meeting) toggleMeeting(Number(ziel.dataset.meeting));
    else toggleItem(ziel.dataset.item);
  });
  document.addEventListener('change', event => {
    const feld = event.target.closest?.('[data-meet-date]');
    if (feld) setMeetDate(Number(feld.dataset.meetDate), feld.value);
  });
  document.querySelector('.matura-reset')?.addEventListener('click', resetAll);

  return { startTracker, bridge };
}
