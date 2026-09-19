/* ══════════════════════════════════════════════════════════════════
   Essen in einer Gruppe — das Modell, ohne Firebase und ohne DOM.

   Der Food Tracker gibt es seit langem: er gehört EINER Person
   (foodlog/{uid}), er ist ein TVZA-Bereich, und was darin steht, sieht
   ausser ihr nur, wem sie ausdrücklich eine Freigabe erteilt hat.
   Daran ändert diese Datei nichts.

   Was dazukommt, ist etwas anderes: ein Kader oder ein Verein, in dem
   die Athletin ihr Essen erfasst, DAMIT die Trainerin es sieht. Das ist
   kein zweiter Tracker, sondern ein zweiter Ort für dieselbe Rechnung.
   Die Nährwerte kommen aus derselben Tabelle (foods.js), gerechnet wird
   mit derselben Funktion (naehrwerte), und die Erfassung ist dasselbe
   Bedienelement (feature/essen/erfassung.js).

   ── Warum eine eigene Sammlung ────────────────────────────────────
   Es wäre bequemer gewesen, die persönlichen Einträge zu markieren und
   der Leitung darauf ein Leserecht zu geben. Es wäre auch falsch
   gewesen:

     · Der persönliche Ordner trägt mehr als Mahlzeiten — Gewicht und
       Ziel liegen unter foodlog/{uid}/meta/profile. Ein Leserecht auf
       den Ordner wäre ein Leserecht darauf. Das darf nicht passieren,
       und eine Regel, die es "eigentlich" ausschliesst, ist schwächer
       als ein Pfad, auf dem es gar nichts zu holen gibt.
     · "Nicht mehr teilen" müsste ein Feld an hunderten alten
       Dokumenten umschreiben. Eine eigene Sammlung wirft man weg.
     · Ein Trainer soll nie in der Lage sein, aus Versehen etwas
       Persönliches zu lesen, weil eine Abfrage anders gefiltert war.

   Darum:

       groups/{gid}/essen/{uid}__{datum}     ein Tag, ein Mensch
       groups/{gid}/essenFreigabe/{uid}      teilt mit — ja oder nein

   Dasselbe Muster wie groups/{gid}/protokoll (Falle 26): die Kennung
   trägt die uid, die Regel liest sie aus der Kennung, und die Leitung
   darf auflisten. Nichts Persönliches liegt auf diesem Weg.

   ── Was NICHT hier steht ──────────────────────────────────────────
   Gewicht, Ziel, Richtwert. Der Tagesbedarf ist eine persönliche
   Angabe; die Trainerin sieht, was gegessen wurde, nicht, was jemand
   wiegt. Wer das teilen will, sagt es der Trainerin selbst.
   ══════════════════════════════════════════════════════════════════ */

/* ── Mahlzeiten ────────────────────────────────────────────────────
   Gespeichert wird der Schlüssel, nicht das Wort. Der alte Tracker
   legte '🌅 Frühstück' ins Dokument — in sieben Sprachen wäre das
   sieben verschiedene Mahlzeiten. */
export const MAHLZEITEN = Object.freeze([
  Object.freeze({ key: 'fruehstueck', i18n: 'fd.fruehstueck', de: 'Frühstück' }),
  Object.freeze({ key: 'mittag', i18n: 'fd.mittag', de: 'Mittagessen' }),
  Object.freeze({ key: 'abend', i18n: 'fd.abend', de: 'Abendessen' }),
  Object.freeze({ key: 'snack', i18n: 'fd.snack', de: 'Snack' }),
]);

export const MAHLZEIT_KEYS = Object.freeze(MAHLZEITEN.map(m => m.key));

/** Die Mahlzeit, die zur Uhrzeit passt — vorgewählt, frei änderbar. */
export function mahlzeitNachUhr(stunde) {
  const h = Number(stunde);
  if (h >= 5 && h < 11) return 'fruehstueck';
  if (h >= 11 && h < 15) return 'mittag';
  if (h >= 17 && h < 22) return 'abend';
  return 'snack';
}

/** Der alte Tracker speicherte das deutsche Wort samt Emoji. */
export function mahlzeitSchluessel(wert) {
  const roh = String(wert ?? '').toLowerCase();
  if (MAHLZEIT_KEYS.includes(roh)) return roh;
  if (roh.includes('frühstück') || roh.includes('fruehstueck')) return 'fruehstueck';
  if (roh.includes('mittag')) return 'mittag';
  if (roh.includes('abend')) return 'abend';
  return 'snack';
}

/* ── Grenzen ───────────────────────────────────────────────────────
   Dieselben Zahlen stehen in firestore.rules. Sie sind nicht dazu da,
   den Menschen einzuschränken — 40 Mahlzeiten an einem Tag isst
   niemand —, sondern damit ein Dokument nicht unbegrenzt wächst. */
export const MAHLZEITEN_MAX = 40;
export const ZUTATEN_MAX = 30;
export const NAME_MAX = 80;
export const GRAMM_MAX = 5000;
export const TAGE_MAX = 62;

export const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/* ── Rechnen ───────────────────────────────────────────────────────
   Die eine Nährwertrechnung der App. Der Food Tracker rechnete sie
   bis v.35.72.0 in seinem eigenen Modul; jetzt rufen beide hierher.

   `finde` ist findFood aus foods.js — als Parameter, damit dieses
   Modul die Tabelle nicht laden muss und ein Test mit drei erfundenen
   Lebensmitteln auskommt. */
export function naehrwerte(zutaten, finde) {
  const summe = {
    kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0,
    micros: [], unbekannt: [],
  };
  const gesehen = new Set();
  for (const z of zutaten || []) {
    const name = String(z?.name ?? '').trim();
    const g = Number(z?.g ?? z?.grams ?? 0);
    if (!name || !(g > 0)) continue;
    const food = z?.food ?? finde?.(name) ?? null;
    if (!food) { summe.unbekannt.push(name); continue; }
    const anteil = g / 100;
    summe.kcal += (food.kcal || 0) * anteil;
    summe.protein += (food.protein || 0) * anteil;
    summe.carbs += (food.carbs || 0) * anteil;
    summe.fat += (food.fat || 0) * anteil;
    summe.fibre += (food.fibre || 0) * anteil;
    for (const m of food.micros || []) if (!gesehen.has(m)) { gesehen.add(m); summe.micros.push(m); }
  }
  return summe;
}

const NAEHRWERTE = ['kcal', 'protein', 'carbs', 'fat', 'fibre'];

/** Eine Zahl, wie sie ins Dokument geht: nie NaN, nie unendlich. */
function zahl(wert, stellen = 1) {
  const n = Number(wert);
  if (!Number.isFinite(n) || n < 0) return 0;
  const faktor = 10 ** stellen;
  return Math.round(n * faktor) / faktor;
}

/** Die Summe mehrerer Mahlzeiten — für den Tag und fürs Dashboard. */
export function summe(mahlzeiten) {
  const raus = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  for (const m of mahlzeiten || []) {
    for (const feld of NAEHRWERTE) raus[feld] += Number(m?.[feld]) || 0;
  }
  for (const feld of NAEHRWERTE) raus[feld] = zahl(raus[feld]);
  return raus;
}

/* Eine Mengenangabe von einer Packung: "500 g", "1 kg", "250ml", "2,5 dl".
   Alles, was ausserhalb von 10 g bis 5 kg liegt, ist keine Packung,
   sondern ein Lesefehler — dann lieber nichts vorschlagen als 0,3 g. */
export function parseMenge(text) {
  if (!text) return null;
  const m = String(text).replace(',', '.').match(/([\d.]+)\s*(kg|g|l|dl|cl|ml)?/i);
  if (!m) return null;
  let wert = parseFloat(m[1]);
  if (!Number.isFinite(wert)) return null;
  const einheit = (m[2] || 'g').toLowerCase();
  if (einheit === 'kg' || einheit === 'l') wert *= 1000;
  if (einheit === 'dl') wert *= 100;
  if (einheit === 'cl') wert *= 10;
  return (wert >= 10 && wert <= GRAMM_MAX) ? wert : null;
}

/* ── Der Tag als Dokument ──────────────────────────────────────────*/

export const tagId = (uid, datum) => `${uid}__${datum}`;
export const uidVonTagId = id => String(id ?? '').split('__')[0] || '';
export const datumVonTagId = id => String(id ?? '').split('__')[1] || '';

/** Eine Zutat so, wie sie ins Dokument darf. */
export function zutatSauber(z) {
  return {
    name: String(z?.name ?? '').trim().slice(0, NAME_MAX),
    g: Math.min(GRAMM_MAX, Math.max(1, Math.round(Number(z?.g ?? z?.grams) || 0))),
  };
}

/** Eine Mahlzeit so, wie sie ins Dokument darf — samt eigener Summe. */
export function mahlzeitSauber(m, finde) {
  const zutaten = (m?.zutaten || [])
    .map(zutatSauber)
    .filter(z => z.name && z.g > 0)
    .slice(0, ZUTATEN_MAX);
  const werte = m?.kcal == null ? naehrwerte(zutaten, finde) : m;
  const raus = {
    id: String(m?.id ?? '').slice(0, 24) || null,
    mahlzeit: mahlzeitSchluessel(m?.mahlzeit),
    zutaten,
  };
  for (const feld of NAEHRWERTE) raus[feld] = zahl(werte?.[feld]);
  return raus;
}

/**
 * Der ganze Tag, wie er unter groups/{gid}/essen liegt.
 *
 * Bewusst EIN Dokument je Mensch und Tag statt eines je Mahlzeit: die
 * Leitung fragt einen Zeitraum ab, und ein Tag ist die Einheit, in der
 * sie denkt ("wer hat gestern nichts eingetragen?"). Ein Dokument je
 * Mahlzeit hiesse fünfmal so viele Lesevorgänge für dieselbe Antwort.
 */
export function tagPayload(uid, datum, mahlzeiten, finde) {
  if (!uid || !ISO_TAG.test(String(datum))) throw new Error('essen: uid und Datum nötig');
  const liste = (mahlzeiten || [])
    .map(m => mahlzeitSauber(m, finde))
    .filter(m => m.zutaten.length)
    .slice(0, MAHLZEITEN_MAX);
  return {
    uid, datum,
    mahlzeiten: liste,
    ...summe(liste),
    stand: Date.now(),
  };
}

/** Ist an diesem Tag überhaupt etwas erfasst? */
export const tagHatEintrag = tag => !!(tag?.mahlzeiten?.length);

/* ── Zeitraum ──────────────────────────────────────────────────────*/

/** Alle ISO-Tage von…bis, einschliesslich. Nie mehr als TAGE_MAX. */
export function zeitraumTage(von, bis) {
  if (!ISO_TAG.test(String(von)) || !ISO_TAG.test(String(bis))) return [];
  const start = new Date(`${von}T12:00:00`);
  const ende = new Date(`${bis}T12:00:00`);
  if (ende < start) return [];
  const raus = [];
  for (let d = start; d <= ende && raus.length < TAGE_MAX; d.setDate(d.getDate() + 1)) {
    raus.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return raus;
}

/* ── Was die Leitung sieht ─────────────────────────────────────────
   Eine Zeile je Mensch. Drei Zustände, und sie bedeuten nicht
   dasselbe:

     geteilt       hat für den Zeitraum etwas erfasst
     leer          teilt mit, hat aber nichts erfasst
     nichtGeteilt  teilt nicht — und das ist keine Aussage darüber,
                   ob jemand gegessen oder etwas erfasst hat

   Die dritte Zeile ist der Grund, warum es sie gibt. "Keine Einträge"
   über jemandem, der einfach nicht teilt, wäre eine Behauptung über
   sein Verhalten, die niemand aufstellen darf. */
export const STATUS = Object.freeze({ geteilt: 'geteilt', leer: 'leer', nichtGeteilt: 'nichtGeteilt' });

export function dashboardZeilen({ mitglieder = [], freigaben = {}, tage = [], von = '', bis = '' } = {}) {
  const spanne = new Set(zeitraumTage(von, bis));
  const proUid = new Map();
  for (const tag of tage) {
    if (!tag?.uid || !spanne.has(tag.datum)) continue;
    if (!tagHatEintrag(tag)) continue;
    if (!proUid.has(tag.uid)) proUid.set(tag.uid, []);
    proUid.get(tag.uid).push(tag);
  }

  const zeilen = mitglieder.map(m => {
    const eigene = (proUid.get(m.uid) || []).sort((a, b) => a.datum.localeCompare(b.datum));
    const teilt = freigaben?.[m.uid] === true;
    return {
      uid: m.uid,
      name: m.name || m.uid,
      rolle: m.rolle || 'mitglied',
      teilt,
      tage: teilt ? eigene : [],
      status: !teilt ? STATUS.nichtGeteilt : (eigene.length ? STATUS.geteilt : STATUS.leer),
      ...(teilt ? summe(eigene) : { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }),
    };
  });

  /* Wer teilt, steht oben — sonst sucht die Trainerin die drei
     Athleten mit Daten zwischen zwanzig ohne. */
  const rang = z => (z.status === STATUS.geteilt ? 0 : z.status === STATUS.leer ? 1 : 2);
  zeilen.sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'de'));
  return zeilen;
}

/* ── Wer darf was ──────────────────────────────────────────────────
   Dieselben Entscheidungen wie in firestore.rules, hier als Funktion.
   Sie ist NICHT die Sicherung — das sind die Regeln — sondern das,
   woran die Oberfläche sich hält und ein Test sie misst. Weichen beide
   voneinander ab, ist eines von beiden falsch, und man sieht es.

   `rolle` ist leer, wer nicht (mehr) in der Gruppe ist. Genau das ist
   der Fall "aus der Gruppe entfernt": das Mitgliedsdokument ist weg,
   inGroup() ist falsch, und damit fällt jeder Zweig. */
const LEITET = new Set(['head', 'staff']);

export function darfEssen({ angemeldet = false, rolle = '', uid = '', zielUid = '', aktion = 'get' } = {}) {
  if (!angemeldet || !uid || !rolle) return false;
  const selbst = uid === zielUid;
  const leitung = LEITET.has(rolle);
  switch (aktion) {
    case 'get': return selbst || leitung;
    /* Auflisten heisst: viele Dokumente auf einmal. Ein Athlet darf das
       nur für sich; die Abfrage muss dafür nach seiner uid filtern.
       Ohne diese Trennung bekäme "alle Tage der Gruppe" eine Antwort. */
    case 'list': return selbst || leitung;
    /* Schreiben nur man selbst. Die Leitung liest — sie korrigiert
       nichts, und sie trägt nichts nach. Ein Ernährungsprotokoll, das
       der Trainer ändern kann, ist keine Auskunft mehr. */
    case 'create':
    case 'update': return selbst;
    /* Löschen: die eigenen Einträge. Die Leitung nicht — sie soll
       einen Verlauf nicht wegräumen können, den jemand geteilt hat. */
    case 'delete': return selbst;
    default: return false;
  }
}

/** Dasselbe für die Freigabe selbst: lesen Leitung und man selbst, schreiben nur man selbst. */
export function darfFreigabe({ angemeldet = false, rolle = '', uid = '', zielUid = '', aktion = 'get' } = {}) {
  if (!angemeldet || !uid || !rolle) return false;
  const selbst = uid === zielUid;
  const leitung = LEITET.has(rolle);
  if (aktion === 'get') return selbst || leitung;
  if (aktion === 'list') return leitung;
  return selbst;
}

/* ── Ist der Bereich überhaupt an? ─────────────────────────────────
   Essen ist ein Bereich der Gruppe wie Termine oder Training: die
   Leitung schaltet ihn ein. Ohne das gibt es ihn in dieser Gruppe
   nicht — auch nicht für die, die schon einmal geteilt haben.

   Und nur dort, wo er einen Sinn hat: ein Kader und ein Verein
   trainieren, eine Familie isst zusammen, ohne dass jemand darüber
   Buch führt. Michel hat Essen in den Vorgaben der Familie bewusst
   nicht (VORGABE_BEREICHE in groups.js: "ein Kader nichts vom Essen"
   — umgekehrt gilt es genauso). */
export const ESSEN_ARTEN = Object.freeze(['kader', 'organisation']);
export const essenMoeglich = art => ESSEN_ARTEN.includes(String(art || ''));
export const essenAn = gruppe => essenMoeglich(gruppe?.art) && gruppe?.bereiche?.essen === true;

/* ── Die Einwilligung ──────────────────────────────────────────────
   Bevor der erste Eintrag geteilt wird, muss dastehen, WER ihn sieht —
   nicht "die Gruppe", sondern die Trainer mit Namen. Eine Zusage zu
   etwas, das man nicht gelesen hat, ist keine.

   Die Fassung steht mit im Dokument. Ändert sich, wer sehen darf, oder
   ändert sich der Text, wird neu gefragt statt stillschweigend
   weitergeteilt. */
export const EINWILLIGUNG = 1;

/** Die Namen, die in der Frage stehen müssen: alle, die die Gruppe leiten. */
export function sehendePersonen(mitglieder = []) {
  return mitglieder
    .filter(m => LEITET.has(m?.rolle))
    .map(m => m?.name || m?.uid)
    .filter(Boolean);
}

/** Gilt die Zusage noch? */
export function freigabeGilt(freigabe) {
  return freigabe?.an === true && Number(freigabe?.fassung || 0) >= EINWILLIGUNG;
}

/** Muss (neu) gefragt werden, bevor geteilt wird? */
export function mussFragen(freigabe) {
  return !freigabeGilt(freigabe);
}
