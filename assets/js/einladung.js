/* ══════════════════════════════════════════════════════════════════
   Einladung in eine Gruppe — ein kurzer Link, der abläuft (v.35.53.0).

   Michel: "Beim Code teilen sollte wirklich ein Link zum Anmelden direkt
   mit Code gehen, aber gekürzt. Einfach so ein langer Code ist auch
   nichts — wenn jemand einfach einen Code erhält, fragt er sich WTF.
   Wichtig ist, dass dieser Code mal abläuft, und dass es keine Backends
   zeigt mit dem Teilen von den Links sowie Codes."

   Bis dahin: 24 Hexzeichen ohne Ablauf, als nackter Text kopiert.
   Jetzt:
   - der Code hat 8 Zeichen aus einem Alphabet ohne Verwechsler (kein 0/O,
     1/I/L) — 31^8, fast 10^12 Möglichkeiten; lesbar als "K7Q3-M9XP".
     Raten scheidet trotzdem aus: Einladungen lassen sich nicht auflisten,
     jeder Versuch ist ein einzelnes Lesen, und nach sieben Tagen ist der
     Code nichts mehr wert;
   - der Link ist die Adresse der App mit ?k=<code>, sonst nichts: keine
     Gruppenkennung, kein Pfad einer Datenbank, kein Name eines Dienstes;
   - er gilt GUELTIG_TAGE Tage (die Regel lässt höchstens 15 zu und
     prüft den Ablauf bei jedem Beitritt);
   - wer ihn ohne Konto öffnet, landet bei Willkommen/Registrieren, und der
     Code wartet auf dem Gerät (localStorage), bis das Konto steht.

   Ohne Firebase, damit es sich testen lässt — der Beitritt selbst lädt
   groups.js erst, wenn er gebraucht wird.
   ══════════════════════════════════════════════════════════════════ */

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LAENGE = 8;
export const GUELTIG_TAGE = 7;
const MERKER = 'firn.beitritt';
/* Ein gemerkter Code, der so lange liegt, ist vergessen — wer nach drei
   Wochen ein Konto anlegt, soll nicht plötzlich in einer Gruppe landen. */
const MERKEN_TAGE = 14;

/** Ein neuer Code aus dem Zufall des Browsers. 256 ist kein Vielfaches
    von 31 — darum werden Bytes über dem letzten vollen Block verworfen,
    sonst kämen die ersten Zeichen öfter vor. */
export function neuerCode(zufall = n => crypto.getRandomValues(new Uint8Array(n))) {
  const grenze = 256 - (256 % ALPHABET.length);
  let code = '';
  while (code.length < CODE_LAENGE) {
    for (const b of zufall(CODE_LAENGE * 2)) {
      if (b >= grenze) continue;
      code += ALPHABET[b % ALPHABET.length];
      if (code.length === CODE_LAENGE) break;
    }
  }
  return code;
}

/** "K7Q3M9XP" → "K7Q3-M9XP". Zum Lesen und Abtippen, nicht zum Speichern. */
export function codeZeigen(code) {
  const c = String(code || '');
  return c.length === CODE_LAENGE ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Was jemand eintippt oder einfügt — der Code, mit Strich, klein, mit
    Leerzeichen, oder gleich der ganze Link — als Kennung des Dokuments.
    Alte Codes (24 Hexzeichen) bleiben klein, wie sie gespeichert sind. */
export function codeSauber(eingabe) {
  let roh = String(eingabe ?? '').trim();
  const imLink = roh.match(/[?&]k=([^&#\s]+)/i);
  if (imLink) roh = decodeURIComponent(imLink[1]);
  const hex = roh.replace(/\s+/g, '');
  if (/^[0-9a-f]{24}$/i.test(hex)) return hex.toLowerCase();
  const neu = roh.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (neu.length !== CODE_LAENGE) return '';
  return [...neu].every(z => ALPHABET.includes(z)) ? neu : '';
}

/** Die Wurzel der App — dieselbe, egal von welcher Seite aus. */
export const APP_WURZEL = new URL('../../', import.meta.url);

/** Der Link: die Adresse der App und der Code. Sonst nichts. */
export function einladungsLink(code, wurzel = APP_WURZEL) {
  const url = new URL(wurzel.href);
  url.search = `?k=${encodeURIComponent(code)}`;
  url.hash = '';
  return url.href;
}

/** Bis wann ein neuer Code gilt. */
export function ablaufAb(jetzt = new Date(), tage = GUELTIG_TAGE) {
  return new Date(jetzt.getTime() + tage * 86400000);
}

/** Ein Firestore-Timestamp, ein Date oder Millisekunden → Date. */
export function alsDatum(wert) {
  if (!wert) return null;
  if (typeof wert.toDate === 'function') return wert.toDate();
  const d = wert instanceof Date ? wert : new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function abgelaufen(einladung, jetzt = new Date()) {
  const bis = alsDatum(einladung?.bis);
  return !bis || bis <= jetzt;
}

/** Der Text, der mit dem Link verschickt wird — der Name der Gruppe und
    bis wann, damit niemand einen nackten Code bekommt. */
export function einladungsText({ gruppe, link, bis, sprache = 'de-CH', t = (k, f, v) => fuellen(f, v) }) {
  const datum = alsDatum(bis)?.toLocaleDateString(sprache, { day: 'numeric', month: 'long' }) || '';
  return t('einl.text', 'Komm in die Gruppe «{gruppe}»: {link}\nDer Link gilt bis {bis}.',
    { gruppe: gruppe || '', link, bis: datum });
}

/** Der Text zu einem Link in den TVZA-Kreis (v.35.56.0) — ohne Marke
    im Katalog, die steht im Link selbst nicht und kommt beim Öffnen. */
export function kreisEinladungsText({ link, bis, sprache = 'de-CH', t = (k, f, v) => fuellen(f, v) }) {
  const datum = alsDatum(bis)?.toLocaleDateString(sprache, { day: 'numeric', month: 'long' }) || '';
  return t('einl.kreisText', 'Du bist eingeladen: {link}\nDer Link gilt bis {bis} und für eine Person.', { link, bis: datum });
}

const fuellen = (text, vars = {}) =>
  String(text).replace(/\{(\w+)\}/g, (ganz, name) => (vars[name] ?? ganz));

/* ── Der Code wartet auf dem Gerät ─────────────────────────────────── */

export function merken(code, speicher = globalThis.localStorage, jetzt = Date.now()) {
  const sauber = codeSauber(code);
  if (!sauber) return '';
  try { speicher?.setItem(MERKER, JSON.stringify({ code: sauber, am: jetzt })); } catch {}
  return sauber;
}

export function gemerkt(speicher = globalThis.localStorage, jetzt = Date.now()) {
  try {
    const roh = JSON.parse(speicher?.getItem(MERKER) || 'null');
    if (!roh?.code || !(jetzt - Number(roh.am) < MERKEN_TAGE * 86400000)) return '';
    return codeSauber(roh.code);
  } catch { return ''; }
}

export function vergessen(speicher = globalThis.localStorage) {
  try { speicher?.removeItem(MERKER); } catch {}
}

/** Liest ?k= aus der Adresse, merkt es und nimmt es aus der Adresszeile
    — dort soll es nicht stehen bleiben, auch nicht im Verlauf. */
export function ausAdresseMerken(win = globalThis.window) {
  try {
    const url = new URL(win.location.href);
    const k = url.searchParams.get('k');
    if (!k) return '';
    url.searchParams.delete('k');
    win.history?.replaceState?.(win.history.state, '', url.pathname + url.search + url.hash);
    return merken(k, win.localStorage);
  } catch { return ''; }
}

/* ── Beitreten ─────────────────────────────────────────────────────── */

/** Tritt mit einem Code bei. Ein Code zeigt entweder auf eine Gruppe
    (die dann die aktive wird) oder in den TVZA-Kreis (v.35.56.0,
    kreis-einladung.js). Gibt { gid } oder { kreis: true } zurück; wirft
    mit einer lesbaren Meldung. */
export async function einloesen(code, uid) {
  const kreis = await import('./kreis-einladung.js');
  if (await kreis.istKreisEinladung(code)) return kreis.kreisBeitreten(code, uid);
  const groups = await import('./groups.js');
  const gid = await groups.beitreten(code, uid);
  groups.aktiveGruppeSetzen(gid);
  return { gid };
}

/** Der gemerkte Code, nach der Anmeldung. Gibt { gid }, { kreis } oder { fehler }
    zurück oder null, wenn nichts wartete. Der Merker geht in jedem Fall
    weg — ein abgelaufener Code soll nicht bei jedem Öffnen scheitern. */
export async function gemerktEinloesen(uid, speicher = globalThis.localStorage) {
  const code = gemerkt(speicher);
  if (!code) return null;
  vergessen(speicher);
  try { return await einloesen(code, uid); }
  catch (e) { return { fehler: e?.message || String(e) }; }
}
