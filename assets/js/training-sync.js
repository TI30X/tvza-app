/* TVZA — Firestore-Sync für den Trainingsbereich

   Zwei Sorten Daten, zwei Ablagen unter dem eigenen Benutzer:

     users/{uid}/trainingPrograms/{id}   das eingelesene Wochenprogramm
     users/{uid}/trainingLogs/{datum}    ein Dokument je Tag

   Das Programm wird als JSON-Zeichenkette abgelegt, nicht als
   verschachtelte Struktur: Firestore kann keine Arrays in Arrays
   speichern, und genau das ist unit.raw.rows. Ein Tagesdokument statt
   eines Dokuments je Übung hält die Zahl der Schreibvorgänge klein —
   der Spark-Tarif zählt jeden einzeln.

   localStorage bleibt daneben bestehen: es zeichnet die Seite sofort,
   bevor Firestore antwortet, und trägt die Daten, falls der Sync
   scheitert.
*/

import { db, reportClientError } from './firebase-config.js';
import {
  collection, doc, onSnapshot, serverTimestamp, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const SYNC_SCHEMA = 1;
const MAX_PROGRAM_BYTES = 900000;   // Firestore-Dokumentgrenze ist 1 MiB
const SAVE_DELAY = 900;

const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

/* Aus dem Protokoll wird nur übernommen, was die Regeln zulassen:
   Wahrheitswerte, kurze Zeichenketten, Sätze als flache Liste. */
function cleanItem(value) {
  const source = value && typeof value === 'object' ? value : {};
  const sets = Array.isArray(source.sets) ? source.sets.slice(0, 12).map(set => ({
    weight: String(set?.weight ?? '').slice(0, 20),
    reps: String(set?.reps ?? '').slice(0, 20),
  })) : [];
  return {
    done: source.done === true,
    note: String(source.note ?? '').slice(0, 200),
    sets,
  };
}

export function cleanDay(units) {
  const out = {};
  Object.entries(units || {}).forEach(([unitId, entry]) => {
    const items = {};
    Object.entries(entry?.items || {}).forEach(([key, item]) => {
      const clean = cleanItem(item);
      /* Leere Einträge entstehen beim Zeichnen und gehören nicht in die
         Datenbank. */
      if (!clean.done && !clean.note && !clean.sets.some(s => s.weight || s.reps)) return;
      items[key] = clean;
    });
    if (Object.keys(items).length) out[unitId] = { items };
  });
  return out;
}

/**
 * @param {{user:object, onProgram:Function, onLogs:Function}} options
 *   onProgram(program|null) und onLogs(logsByDateAndUnit) werden bei jeder
 *   Änderung aufgerufen — auch von anderen Geräten.
 */
export function connectTraining({ user, onProgram, onLogs }) {
  const programs = collection(db, 'users', user.uid, 'trainingPrograms');
  const logs = collection(db, 'users', user.uid, 'trainingLogs');
  const pending = new Map();
  const timers = new Map();
  let stopped = false;

  const unsubProgram = onSnapshot(programs, snapshot => {
    /* Es liegt genau ein aktives Programm dort; bei mehreren gewinnt das
       zuletzt geschriebene. */
    let newest = null;
    snapshot.forEach(entry => {
      const data = entry.data();
      if (!data?.json) return;
      const stamp = data.updatedAt?.toMillis?.() || 0;
      if (!newest || stamp >= newest.stamp) newest = { stamp, json: data.json };
    });
    if (!newest) { onProgram(null); return; }
    try { onProgram(JSON.parse(newest.json)); }
    catch (error) { reportClientError('training-sync-program', error); onProgram(null); }
  }, error => reportClientError('training-sync-program-live', error));

  const unsubLogs = onSnapshot(logs, snapshot => {
    const byKey = {};
    snapshot.forEach(entry => {
      const date = entry.id;
      const units = entry.data()?.units || {};
      Object.entries(units).forEach(([unitId, value]) => {
        byKey[`${date}|${unitId}`] = { items: value?.items || {} };
      });
    });
    onLogs(byKey);
  }, error => reportClientError('training-sync-logs-live', error));

  async function writeDay(date) {
    const units = pending.get(date);
    pending.delete(date);
    timers.delete(date);
    if (!units || stopped) return;
    try {
      await setDoc(doc(logs, date), {
        schema: SYNC_SCHEMA,
        units: cleanDay(units),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      reportClientError('training-sync-day', error);
    }
  }

  return {
    /** Ein ganzer Tag auf einmal — gesammelt, damit Tippen nicht jeden
        Tastendruck in die Datenbank schreibt. */
    saveDay(date, units) {
      if (!isDate(date)) return;
      pending.set(date, units);
      if (timers.has(date)) clearTimeout(timers.get(date));
      timers.set(date, setTimeout(() => writeDay(date), SAVE_DELAY));
    },

    async saveProgram(program) {
      const json = JSON.stringify(program);
      if (json.length > MAX_PROGRAM_BYTES) {
        throw new Error('Das Programm ist zu gross für die Synchronisierung.');
      }
      await setDoc(doc(programs, String(program.id || 'aktuell')), {
        schema: SYNC_SCHEMA,
        id: String(program.id || 'aktuell'),
        json,
        updatedAt: serverTimestamp(),
      });
    },

    stop() {
      stopped = true;
      timers.forEach(id => clearTimeout(id));
      timers.clear();
      unsubProgram();
      unsubLogs();
    },
  };
}
