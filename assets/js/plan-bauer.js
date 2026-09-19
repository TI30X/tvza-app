/* ══════════════════════════════════════════════════════════════════
   Einen eigenen Wochenplan bauen — ohne Excel und ohne Trainer.

   Was hier entsteht, ist KEIN neues Format. Es ist genau die Form, die
   training-parser.js aus der Excel des Kaders macht:

       { name, dateRange, days: [{ key, name, date, slots: [...] }],
         units: { [id]: { id, title, kind, items: [...] } } }

   Das ist die ganze Idee dieser Datei. Der Player (feature/einheit),
   die Woche (feature/woche), der Kalender, die Übersicht auf Start und
   das Teilen nach aussen lesen alle DIESE Form. Ein zweites Format
   hätte jedes dieser fünf Dinge ein zweites Mal gebraucht.

   ── Eigen und Gruppe stehen nebeneinander ─────────────────────────
   Ein eigener Plan ist eine Quelle wie eine Gruppe — mit der Kennung
   EIGEN ('ich', groups.js). Ein Plan des Kaders und ein eigener am
   selben Tag verdrängen einander nicht: agendaTage() entscheidet je
   QUELLE, welcher Plan gewinnt, und zwei Quellen sind zwei Einträge.
   Wer am Dienstag Krafttraining vom Kader und abends seinen eigenen
   Lauf hat, sieht beides.

   ── Ohne Datum kein Tag ───────────────────────────────────────────
   Die Excel des Kaders nennt eine Kalenderwoche und leitet die Daten
   daraus ab. Ein eigener Plan trägt sie direkt: jeder Tag hat sein
   ISO-Datum. Damit gibt es keine zweite, selbst gerechnete Wochenzahl
   (CLAUDE.md, Falle 10: "eine selbst gerechnete Zahl daneben wäre eine
   zweite Wahrheit").
   ══════════════════════════════════════════════════════════════════ */

import { uebungSauber, videoSicher, modusGueltig, NAME_MAX } from './uebungen-bibliothek.js';

export const SCHEMA = 1;
export const TITEL_MAX = 80;
export const EINHEIT_MAX = 40;
export const UEBUNG_MAX = 60;
export const SAETZE_MAX = 12;
export const PLAN_MAX = 900000;   // dieselbe Grenze wie in den Regeln

export const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/* Die drei Zeitfenster eines Tages. Die Excel kennt Vormittag und
   Nachmittag; "Abend" kommt dazu, weil ein eigener Plan nach der
   Arbeit stattfindet. Eine Uhrzeit steht am Eintrag (time) — der
   Slot sagt nur, wohin am Tag er gehört. */
export const SLOTS = Object.freeze([
  { key: 'vormittag', i18n: 'pb.slot.vormittag', de: 'Vormittag' },
  { key: 'nachmittag', i18n: 'pb.slot.nachmittag', de: 'Nachmittag' },
  { key: 'abend', i18n: 'pb.slot.abend', de: 'Abend' },
]);
export const SLOT_KEYS = Object.freeze(SLOTS.map(s => s.key));
export const slotGueltig = k => SLOT_KEYS.includes(String(k || ''));
export const slotWort = key => {
  const s = SLOTS.find(x => x.key === key) || SLOTS[0];
  return window.TVZAI18n?.tOr(s.i18n, s.de) ?? s.de;
};

const WOCHENTAGE = Object.freeze(['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']);
const TAG_NAMEN = Object.freeze({
  mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag',
  fr: 'Freitag', sa: 'Samstag', so: 'Sonntag',
});

const text = (wert, max) => String(wert ?? '').trim().slice(0, max);

/* ── Datumsrechnen ─────────────────────────────────────────────────
   Bewusst hier und nicht aus wochenplan.js: dieses Modul soll ohne
   Firebase und ohne die Gruppenwelt laufen, damit ein Test es mit
   drei Zeilen prüfen kann. */
export function plusTage(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function montagVon(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return plusTage(iso, -((d.getDay() + 6) % 7));
}

/* Eine Kennung, die nur einmal vorkommt und keine Zeichen trägt, die
   anderswo etwas bedeuten. '~' trennt in privatEinheit() Gruppe und
   Einheit — eine Kennung mit '~' darin brächte die privaten Notizen
   durcheinander. */
let laufend = 0;
export function neueKennung(praefix = 'e') {
  laufend += 1;
  const zufall = Math.random().toString(36).slice(2, 7);
  return `${praefix}${Date.now().toString(36)}${laufend.toString(36)}${zufall}`
    .replace(/[^a-z0-9]/gi, '');
}

/* ── Ein leerer Plan ───────────────────────────────────────────────*/

export function leererPlan({ titel = '', montag = '' } = {}) {
  const start = ISO_TAG.test(montag) ? montagVon(montag) : montagVon(heuteIso());
  return {
    schema: SCHEMA,
    eigen: true,
    name: text(titel, TITEL_MAX) || 'Meine Woche',
    dateRange: { raw: '', start, end: plusTage(start, 6) },
    days: WOCHENTAGE.map((key, i) => ({
      key,
      name: TAG_NAMEN[key],
      date: plusTage(start, i),
      slots: SLOT_KEYS.map(s => ({ key: s, name: slotNameDe(s), items: [] })),
    })),
    units: {},
  };
}

/* Im Dokument steht das deutsche Wort (wie in der Excel); die
   Oberfläche übersetzt über slotWort(). Ein Katalogschlüssel im
   Dokument wäre ein Wort, das ohne den Katalog nichts sagt. */
const slotNameDe = key => (SLOTS.find(s => s.key === key) || SLOTS[0]).de;

function heuteIso() {
  const d = new Date();
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ── Einheiten ─────────────────────────────────────────────────────
   Eine Einheit ist zweierlei: ein EINTRAG an einem Tag (was wann
   stattfindet) und ein BLATT (welche Übungen). Die Excel trennt beides
   genauso — die Zelle nennt den Namen, das Blatt trägt die Übungen —,
   und der Player öffnet immer das Blatt.

   Beides zusammen anzulegen ist der einzige Weg, der nicht zu
   verwaisten Blättern führt. */

export function einheitAnlegen(plan, { datum, slot = 'vormittag', titel, zeit = '' }) {
  const p = kopie(plan);
  const tag = p.days.find(d => d.date === datum);
  if (!tag) throw new Error('plan: dieser Tag gehört nicht zur Woche');
  if (zaehleEinheiten(p) >= EINHEIT_MAX) throw new Error('plan: zu viele Einheiten');
  const unitId = neueKennung('u');
  const name = text(titel, TITEL_MAX) || 'Einheit';
  const s = tag.slots.find(x => x.key === (slotGueltig(slot) ? slot : 'vormittag'))
    || tag.slots[0];
  s.items.push({ title: name, unit: unitId, time: text(zeit, 40) });
  p.units[unitId] = { id: unitId, title: name, kind: 'strength', items: [] };
  return { plan: p, unitId };
}

/** Wo steht diese Einheit? { tag, slot, index } oder null. */
export function findeEinheit(plan, unitId) {
  for (const tag of plan?.days || []) {
    for (const slot of tag.slots || []) {
      const index = (slot.items || []).findIndex(i => i.unit === unitId);
      if (index >= 0) return { datum: tag.date, slot: slot.key, index, eintrag: slot.items[index] };
    }
  }
  return null;
}

export function einheitAendern(plan, unitId, { titel, zeit } = {}) {
  const p = kopie(plan);
  const ort = findeEinheit(p, unitId);
  if (!ort) return p;
  const eintrag = p.days.find(d => d.date === ort.datum)
    .slots.find(s => s.key === ort.slot).items[ort.index];
  if (titel !== undefined) {
    eintrag.title = text(titel, TITEL_MAX) || eintrag.title;
    if (p.units[unitId]) p.units[unitId].title = eintrag.title;
  }
  if (zeit !== undefined) eintrag.time = text(zeit, 40);
  return p;
}

/** Verschieben: anderer Tag, anderes Zeitfenster, oder beides. */
export function einheitVerschieben(plan, unitId, { datum, slot } = {}) {
  const p = kopie(plan);
  const ort = findeEinheit(p, unitId);
  if (!ort) return p;
  const zielDatum = datum || ort.datum;
  const zielSlot = slotGueltig(slot) ? slot : ort.slot;
  const zielTag = p.days.find(d => d.date === zielDatum);
  if (!zielTag) return p;

  const quelle = p.days.find(d => d.date === ort.datum).slots.find(s => s.key === ort.slot);
  const [eintrag] = quelle.items.splice(ort.index, 1);
  const ziel = zielTag.slots.find(s => s.key === zielSlot) || zielTag.slots[0];
  ziel.items.push(eintrag);
  return p;
}

/**
 * Duplizieren — eine KOPIE mit eigener Kennung.
 *
 * Nicht dieselbe: zwei Einträge auf DASSELBE Blatt wären ein Protokoll
 * für zwei Tage, und was man am Dienstag abhakt, stünde am Donnerstag
 * schon abgehakt da (das Protokoll hängt an unitId).
 */
export function einheitDuplizieren(plan, unitId, { datum, slot } = {}) {
  const p = kopie(plan);
  const ort = findeEinheit(p, unitId);
  const blatt = p.units[unitId];
  if (!ort || !blatt) return { plan: p, unitId: '' };
  const neu = neueKennung('u');
  const zielDatum = datum || ort.datum;
  const zielTag = p.days.find(d => d.date === zielDatum);
  if (!zielTag) return { plan: p, unitId: '' };
  const ziel = zielTag.slots.find(s => s.key === (slotGueltig(slot) ? slot : ort.slot)) || zielTag.slots[0];
  ziel.items.push({ ...ort.eintrag, unit: neu });
  p.units[neu] = { ...JSON.parse(JSON.stringify(blatt)), id: neu };
  p.units[neu].items = p.units[neu].items.map(i => ({ ...i, key: `${neu}-${i.slug || neueKennung('i')}` }));
  return { plan: p, unitId: neu };
}

export function einheitLoeschen(plan, unitId) {
  const p = kopie(plan);
  for (const tag of p.days) {
    for (const slot of tag.slots) slot.items = slot.items.filter(i => i.unit !== unitId);
  }
  delete p.units[unitId];
  return p;
}

export const zaehleEinheiten = plan => Object.keys(plan?.units || {}).length;

/* ── Übungen ───────────────────────────────────────────────────────
   Aus einem Eintrag der Bibliothek wird ein Item in der Form des
   Parsers. Der Schlüssel ist, was das Protokoll adressiert; er muss
   innerhalb der Einheit eindeutig und über Änderungen stabil sein —
   sonst verliert ein Athlet seine eingetragenen Werte, weil er eine
   Übung umbenannt hat. */

export function alsItem(uebung, { nummer = 1, unitId = '' } = {}) {
  const u = uebungSauber(uebung);
  const slug = `${nummer}-${schlank(u.name)}`.slice(0, 40);
  const item = {
    key: `${unitId}-${slug}`,
    slug,
    no: String(nummer),
    name: u.name,
    alt: u.anweisung,
    video: u.video,
    mode: u.modus,
    sets: [],
    params: [],
    lines: [],
    pause: u.pause,
    tut: '',
    history: [],
  };
  if (u.geraet) item.params.push({ label: 'Gerät', value: u.geraet });
  if (u.modus === 'sets') {
    const anzahl = Math.min(SAETZE_MAX, Math.max(1, u.saetze || 3));
    item.sets = Array.from({ length: anzahl }, (_, i) => ({
      label: `${i + 1}. Satz`, reps: u.reps || '', weight: '',
    }));
  } else if (u.dauer) {
    item.params.push({ label: 'Dauer', value: u.dauer });
  }
  if (u.modus !== 'sets' && u.saetze) item.params.push({ label: 'Runden', value: String(u.saetze) });
  if (u.modus !== 'sets' && u.reps) item.params.push({ label: 'Umfang', value: u.reps });
  return item;
}

const schlank = name => String(name || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'uebung';

export function uebungHinzufuegen(plan, unitId, uebung) {
  const p = kopie(plan);
  const blatt = p.units[unitId];
  if (!blatt) throw new Error('plan: diese Einheit gibt es nicht');
  if (blatt.items.length >= UEBUNG_MAX) throw new Error('plan: zu viele Übungen');
  blatt.items.push(alsItem(uebung, { nummer: blatt.items.length + 1, unitId }));
  blatt.kind = blattArt(blatt.items);
  return p;
}

export function uebungLoeschen(plan, unitId, key) {
  const p = kopie(plan);
  const blatt = p.units[unitId];
  if (!blatt) return p;
  blatt.items = blatt.items.filter(i => i.key !== key);
  blatt.kind = blattArt(blatt.items);
  return p;
}

export function uebungVerschieben(plan, unitId, key, richtung) {
  const p = kopie(plan);
  const blatt = p.units[unitId];
  if (!blatt) return p;
  const i = blatt.items.findIndex(x => x.key === key);
  const j = i + (richtung < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= blatt.items.length) return p;
  [blatt.items[i], blatt.items[j]] = [blatt.items[j], blatt.items[i]];
  return p;
}

/**
 * Eine Übung ändern.
 *
 * `key` bleibt, auch wenn der Name sich ändert — daran hängt das
 * Protokoll. Eine umbenannte Übung ist dieselbe Übung.
 */
export function uebungAendern(plan, unitId, key, patch) {
  const p = kopie(plan);
  const item = p.units[unitId]?.items?.find(i => i.key === key);
  if (!item) return p;
  if (patch?.name !== undefined) item.name = text(patch.name, NAME_MAX) || item.name;
  if (patch?.anweisung !== undefined) item.alt = text(patch.anweisung, 400);
  if (patch?.video !== undefined) item.video = videoSicher(patch.video);
  if (patch?.pause !== undefined) item.pause = text(patch.pause, 40);
  if (patch?.modus !== undefined && modusGueltig(patch.modus)) item.mode = patch.modus;
  if (patch?.saetze !== undefined || patch?.reps !== undefined) {
    const anzahl = patch.saetze === undefined
      ? item.sets.length
      : Math.min(SAETZE_MAX, Math.max(0, Math.round(Number(patch.saetze) || 0)));
    const reps = patch.reps === undefined ? (item.sets[0]?.reps || '') : text(patch.reps, 20);
    item.sets = Array.from({ length: anzahl }, (_, i) => ({
      label: item.sets[i]?.label || `${i + 1}. Satz`,
      reps,
      weight: item.sets[i]?.weight || '',
    }));
  }
  p.units[unitId].kind = blattArt(p.units[unitId].items);
  return p;
}

/* Womit der Player das Blatt beschriftet. Aus den Modi der Übungen
   abgeleitet, damit niemand es von Hand setzen muss. */
function blattArt(items = []) {
  const modi = new Set(items.map(i => i.mode));
  if (!items.length) return 'notes';
  if (modi.has('sets')) return 'strength';
  if (modi.size === 1 && modi.has('video')) return 'links';
  if (modi.size === 1 && modi.has('block')) return 'endurance';
  if (modi.size === 1 && modi.has('note')) return 'notes';
  return 'circuit';
}

/* ── Eine Woche kopieren ───────────────────────────────────────────
   Der häufigste Wunsch überhaupt: "wie letzte Woche". Kopiert werden
   die Einheiten mit ihren Übungen — nicht das Protokoll. Was man
   getan hat, gehört dem Tag, an dem man es getan hat. */
export function wocheKopieren(plan, { nachMontag }) {
  if (!ISO_TAG.test(nachMontag)) throw new Error('plan: Zielwoche braucht ein Datum');
  const start = montagVon(nachMontag);
  const neu = leererPlan({ titel: plan?.name, montag: start });
  const versatz = new Map((plan?.days || []).map((d, i) => [d.date, i]));

  for (const tag of plan?.days || []) {
    const i = versatz.get(tag.date);
    if (i === undefined || i > 6) continue;
    const zielTag = neu.days[i];
    for (const slot of tag.slots || []) {
      const ziel = zielTag.slots.find(s => s.key === slot.key) || zielTag.slots[0];
      for (const eintrag of slot.items || []) {
        const blatt = plan.units?.[eintrag.unit];
        const unitId = neueKennung('u');
        ziel.items.push({ ...eintrag, unit: unitId });
        neu.units[unitId] = blatt
          ? {
            ...JSON.parse(JSON.stringify(blatt)),
            id: unitId,
            items: (blatt.items || []).map(x => ({ ...x, key: `${unitId}-${x.slug}` })),
          }
          : { id: unitId, title: eintrag.title, kind: 'notes', items: [] };
      }
    }
  }
  return neu;
}

/* ── Vorlagen ──────────────────────────────────────────────────────
   Eine Einheit, die man wieder braucht. Gespeichert wird das BLATT
   allein — ohne Tag, ohne Zeit: eine Vorlage hat kein Datum. */
export function alsVorlage(plan, unitId) {
  const blatt = plan?.units?.[unitId];
  if (!blatt) throw new Error('plan: diese Einheit gibt es nicht');
  return {
    titel: text(blatt.title, TITEL_MAX),
    kind: blatt.kind || 'strength',
    items: JSON.parse(JSON.stringify(blatt.items || [])),
  };
}

export function ausVorlage(plan, vorlage, { datum, slot = 'vormittag', zeit = '' }) {
  const { plan: mitEinheit, unitId } = einheitAnlegen(plan, { datum, slot, titel: vorlage?.titel, zeit });
  const p = kopie(mitEinheit);
  p.units[unitId].kind = vorlage?.kind || 'strength';
  p.units[unitId].items = (vorlage?.items || []).map(i => ({
    ...JSON.parse(JSON.stringify(i)),
    key: `${unitId}-${i.slug}`,
  }));
  return { plan: p, unitId };
}

/* ── Prüfen und speichern ──────────────────────────────────────────*/

/** Was der Plan dem Speicher anbietet — und was nicht hineindarf. */
export function planSauber(plan) {
  const p = kopie(plan);
  p.schema = SCHEMA;
  p.eigen = true;
  p.name = text(p.name, TITEL_MAX) || 'Meine Woche';
  p.days = (p.days || []).filter(d => ISO_TAG.test(d.date)).slice(0, 7);
  const bekannt = new Set();
  for (const tag of p.days) {
    tag.slots = (tag.slots || []).filter(s => slotGueltig(s.key));
    for (const slot of tag.slots) {
      slot.items = (slot.items || []).filter(i => i.unit && p.units?.[i.unit]);
      for (const i of slot.items) bekannt.add(i.unit);
    }
  }
  /* Ein Blatt ohne Eintrag wäre eine Einheit, die an keinem Tag
     stattfindet — der Player fände sie, die Woche nie. */
  for (const id of Object.keys(p.units || {})) if (!bekannt.has(id)) delete p.units[id];
  return p;
}

export function planText(plan) {
  const s = JSON.stringify(planSauber(plan));
  if (s.length > PLAN_MAX) throw new Error('plan: zu gross');
  return s;
}

export function planLesen(json) {
  try {
    const p = JSON.parse(json);
    return p && Array.isArray(p.days) ? p : null;
  } catch { return null; }
}

/** Ist das ein selbst gebauter Plan? */
export const istEigenerPlan = plan => plan?.eigen === true;

function kopie(plan) {
  return JSON.parse(JSON.stringify(plan || leererPlan()));
}
