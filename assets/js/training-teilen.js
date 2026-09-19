/* ══════════════════════════════════════════════════════════════════
   Das eigene Training mit einem Trainer ausserhalb teilen.

   Der Fall: eine Athletin ist im Kader, hat daneben aber eine
   Privattrainerin, eine Physiotherapeutin oder einen Vater, der mit
   ihr plant. Die sollen sehen, was sie trainiert — und sonst nichts.

   ── Was das NICHT ist ─────────────────────────────────────────────
   Kein Gastzugang in die Gruppe. Ein Gast, der groups/{gid} lesen
   darf, sieht damit die Kaderliste, die Termine, die Kontakte und den
   Chat. Diese Ansicht ist stattdessen ein AUSZUG: ein Dokument, das
   die Athletin selbst schreibt, mit genau dem, was sie ausgewählt
   hat, und ohne einen Weg zurück in die Gruppe.

   Der Preis dafür ist Ehrlichkeit: ein Auszug ist ein Stand, kein
   Fenster. Er wird aufgefrischt, wenn die Athletin den Bereich
   Training öffnet oder "Jetzt aktualisieren" tippt — und bis dahin
   sieht die externe Trainerin, was beim letzten Mal galt. Das steht
   in der Ansicht auch so da. Die Alternative — Leserecht auf die
   Pläne und Protokolle der Gruppe — wäre ein Fenster gewesen, hätte
   aber genau das geöffnet, was hier zu bleiben hat.

   ── Der Link ──────────────────────────────────────────────────────
   trainingShares/{code}. Der Code ist die Fähigkeit: 32 Zeichen aus
   einem Alphabet von 31 (rund 158 Bit). Wer ihn hat, darf lesen; wer
   ihn nicht hat, findet nichts, denn aufzählen darf die Sammlung nur
   die Eigentümerin selbst. Zurückziehen heisst löschen, und damit ist
   der Link im selben Augenblick tot.

   ── Was die Gruppe davon merkt ────────────────────────────────────
   Nichts. Die Freigabe steht nicht unter der Gruppe, sie trägt keine
   Gruppenkennung, und die Leitung darf sie weder lesen noch
   auflisten. Das ist Absicht: eine Athletin, die sich zusätzlich Hilfe
   holt, muss sich dafür nicht bei ihrem Verein abmelden.
   ══════════════════════════════════════════════════════════════════ */

/* Dasselbe Alphabet wie bei den Einladungen (einladung.js): ohne
   0/O/1/I/l — ein Code, den man vorlesen kann. Hier 32 Zeichen statt
   8, weil dieser Code nicht abgetippt, sondern geteilt wird und
   niemand ihn erraten darf. */
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LAENGE = 32;
export const GUELTIG_TAGE = 30;
export const LABEL_MAX = 60;
export const DATEN_MAX = 700000;
/* Wie weit der Auszug reicht: zwei Wochen zurück (was war) und sechs
   nach vorn (was kommt). Mehr wäre ein Export, kein Einblick. */
export const TAGE_ZURUECK = 14;
export const TAGE_VORAUS = 42;

/**
 * Ein Code, den niemand raten kann.
 *
 * crypto.getRandomValues, nie Math.random: der zweite ist vorhersagbar,
 * und ein vorhersagbarer Code ist keine Fähigkeit, sondern eine
 * Einladung. Ohne Web Crypto gibt es hier gar keinen Code — lieber
 * scheitern als einen schwachen ausgeben.
 */
export function neuerCode(zufall = globalThis.crypto) {
  if (!zufall?.getRandomValues) throw new Error('teilen: kein sicherer Zufall verfügbar');
  const bytes = new Uint8Array(CODE_LAENGE);
  zufall.getRandomValues(bytes);
  /* 256 ist kein Vielfaches von 31 — eine reine Modulo-Abbildung
     bevorzugte die ersten Zeichen leicht. Bei 158 Bit ist das ohne
     praktische Bedeutung, aber Verwerfen kostet nichts. */
  let raus = '';
  let i = 0;
  while (raus.length < CODE_LAENGE) {
    if (i >= bytes.length) { zufall.getRandomValues(bytes); i = 0; }
    const b = bytes[i++];
    if (b < 248) raus += ALPHABET[b % ALPHABET.length];
  }
  return raus;
}

export const codeGueltig = code =>
  typeof code === 'string' && code.length === CODE_LAENGE
  && [...code].every(z => ALPHABET.includes(z));

/** Der Link, den die Athletin verschickt. */
export function teilenLink(code, basis = '') {
  const wurzel = String(basis || '').replace(/\/+$/, '');
  return `${wurzel}/pages/geteilt.html?t=${encodeURIComponent(code)}`;
}

export const ablaufAb = (tage = GUELTIG_TAGE, jetzt = Date.now()) =>
  new Date(jetzt + tage * 86400000);

export function alsZeit(wert) {
  if (!wert) return 0;
  /* Date.now() ist eine Zahl. Ohne diesen Zweig landete sie bei
     Date.parse(), und "vor 0 Stunden" wurde zu "vor 277777 Stunden". */
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : 0;
  if (typeof wert.toMillis === 'function') return wert.toMillis();
  if (Number.isFinite(wert.seconds)) return wert.seconds * 1000;
  if (wert instanceof Date) return wert.getTime();
  const n = Date.parse(wert);
  return Number.isFinite(n) ? n : 0;
}

export const abgelaufen = (freigabe, jetzt = Date.now()) => alsZeit(freigabe?.bis) <= jetzt;

/* ── Der Umfang ────────────────────────────────────────────────────
   Was mitgeht, entscheidet die Athletin — Stück für Stück, nicht als
   ein Schalter. Die Vorgabe ist das Unverfängliche: was geplant ist
   und ob es getan wurde. Werte und Notizen sind aus.

   `privat` steht bewusst ganz unten und ist immer aus: "Nur für mich"
   heisst nur für mich, bis jemand ausdrücklich etwas anderes sagt. */
export const UMFANG_FELDER = Object.freeze(['einheiten', 'uebungen', 'fortschritt', 'werte', 'notizen', 'privat']);

export const UMFANG_VORGABE = Object.freeze({
  einheiten: true,
  uebungen: true,
  fortschritt: true,
  werte: false,
  notizen: false,
  privat: false,
});

export function umfangSauber(umfang) {
  const raus = {};
  for (const feld of UMFANG_FELDER) raus[feld] = umfang?.[feld] === true;
  /* Ohne Einheiten gäbe es nichts zu sehen — dann ist der ganze Rest
     gegenstandslos, und ein "Auszug" ohne Inhalt wäre ein Link, der
     nichts tut. */
  raus.einheiten = true;
  if (!raus.uebungen) { raus.werte = false; raus.notizen = false; raus.privat = false; }
  return raus;
}

/* ── Der Auszug ────────────────────────────────────────────────────
   Gebaut wird er aus einer Positivliste, nie durch Kopieren eines
   vorhandenen Objekts. Ein `...spread` hätte irgendwann ein Feld
   mitgenommen, das später dazukam — und niemand hätte es gemerkt.
   Was hier nicht ausdrücklich steht, geht nicht hinaus. */

const text = (wert, max = 200) => String(wert ?? '').trim().slice(0, max);

function satzAuszug(geplant, gemacht, werte) {
  const raus = { label: text(geplant?.label, 30) };
  /* Das Geplante ist Teil der Übung, nicht des Protokolls: es steht
     auch da, wenn Werte nicht geteilt werden. */
  if (geplant?.reps !== undefined) raus.repsPlan = text(geplant.reps, 20);
  if (geplant?.weight !== undefined) raus.gewichtPlan = text(geplant.weight, 20);
  if (!werte || !gemacht) return raus;
  if (gemacht.ok === true) raus.ok = true;
  for (const [feld, quelle] of [['reps', 'reps'], ['gewicht', 'weight'], ['dauer', 'dauer'], ['strecke', 'strecke']]) {
    const v = text(gemacht[quelle], 20);
    if (v) raus[feld] = v;
  }
  if (gemacht.koerper === true) raus.koerper = true;
  return raus;
}

function uebungAuszug(item, eintrag, umfang) {
  const raus = {
    name: text(item?.name || item?.title, 120),
    modus: text(item?.mode, 20),
  };
  const anweisung = text(item?.alt, 300);
  if (anweisung) raus.anweisung = anweisung;
  const pause = text(item?.pause, 40);
  if (pause) raus.pause = pause;
  if (typeof item?.video === 'string' && /^https?:\/\//i.test(item.video)) raus.video = item.video.slice(0, 500);

  const geplant = Array.isArray(item?.sets) ? item.sets : [];
  const gemacht = Array.isArray(eintrag?.sets) ? eintrag.sets : [];
  const anzahl = Math.min(12, Math.max(geplant.length, umfang.werte ? gemacht.length : 0));
  if (anzahl) {
    raus.saetze = Array.from({ length: anzahl }, (_, i) =>
      satzAuszug(geplant[i], gemacht[i], umfang.werte));
  }
  if (umfang.fortschritt && eintrag?.done === true) raus.erledigt = true;
  if (umfang.notizen) {
    const notiz = text(eintrag?.note, 200);
    if (notiz) raus.notiz = notiz;
  }
  return raus;
}

/**
 * Der Auszug, wie er im Dokument liegt.
 *
 * @param {object} o
 * @param {string} o.name            wie die Athletin heisst (ihr eigener Name)
 * @param {Array}  o.einheiten       aus planEinheiten(): { datum, titel, zeit, slot, unit, gid, planId }
 * @param {Map}    o.programme       gid|planId -> geparstes Programm
 * @param {Map}    o.protokolle      gid -> { datum: protokoll }
 * @param {object} o.privat          { datum: { 'gid~unit~key': text } }
 * @param {object} o.umfang
 * @param {object} o.helfer          { uebungen, eintrag } aus einheit.js
 * @param {string} o.von, o.bis      ISO-Tage
 */
export function auszug({
  name = '', einheiten = [], programme = new Map(), protokolle = new Map(),
  privat = {}, umfang = UMFANG_VORGABE, helfer = {}, von = '', bis = '',
} = {}) {
  const u = umfangSauber(umfang);
  const tage = new Map();

  for (const e of einheiten) {
    if (!e?.datum) continue;
    if (von && e.datum < von) continue;
    if (bis && e.datum > bis) continue;
    if (!tage.has(e.datum)) tage.set(e.datum, { datum: e.datum, einheiten: [] });

    const eintragRaus = {
      titel: text(e.titel, 120),
    };
    const zeit = text(e.zeit, 40);
    if (zeit) eintragRaus.zeit = zeit;
    const slot = text(e.slot, 40);
    if (slot) eintragRaus.slot = slot;

    const programm = programme.get(`${e.gid}|${e.planId}`) || null;
    const items = (e.unit && programm && helfer.uebungen) ? helfer.uebungen(programm, e.unit) : [];
    const protokoll = protokolle.get(e.gid)?.[e.datum] || null;

    if (u.uebungen && items.length) {
      eintragRaus.uebungen = items.slice(0, 60).map(item =>
        uebungAuszug(item, helfer.eintrag ? helfer.eintrag(protokoll, e.unit, item.key) : null, u));
    }
    if (u.fortschritt && items.length && helfer.eintrag) {
      const fertig = items.filter(i => helfer.eintrag(protokoll, e.unit, i.key).done === true).length;
      eintragRaus.fortschritt = { erledigt: fertig, gesamt: items.length };
    }
    /* Die private Notiz liegt unter users/{uid}/trainingLogs und geht
       NUR mit, wenn dieser Haken ausdrücklich gesetzt ist. */
    if (u.privat) {
      const schluessel = `${e.gid}~${e.unit}`;
      const notiz = text(privat?.[e.datum]?.[schluessel], 400);
      if (notiz) eintragRaus.privatNotiz = notiz;
    }

    tage.get(e.datum).einheiten.push(eintragRaus);
  }

  return {
    schema: 1,
    name: text(name, 80),
    von: text(von, 10),
    bis: text(bis, 10),
    umfang: u,
    tage: [...tage.values()].sort((a, b) => a.datum.localeCompare(b.datum)),
  };
}

/** Der Auszug als Zeichenkette — mit der Grenze, die auch die Regel zieht. */
export function auszugText(daten) {
  const s = JSON.stringify(daten);
  if (s.length <= DATEN_MAX) return s;
  /* Lieber weniger Tage als ein Dokument, das Firestore ablehnt. */
  const gekuerzt = { ...daten, tage: [...(daten.tage || [])] };
  while (gekuerzt.tage.length > 1 && JSON.stringify(gekuerzt).length > DATEN_MAX) gekuerzt.tage.pop();
  gekuerzt.gekuerzt = true;
  return JSON.stringify(gekuerzt);
}

/* ── Die Gegenprobe ────────────────────────────────────────────────
   Ein Auszug, der eine Gruppenkennung, eine fremde uid oder eine
   E-Mail-Adresse trägt, ist ein Fehler — kein kleiner. Diese Funktion
   sucht danach, und der Test lässt sie über echte Daten laufen.

   Sie ist kein Filter: gefunden wird hier nichts mehr weggeworfen,
   sondern gemeldet. Was gefiltert werden muss, gehört in auszug(). */
export function pruefeAuszug(daten, { verboten = [] } = {}) {
  const s = JSON.stringify(daten ?? {});
  const treffer = [];
  for (const wort of verboten) {
    if (wort && s.includes(wort)) treffer.push(wort);
  }
  /* Eine E-Mail-Adresse hat in einem Trainingsauszug nichts zu suchen,
     auch nicht die eigene. */
  const mail = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (mail) treffer.push(mail[0]);
  return treffer;
}

/** Wie die Ansicht den Stand nennt: "vor 3 Stunden" wäre gelogen, wenn nie aufgefrischt wurde. */
export function standAlter(stand, jetzt = Date.now()) {
  const ms = jetzt - alsZeit(stand);
  if (!(ms >= 0)) return null;
  return Math.floor(ms / 3600000);
}
