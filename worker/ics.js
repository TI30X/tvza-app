/* ══════════════════════════════════════════════════════════════════
   iCalendar — die Abo-Adresse einer Gruppe.

   Das ist der Weg, auf dem ein Verein eine App wirklich einführt:
   Eltern abonnieren den Kaderkalender in Apple Calendar und sehen jede
   Änderung, OHNE ein Konto bei Firn zu haben. Kein Einladungsmail,
   kein Passwort, keine Installation — eine Adresse.

   ── Warum das nicht im Browser gehen kann ─────────────────────────
   Ein Abo ist ein GET auf eine Adresse, die text/calendar liefert.
   Eine statische Seite auf GitHub Pages kann das nicht: sie kann keine
   Kopfzeile setzen und keinen Firestore-Lesezugriff ohne Anmeldung
   machen. Darum der Worker.

   ── Was hier leicht falsch wird ───────────────────────────────────
   Drei Dinge, an denen ICS-Erzeugung regelmässig scheitert, und die
   deshalb Tests haben:

     1. DTEND ist AUSSCHLIESSEND. Ein Lager vom 3. bis 10. Oktober
        endet in ICS am 11. Oktober. Wer das übersieht, dessen Lager
        ist im Kalender einen Tag zu kurz — jedes Mal.

     2. Zeilen werden nach 75 Oktetten umgebrochen, mit einem
        Leerzeichen am Anfang der Folgezeile. Ohne das Falten zeigen
        strenge Parser gar nichts an, statt sich zu beschweren.

     3. Text muss maskiert werden: Backslash, Semikolon, Komma und
        Zeilenumbruch. Ein Titel mit Komma zerreisst sonst das Feld.

   ── Reines Modul ──────────────────────────────────────────────────
   Kein Netz, keine Firestore-Abhängigkeit, keine Worker-Globals. Nur
   Daten hinein, Text heraus — damit sich die drei Punkte oben prüfen
   lassen, ohne etwas auszurollen.
   ══════════════════════════════════════════════════════════════════ */

/* Die Termine der Gruppe stehen in lokaler Zeit ohne Zonenangabe: das
   Modell speichert 'JJJJ-MM-TT' und 'HH:MM' (siehe termine.js). Für
   ICS braucht ein Zeitpunkt eine Zone, sonst rutscht ein Training um
   eine oder zwei Stunden. Ein Liechtensteiner Kader trainiert in
   Europe/Zurich, also wird diese Zone mitgeliefert — vollständig, mit
   den EU-Umstellungsregeln, damit auch der Winter stimmt. */
export const ZONE = 'Europe/Zurich';

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${ZONE}`,
  'X-LIC-LOCATION:Europe/Zurich',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/* ── Text ──────────────────────────────────────────────────────────*/

/** RFC 5545 §3.3.11: Backslash, Semikolon, Komma, Zeilenumbruch. */
export function maskiere(wert) {
  return String(wert ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1: höchstens 75 Oktette pro Zeile, Fortsetzung mit einem
 * Leerzeichen am Zeilenanfang.
 *
 * Gezählt werden OKTETTE, nicht Zeichen — ein Umlaut braucht zwei. Wer
 * nach Zeichen faltet, produziert bei einem Titel voller Umlaute
 * Zeilen, die zu lang sind, und ein strenger Parser zeigt dann gar
 * nichts an.
 */
export function falte(zeile) {
  const bytes = new TextEncoder().encode(zeile);
  if (bytes.length <= 75) return zeile;

  const teile = [];
  let rest = zeile;
  let grenze = 75;

  while (rest) {
    if (new TextEncoder().encode(rest).length <= grenze) { teile.push(rest); break; }

    /* Zeichenweise vorrücken, bis das Oktett-Budget erreicht ist. So
       wird nie mitten in einem Mehrbyte-Zeichen getrennt. */
    let schnitt = 0;
    let bisher = 0;
    for (const zeichen of rest) {
      const laenge = new TextEncoder().encode(zeichen).length;
      if (bisher + laenge > grenze) break;
      bisher += laenge;
      schnitt += zeichen.length;
    }
    if (schnitt === 0) schnitt = 1;   // Notausgang, sollte nie greifen

    teile.push(rest.slice(0, schnitt));
    rest = rest.slice(schnitt);
    grenze = 74;   // die Folgezeile beginnt mit einem Leerzeichen
  }

  return teile.join('\r\n ');
}

/* ── Datum und Zeit ────────────────────────────────────────────────*/

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^\d{2}:\d{2}$/;

const ohneStriche = tag => tag.replace(/-/g, '');

/**
 * Der Tag NACH einem Datum — für DTEND, das ausschliessend ist.
 * Rechnet über UTC-Mittag, damit keine Zeitzone hineinpfuscht.
 */
export function tagDanach(tag) {
  if (!ISO_TAG.test(tag)) return '';
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** "20260903T120000Z" — für DTSTAMP, das immer in UTC steht. */
export function alsUtcStempel(datum = new Date()) {
  return `${datum.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/* ── Ein Termin ────────────────────────────────────────────────────*/

/**
 * @param {object} termin  { id, art, titel, von, bis, zeit, ort, notiz, disziplin }
 * @param {object} kontext { gid, artWort, jetzt }
 * @returns {string[]|null} Zeilen, oder null wenn der Termin unbrauchbar ist
 */
export function alsVEvent(termin, { gid = '', artWort = '', jetzt = new Date() } = {}) {
  if (!termin?.id || !ISO_TAG.test(termin.von || '')) return null;
  const titel = String(termin.titel ?? '').trim();
  if (!titel) return null;

  const mehrtaegig = ISO_TAG.test(termin.bis || '') && termin.bis > termin.von;
  const zeitlich = !mehrtaegig && ZEIT.test(termin.zeit || '');

  const zeilen = [
    'BEGIN:VEVENT',
    /* Die UID muss über Aktualisierungen hinweg dieselbe bleiben, sonst
       legt der Kalender bei jedem Abruf neue Termine an statt die alten
       zu ändern. Darum die Dokument-ID und nicht etwas Errechnetes. */
    `UID:${termin.id}@${gid || 'firn'}`,
    `DTSTAMP:${alsUtcStempel(jetzt)}`,
    `SUMMARY:${maskiere(artWort ? `${titel} (${artWort})` : titel)}`,
  ];

  if (zeitlich) {
    const [stunde, minute] = termin.zeit.split(':');
    const start = `${ohneStriche(termin.von)}T${stunde}${minute}00`;
    zeilen.push(`DTSTART;TZID=${ZONE}:${start}`);
    /* Ohne Endzeit im Modell: zwei Stunden. Das ist die Länge eines
       Trainings und besser als ein Termin ohne Dauer, den manche
       Kalender als ganztägig zeichnen. */
    const ende = new Date(Date.UTC(
      Number(termin.von.slice(0, 4)), Number(termin.von.slice(5, 7)) - 1,
      Number(termin.von.slice(8, 10)), Number(stunde) + 2, Number(minute)));
    zeilen.push(`DTEND;TZID=${ZONE}:${
      ohneStriche(ende.toISOString().slice(0, 10))}T${
      ende.toISOString().slice(11, 13)}${ende.toISOString().slice(14, 16)}00`);
  } else {
    /* Ganztägig. DTEND ist AUSSCHLIESSEND: ein Lager vom 3. bis 10.
       endet in ICS am 11., sonst fehlt der letzte Tag. */
    const letzter = mehrtaegig ? termin.bis : termin.von;
    zeilen.push(`DTSTART;VALUE=DATE:${ohneStriche(termin.von)}`);
    zeilen.push(`DTEND;VALUE=DATE:${ohneStriche(tagDanach(letzter))}`);
  }

  if (termin.ort) zeilen.push(`LOCATION:${maskiere(termin.ort)}`);

  /* Ein abgesagter Termin wird nicht weggelassen, sondern als abgesagt
     gemeldet. Liesse man ihn weg, verschwände er aus dem Kalender des
     Abonnenten, ohne dass jemand es bemerkt — und am Samstag steht
     eine Familie am Lift. STATUS:CANCELLED zeigen Kalender an. */
  if (termin.abgesagt === true) zeilen.push('STATUS:CANCELLED');

  const beschreibung = [
    termin.abgesagt === true
      ? `ABGESAGT${termin.absageGrund ? `: ${termin.absageGrund}` : ''}`
      : '',
    termin.notiz,
    termin.disziplin && `Disziplin: ${termin.disziplin}`,
  ].filter(Boolean).join('\n');
  if (beschreibung) zeilen.push(`DESCRIPTION:${maskiere(beschreibung)}`);

  zeilen.push('END:VEVENT');
  return zeilen;
}

/* ── Der ganze Kalender ────────────────────────────────────────────*/

/**
 * @param {object} optionen { name, gid, termine, artWort, jetzt }
 *   artWort: (art) => string — damit der Worker die Wortwahl der
 *   Gruppenart benutzen kann, ohne termine.js zu importieren.
 */
export function alsKalender({ name = 'Firn', gid = '', termine = [], artWort, jetzt = new Date() } = {}) {
  const kopf = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Firn//Gruppentermine//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${maskiere(name)}`,
    `X-WR-TIMEZONE:${ZONE}`,
    /* Wie oft ein Kalender neu lädt, ist eine Bitte und keine Vorgabe;
       Apple und Google halten sich unterschiedlich daran. Eine Stunde
       ist für einen Trainingsplan reichlich genau. */
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...VTIMEZONE,
  ];

  const koerper = (Array.isArray(termine) ? termine : [])
    .map(t => alsVEvent(t, { gid, artWort: artWort?.(t.art) || '', jetzt }))
    .filter(Boolean)
    .flat();

  /* CRLF, nicht LF: RFC 5545 verlangt es, und manche Parser sind da
     tatsächlich streng. Die Schlusszeile braucht ebenfalls einen
     Umbruch. */
  return [...kopf, ...koerper, 'END:VCALENDAR']
    .map(falte)
    .join('\r\n') + '\r\n';
}
