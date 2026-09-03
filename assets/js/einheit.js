/* ══════════════════════════════════════════════════════════════════
   Der Einheiten-Player — die Logik.

   Eine Übung nach der anderen, Sätze beim Machen erfasst. Das ist der
   Unterschied zu einer Liste: im Kraftraum hält man ein Telefon in der
   einen Hand und eine Hantel in der anderen. Was zählt, ist "was ist
   jetzt dran" und "was habe ich gerade geschafft" — nicht ein
   Wochenplan zum Überfliegen.

   ── Woher die Übungen kommen ──────────────────────────────────────
   Aus dem geparsten Programm, unverändert:

       programm.units[unitId].items[] = { key, name, alt, sets, ... }

   Das ist dasselbe Format, das training-parser.js aus der Excel-Datei
   erzeugt und das groups.js als Zeichenkette in einem Plan ablegt. Der
   Player liest, er interpretiert nicht neu.

   ── Wohin das Protokoll geht ──────────────────────────────────────
   In derselben Form wie users/{uid}/trainingLogs:

       { units: { unitId: { items: { key: { done, note, sets:[…] } } } } }

   Beibehalten, obwohl das Protokoll jetzt an der Gruppe hängt: die
   Form ist erprobt, und ein zweites Format hiesse zwei Parser.

   ── Reines Modul ──────────────────────────────────────────────────
   Kein Firebase, kein DOM. Alles hier ist eine Funktion von Daten auf
   Daten, damit die Fälle testbar sind, die im Kraftraum weh tun: eine
   Einheit, die es nicht gibt; ein Satz, den niemand ausgefüllt hat;
   ein Protokoll, das aus einer älteren Fassung stammt.
   ══════════════════════════════════════════════════════════════════ */

/* ── Lesen ─────────────────────────────────────────────────────────*/

/** Die Einheiten eines Programms, für die Auswahl vor dem Start. */
export function einheiten(programm) {
  const units = programm?.units;
  if (!units || typeof units !== 'object') return [];
  return Object.values(units)
    .filter(u => u?.id)
    .map(u => ({
      id: u.id,
      titel: u.title || u.id,
      kind: u.kind || 'notes',
      anzahl: Array.isArray(u.items) ? u.items.length : 0,
    }))
    /* Einheiten ohne Übungen sind Notizblätter. Sie gehören in die
       Liste — ein Trainer legt dort Erklärungen ab —, aber hinter die
       Einheiten, mit denen man wirklich trainiert. */
    .sort((a, b) => (b.anzahl > 0) - (a.anzahl > 0)
      || String(a.titel).localeCompare(String(b.titel), 'de'));
}

/** Die Übungen einer Einheit. Leer, wenn die Einheit fehlt. */
export function uebungen(programm, unitId) {
  const items = programm?.units?.[unitId]?.items;
  return Array.isArray(items) ? items.filter(i => i?.key) : [];
}

export function einheitTitel(programm, unitId) {
  const u = programm?.units?.[unitId];
  return u?.title || u?.id || '';
}

/* ── Protokoll ─────────────────────────────────────────────────────*/

const LEER = Object.freeze({ done: false, note: '', sets: [] });

/**
 * Der Eintrag zu einer Übung — immer vollständig, auch wenn im
 * Protokoll nichts steht. Die Oberfläche soll nicht an jeder Stelle
 * prüfen müssen, ob ein Zwischenobjekt existiert.
 */
export function eintrag(protokoll, unitId, itemKey) {
  const roh = protokoll?.units?.[unitId]?.items?.[itemKey];
  if (!roh || typeof roh !== 'object') return { ...LEER };
  return {
    done: roh.done === true,
    note: String(roh.note ?? ''),
    sets: Array.isArray(roh.sets)
      ? roh.sets.map(s => ({
          weight: String(s?.weight ?? ''),
          reps: String(s?.reps ?? ''),
        }))
      : [],
  };
}

/**
 * Ein geänderter Eintrag, als NEUES Protokoll.
 *
 * Unveränderlich, weil der Player bei jedem Tastendruck speichert:
 * würde am Objekt selbst geschraubt, könnte ein noch laufender
 * Speichervorgang einen halb geänderten Zustand hochschicken.
 */
export function mitEintrag(protokoll, unitId, itemKey, patch) {
  const alt = eintrag(protokoll, unitId, itemKey);
  const neu = {
    done: patch.done === undefined ? alt.done : patch.done === true,
    note: patch.note === undefined ? alt.note : String(patch.note ?? ''),
    sets: patch.sets === undefined ? alt.sets : patch.sets.map(s => ({
      weight: String(s?.weight ?? ''),
      reps: String(s?.reps ?? ''),
    })),
  };

  const units = { ...(protokoll?.units || {}) };
  const einheit = { ...(units[unitId] || {}) };
  einheit.items = { ...(einheit.items || {}), [itemKey]: neu };
  units[unitId] = einheit;
  return { ...(protokoll || {}), units };
}

/** Hat jemand in dieser Übung überhaupt etwas eingetragen? */
export function hatInhalt(e) {
  return e.done
    || !!e.note
    || e.sets.some(s => s.weight !== '' || s.reps !== '');
}

/**
 * Was gespeichert werden darf: leere Einträge fliegen heraus.
 *
 * Sie entstehen beim Zeichnen — die Oberfläche legt für jeden Satz ein
 * Feld an —, und ohne dieses Sieb wüchse das Protokoll mit jeder
 * geöffneten Einheit, auch wenn niemand etwas gemacht hat. Dieselbe
 * Überlegung wie in cleanDay() in training-sync.js.
 */
export function sauber(protokoll) {
  const raus = {};
  for (const [unitId, einheit] of Object.entries(protokoll?.units || {})) {
    const items = {};
    for (const [key, roh] of Object.entries(einheit?.items || {})) {
      const e = eintrag({ units: { [unitId]: { items: { [key]: roh } } } }, unitId, key);
      if (!hatInhalt(e)) continue;
      items[key] = {
        done: e.done,
        note: e.note.slice(0, 200),
        /* Zwölf Sätze sind mehr, als je jemand macht; die Grenze steht
           genauso in den Regeln. */
        sets: e.sets.slice(0, 12).map(s => ({
          weight: s.weight.slice(0, 20),
          reps: s.reps.slice(0, 20),
        })),
      };
    }
    if (Object.keys(items).length) raus[unitId] = { items };
  }
  return raus;
}

/* ── Fortschritt ───────────────────────────────────────────────────*/

export function fortschritt(items, protokoll, unitId) {
  const gesamt = items.length;
  const erledigt = items.filter(i => eintrag(protokoll, unitId, i.key).done).length;
  return {
    erledigt,
    gesamt,
    /* Ohne Übungen ist nichts offen — 0/0 ist fertig, nicht null
       Prozent. Sonst zeigte ein Notizblatt für immer "nicht erledigt". */
    fertig: gesamt === 0 || erledigt === gesamt,
    anteil: gesamt ? Math.round((erledigt / gesamt) * 100) : 100,
  };
}

/**
 * Die nächste Übung, die noch offen ist — ab einer Position, dann von
 * vorn. So landet man beim Wiederaufnehmen dort, wo man aufgehört hat,
 * und nicht wieder bei Übung eins.
 *
 * @returns {number} Index, oder -1 wenn alles erledigt ist
 */
export function naechsteOffene(items, protokoll, unitId, ab = 0) {
  const offen = i => !eintrag(protokoll, unitId, items[i].key).done;
  for (let i = Math.max(0, ab); i < items.length; i += 1) if (offen(i)) return i;
  for (let i = 0; i < Math.min(ab, items.length); i += 1) if (offen(i)) return i;
  return -1;
}

/**
 * Die Sätze einer Übung, mit dem Protokoll darübergelegt.
 *
 * Der Plan sagt, wie viele Sätze mit welchen Wiederholungen vorgesehen
 * sind; das Protokoll sagt, was tatsächlich war. Beides gehört in
 * dieselbe Zeile, sonst muss man im Kopf abgleichen.
 */
export function saetze(item, e) {
  const geplant = Array.isArray(item?.sets) ? item.sets : [];
  const anzahl = Math.max(geplant.length, e.sets.length);

  return Array.from({ length: anzahl }, (_, i) => ({
    label: geplant[i]?.label || `${i + 1}. Satz`,
    zielReps: String(geplant[i]?.reps ?? ''),
    /* Der Plan kann einen Vorgabewert mitbringen (das Gewicht der
       letzten Woche). Er wird angezeigt, aber nicht als Eingabe
       ausgegeben — sonst stünde eine fremde Zahl da, als hätte man sie
       selbst gemacht. */
    zielWert: String(geplant[i]?.weight ?? ''),
    weight: e.sets[i]?.weight ?? '',
    reps: e.sets[i]?.reps ?? '',
  }));
}
