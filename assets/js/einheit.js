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

/* Ein Satz im Protokoll. Bis v.35.63.0 war ein Satz "gemacht", sobald
   irgendein Wert darin stand — wer ein Gewicht korrigierte, hakte den
   Satz damit auch ab (Michel: "Bearbeiten darf den Satz nicht zusätzlich
   abhaken"). Seit v.35.64.0 trägt er seinen Haken selbst (ok); alte
   Protokolle ohne ok zählen wie früher. Dauer, Strecke und
   Körpergewicht nur, wo jemand sie einträgt. */
function satzAus(s) {
  const raus = { weight: String(s?.weight ?? ''), reps: String(s?.reps ?? '') };
  if (typeof s?.ok === 'boolean') raus.ok = s.ok;
  for (const feld of ['dauer', 'strecke']) {
    if (s?.[feld] !== undefined && String(s[feld]) !== '') raus[feld] = String(s[feld]);
  }
  if (s?.koerper === true) raus.koerper = true;
  return raus;
}

/** Ist dieser Satz abgehakt? */
export function satzOk(s) {
  if (typeof s?.ok === 'boolean') return s.ok;
  return Boolean(String(s?.weight ?? '').trim() || String(s?.reps ?? '').trim());
}

/**
 * Der Eintrag zu einer Übung — immer vollständig, auch wenn im
 * Protokoll nichts steht. Die Oberfläche soll nicht an jeder Stelle
 * prüfen müssen, ob ein Zwischenobjekt existiert.
 *
 * stand (ms) sagt, wann das Gerät ihn zuletzt geändert hat — damit
 * gewinnt zwischen zwei Geräten der neuere (v.35.64.0).
 */
export function eintrag(protokoll, unitId, itemKey) {
  const roh = protokoll?.units?.[unitId]?.items?.[itemKey];
  if (!roh || typeof roh !== 'object') return { done: false, note: '', sets: [] };
  const e = {
    done: roh.done === true,
    note: String(roh.note ?? ''),
    sets: Array.isArray(roh.sets) ? roh.sets.map(satzAus) : [],
  };
  const stand = Number(roh.stand);
  if (stand > 0) e.stand = stand;
  return e;
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
    sets: patch.sets === undefined ? alt.sets : patch.sets.map(satzAus),
  };
  const stand = patch.stand ?? alt.stand;
  if (stand) neu.stand = stand;

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
    || e.sets.some(s => s.weight !== '' || s.reps !== '' || s.ok === true || !!s.dauer || !!s.strecke);
}

/**
 * Ein Eintrag, wie er gespeichert wird — mit den Grenzen der Regeln.
 * Ein leerer bleibt als { stand } stehen: so weiss ein anderes Gerät,
 * das offline war, dass hier jemand NACH ihm geleert hat, und schreibt
 * seinen älteren Stand nicht darüber (aenderungenPruefen).
 */
export function eintragSauber(e) {
  if (!hatInhalt(e)) return e.stand ? { stand: e.stand } : null;
  const raus = {
    done: e.done,
    note: e.note.slice(0, 200),
    /* Zwölf Sätze sind mehr, als je jemand macht; die Grenze steht
       genauso in den Regeln. */
    sets: e.sets.slice(0, 12).map(s => {
      const x = { weight: s.weight.slice(0, 20), reps: s.reps.slice(0, 20) };
      if (typeof s.ok === 'boolean') x.ok = s.ok;
      if (s.dauer) x.dauer = s.dauer.slice(0, 20);
      if (s.strecke) x.strecke = s.strecke.slice(0, 20);
      if (s.koerper) x.koerper = true;
      return x;
    }),
  };
  if (e.stand) raus.stand = e.stand;
  return raus;
}

/**
 * Was gespeichert werden darf: leere Einträge fliegen heraus.
 *
 * Sie entstehen beim Zeichnen — die Oberfläche legt für jeden Satz ein
 * Feld an —, und ohne dieses Sieb wüchse das Protokoll mit jeder
 * geöffneten Einheit, auch wenn niemand etwas gemacht hat. Dieselbe
 * Überlegung wie früher in cleanDay() der persönlichen Trainingsseite.
 */
export function sauber(protokoll) {
  const raus = {};
  for (const [unitId, einheit] of Object.entries(protokoll?.units || {})) {
    const items = {};
    for (const [key, roh] of Object.entries(einheit?.items || {})) {
      const e = eintrag({ units: { [unitId]: { items: { [key]: roh } } } }, unitId, key);
      if (!hatInhalt(e)) continue;
      items[key] = eintragSauber(e);
    }
    if (Object.keys(items).length) raus[unitId] = { items };
  }
  return raus;
}

/* ── Zwischen Geräten (v.35.64.0) ──────────────────────────────────
   Michel: am Handy trainiert, am PC stand nichts davon, Notizen waren
   weg. Im Code belegt sind zwei Ursachen:
   - Das Protokoll wurde als GANZES Dokument geschrieben (set ohne
     merge). Wer die Einheit auf einem zweiten Gerät offen hatte oder
     sie mit einem alten Stand öffnete und dann etwas antippte, schrieb
     diesen alten Stand über alles, was das andere Gerät inzwischen
     eingetragen hatte — Sätze und Notizen.
   - Gespeichert wurde 900 ms nach der letzten Eingabe. Wer innerhalb
     dieser Zeit die Seite verliess ("Zurück", App wechseln), dessen
     letzte Eingabe — oft die Notiz — ging nie hinaus.
   Jetzt wird je Übung geschrieben, jede mit ihrem Stand; der Server
   entscheidet in einer Transaktion, und der neuere gewinnt. Was noch
   nicht hinaus ist, liegt zusätzlich im Gerät (protokoll-sicherung.js). */

export const eintragSchluessel = (unitId, key) => `${unitId}${key}`;

/**
 * Das Protokoll vom Server über das eigene legen: je Übung gilt der
 * Server — ausser wo hier etwas geändert und noch nicht geschrieben ist.
 * @param offen  Set/Map der eintragSchluessel mit eigenen Änderungen
 */
export function abgleichen(lokal, fern, offen = new Set()) {
  const units = {};
  const namen = new Set([...Object.keys(lokal?.units || {}), ...Object.keys(fern?.units || {})]);
  for (const u of namen) {
    const li = lokal?.units?.[u]?.items || {};
    const fi = fern?.units?.[u]?.items || {};
    const items = {};
    for (const k of new Set([...Object.keys(li), ...Object.keys(fi)])) {
      const w = offen.has(eintragSchluessel(u, k)) ? li[k] : fi[k];
      if (w !== undefined) items[k] = w;
    }
    units[u] = { ...(lokal?.units?.[u] || {}), ...(fern?.units?.[u] || {}), items };
  }
  return { ...(lokal || {}), ...(fern || {}), units };
}

/**
 * Was ein Gerät schreiben darf, gegen den Stand des Servers: eine
 * Übung, die dort NEUER ist, bleibt, wie sie ist — ein Gerät, das
 * offline war, überschreibt nicht, was ein anderes seither eingetragen
 * hat.
 * @param server       das Protokoll auf dem Server, oder null
 * @param aenderungen  [{ unitId, key, eintrag, stand }] — eintrag aus eintragSauber
 * @returns {{ units, geschrieben: string[], verworfen: string[] }}
 */
export function aenderungenPruefen(server, aenderungen = []) {
  const units = {};
  const geschrieben = [];
  const verworfen = [];
  for (const a of aenderungen) {
    const s = eintragSchluessel(a.unitId, a.key);
    const dort = Number(server?.units?.[a.unitId]?.items?.[a.key]?.stand) || 0;
    if (dort > (Number(a.stand) || 0)) { verworfen.push(s); continue; }
    (units[a.unitId] ||= { items: {} }).items[a.key] = a.eintrag || { stand: a.stand };
    geschrieben.push(s);
  }
  return { units, geschrieben, verworfen };
}

/**
 * Wie weit eine Einheit ist — für die Leitung (v.35.64.0).
 * 'offen' heisst: im Protokoll steht nichts. Ob das Protokoll überhaupt
 * geladen werden konnte, weiss der Aufrufer; ohne es ist der Status
 * unbekannt, nicht "offen".
 */
export function einheitStatus(items, protokoll, unitId) {
  const f = fortschritt(items, protokoll, unitId);
  const s = satzFortschritt(items, protokoll, unitId);
  if (items.length && f.fertig) return 'fertig';
  const begonnen = items.some(i => hatInhalt(eintrag(protokoll, unitId, i.key)));
  return begonnen || s.ok ? 'begonnen' : 'offen';
}

/**
 * Die Sätze einer Einheit: wie viele abgehakt sind, von wie vielen
 * geplanten (oder eingetragenen, wo es mehr sind).
 */
export function satzFortschritt(items, protokoll, unitId) {
  let ok = 0;
  let gesamt = 0;
  for (const item of items) {
    const e = eintrag(protokoll, unitId, item.key);
    const geplant = Array.isArray(item?.sets) ? item.sets.length : 0;
    gesamt += Math.max(geplant, e.sets.length);
    ok += e.sets.filter(satzOk).length;
  }
  return { ok, gesamt };
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
/* "??" in der Gewichtsspalte heisst in der Kadervorlage: das Gewicht
   bestimmt der Athlet (KW 36). Es ist kein Wert — bis v.35.50.0 hätte
   ein Tipp auf den Satz "??" als Gewicht gespeichert. */
export const gewichtOffen = w => /^\?+$/.test(String(w ?? '').trim());
const wertSauber = w => (gewichtOffen(w) ? '' : String(w ?? '').trim());

/**
 * Die Sätze einer Übung: Vorgabe und Eingetragenes nebeneinander.
 * @param zuletzt  die Gewichte vom letzten Mal (letzteGewichte) — der
 *                 Vorschlag, wo der Plan keines nennt
 */
export function saetze(item, e, zuletzt = []) {
  const geplant = Array.isArray(item?.sets) ? item.sets : [];
  const anzahl = Math.max(geplant.length, e.sets.length);

  let davor = '';   // das Gewicht, das in einem Satz davor schon steht
  return Array.from({ length: anzahl }, (_, i) => {
    /* Der Plan kann einen Vorgabewert mitbringen (das Gewicht der
       letzten Woche). Er wird angezeigt, aber nicht als Eingabe
       ausgegeben — sonst stünde eine fremde Zahl da, als hätte man sie
       selbst gemacht. */
    const zielWert = wertSauber(geplant[i]?.weight);
    const frage = gewichtOffen(geplant[i]?.weight);
    /* Ohne Plan-Gewicht: was man im Satz davor genommen hat, sonst das
       vom letzten Mal. Wer 12 kg eingetragen hat, bestätigt im zweiten
       Satz mit einem Tipp dieselben 12 kg. */
    const ausDavor = davor;
    const letztes = ausDavor || String(zuletzt[i] ?? zuletzt[zuletzt.length - 1] ?? '').trim();
    const eigen = wertSauber(e.sets[i]?.weight);
    if (eigen) davor = eigen;
    return {
      label: geplant[i]?.label || `${i + 1}. Satz`,
      zielReps: String(geplant[i]?.reps ?? ''),
      zielWert,
      /* Das Gewicht bestimmt der Athlet: der Plan sagt "??". */
      gewichtFrage: frage,
      /* Was ein Tipp bestätigt: die Vorgabe des Plans, sonst das Gewicht
         aus dem Satz davor oder vom letzten Mal. Ohne alles öffnet der
         Tipp die Felder. */
      vorschlag: zielWert || letztes,
      vorschlagDavor: !zielWert && !!ausDavor,
      vorschlagZuletzt: !zielWert && !ausDavor && !!letztes,
      weight: e.sets[i]?.weight ?? '',
      reps: e.sets[i]?.reps ?? '',
      /* Abgehakt ist er, wenn er es sagt (v.35.64.0) — nicht, weil ein
         Wert darin steht. */
      ok: e.sets[i] ? satzOk(e.sets[i]) : false,
      dauer: e.sets[i]?.dauer ?? '',
      strecke: e.sets[i]?.strecke ?? '',
      koerper: e.sets[i]?.koerper === true,
    };
  });
}

/**
 * Die Gewichte, mit denen jemand diese Übung zuletzt gemacht hat — aus
 * seinen Protokollen VOR dem Tag. Die Übung wird am Namen erkannt
 * (item.slug): die Nummer davor wechselt von Woche zu Woche
 * ("kraft-beine-3a-kniebeuge-hinten" → "…-3-kniebeuge-vorne").
 * @returns {string[]}  je Satz das Gewicht, [] wenn es keins gibt
 */
export function letzteGewichte(protokolle, item, datum) {
  const slug = String(item?.slug || '').trim();
  const passt = key => key === item?.key || (slug && String(key).endsWith(`-${slug}`));
  const frueher = (protokolle || [])
    .filter(p => p?.datum && p.datum < datum && p.units)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  for (const p of frueher) {
    for (const unit of Object.values(p.units)) {
      for (const [key, roh] of Object.entries(unit?.items || {})) {
        if (!passt(key)) continue;
        const gewichte = (roh?.sets || []).map(s => wertSauber(s?.weight));
        if (gewichte.some(Boolean)) return gewichte;
      }
    }
  }
  return [];
}

/* ── Zeit ──────────────────────────────────────────────────────────
   Pausen ("120-180 Sec") und Übungen, die ganz auf Zeit laufen
   ("30 Sec pro Seite", 2 Sätze) — daraus wird ein Timer im Player. */

/** Sekunden aus "30 sec", "60 Sec", "2 min", "1:30", "120-180 Sec"
 *  (die untere Grenze), "30 pro Seite" (ohne Einheit: Sekunden). */
export function sekundenAus(text) {
  const s = String(text ?? '').toLowerCase().replace(',', '.');
  const uhr = s.match(/(\d{1,2}):(\d{2})/);
  if (uhr) return Number(uhr[1]) * 60 + Number(uhr[2]);
  const zahl = s.match(/(\d+(?:\.\d+)?)/);
  if (!zahl) return 0;
  const n = Number(zahl[1]);
  if (/min/.test(s)) return Math.round(n * 60);
  if (/(sek|sec|s\b|")/.test(s) || n <= 300) return Math.round(n);
  return 0;
}

/** Die Pause nach einem Satz, in Sekunden — 0, wenn der Plan keine nennt. */
export function pauseSekunden(item) {
  return sekundenAus(item?.pause);
}

/**
 * Die Pause als Bereich (v.35.64.0): "180-240 Sec" → { von: 180, bis: 240 },
 * "2-3 min" → { von: 120, bis: 180 }, "90 Sec" → { von: 90, bis: 90 }.
 * Bis dahin lief stillschweigend die untere Grenze — wer 4 Minuten
 * Pause wollte, sah nirgends, dass es sie gab. Jetzt steht beides zur
 * Wahl, die untere ist vorgewählt. null ohne Pause.
 */
export function pauseBereich(item) {
  const text = String(item?.pause ?? '').toLowerCase().replace(',', '.');
  const von = sekundenAus(text);
  if (!von) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|bis)\s*(\d+(?:\.\d+)?)/);
  const bis = m ? Math.round(Number(m[2]) * (/min/.test(text) ? 60 : 1)) : von;
  return { von, bis: Math.max(von, bis) };
}

/** Eine Übung auf Zeit: { sekunden, runden, proSeite } oder null.
 *  "30 Sec pro Seite" und 2 Sätze sind vier Runden — je Seite zwei. */
export function zeitVorgabe(item) {
  const k = kennzahlen(item);
  const zeit = k.find(p => /^(zeit|dauer|time)$/i.test(p.label));
  if (!zeit) return null;
  const sekunden = sekundenAus(zeit.wert);
  if (!sekunden) return null;
  const saetzeZahl = Number(String(k.find(p => /^(sätze|saetze|serien|sets)$/i.test(p.label))?.wert || '1').match(/\d+/)?.[0] || 1);
  const proSeite = /seite/i.test(zeit.wert);
  return { sekunden, runden: Math.max(1, saetzeZahl) * (proSeite ? 2 : 1), proSeite };
}

/* ── Für die Leitung ───────────────────────────────────────────────
   "Mit wie viel Gewicht wird wirklich trainiert?" (Michel) — je Übung
   die letzten Tage, aus den Protokollen eines Athleten und den Plänen,
   die ihre Namen kennen. */
export function gewichtsVerlauf(plaene, protokolle, { tage = 5 } = {}) {
  const namen = new Map();
  for (const plan of plaene || []) {
    let programm = plan?.programm;
    if (!programm && typeof plan?.json === 'string') { try { programm = JSON.parse(plan.json); } catch { programm = null; } }
    for (const unit of Object.values(programm?.units || {})) {
      for (const item of unit?.items || []) {
        if (item?.key) namen.set(item.key, { name: item.name || item.key, slug: item.slug || item.key });
      }
    }
  }
  const je = new Map();
  for (const p of protokolle || []) {
    for (const unit of Object.values(p?.units || {})) {
      for (const [key, roh] of Object.entries(unit?.items || {})) {
        const sets = (roh?.sets || [])
          .map(s => ({ weight: wertSauber(s?.weight), reps: String(s?.reps ?? '').trim() }))
          .filter(s => s.weight || s.reps);
        if (!sets.length) continue;
        const bekannt = namen.get(key);
        const slug = bekannt?.slug || key.replace(/^.*?-\d+[a-z]?-/, '');
        if (!je.has(slug)) je.set(slug, { name: bekannt?.name || slug, tage: [] });
        je.get(slug).tage.push({ datum: p.datum, sets });
      }
    }
  }
  return [...je.values()]
    .map(u => ({ ...u, tage: u.tage.sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, tage) }))
    .sort((a, b) => (b.tage[0]?.datum || '').localeCompare(a.tage[0]?.datum || '') || a.name.localeCompare(b.name));
}

/* ══════════════════════════════════════════════════════════════════
   Was der Player bisher nicht angezeigt hat.

   Der Parser liest all das seit jeher aus der Excel — der Player las
   nur name, alt, params, lines, pause und tut. Video und Vorwochen
   lagen also im Dokument und kamen nie auf den Bildschirm.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Die Bilder zu einer Übung — Dateinamen aus assets/data/training/
 * images.json, nachgeschlagen nach Einheit und Übungsname.
 *
 * Die alte persönliche Trainingsseite zeigte sie (Fussgymnastik,
 * Neuroathletik: wie steht der Fuss, wo liegt der Ball). Als der
 * Bereich Training in v.35.26.0 auf die Gruppe umzog, kamen sie in den
 * Player, damit beim Umzug nichts verloren geht.
 *
 * Nur schlichte Dateinamen: der Name wandert in ein src, und ein Pfad
 * oder eine Adresse darin wäre ein Weg aus dem Bilderordner hinaus.
 */
const BILDNAME = /^[\w-]+(\.[\w-]+)*\.(webp|png|jpe?g|gif)$/i;

export function bilderFuer(bilder, unitId, item) {
  const liste = bilder?.[unitId]?.[item?.slug];
  return Array.isArray(liste) ? liste.filter(n => typeof n === 'string' && BILDNAME.test(n)) : [];
}

/**
 * Die Kennzahlen einer Übung als { label, wert } — für die Kurzinfo
 * unter dem Namen.
 *
 * Der Parser liefert params als Objekte { label, value }. Der Player
 * reihte sie bis v.35.25.0 direkt in einen Text ein, und bei 44 Übungen
 * der echten KW 31 stand dort "[object Object]". Dazu stand TUT doppelt
 * da: einmal aus item.tut, einmal als Kennzahl. Hier werden beide Formen
 * gelesen (auch ein blosser Text), leere Werte fallen weg, und TUT
 * erscheint nur einmal.
 */
export function kennzahlen(item) {
  const tut = String(item?.tut ?? '').trim();
  return (Array.isArray(item?.params) ? item.params : [])
    .map(p => (typeof p === 'string'
      ? { label: '', wert: p.trim() }
      : { label: String(p?.label ?? '').trim(), wert: String(p?.value ?? '').trim() }))
    /* "5_5" in der Vorlage heisst fünf je Seite. */
    .map(p => ({ ...p, wert: p.wert.replace(/^(\d+)_(\d+)$/, '$1/$2') }))
    .filter(p => p.wert)
    .filter(p => !(tut && p.label.toLowerCase() === 'tut' && p.wert === tut));
}

/**
 * Die Adresse des Übungsvideos, oder ''.
 *
 * In der Vorlage steht sie eine Zeile unter dem Übungsnamen. Geprüft
 * wird sie hier, weil sie in ein href wandert: alles ausser http und
 * https fällt weg — eine javascript:-Adresse aus einer fremden Excel
 * wäre sonst ein Weg in die Seite hinein.
 */
export function videoUrl(item) {
  const roh = String(item?.video ?? '').trim();
  if (!roh) return '';
  try {
    const u = new URL(roh);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch { return ''; }
}

/**
 * Die anderen Trainingswochen derselben Übung.
 *
 * Ein Plan läuft zwei Wochen — in der Vorlage stehen TW17 und TW18
 * untereinander in DERSELBEN Übung. Genau daraus liest man ab, ob es
 * besser geworden ist, und das ist der einzige Grund, warum die
 * zweite Zeile existiert.
 *
 * Leere Zeilen fallen heraus: eine Woche ohne einen einzigen Wert ist
 * keine Auskunft, sondern eine Zeile, die noch niemand ausgefüllt hat.
 */
export function vorwochen(item) {
  const roh = Array.isArray(item?.history) ? item.history : [];
  return roh
    .map(h => ({
      woche: String(h?.week ?? '').trim(),
      /* "??" ist keine Auskunft (die Vorlage lässt das Gewicht offen). */
      werte: (Array.isArray(h?.values) ? h.values : []).map(wertSauber),
      bemerkung: String(h?.note ?? '').trim(),
    }))
    .filter(h => h.werte.some(Boolean) || h.bemerkung);
}

/* Welche Modi der Parser vergibt: sets, rounds, timed, block, note,
   video. Nur bei 'sets' gibt es Sätze zum Eintragen — ein Mobi-Video
   oder eine Notiz mit Gewichtsfeldern darunter wäre Unsinn. */
const MIT_SAETZEN = new Set(['sets']);

/** Zeigt diese Übung Satz-Eingaben, oder ist sie nur zum Abhaken? */
export function zeigtSaetze(item) {
  const mode = String(item?.mode ?? '').trim();
  /* Ohne mode entscheidet der Inhalt: eine Übung mit geplanten Sätzen
     bekommt Felder, alles andere nicht. Alte Pläne aus der Zeit vor
     dem mode-Feld verhalten sich damit wie bisher. */
  if (!mode) return Array.isArray(item?.sets) && item.sets.length > 0;
  return MIT_SAETZEN.has(mode);
}
