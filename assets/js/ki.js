/* ══════════════════════════════════════════════════════════════════
   Der Assistent — was der Browser weiss, schickt und prüft (v.35.53.0).

   Rein, ohne Firebase und ohne DOM: die Pille (ki-pille.js) holt die
   Daten und zeichnet, hier wird entschieden, WAS mitgeht und OB ein
   Vorschlag des Assistenten eingetragen werden darf.

   Zwei Grundsätze, beide von Michel:
   - "nur auf die Daten des jeweiligen Kontos": der Kontext besteht aus
     dem, was diese Person ohnehin lesen darf — ihre Gruppen, deren
     Termine, ihre eigenen Termine und Erinnerungen. Keine Namen anderer
     Menschen, keine Kontakte, keine Nachrichten.
   - "eintragen, planen oder übertragen": der Assistent schlägt vor, die
     Person bestätigt, der Browser schreibt mit IHREN Rechten. Was hier
     nicht durch aktionPruefen() kommt, erscheint gar nicht erst als
     Vorschlag — ein Gruppentermin in einer Gruppe, die man nicht leitet,
     ein Datum im Jahr 1970, eine erfundene Termin-id.
   ══════════════════════════════════════════════════════════════════ */

import { ARTEN, istIsoTag, pruefe } from './termine.js';

export const STANDARD_NAME = 'Assistent';
export const NAME_MAX = 30;
export const ANWEISUNG_MAX = 600;
const TAGE_ZURUECK = 7;
const TAGE_VOR = 60;
const HOECHSTENS = { termine: 80, eigene: 40, erinnerungen: 30 };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusTage = (tag, n) => { const d = new Date(`${tag}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const hhmm = z => (/^\d{2}:\d{2}$/.test(String(z || '')) ? String(z) : '');
const kurz = (t, n) => String(t ?? '').trim().slice(0, n);

/** Der Name, den die Pille trägt: der der Gruppe, sonst "Assistent". */
export function assistentVon(gruppe, t = (k, f) => f) {
  const name = kurz(gruppe?.assistent?.name, NAME_MAX);
  return {
    name: name || t('ki.name', STANDARD_NAME),
    eigen: !!name,
    anweisung: kurz(gruppe?.assistent?.anweisung, ANWEISUNG_MAX),
    gruppe: gruppe?.name || '',
  };
}

/** Was die Leitung speichert — leer heisst: wieder der Standard. */
export function assistentSauber({ name, anweisung } = {}) {
  const n = kurz(name, NAME_MAX).replace(/\s+/g, ' ');
  const a = kurz(anweisung, ANWEISUNG_MAX);
  return n ? { name: n, ...(a ? { anweisung: a } : {}) } : null;
}

/**
 * Der Kontext für eine Frage — nur die eigenen Daten, nur ein Fenster um
 * heute (eine Woche zurück, zwei Monate vor), gekürzt auf das Nötige.
 */
export function kontextBauen({
  jetzt = new Date(), sprache = 'de-CH', seite = '', aktiveGid = '',
  gruppen = [], termine = [], eigene = [], erinnerungen = [],
  leitet = rolle => rolle === 'head' || rolle === 'staff',
} = {}) {
  const heute = iso(jetzt);
  const von = plusTage(heute, -TAGE_ZURUECK);
  const bis = plusTage(heute, TAGE_VOR);
  const imFenster = (a, e) => istIsoTag(a) && (e || a) >= von && a <= bis;
  const gruppenIds = new Set(gruppen.map(g => g.id));

  return {
    heute,
    wochentag: jetzt.toLocaleDateString(sprache, { weekday: 'long' }),
    zeit: `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`,
    seite,
    aktiveGruppe: gruppenIds.has(aktiveGid) ? aktiveGid : '',
    gruppen: gruppen.map(g => ({
      id: g.id, name: kurz(g.name, 80), art: g.art || '', leite: !!leitet(g.meineRolle),
    })),
    termine: termine
      .filter(e => gruppenIds.has(e.gid) && imFenster(e.von, e.bis) && !e.abgesagt)
      .sort((a, b) => `${a.von}${a.zeit || ''}`.localeCompare(`${b.von}${b.zeit || ''}`))
      .slice(0, HOECHSTENS.termine)
      .map(e => ({
        id: `g:${e.gid}:${e.id}`, gruppe: e.gid, art: e.art || '', titel: kurz(e.titel, 120),
        von: e.von, ...(e.bis && e.bis !== e.von ? { bis: e.bis } : {}),
        ...(hhmm(e.zeit) ? { zeit: e.zeit } : {}), ...(hhmm(e.bisZeit) ? { bisZeit: e.bisZeit } : {}),
        ...(e.ort ? { ort: kurz(e.ort, 80) } : {}),
      })),
    eigene: eigene
      .filter(e => imFenster(e.date, e.endDate))
      .sort((a, b) => `${a.date}${a.startTime || ''}`.localeCompare(`${b.date}${b.startTime || ''}`))
      .slice(0, HOECHSTENS.eigene)
      .map(e => ({
        id: `e:${e.id}`, titel: kurz(e.title, 120), von: e.date,
        ...(e.endDate && e.endDate !== e.date ? { bis: e.endDate } : {}),
        ...(hhmm(e.startTime) ? { zeit: e.startTime } : {}), ...(hhmm(e.endTime) ? { bisZeit: e.endTime } : {}),
        ...(e.location ? { ort: kurz(e.location, 80) } : {}),
      })),
    erinnerungen: erinnerungen
      .filter(r => !r.completed && istIsoTag(r.date) && r.date <= bis)
      .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))
      .slice(0, HOECHSTENS.erinnerungen)
      .map(r => ({ id: `r:${r.id}`, titel: kurz(r.title, 120), datum: r.date, ...(hhmm(r.time) ? { zeit: r.time } : {}) })),
  };
}

/* ── Vorschläge prüfen ─────────────────────────────────────────────── */

const nein = grund => ({ ok: false, grund });

/** Ein Datum, das in eine Planungs-App gehört: nicht vor gestern, nicht
    weiter als zwei Jahre voraus. */
function datumOk(tag, heute) {
  return istIsoTag(tag) && tag >= plusTage(heute, -1) && tag <= plusTage(heute, 730);
}

/**
 * Prüft einen Vorschlag des Assistenten gegen den Kontext.
 * Ergebnis: { ok:true, art, ziel, daten } oder { ok:false, grund }.
 *   art: 'erinnerung' | 'eigen' | 'gruppe' | 'verschieben'
 */
export function aktionPruefen({ name, args = {} } = {}, kontext = {}) {
  const heute = kontext.heute || iso(new Date());
  const a = args && typeof args === 'object' ? args : {};
  const titel = kurz(a.titel, 120);
  const zeit = hhmm(a.zeit);
  const bisZeit = hhmm(a.bisZeit);
  if (a.zeit && !zeit) return nein('Die Uhrzeit ist unlesbar.');

  if (name === 'erinnerung_eintragen') {
    if (!titel) return nein('Ohne Titel.');
    if (!datumOk(a.datum, heute)) return nein('Das Datum passt nicht.');
    return { ok: true, art: 'erinnerung', daten: { title: titel, date: a.datum, time: zeit, notes: kurz(a.notiz, 500) } };
  }

  if (name === 'eigenen_termin_eintragen') {
    if (!titel) return nein('Ohne Titel.');
    if (!datumOk(a.datum, heute)) return nein('Das Datum passt nicht.');
    const bis = istIsoTag(a.bis) && a.bis > a.datum ? a.bis : '';
    if (bisZeit && zeit && bisZeit <= zeit && !bis) return nein('Das Ende liegt vor dem Anfang.');
    return { ok: true, art: 'eigen', daten: {
      title: titel, date: a.datum, endDate: bis, startTime: zeit, endTime: bisZeit,
      location: kurz(a.ort, 120), notes: kurz(a.notiz, 1000),
    } };
  }

  if (name === 'gruppentermin_eintragen') {
    const gruppe = (kontext.gruppen || []).find(g => g.id === a.gruppe_id);
    if (!gruppe) return nein('Diese Gruppe gibt es hier nicht.');
    if (!gruppe.leite) return nein(`In «${gruppe.name}» trägt nur die Leitung ein.`);
    if (!datumOk(a.datum, heute)) return nein('Das Datum passt nicht.');
    const termin = {
      art: ARTEN.includes(a.art) ? a.art : 'training', titel, von: a.datum,
      bis: istIsoTag(a.bis) && a.bis > a.datum ? a.bis : '', zeit, bisZeit,
      ort: kurz(a.ort, 120), notiz: kurz(a.notiz, 1000),
    };
    const fehler = pruefe(termin);
    if (fehler.length) return nein(fehler[0]);
    return { ok: true, art: 'gruppe', ziel: { gid: gruppe.id, gruppe: gruppe.name }, daten: termin };
  }

  if (name === 'termin_verschieben') {
    const id = String(a.termin_id || '');
    if (!datumOk(a.datum, heute)) return nein('Das Datum passt nicht.');
    const bis = istIsoTag(a.bis) && a.bis > a.datum ? a.bis : '';
    const g = (kontext.termine || []).find(e => e.id === id);
    if (g) {
      const gruppe = (kontext.gruppen || []).find(x => x.id === g.gruppe);
      if (!gruppe?.leite) return nein(`In «${gruppe?.name || 'dieser Gruppe'}» verschiebt nur die Leitung.`);
      /* Ein mehrtägiger Termin behält seine Länge, wenn nur der Anfang
         genannt ist. */
      const laenge = g.bis ? Math.round((new Date(`${g.bis}T12:00`) - new Date(`${g.von}T12:00`)) / 86400000) : 0;
      const patch = { von: a.datum, bis: bis || (laenge ? plusTage(a.datum, laenge) : ''),
        ...(zeit ? { zeit } : {}), ...(bisZeit ? { bisZeit } : {}) };
      return { ok: true, art: 'verschieben', ziel: { quelle: 'gruppe', gid: g.gruppe, eid: id.split(':')[2],
        titel: g.titel, vorher: g }, daten: patch };
    }
    const e = (kontext.eigene || []).find(x => x.id === id);
    if (e) {
      const laenge = e.bis ? Math.round((new Date(`${e.bis}T12:00`) - new Date(`${e.von}T12:00`)) / 86400000) : 0;
      return { ok: true, art: 'verschieben', ziel: { quelle: 'eigen', id: id.slice(2), titel: e.titel, vorher: e },
        daten: { date: a.datum, endDate: bis || (laenge ? plusTage(a.datum, laenge) : ''),
          ...(zeit ? { startTime: zeit } : {}), ...(bisZeit ? { endTime: bisZeit } : {}) } };
    }
    const r = (kontext.erinnerungen || []).find(x => x.id === id);
    if (r) {
      return { ok: true, art: 'verschieben', ziel: { quelle: 'erinnerung', id: id.slice(2), titel: r.titel, vorher: r },
        daten: { date: a.datum, ...(zeit ? { time: zeit } : {}) } };
    }
    return nein('Diesen Termin finde ich nicht.');
  }

  return nein('Das kann der Assistent nicht.');
}

/** Eine Zeile für die Karte: was eingetragen würde. */
export function aktionZeile(pruefung, { sprache = 'de-CH', t = (k, f, v) => fuellen(f, v) } = {}) {
  const tag = d => (istIsoTag(d)
    ? new Date(`${d}T12:00:00`).toLocaleDateString(sprache, { weekday: 'short', day: 'numeric', month: 'short' })
    : '');
  const wann = (von, bis, zeit, bisZeit) => [tag(von), bis ? `– ${tag(bis)}` : '',
    zeit ? `${zeit}${bisZeit ? `–${bisZeit}` : ''}` : ''].filter(Boolean).join(' ');
  const d = pruefung.daten || {};
  if (pruefung.art === 'erinnerung') {
    return { was: t('ki.a.erinnerung', 'Erinnerung'), titel: d.title, wann: wann(d.date, '', d.time) };
  }
  if (pruefung.art === 'eigen') {
    return { was: t('ki.a.eigen', 'Eigener Termin'), titel: d.title,
      wann: wann(d.date, d.endDate, d.startTime, d.endTime), ort: d.location };
  }
  if (pruefung.art === 'gruppe') {
    return { was: t('ki.a.gruppe', 'Termin in {gruppe}', { gruppe: pruefung.ziel.gruppe }), titel: d.titel,
      wann: wann(d.von, d.bis, d.zeit, d.bisZeit), ort: d.ort };
  }
  const z = pruefung.ziel || {};
  const neu = z.quelle === 'gruppe' ? wann(d.von, d.bis, d.zeit, d.bisZeit)
    : z.quelle === 'eigen' ? wann(d.date, d.endDate, d.startTime, d.endTime) : wann(d.date, '', d.time);
  return { was: t('ki.a.verschieben', 'Verschieben'), titel: z.titel, wann: neu };
}

const fuellen = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (ganz, n) => (vars[n] ?? ganz));

/* ── Das Gespräch ──────────────────────────────────────────────────── */

export const VERLAUF_MAX = 8;

export function verlaufKuerzen(verlauf) {
  return (verlauf || []).filter(v => v.text).slice(-VERLAUF_MAX)
    .map(v => ({ rolle: v.rolle, text: String(v.text).slice(0, 1500) }));
}

/** Fragt den Worker. Wirft mit { code } bei einem Fehler, den die Pille kennt. */
export async function fragen({ basis, token, frage, hoch = false, verlauf = [], kontext, assistent, holen = fetch }) {
  let antwort;
  try {
    antwort = await holen(`${String(basis).replace(/\/+$/, '')}/ki`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ frage, hoch, verlauf: verlaufKuerzen(verlauf), kontext,
        assistent: { name: assistent?.eigen ? assistent.name : '', anweisung: assistent?.anweisung || '',
          gruppe: assistent?.gruppe || '' } }),
    });
  } catch {
    throw Object.assign(new Error('netz'), { code: 'netz' });
  }
  let daten = {};
  try { daten = await antwort.json(); } catch { /* bleibt leer */ }
  if (!antwort.ok) throw Object.assign(new Error(daten.fehler || 'fehler'), { code: daten.fehler || 'fehler', grund: daten.grund });
  return {
    text: String(daten.text || ''),
    aktionen: Array.isArray(daten.aktionen) ? daten.aktionen : [],
    stufe: daten.stufe === 'hoch' ? 'hoch' : 'normal',
    hochUebrig: Number.isFinite(daten.hochUebrig) ? daten.hochUebrig : null,
    hochAufgebraucht: !!daten.hochAufgebraucht,
  };
}

/** Was die Pille bei einem Fehler sagt — nie ein Code aus dem Hintergrund. */
export function fehlerText(code, grund, t = (k, f) => f) {
  if (code === 'kontingent') {
    return grund === 'alle'
      ? t('ki.f.alle', 'Der Assistent hat für heute genug gearbeitet. Morgen wieder.')
      : t('ki.f.person', 'Für heute sind deine Fragen aufgebraucht. Morgen wieder.');
  }
  if (code === 'anmeldung') return t('ki.f.anmeldung', 'Bitte melde dich neu an.');
  if (code === 'netz') return t('ki.f.netz', 'Keine Verbindung. Versuch es gleich noch einmal.');
  if (code === 'gemini-voll') return t('ki.f.voll', 'Gerade fragen zu viele. Versuch es in einer Minute noch einmal.');
  if (code === 'nicht-eingerichtet') return t('ki.f.aus', 'Der Assistent ist noch nicht eingerichtet.');
  return t('ki.f.allgemein', 'Das hat nicht geklappt. Versuch es noch einmal.');
}
