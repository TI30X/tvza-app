/* ══════════════════════════════════════════════════════════════════
   Eine Nachricht über den Assistenten (v.35.67.0) — rein.

   Michel: "Nachrichten über den KI-Assistenten senden, wenn ausdrücklich
   darum gebeten … Bestätigung mit Empfänger, vollem Text und Absender;
   bei mehrdeutigen Namen wählen; genau den gezeigten Text erst nach der
   Bestätigung senden."

   Der Assistent bekommt keine Namen anderer (ki.js, kontextBauen). Er
   gibt zurück, WEN die Person genannt hat ("Lea", "den Kader") und WAS
   geschrieben werden soll. Aufgelöst wird hier, im Browser, gegen die
   Leute und Gruppen, die man ohnehin kennt — und steht der Name für
   mehrere, wählt die Person.
   ══════════════════════════════════════════════════════════════════ */

export const TEXT_MAX = 2000;

/* Wie die Suche im Chat (bekannte.js): gross/klein, Akzente, ä = ae. */
export const flach = text => String(text || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/ß/g, 'ss')
  .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/* "Lea und Max", "Lea, Max & Tim" — einzelne Namen. */
export function namenAus(an) {
  return String(an || '')
    .split(/\s*(?:,|;|&|\+|\bund\b|\band\b|\bet\b|\bi\b|\ben\b|\by\b|\be\b|\boraz\b)\s*/i)
    .map(s => s.trim()).filter(Boolean).slice(0, 10);
}

/* Füllwörter vor einem Namen: "an Lea", "dem Kader", "die Gruppe BSV". */
const FUELL = /^(an|a|to|zu|dem|den|der|die|das|meinem|meiner|meinen|unserem|unserer|the|my|la|le|il|gruppe|group|chat|kader)\s+/i;
const ohneFuell = s => { let x = s; for (let i = 0; i < 3; i += 1) x = x.replace(FUELL, ''); return x.trim(); };

/**
 * Wer mit einem Namen gemeint sein kann.
 * @param name      wie die Person ihn nannte
 * @param personen  [{ uid, name, gruppen: [Gruppennamen] }]  aus den eigenen Gruppen und Chats
 * @param gruppen   [{ id, name }]  die eigenen Gruppen (ihr Chat)
 * @returns [{ art: 'person'|'gruppe', id, name, sub }]  bestes zuerst
 */
export function treffer(name, { personen = [], gruppen = [] } = {}) {
  const s = flach(ohneFuell(name));
  if (!s) return [];
  const woerter = s.split(' ');
  const passt = text => { const f = flach(text); return woerter.every(w => f.includes(w)); };
  const genau = text => flach(text) === s;
  const vorname = text => flach(text).split(' ')[0] === s;
  const raus = [];
  for (const g of gruppen) {
    if (g?.id && passt(g.name)) raus.push({ art: 'gruppe', id: g.id, name: g.name, sub: 'gruppe', guete: genau(g.name) ? 3 : 1 });
  }
  for (const p of personen) {
    if (p?.uid && passt(p.name)) {
      raus.push({ art: 'person', id: p.uid, name: p.name, sub: (p.gruppen || []).join(' · '),
        guete: genau(p.name) ? 3 : vorname(p.name) ? 2 : 1 });
    }
  }
  /* Ein genauer Treffer schlägt die ungefähren — "Lea" ist Lea, nicht
     auch "Leandra"; stehen zwei Leas da, bleibt die Wahl. */
  const beste = Math.max(0, ...raus.map(r => r.guete));
  return raus.filter(r => r.guete === beste)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map(({ guete, ...r }) => r);
}

/**
 * Alle genannten Namen aufgelöst: je Name die Treffer; genau einer ist
 * gewählt, mehrere heissen wählen, keiner heisst "nicht gefunden".
 * @param o.nurGruppe  der Assistent einer Gruppe schreibt nur in sie: ihre
 *                     Leute und ihren Chat
 */
export function empfaengerFinden(an, { personen = [], gruppen = [], nurGruppe = null } = {}) {
  const inDer = nurGruppe ? gruppen.find(g => g.id === nurGruppe) : null;
  const gs = nurGruppe ? (inDer ? [inDer] : []) : gruppen;
  const ps = nurGruppe ? personen.filter(p => (p.gruppen || []).includes(inDer?.name)) : personen;
  return namenAus(an).map(name => {
    const liste = treffer(name, { personen: ps, gruppen: gs });
    return { name, treffer: liste, gewaehlt: liste.length === 1 ? liste[0] : null };
  });
}

/** Bereit zum Senden: jeder Name hat genau einen Empfänger, der Text steht. */
export function sendebereit(empfaenger, text) {
  const t = String(text || '').trim();
  if (!t || t.length > TEXT_MAX) return false;
  if (!empfaenger.length) return false;
  return empfaenger.every(e => e.gewaehlt);
}

/** Dieselbe Person zweimal genannt ("Lea und Lea Müller") — einmal senden. */
export function ohneDoppelte(empfaenger) {
  const gesehen = new Set();
  return empfaenger.map(e => e.gewaehlt).filter(e => {
    if (!e) return false;
    const k = `${e.art}:${e.id}`;
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}
