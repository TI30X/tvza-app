/* ══════════════════════════════════════════════════════════════════
   Kontakte — alles, was ein Trainer ueber eine Person wissen muss, und
   der Verteiler an alle.

   Michel: "Eltern hinzufuegen, damit man alle wichtigen Infos dort
   verteilen kann, sowie einen E-Mail-Verteiler — alle Daten ueber eine
   Person dort eingefuehrt, und mit einem Klick an alle versenden."

   ── Wer was sieht ─────────────────────────────────────────────────
   Die Leitung und die Person selbst. Sonst niemand — ein Athlet sieht
   nie die Telefonnummer der Mutter eines anderen Athleten. Das steht in
   firestore.rules, nicht nur hier; die Oberflaeche zeigt nur, was die
   Regeln ohnehin herausgeben.

   ── Warum mailto und BCC ──────────────────────────────────────────
   Es gibt noch keinen Server, der Mails verschicken koennte (der Spark-
   Tarif hat keine Functions). Der Verteiler oeffnet darum das eigene
   Mailprogramm, mit allen Adressen im BCC: die Eltern sehen einander
   nicht, und niemandes Adresse geht an alle.

   Kein DOM, kein Firebase. Die Seite steht in feature/gruppe/.
   ══════════════════════════════════════════════════════════════════ */

export const ELTERN_MAX = 4;

/* Die Grenzen stehen genauso in firestore.rules. */
export const GRENZEN = Object.freeze({
  telefon: 30,
  email: 120,
  adresse: 160,
  notiz: 500,
  name: 80,
  beziehung: 40,
});

/* Eine Adresse, die ein Mailprogramm annimmt — nicht mehr. Wer eine
   RFC schreiben will, soll es woanders tun; hier soll ein Tippfehler
   ("anna.muster@gmail" ohne Endung) auffallen. */
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
export const istEmail = s => EMAIL.test(String(s ?? '').trim());

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function text(wert, max) {
  return String(wert ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Ein Kontakt, wie er gespeichert wird: getrimmt, gekuerzt, ohne leere
 * Felder, die E-Mail klein. Ein Elternteil ohne Namen, Adresse und
 * Nummer ist eine leere Zeile im Formular und faellt weg.
 */
export function kontaktSauber(roh = {}) {
  const raus = {};
  const geburt = String(roh.geburt ?? '').trim();
  if (ISO.test(geburt)) raus.geburt = geburt;
  const telefon = text(roh.telefon, GRENZEN.telefon);
  if (telefon) raus.telefon = telefon;
  const email = text(roh.email, GRENZEN.email).toLowerCase();
  if (email) raus.email = email;
  const adresse = text(roh.adresse, GRENZEN.adresse);
  if (adresse) raus.adresse = adresse;
  /* Die Notiz behaelt ihre Zeilen — "Allergie: Nuesse / Notfall: …". */
  const notiz = String(roh.notiz ?? '').trim().slice(0, GRENZEN.notiz);
  if (notiz) raus.notiz = notiz;

  const eltern = (Array.isArray(roh.eltern) ? roh.eltern : [])
    .map(e => {
      const eintrag = {};
      const name = text(e?.name, GRENZEN.name);
      const beziehung = text(e?.beziehung, GRENZEN.beziehung);
      const mail = text(e?.email, GRENZEN.email).toLowerCase();
      const tel = text(e?.telefon, GRENZEN.telefon);
      if (name) eintrag.name = name;
      if (beziehung) eintrag.beziehung = beziehung;
      if (mail) eintrag.email = mail;
      if (tel) eintrag.telefon = tel;
      return eintrag;
    })
    .filter(e => e.name || e.email || e.telefon)
    .slice(0, ELTERN_MAX);
  if (eltern.length) raus.eltern = eltern;
  return raus;
}

/** Was an einem Kontakt nicht stimmt — als Saetze fuer das Formular. */
export function pruefeKontakt(k) {
  const fehler = [];
  if (k.email && !istEmail(k.email)) fehler.push(`„${k.email}" ist keine E-Mail-Adresse.`);
  for (const e of k.eltern || []) {
    if (e.email && !istEmail(e.email)) fehler.push(`„${e.email}" ist keine E-Mail-Adresse.`);
  }
  if (k.geburt && k.geburt > new Date().toISOString().slice(0, 10)) {
    fehler.push('Das Geburtsdatum liegt in der Zukunft.');
  }
  return fehler;
}

/**
 * Die Adressen fuer den Verteiler.
 *
 * @param {Array} kontakte  [{ uid, email?, eltern?: [{ email? }] }]
 * @param {'alle'|'eltern'|'athleten'} wer
 * @returns {string[]} eindeutig, klein, sortiert — nur gueltige
 */
export function verteiler(kontakte, wer = 'alle') {
  const adressen = new Set();
  for (const k of kontakte || []) {
    if (wer !== 'eltern' && istEmail(k?.email)) adressen.add(String(k.email).trim().toLowerCase());
    if (wer !== 'athleten') {
      for (const e of k?.eltern || []) {
        if (istEmail(e?.email)) adressen.add(String(e.email).trim().toLowerCase());
      }
    }
  }
  return [...adressen].sort();
}

/** Wer im Verteiler fehlt, weil keine gueltige Adresse hinterlegt ist. */
export function ohneAdresse(mitglieder, kontakte, wer = 'alle') {
  const je = new Map((kontakte || []).map(k => [k.uid, k]));
  return (mitglieder || []).filter(m => verteiler([je.get(m.uid) || {}], wer).length === 0);
}

/**
 * Die Adresse, die das Mailprogramm oeffnet. Alle Empfaenger im BCC —
 * die Eltern sehen einander nicht.
 */
export function mailtoAdresse(adressen, { betreff = '' } = {}) {
  const teile = [];
  if (adressen.length) teile.push(`bcc=${adressen.map(encodeURIComponent).join(',')}`);
  if (betreff) teile.push(`subject=${encodeURIComponent(betreff)}`);
  return `mailto:?${teile.join('&')}`;
}
