/* ══════════════════════════════════════════════════════════════════
   Einen eigenen Wochenplan bauen — die Ansicht.

   Drei Ebenen, und man kommt mit "Zurück" aus jeder heraus:

     Woche     die sieben Tage mit ihren Einheiten; anlegen, verschieben,
               duplizieren, löschen, Woche kopieren
     Einheit   die Übungen einer Einheit; hinzufügen, ordnen, ändern
     Übung     eine eigene Übung anlegen oder ändern

   Gespeichert wird nach jeder Änderung (eigene-plaene.js). Ein
   "Speichern"-Knopf, den man vergessen kann, wäre bei einem Plan, den
   man über eine Woche verteilt baut, genau der falsche Ort für einen
   Verlust.

   Was der Plan ist, entscheidet plan-bauer.js. Diese Datei zeichnet.
   ══════════════════════════════════════════════════════════════════ */

import { escHtml, reportClientError } from '../../firebase-config.js';
import { frage, eingabe, meldung, waehle } from '../../dialog.js';
import {
  leererPlan, einheitAnlegen, einheitAendern, einheitVerschieben, einheitDuplizieren,
  einheitLoeschen, uebungHinzufuegen, uebungLoeschen, uebungVerschieben, uebungAendern,
  wocheKopieren, alsVorlage, ausVorlage, findeEinheit, montagVon, plusTage,
  SLOTS, SLOT_KEYS, slotWort, ISO_TAG, EINHEIT_MAX, UEBUNG_MAX,
} from '../../plan-bauer.js';
import {
  bibliothek, suche, kategorieWort, KATEGORIEN, MODI, videoSicher,
} from '../../uebungen-bibliothek.js';
import {
  planSpeichern, meinePlaene, planWeg, uebungSpeichern, meineUebungen, uebungWeg,
  vorlageSpeichern, meineVorlagen,
} from '../../eigene-plaene.js';

const $ = id => document.getElementById(id);
const t = (key, rueckfall, vars) => window.TVZAI18n?.tOr(key, rueckfall, vars)
  ?? String(rueckfall).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

let user = null;
let zurueckRuf = () => {};
let neuGeladen = () => {};

/* undefined = noch nicht geladen, null = das Laden ist gescheitert,
   [] = es gibt keine. Drei Zustaende, drei Werte — in EINEM Wert
   stuende bei einem Fehler "noch keinen Plan", und das waere eine
   Behauptung ueber den Menschen statt ueber die Verbindung. */
let plaene;
let aktiv = null;             // { id, plan }
let offeneEinheit = '';
let eigeneUebungen = [];
let vorlagen = [];
let speichert = false;

export function bauenInit({ nutzer, zurueck, danach }) {
  user = nutzer;
  zurueckRuf = zurueck || zurueckRuf;
  neuGeladen = danach || neuGeladen;
}

export const bauenOffen = () => $('secBauen')?.hidden === false;

/* ── Öffnen und schliessen ─────────────────────────────────────────*/

export async function bauenOeffnen() {
  $('secBauen').hidden = false;
  offeneEinheit = '';
  window.scrollTo?.(0, 0);
  zeichne();
  [plaene, eigeneUebungen, vorlagen] = await Promise.all([
    meinePlaene(user.uid), meineUebungen(user.uid), meineVorlagen(user.uid),
  ]);
  if (Array.isArray(plaene) && plaene.length && !aktiv) aktiv = plaene[0];
  zeichne();
}

export function bauenSchliessen() {
  $('secBauen').hidden = true;
  zurueckRuf();
}

/* ── Speichern ─────────────────────────────────────────────────────
   Nach jeder Änderung, aber nie zwei auf einmal: wer schnell dreimal
   tippt, würde sonst dreimal dasselbe Dokument überschreiben, und die
   Antworten kämen in beliebiger Reihenfolge zurück. */
async function sichern(neuerPlan) {
  if (!aktiv) return;
  aktiv = { ...aktiv, plan: neuerPlan };
  zeichne();
  if (speichert) return;
  speichert = true;
  try {
    const id = await planSpeichern(user.uid, aktiv.plan, aktiv.id);
    aktiv = { ...aktiv, id };
    if (Array.isArray(plaene)) {
      plaene = plaene.some(p => p.id === id)
        ? plaene.map(p => (p.id === id ? aktiv : p))
        : [aktiv, ...plaene];
    }
    neuGeladen();
  } catch (e) {
    reportClientError('bauen/speichern', e);
    await meldung({
      titel: t('pb.fehler', 'Das hat nicht geklappt'),
      text: t('pb.speichernWeg', 'Der Plan liess sich nicht speichern. Deine Änderung steht noch da — versuch es gleich nochmal.'),
    });
  }
  speichert = false;
}

/* ── Die Woche ─────────────────────────────────────────────────────*/

function zeichne() {
  if (!bauenOffen()) return;
  const wahl = $('bauenPlanWahl');
  const woche = $('bauenWoche');
  const leerHinweis = $('bauenLeer');

  if (plaene === undefined) {
    woche.innerHTML = `<p class="empty-hint">${escHtml(t('common.laden', 'Lädt …'))}</p>`;
    leerHinweis.hidden = true;
    wahl.hidden = true;
    return;
  }
  if (!Array.isArray(plaene)) {
    woche.innerHTML = `<p class="empty-hint">${escHtml(t('pb.ladeFehler', 'Deine Pläne liessen sich gerade nicht laden.'))}</p>`;
    leerHinweis.hidden = true;
    wahl.hidden = true;
    return;
  }

  leerHinweis.hidden = plaene.length > 0;
  wahl.hidden = plaene.length < 2;
  if (plaene.length >= 2) {
    wahl.innerHTML = plaene.map(p =>
      `<option value="${escHtml(p.id)}"${p.id === aktiv?.id ? ' selected' : ''}>${escHtml(planLabel(p.plan))}</option>`).join('');
  }

  if (!aktiv) { woche.innerHTML = ''; zeigeEinheit(); return; }
  $('bauenTitel').textContent = aktiv.plan.name || t('pb.meineWoche', 'Meine Woche');
  $('bauenSpanne').textContent = spanne(aktiv.plan);

  woche.innerHTML = aktiv.plan.days.map(tagHtml).join('');
  zeigeEinheit();
}

const planLabel = plan => `${plan?.name || 'Meine Woche'} · ${spanne(plan)}`;

function spanne(plan) {
  const von = plan?.dateRange?.start || '';
  const bis = plan?.dateRange?.end || '';
  return von && bis ? `${kurz(von)} – ${kurz(bis)}` : '';
}

function kurz(iso) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(window.TVZAI18n?.lang || 'de-CH',
      { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function tagHtml(tag) {
  const eintraege = (tag.slots || []).flatMap(s => (s.items || []).map(i => ({ ...i, slot: s.key })));
  return `
    <div class="pb-tag">
      <p class="pb-tag__kopf">
        <span class="pb-tag__name">${escHtml(tag.name)}</span>
        <span class="pb-tag__datum">${escHtml(kurz(tag.date))}</span>
        <button class="b b--secondary pb-tag__plus" type="button" data-pb-neu="${escHtml(tag.date)}"
                aria-label="${escHtml(t('pb.einheitNeu', 'Einheit hinzufügen'))}"><span class="ui-plus" aria-hidden="true"></span></button>
      </p>
      ${eintraege.length
        ? eintraege.map(e => `
          <div class="pb-einheit" data-pb-einheit="${escHtml(e.unit)}">
            <button class="pb-einheit__auf" type="button" data-pb-auf="${escHtml(e.unit)}">
              <span class="pb-einheit__titel">${escHtml(e.title)}</span>
              <span class="pb-einheit__wann">${escHtml([slotWort(e.slot), e.time].filter(Boolean).join(' · '))}</span>
              <span class="pb-einheit__zahl">${escHtml(uebungZahl(e.unit))}</span>
            </button>
            <div class="pb-einheit__knoepfe">
              <button class="b b--secondary" type="button" data-pb-verschieben="${escHtml(e.unit)}">${escHtml(t('pb.verschieben', 'Verschieben'))}</button>
              <button class="b b--secondary" type="button" data-pb-kopieren="${escHtml(e.unit)}">${escHtml(t('pb.duplizieren', 'Duplizieren'))}</button>
              <button class="b b--danger" type="button" data-pb-weg="${escHtml(e.unit)}">${escHtml(t('common.loeschen', 'Löschen'))}</button>
            </div>
          </div>`).join('')
        : `<p class="pb-tag__leer">${escHtml(t('pb.tagLeer', 'frei'))}</p>`}
    </div>`;
}

function uebungZahl(unitId) {
  const n = aktiv?.plan?.units?.[unitId]?.items?.length || 0;
  return n === 1 ? t('pb.eineUebung', '1 Übung') : t('pb.nUebungen', '{n} Übungen', { n });
}

/* ── Die Einheit ───────────────────────────────────────────────────*/

function zeigeEinheit() {
  const teil = $('bauenEinheit');
  const blatt = offeneEinheit ? aktiv?.plan?.units?.[offeneEinheit] : null;
  teil.hidden = !blatt;
  if (!blatt) return;
  $('bauenEinheitTitel').textContent = blatt.title || '';
  const liste = $('bauenUebungen');
  liste.innerHTML = blatt.items.length
    ? blatt.items.map((item, i) => `
      <div class="pb-uebung" data-pb-item="${escHtml(item.key)}">
        <p class="pb-uebung__kopf">
          <span class="pb-uebung__name">${escHtml(item.name)}</span>
          <span class="pb-uebung__modus">${escHtml(modusWort(item.mode))}</span>
        </p>
        ${item.alt ? `<p class="pb-uebung__text">${escHtml(item.alt)}</p>` : ''}
        <p class="pb-uebung__werte">${escHtml(werteText(item))}</p>
        <div class="pb-uebung__knoepfe">
          <button class="b b--secondary" type="button" data-pb-hoch="${escHtml(item.key)}" ${i === 0 ? 'disabled' : ''}
                  aria-label="${escHtml(t('pb.hoch', 'Nach oben'))}">↑</button>
          <button class="b b--secondary" type="button" data-pb-runter="${escHtml(item.key)}" ${i === blatt.items.length - 1 ? 'disabled' : ''}
                  aria-label="${escHtml(t('pb.runter', 'Nach unten'))}">↓</button>
          <button class="b b--secondary" type="button" data-pb-item-aendern="${escHtml(item.key)}">${escHtml(t('common.bearbeiten', 'Bearbeiten'))}</button>
          <button class="b b--danger" type="button" data-pb-item-weg="${escHtml(item.key)}">${escHtml(t('common.loeschen', 'Löschen'))}</button>
        </div>
      </div>`).join('')
    : `<p class="empty-hint">${escHtml(t('pb.keineUebung', 'Noch keine Übung. Such unten eine aus oder leg eine eigene an.'))}</p>`;
  zeichneBibliothek();
}

const MODUS_WORT = {
  sets: () => t('pb.modus.sets', 'Sätze'),
  rounds: () => t('pb.modus.rounds', 'Runden'),
  timed: () => t('pb.modus.timed', 'Auf Zeit'),
  block: () => t('pb.modus.block', 'Abschnitt'),
  video: () => t('pb.modus.video', 'Video'),
  note: () => t('pb.modus.note', 'Notiz'),
};
const modusWort = m => (MODUS_WORT[m] || MODUS_WORT.sets)();

function werteText(item) {
  const teile = [];
  if (item.sets?.length) {
    teile.push(t('pb.nSaetze', '{n} Sätze', { n: item.sets.length }));
    if (item.sets[0]?.reps) teile.push(`× ${item.sets[0].reps}`);
  }
  for (const p of item.params || []) if (p?.value) teile.push(`${p.label}: ${p.value}`);
  if (item.pause) teile.push(t('pb.pause', 'Pause {wert}', { wert: item.pause }));
  if (item.video) teile.push(t('pb.mitVideo', 'mit Video'));
  return teile.join(' · ');
}

/* ── Die Bibliothek ────────────────────────────────────────────────*/

function zeichneBibliothek() {
  const liste = $('bauenBibliothek');
  if (!liste) return;
  const frage_ = $('bauenSuche').value;
  const treffer = suche(bibliothek(eigeneUebungen), frage_, 14);
  liste.innerHTML = treffer.length
    ? treffer.map(u => `
      <button class="pb-bib" type="button" data-pb-bib="${escHtml(u.id || u.name)}">
        <span class="pb-bib__name">${escHtml(u.name)}</span>
        <span class="pb-bib__sub">${escHtml([kategorieWort(u.kategorie), u.geraet, modusWort(u.modus)].filter(Boolean).join(' · '))}</span>
        ${u.eigen ? `<span class="pb-bib__eigen">${escHtml(t('pb.eigene', 'eigene'))}</span>` : ''}
      </button>`).join('')
    : `<p class="empty-hint">${escHtml(t('pb.nichtsGefunden', 'Nichts gefunden — leg die Übung als eigene an.'))}</p>`;
}

function uebungVon(id) {
  return bibliothek(eigeneUebungen).find(u => (u.id || u.name) === id) || null;
}

/* ── Handlungen ────────────────────────────────────────────────────*/

export async function planNeu() {
  const heute = new Date();
  const p = x => String(x).padStart(2, '0');
  const iso = `${heute.getFullYear()}-${p(heute.getMonth() + 1)}-${p(heute.getDate())}`;
  const titel = await eingabe({
    titel: t('pb.neuTitel', 'Neuer Wochenplan'),
    text: t('pb.neuText', 'Gib ihm einen Namen. Die Woche beginnt am Montag.'),
    wert: t('pb.meineWoche', 'Meine Woche'),
  });
  if (titel === null) return;
  aktiv = { id: '', plan: leererPlan({ titel, montag: montagVon(iso) }) };
  await sichern(aktiv.plan);
}

export async function planWaehlen(id) {
  const gefunden = (plaene || []).find(p => p.id === id);
  if (!gefunden) return;
  aktiv = gefunden;
  offeneEinheit = '';
  zeichne();
}

export async function planLoeschenFragen() {
  if (!aktiv?.id) return;
  const ja = await frage({
    titel: t('pb.wegTitel', 'Plan löschen?'),
    text: t('pb.wegText', '„{name}" wird gelöscht. Was du bereits trainiert und eingetragen hast, bleibt — das gehört dem Tag, nicht dem Plan.', { name: aktiv.plan.name }),
    ja: t('common.loeschen', 'Löschen'),
    gefahr: true,
  });
  if (!ja) return;
  try {
    await planWeg(user.uid, aktiv.id);
    plaene = (plaene || []).filter(p => p.id !== aktiv.id);
    aktiv = plaene[0] || null;
    offeneEinheit = '';
    zeichne();
    neuGeladen();
  } catch (e) {
    reportClientError('bauen/plan-weg', e);
    await meldung({ titel: t('pb.fehler', 'Das hat nicht geklappt') });
  }
}

/** Die ganze Woche in eine andere kopieren — der häufigste Wunsch. */
export async function wocheKopierenFragen() {
  if (!aktiv) return;
  const start = aktiv.plan.dateRange?.start || '';
  const optionen = [1, 2, 3, 4].map(n => ({
    wert: plusTage(start, n * 7),
    titel: t('pb.inWoche', 'Woche ab {datum}', { datum: kurz(plusTage(start, n * 7)) }),
  }));
  const ziel = await waehle({
    titel: t('pb.kopierenTitel', 'Woche kopieren'),
    text: t('pb.kopierenText', 'Die Einheiten und Übungen kommen in eine neue Woche. Was du trainiert hast, bleibt, wo es war.'),
    optionen,
  });
  if (!ziel) return;
  try {
    const neu = wocheKopieren(aktiv.plan, { nachMontag: ziel });
    aktiv = { id: '', plan: neu };
    await sichern(neu);
  } catch (e) {
    reportClientError('bauen/kopieren', e);
    await meldung({ titel: t('pb.fehler', 'Das hat nicht geklappt') });
  }
}

async function einheitNeu(datum) {
  if (!aktiv) return;
  const wahl = vorlagen.length
    ? await waehle({
      titel: t('pb.woherTitel', 'Einheit hinzufügen'),
      optionen: [
        { wert: 'neu', titel: t('pb.leereEinheit', 'Leere Einheit') },
        ...vorlagen.map(v => ({ wert: `v:${v.id}`, titel: t('pb.ausVorlage', 'Aus „{name}"', { name: v.titel }) })),
      ],
    })
    : 'neu';
  if (!wahl) return;

  const slot = await slotFragen();
  if (!slot) return;

  if (wahl.startsWith('v:')) {
    const vorlage = vorlagen.find(v => v.id === wahl.slice(2));
    if (!vorlage) return;
    const { plan, unitId } = ausVorlage(aktiv.plan, vorlage, { datum, slot });
    offeneEinheit = unitId;
    await sichern(plan);
    return;
  }

  const titel = await eingabe({
    titel: t('pb.einheitNeu', 'Einheit hinzufügen'),
    text: t('pb.einheitText', 'Wie heisst sie? Zum Beispiel „Kraft Beine" oder „Laufen".'),
    wert: '',
  });
  if (titel === null || !titel.trim()) return;
  try {
    const { plan, unitId } = einheitAnlegen(aktiv.plan, { datum, slot, titel });
    offeneEinheit = unitId;
    await sichern(plan);
  } catch (e) {
    await meldung({
      titel: t('pb.fehler', 'Das hat nicht geklappt'),
      text: t('pb.zuVieleEinheiten', 'Mehr als {n} Einheiten in einer Woche gehen nicht.', { n: EINHEIT_MAX }),
    });
  }
}

function slotFragen() {
  return waehle({
    titel: t('pb.wannTitel', 'Wann am Tag?'),
    optionen: SLOTS.map(s => ({ wert: s.key, titel: slotWort(s.key) })),
  });
}

async function einheitVerschiebenFragen(unitId) {
  if (!aktiv) return;
  const ort = findeEinheit(aktiv.plan, unitId);
  if (!ort) return;
  const tag = await waehle({
    titel: t('pb.wohinTitel', 'An welchen Tag?'),
    optionen: aktiv.plan.days.map(d => ({ wert: d.date, titel: `${d.name} · ${kurz(d.date)}` })),
  });
  if (!tag) return;
  const slot = await slotFragen();
  if (!slot) return;
  await sichern(einheitVerschieben(aktiv.plan, unitId, { datum: tag, slot }));
}

async function einheitDuplizierenFragen(unitId) {
  if (!aktiv) return;
  const tag = await waehle({
    titel: t('pb.duplizieren', 'Duplizieren'),
    text: t('pb.duplizierenText', 'Eine Kopie mit denselben Übungen. Was du trainiert hast, wird nicht mitkopiert.'),
    optionen: aktiv.plan.days.map(d => ({ wert: d.date, titel: `${d.name} · ${kurz(d.date)}` })),
  });
  if (!tag) return;
  const { plan } = einheitDuplizieren(aktiv.plan, unitId, { datum: tag });
  await sichern(plan);
}

async function einheitWegFragen(unitId) {
  const blatt = aktiv?.plan?.units?.[unitId];
  if (!blatt) return;
  const ja = await frage({
    titel: t('pb.einheitWeg', 'Einheit löschen?'),
    text: t('pb.einheitWegText', '„{name}" verschwindet aus deiner Woche.', { name: blatt.title }),
    ja: t('common.loeschen', 'Löschen'),
    gefahr: true,
  });
  if (!ja) return;
  if (offeneEinheit === unitId) offeneEinheit = '';
  await sichern(einheitLoeschen(aktiv.plan, unitId));
}

async function einheitUmbenennen() {
  const blatt = aktiv?.plan?.units?.[offeneEinheit];
  if (!blatt) return;
  const titel = await eingabe({
    titel: t('pb.umbenennen', 'Einheit umbenennen'),
    wert: blatt.title,
  });
  if (titel === null || !titel.trim()) return;
  await sichern(einheitAendern(aktiv.plan, offeneEinheit, { titel }));
}

async function alsVorlageSpeichern() {
  if (!aktiv || !offeneEinheit) return;
  try {
    const vorlage = alsVorlage(aktiv.plan, offeneEinheit);
    const id = await vorlageSpeichern(user.uid, vorlage);
    vorlagen = [...vorlagen, { id, ...vorlage }];
    await meldung({
      titel: t('pb.vorlageDa', 'Als Vorlage gespeichert'),
      text: t('pb.vorlageDaText', '„{name}" lässt sich jetzt an jedem Tag wieder einsetzen.', { name: vorlage.titel }),
    });
  } catch (e) {
    reportClientError('bauen/vorlage', e);
    await meldung({ titel: t('pb.fehler', 'Das hat nicht geklappt') });
  }
}

/* ── Eine eigene Übung ─────────────────────────────────────────────*/

export function uebungFormOeffnen(id = '') {
  const u = id ? eigeneUebungen.find(x => x.id === id) : null;
  $('bauenUebungForm').hidden = false;
  $('bauenUebungForm').dataset.id = id;
  $('ubName').value = u?.name || $('bauenSuche').value.trim();
  $('ubKategorie').value = u?.kategorie || 'kraft';
  $('ubAnweisung').value = u?.anweisung || '';
  $('ubGeraet').value = u?.geraet || '';
  $('ubModus').value = u?.modus || 'sets';
  $('ubSaetze').value = u?.saetze ?? 3;
  $('ubReps').value = u?.reps || '';
  $('ubDauer').value = u?.dauer || '';
  $('ubPause').value = u?.pause || '';
  $('ubVideo').value = u?.video || '';
  $('ubFehler').hidden = true;
  $('ubName').focus();
}

export function uebungFormSchliessen() {
  $('bauenUebungForm').hidden = true;
  $('bauenUebungForm').dataset.id = '';
}

export async function uebungSpeichernAusForm() {
  const fehler = $('ubFehler');
  const zeige = text => { fehler.hidden = !text; fehler.textContent = text || ''; };
  const name = $('ubName').value.trim();
  if (!name) { zeige(t('pb.ohneName', 'Die Übung braucht einen Namen.')); return; }
  const video = $('ubVideo').value.trim();
  if (video && !videoSicher(video)) {
    zeige(t('pb.videoWeg', 'Der Videolink muss mit http:// oder https:// beginnen.'));
    return;
  }
  const uebung = {
    name,
    kategorie: $('ubKategorie').value,
    anweisung: $('ubAnweisung').value,
    geraet: $('ubGeraet').value,
    modus: $('ubModus').value,
    saetze: $('ubSaetze').value,
    reps: $('ubReps').value,
    dauer: $('ubDauer').value,
    pause: $('ubPause').value,
    video,
  };
  try {
    const id = await uebungSpeichern(user.uid, uebung, $('bauenUebungForm').dataset.id || '');
    eigeneUebungen = [...eigeneUebungen.filter(x => x.id !== id), { id, ...uebung, eigen: true }];
    uebungFormSchliessen();
    zeichneBibliothek();
  } catch (e) {
    reportClientError('bauen/uebung', e);
    zeige(t('pb.speichernWeg2', 'Die Übung liess sich nicht speichern.'));
  }
}

async function eigeneUebungWeg(id) {
  const u = eigeneUebungen.find(x => x.id === id);
  if (!u) return;
  const ja = await frage({
    titel: t('pb.uebungWeg', 'Übung löschen?'),
    text: t('pb.uebungWegText', '„{name}" verschwindet aus deiner Bibliothek. Pläne, in denen sie schon steht, bleiben unverändert.', { name: u.name }),
    ja: t('common.loeschen', 'Löschen'),
    gefahr: true,
  });
  if (!ja) return;
  try {
    await uebungWeg(user.uid, id);
    eigeneUebungen = eigeneUebungen.filter(x => x.id !== id);
    zeichneBibliothek();
  } catch (e) {
    reportClientError('bauen/uebung-weg', e);
    await meldung({ titel: t('pb.fehler', 'Das hat nicht geklappt') });
  }
}

/* ── Verdrahten ────────────────────────────────────────────────────*/

export function bauenVerdrahten() {
  $('btnBauen')?.addEventListener('click', () => void bauenOeffnen());
  $('btnBauenZurueck')?.addEventListener('click', bauenSchliessen);
  $('btnPlanNeuEigen')?.addEventListener('click', () => void planNeu());
  $('btnPlanWegEigen')?.addEventListener('click', () => void planLoeschenFragen());
  $('btnWocheKopieren')?.addEventListener('click', () => void wocheKopierenFragen());
  $('bauenPlanWahl')?.addEventListener('change', event => void planWaehlen(event.target.value));

  $('bauenWoche')?.addEventListener('click', event => {
    const neu = event.target.closest('[data-pb-neu]');
    if (neu) { void einheitNeu(neu.dataset.pbNeu); return; }
    const auf = event.target.closest('[data-pb-auf]');
    if (auf) { offeneEinheit = auf.dataset.pbAuf; zeigeEinheit(); $('bauenEinheit').scrollIntoView?.({ behavior: 'smooth', block: 'start' }); return; }
    const verschieben = event.target.closest('[data-pb-verschieben]');
    if (verschieben) { void einheitVerschiebenFragen(verschieben.dataset.pbVerschieben); return; }
    const kopieren = event.target.closest('[data-pb-kopieren]');
    if (kopieren) { void einheitDuplizierenFragen(kopieren.dataset.pbKopieren); return; }
    const weg = event.target.closest('[data-pb-weg]');
    if (weg) void einheitWegFragen(weg.dataset.pbWeg);
  });

  $('btnEinheitUmbenennen')?.addEventListener('click', () => void einheitUmbenennen());
  $('btnEinheitVorlage')?.addEventListener('click', () => void alsVorlageSpeichern());
  $('btnEinheitZu')?.addEventListener('click', () => { offeneEinheit = ''; zeigeEinheit(); });

  $('bauenUebungen')?.addEventListener('click', event => {
    const hoch = event.target.closest('[data-pb-hoch]');
    if (hoch) { void sichern(uebungVerschieben(aktiv.plan, offeneEinheit, hoch.dataset.pbHoch, -1)); return; }
    const runter = event.target.closest('[data-pb-runter]');
    if (runter) { void sichern(uebungVerschieben(aktiv.plan, offeneEinheit, runter.dataset.pbRunter, 1)); return; }
    const weg = event.target.closest('[data-pb-item-weg]');
    if (weg) { void sichern(uebungLoeschen(aktiv.plan, offeneEinheit, weg.dataset.pbItemWeg)); return; }
    const aendern = event.target.closest('[data-pb-item-aendern]');
    if (aendern) void itemAendern(aendern.dataset.pbItemAendern);
  });

  $('bauenSuche')?.addEventListener('input', zeichneBibliothek);
  $('bauenBibliothek')?.addEventListener('click', event => {
    const bib = event.target.closest('[data-pb-bib]');
    if (!bib) return;
    const u = uebungVon(bib.dataset.pbBib);
    if (!u || !offeneEinheit) return;
    try { void sichern(uebungHinzufuegen(aktiv.plan, offeneEinheit, u)); }
    catch { void meldung({ titel: t('pb.fehler', 'Das hat nicht geklappt'), text: t('pb.zuVieleUebungen', 'Mehr als {n} Übungen in einer Einheit gehen nicht.', { n: UEBUNG_MAX }) }); }
  });
  $('btnUebungNeu')?.addEventListener('click', () => uebungFormOeffnen());
  $('btnUbSpeichern')?.addEventListener('click', () => void uebungSpeichernAusForm());
  $('btnUbAbbrechen')?.addEventListener('click', uebungFormSchliessen);
  $('btnUbWeg')?.addEventListener('click', () => {
    const id = $('bauenUebungForm').dataset.id;
    if (id) void eigeneUebungWeg(id);
  });

  /* Die Auswahlfelder einmal füllen — sie ändern sich nie. */
  const kategorie = $('ubKategorie');
  if (kategorie && !kategorie.options.length) {
    for (const k of KATEGORIEN) {
      const o = document.createElement('option');
      o.value = k.key;
      o.textContent = kategorieWort(k.key);
      kategorie.appendChild(o);
    }
  }
  const modus = $('ubModus');
  if (modus && !modus.options.length) {
    for (const m of MODI) {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = modusWort(m);
      modus.appendChild(o);
    }
  }
}

async function itemAendern(key) {
  const item = aktiv?.plan?.units?.[offeneEinheit]?.items?.find(i => i.key === key);
  if (!item) return;
  const neu = await eingabe({
    titel: t('pb.itemAendern', 'Wiederholungen ändern'),
    text: t('pb.itemAendernText', 'Für „{name}". Zum Beispiel „10" oder „8/Seite".', { name: item.name }),
    wert: item.sets?.[0]?.reps || '',
  });
  if (neu === null) return;
  await sichern(uebungAendern(aktiv.plan, offeneEinheit, key, { reps: neu }));
}

/** Für den Bereich Training: hat diese Person eigene Pläne? */
export const hatEigenePlaene = () => Array.isArray(plaene) && plaene.length > 0;
