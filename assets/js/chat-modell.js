/* ══════════════════════════════════════════════════════════════════
   Der Chat (v.35.61.0) — rein, ohne Firebase und ohne DOM.

   Michel: "Im Chat sollte es die Möglichkeit für Gruppenchats geben und
   zusätzlich immer einen Chat für jede Gruppe … Tags wie beim Eintragen
   von Terminen beim KI-Assistenten — oder gleich von der KI beim
   Eintragen versendet, zum Informieren … man sollte bestimmte Chats
   stummschalten können."

   Drei Arten Unterhaltung, eine Liste:
     'dm'     zu zweit          dms/{a__b}                 (wie bisher)
     'runde'  ein Gruppenchat   dms/{zufall}, art 'runde', 3–30 Leute,
                                ein Titel; wer drin ist, steht fest
     'gruppe' der Chat einer    groups/{gid}/chat, lesen und schreiben
              Firn-Gruppe       alle in der Gruppe — es gibt ihn immer,
                                wer beitritt, ist drin
   Was man selbst dazu weiss — stumm, und bis wann eine Gruppe gelesen
   ist —, steht unter users/{uid}/chat/{schluessel}.

   Eine Nachricht kann eine Termin-Karte tragen (termin): dieselben
   Angaben, die der Assistent auf seinen Karten zeigt.
   ══════════════════════════════════════════════════════════════════ */

export const RUNDE_MIN = 3;
export const RUNDE_MAX = 30;
export const TITEL_MAX = 60;

/** Der Schlüssel unter users/{uid}/chat für eine Unterhaltung. */
export const standSchluessel = (art, id) => (art === 'gruppe' ? `g_${id}` : `d_${id}`);

export const rundeTitel = t => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, TITEL_MAX);

const kurz = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const istTag = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const istZeit = s => /^\d{2}:\d{2}$/.test(String(s || ''));

/**
 * Die Karte eines Termins für eine Nachricht — nur, was jede Person sehen
 * darf, die den Chat liest: keine Abfahrten, keine Zusagen, keine Notiz.
 * @param was 'neu' | 'geaendert' | '' (geteilt)
 */
export function terminKarte(termin, gruppe = {}, was = '') {
  if (!termin?.id || !istTag(termin.von)) return null;
  const k = {
    gid: String(gruppe.id || termin.gid || ''),
    eid: String(termin.id),
    titel: kurz(termin.titel, 120) || 'Termin',
    von: termin.von,
    art: ['training', 'lager', 'rennen'].includes(termin.art) ? termin.art : 'training',
    gruppe: kurz(gruppe.name || termin.gruppenName, 80),
  };
  if (istTag(termin.bis) && termin.bis > termin.von) k.bis = termin.bis;
  if (istZeit(termin.zeit)) k.zeit = termin.zeit;
  if (termin.ort) k.ort = kurz(termin.ort, 80);
  if (was === 'neu' || was === 'geaendert') k.was = was;
  return k.gid ? k : null;
}

/** Die Karte als eine Zeile — für die Vorschau in der Liste und als Text
    der Nachricht (wer eine alte App hat, liest wenigstens das). */
export function karteText(k, { datum = d => d, artWort = a => a } = {}) {
  if (!k) return '';
  const wann = [k.bis ? `${datum(k.von)} – ${datum(k.bis)}` : datum(k.von), k.zeit].filter(Boolean).join(' ');
  const vorne = k.was === 'neu' ? 'Neu: ' : k.was === 'geaendert' ? 'Geändert: ' : '';
  return `${vorne}${artWort(k.art)} «${k.titel}» · ${wann}${k.ort ? ` · ${k.ort}` : ''}`;
}

const ms = t => (t && typeof t.toMillis === 'function' ? t.toMillis()
  : t && Number.isFinite(t.seconds) ? t.seconds * 1000
  : t instanceof Date ? t.getTime() : Number(t) || 0);

/**
 * Alle Unterhaltungen in einer Liste, die jüngste oben.
 * @param o.dms     Dokumente aus dms (mit id)
 * @param o.gruppen die eigenen Gruppen [{ id, name }]
 * @param o.meta    Map gid -> { text, sender, senderName, at }
 * @param o.stand   Map schlüssel -> { stumm, gelesen }
 */
export function unterhaltungen({ ich, dms = [], gruppen = [], meta = new Map(), stand = new Map() } = {}) {
  const liste = [];
  for (const c of dms) {
    const runde = c.art === 'runde';
    const andere = (c.participants || []).filter(u => u !== ich);
    const schluessel = standSchluessel('dm', c.id);
    const name = runde
      ? rundeTitel(c.titel) || andere.map(u => c.participantNames?.[u]).filter(Boolean).join(', ')
      : c.participantNames?.[andere[0]] || 'Unbekannt';
    const von = c.lastSender === ich ? 'Du: '
      : runde && c.lastSender ? `${String(c.participantNames?.[c.lastSender] || '').split(' ')[0]}: ` : '';
    liste.push({
      art: runde ? 'runde' : 'dm', id: c.id, schluessel, name,
      andere: runde ? '' : andere[0] || '',
      leute: (c.participants || []).length,
      vorschau: c.lastMessage ? von + c.lastMessage : '',
      zeit: ms(c.lastAt),
      ungelesen: Number(c.unread?.[ich]) || 0,
      stumm: stand.get(schluessel)?.stumm === true,
    });
  }
  for (const g of gruppen) {
    const m = meta.get(g.id) || null;
    const schluessel = standSchluessel('gruppe', g.id);
    const s = stand.get(schluessel) || {};
    const neu = !!m && m.sender !== ich && ms(m.at) > ms(s.gelesen);
    liste.push({
      art: 'gruppe', id: g.id, schluessel, name: g.name || 'Gruppe',
      vorschau: m?.text ? `${m.sender === ich ? 'Du' : String(m.senderName || '').split(' ')[0] || '…'}: ${m.text}` : '',
      zeit: ms(m?.at),
      /* Wie viele, weiss die Gruppe nicht (dafür müsste jede Nachricht
         gezählt werden) — ungelesen ist ein Punkt. */
      ungelesen: neu ? 1 : 0,
      punkt: true,
      stumm: s.stumm === true,
    });
  }
  /* Ohne Nachricht die Gruppen nach Namen ans Ende — es gibt sie immer. */
  return liste.sort((a, b) => (b.zeit - a.zeit) || a.name.localeCompare(b.name, 'de'));
}

/** Die Zahl für die Leiste: stumme Unterhaltungen zählen nicht. */
export const ungelesenGesamt = liste => liste.reduce((n, u) => n + (u.stumm ? 0 : u.ungelesen), 0);

/** Ein Gruppenchat: 3–30 Leute (man selbst eingeschlossen), ein Titel. */
export function rundePruefen({ ich, andere = [], titel }) {
  const leute = [...new Set([ich, ...andere].filter(Boolean))];
  if (leute.length < RUNDE_MIN) return { ok: false, grund: 'wenige' };
  if (leute.length > RUNDE_MAX) return { ok: false, grund: 'viele' };
  const t = rundeTitel(titel);
  if (!t) return { ok: false, grund: 'titel' };
  return { ok: true, leute: leute.sort(), titel: t };
}
