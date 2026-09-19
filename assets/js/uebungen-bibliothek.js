/* ══════════════════════════════════════════════════════════════════
   Die Übungsbibliothek — für Pläne, die niemand aus einer Excel liest.

   Firn kam aus einem Kader: dort schreibt die Trainerin eine Excel,
   und die App liest sie (training-parser.js). Wer keinen Trainer hat,
   hatte damit auch keinen Plan.

   Diese Datei ist die andere Hälfte: eine Liste von Übungen, aus denen
   man selbst eine Einheit baut. Sie erzeugt GENAU die Form, die der
   Parser aus der Excel macht — dieselben Felder, dieselben Modi.
   Dadurch spielt der vorhandene Player einen selbst gebauten Plan,
   ohne eine Zeile davon zu wissen.

   ── Die sechs Modi ────────────────────────────────────────────────
   Sie stammen nicht von hier, sondern aus dem Parser, und sie sind das
   Vokabular des Players:

     sets    Sätze mit Wiederholungen und Gewicht — das Einzige, wo man
             Werte einträgt
     rounds  Runden (Sprungprogramm, Zirkel)
     timed   auf Zeit ("30 Sec pro Seite")
     block   Abschnitte einer Ausdauereinheit ("20 Minuten einlaufen")
     video   eine Liste von Videos (Mobi)
     note    eine Erklärung ohne Übung

   Eine eigene Übung, die einen siebten Modus erfände, würde im Player
   als etwas anderes erscheinen, als sie gemeint war. Darum prüft
   modusGueltig(), und was nicht passt, wird 'sets'.
   ══════════════════════════════════════════════════════════════════ */

export const MODI = Object.freeze(['sets', 'rounds', 'timed', 'block', 'video', 'note']);
export const modusGueltig = m => MODI.includes(String(m || ''));

export const KATEGORIEN = Object.freeze([
  { key: 'kraft', i18n: 'ub.kat.kraft', de: 'Kraft' },
  { key: 'sprung', i18n: 'ub.kat.sprung', de: 'Sprung & Schnelligkeit' },
  { key: 'rumpf', i18n: 'ub.kat.rumpf', de: 'Rumpf' },
  { key: 'ausdauer', i18n: 'ub.kat.ausdauer', de: 'Ausdauer' },
  { key: 'mobi', i18n: 'ub.kat.mobi', de: 'Mobilität & Koordination' },
  { key: 'sonst', i18n: 'ub.kat.sonst', de: 'Sonstiges' },
]);
export const KATEGORIE_KEYS = Object.freeze(KATEGORIEN.map(k => k.key));
export const kategorieGueltig = k => KATEGORIE_KEYS.includes(String(k || ''));

export const NAME_MAX = 80;
export const TEXT_MAX = 400;
export const GERAET_MAX = 60;
export const VIDEO_MAX = 500;
export const EIGENE_MAX = 300;

/**
 * Eine Adresse, die in ein href darf.
 *
 * Dieselbe Prüfung wie videoUrl() im Player (einheit.js): alles ausser
 * http und https fällt weg. Eine javascript:-Adresse in einem selbst
 * angelegten Plan wäre ein Weg in die eigene Seite hinein — und der
 * Plan ist teilbar (training-teilen.js), also auch in eine fremde.
 */
export function videoSicher(roh) {
  const text = String(roh ?? '').trim();
  if (!text) return '';
  try {
    const u = new URL(text);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href.slice(0, VIDEO_MAX) : '';
  } catch { return ''; }
}

/* ── Die mitgelieferten Übungen ────────────────────────────────────
   Bewusst kurz und allgemein: das ist ein Anfang, kein Trainingsplan.
   Wer mehr braucht, legt eigene an — und eine eigene Übung gehört
   ihrem Konto allein (users/{uid}/uebungen, Regel owner-only).

   Kein Video bei den mitgelieferten: ein Link, den wir setzen, ist ein
   Link, für den wir geradestehen. Wer ein Video will, trägt seines ein. */
export const BIBLIOTHEK = Object.freeze([
  { id: 'kniebeuge', name: 'Kniebeuge', kategorie: 'kraft', geraet: 'Langhantel',
    anweisung: 'Füsse schulterbreit, Knie über den Zehen, Rücken gerade.',
    modus: 'sets', saetze: 3, reps: '8', pause: '120-180 Sec' },
  { id: 'kreuzheben', name: 'Kreuzheben', kategorie: 'kraft', geraet: 'Langhantel',
    anweisung: 'Hüfte zuerst, Rücken neutral, Stange nah am Körper.',
    modus: 'sets', saetze: 3, reps: '6', pause: '120-180 Sec' },
  { id: 'ausfallschritt', name: 'Ausfallschritt', kategorie: 'kraft', geraet: 'Kurzhanteln',
    anweisung: 'Grosser Schritt, hinteres Knie tief, Oberkörper aufrecht.',
    modus: 'sets', saetze: 3, reps: '10/Seite', pause: '90 Sec' },
  { id: 'klimmzug', name: 'Klimmzug', kategorie: 'kraft', geraet: 'Stange',
    anweisung: 'Schulterblätter zuerst, ganze Bewegung.',
    modus: 'sets', saetze: 3, reps: '8', pause: '120 Sec' },
  { id: 'rudern', name: 'Vorgebeugtes Rudern', kategorie: 'kraft', geraet: 'Langhantel',
    anweisung: 'Oberkörper vorgeneigt, Ellbogen am Körper vorbei.',
    modus: 'sets', saetze: 3, reps: '10', pause: '120 Sec' },
  { id: 'bankdruecken', name: 'Bankdrücken', kategorie: 'kraft', geraet: 'Langhantel',
    anweisung: 'Schulterblätter zusammen, Stange zur Brustmitte.',
    modus: 'sets', saetze: 3, reps: '8', pause: '120 Sec' },
  { id: 'schulterdruecken', name: 'Schulterdrücken', kategorie: 'kraft', geraet: 'Kurzhanteln',
    anweisung: 'Rumpf fest, kein Hohlkreuz.',
    modus: 'sets', saetze: 3, reps: '10', pause: '90 Sec' },
  { id: 'wadenheben', name: 'Wadenheben einbeinig', kategorie: 'kraft', geraet: 'Stufe',
    anweisung: 'Ganze Bewegung, oben kurz halten.',
    modus: 'sets', saetze: 3, reps: '12/Seite', pause: '60 Sec' },

  { id: 'huerdensprung', name: 'Hürdensprünge beidbeinig', kategorie: 'sprung', geraet: 'Hürden',
    anweisung: 'Kurzer Bodenkontakt, Landung weich.',
    modus: 'rounds', saetze: 4, reps: '6' },
  { id: 'sprungabfolge', name: 'Sprungabfolge', kategorie: 'sprung', geraet: '',
    anweisung: 'Vorwärts, seitlich, einbeinig — ohne Pause dazwischen.',
    modus: 'rounds', saetze: 3, reps: '1 Durchgang' },
  { id: 'sprint', name: 'Sprint', kategorie: 'sprung', geraet: '',
    anweisung: 'Aus dem Stand, volle Beschleunigung.',
    modus: 'rounds', saetze: 6, reps: '30 m' },
  { id: 'stopandgo', name: 'Stop and go', kategorie: 'sprung', geraet: '',
    anweisung: 'Antritt, abstoppen, sofort wieder los.',
    modus: 'rounds', saetze: 4, reps: '20 m' },

  { id: 'plank', name: 'Unterarmstütz', kategorie: 'rumpf', geraet: 'Matte',
    anweisung: 'Gerade Linie von Kopf bis Ferse, Gesäss fest.',
    modus: 'timed', saetze: 3, dauer: '45 Sec' },
  { id: 'seitstuetz', name: 'Seitstütz', kategorie: 'rumpf', geraet: 'Matte',
    anweisung: 'Hüfte hoch, Schulter über dem Ellbogen.',
    modus: 'timed', saetze: 3, dauer: '30 Sec pro Seite' },
  { id: 'pallof', name: 'Pallof Press', kategorie: 'rumpf', geraet: 'Kabelzug',
    anweisung: 'Gegen den Zug stabil bleiben, nicht mitdrehen.',
    modus: 'sets', saetze: 3, reps: '10/Seite', pause: '60-90 Sec' },
  { id: 'deadbug', name: 'Dead Bug', kategorie: 'rumpf', geraet: 'Matte',
    anweisung: 'Unterer Rücken bleibt am Boden.',
    modus: 'sets', saetze: 3, reps: '10/Seite', pause: '60 Sec' },

  { id: 'dauerlauf', name: 'Dauerlauf Zone 1', kategorie: 'ausdauer', geraet: '',
    anweisung: 'Ruhig, du solltest dich unterhalten können.',
    modus: 'block', dauer: '45 Minuten' },
  { id: 'intervall', name: 'Intervall 4×5 Minuten', kategorie: 'ausdauer', geraet: '',
    anweisung: '5 Minuten schnell, 3 Minuten locker.',
    modus: 'block', dauer: '4 Runden' },
  { id: 'rad', name: 'Rad locker', kategorie: 'ausdauer', geraet: 'Rad',
    anweisung: 'Gleichmässige Trittfrequenz.',
    modus: 'block', dauer: '60 Minuten' },

  { id: 'mobi', name: 'Mobilität', kategorie: 'mobi', geraet: 'Matte',
    anweisung: 'Ruhig atmen, nie in den Schmerz.',
    modus: 'timed', saetze: 1, dauer: '10 Minuten' },
  { id: 'fussgymnastik', name: 'Fussgymnastik', kategorie: 'mobi', geraet: '',
    anweisung: 'Zehen spreizen, Short foot, Handtuch greifen.',
    modus: 'timed', saetze: 1, dauer: '8 Minuten' },
  { id: 'koordination', name: 'Koordinationsleiter', kategorie: 'mobi', geraet: 'Leiter',
    anweisung: 'Schnelle Füsse, Blick nach vorn.',
    modus: 'rounds', saetze: 4, reps: '1 Durchgang' },
].map(u => Object.freeze({ ...u, eigen: false })));

/** Eine eigene Übung so, wie sie ins Dokument darf. */
export function uebungSauber(roh) {
  const text = (wert, max) => String(wert ?? '').trim().slice(0, max);
  const modus = modusGueltig(roh?.modus) ? roh.modus : 'sets';
  const raus = {
    name: text(roh?.name, NAME_MAX),
    kategorie: kategorieGueltig(roh?.kategorie) ? roh.kategorie : 'sonst',
    anweisung: text(roh?.anweisung, TEXT_MAX),
    geraet: text(roh?.geraet, GERAET_MAX),
    modus,
    saetze: Math.min(12, Math.max(0, Math.round(Number(roh?.saetze) || 0))),
    reps: text(roh?.reps, 20),
    dauer: text(roh?.dauer, 20),
    pause: text(roh?.pause, 40),
    video: videoSicher(roh?.video),
  };
  if (!raus.name) throw new Error('uebung: ohne Namen geht es nicht');
  return raus;
}

/* ── Zusammenführen ────────────────────────────────────────────────
   Die mitgelieferten und die eigenen in EINER Liste. Wer eine eigene
   Übung genauso nennt wie eine mitgelieferte, meint seine — sie
   verdrängt die andere, statt zweimal dazustehen. */
const schluessel = name => String(name || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '');

export function bibliothek(eigene = []) {
  const nachName = new Map();
  for (const u of BIBLIOTHEK) nachName.set(schluessel(u.name), u);
  for (const u of eigene) {
    if (!u?.name) continue;
    nachName.set(schluessel(u.name), { ...u, eigen: true });
  }
  return [...nachName.values()]
    .sort((a, b) => KATEGORIE_KEYS.indexOf(a.kategorie) - KATEGORIE_KEYS.indexOf(b.kategorie)
      || String(a.name).localeCompare(String(b.name), 'de'));
}

/** Suchen wie im Food Tracker: klein, ohne Umlaute, Teiltreffer. */
export function suche(liste, frage, grenze = 12) {
  const q = schluessel(frage);
  if (!q) return liste.slice(0, grenze);
  return liste
    .filter(u => schluessel(u.name).includes(q)
      || schluessel(u.geraet).includes(q)
      || schluessel(u.kategorie).includes(q))
    .slice(0, grenze);
}

export const kategorieWort = key => {
  const k = KATEGORIEN.find(x => x.key === key) || KATEGORIEN[KATEGORIEN.length - 1];
  return window.TVZAI18n?.tOr(k.i18n, k.de) ?? k.de;
};
