/* Die Startdaten der Attrappe — siehe firebase-firestore.js.

   Ein Kader, wie ihn Michel führt: Michel leitet, Timothy und Lea sind
   dabei. Termine liegen um HEUTE herum, damit die Woche beim Öffnen
   etwas zeigt; der Plan ist Timothys echte KW 31 (dev/fixtures), einmal
   so, wie die Excel sie datiert, und einmal in die laufende Woche
   verschoben und für alle.

   Wer die Daten ändert, erhöht VERSION — dann setzt sich jeder Browser
   beim nächsten Laden auf diese Startdaten zurück. Von Hand:
   attrappeZuruecksetzen() in der Konsole. */

export const VERSION = 11;

export const KONTEN = {
  michel: { email: 'michel@firn.test', name: 'Michel van Zanten' },
  timo: { email: 'timo@firn.test', name: 'Timothy van Zanten' },
  lea: { email: 'lea@firn.test', name: 'Lea Müller' },
  /* Familie, in keiner Gruppe — nur im TVZA-Kreis (v.35.48.0). */
  anna: { email: 'anna@firn.test', name: 'Anna van Zanten' },
};

const pad = n => String(n).padStart(2, '0');
const tag = (versatz = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + versatz);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const zeit = (versatz = 0) => ({ __ts: Date.now() + versatz * 864e5 });
const montag = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return tag(-((d.getDay() + 6) % 7)); };

const ALLE_MODULE = { ski: true, food: true, watch: true, trip: true, weather: true, dm: true, matura: true, maturatracker: true, training: true, projects: true };

export async function startDaten() {
  const [{ parseProgram }, grid] = await Promise.all([
    import('/assets/js/training-parser.js'),
    fetch('/dev/fixtures/kw31-grid.json').then(r => r.json()),
  ]);
  const kw31 = parseProgram(grid);

  /* Dieselbe Woche in die laufende verschoben — sonst stünde heute nichts. */
  const start = montag();
  const verschieben = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const jetzt = JSON.parse(JSON.stringify(kw31));
  jetzt.days.forEach((d, i) => { d.date = verschieben(start, i); });
  jetzt.dateRange = { raw: '', start, end: verschieben(start, 6) };

  const profil = (uid, extra = {}) => ({
    displayName: KONTEN[uid].name, email: KONTEN[uid].email, lang: null, ...extra,
  });

  return {
    'config/tvza': { timoUid: 'michel', requireEmailVerification: false },

    'users/michel': profil('michel', { isTimo: true, modules: { ...ALLE_MODULE }, allowedModules: { ...ALLE_MODULE } }),
    'users/timo': profil('timo', {
      isTimo: false,
      allowedModules: { training: true, ski: true, weather: true, matura: true, maturatracker: true },
      modules: { training: true, ski: true, weather: true, matura: true, maturatracker: false },
      kreis: true,
    }),
    /* Lea ist dem Kader beigetreten, wie jedes neue Konto: TVZA nicht frei,
       nicht im Kreis. Sie sieht Firn und von TVZA nichts. */
    'users/lea': profil('lea', {
      isTimo: false,
      allowedModules: { training: true, ski: true, weather: true, food: false, watch: false, matura: false, maturatracker: false, projects: false },
      modules: { training: true },
    }),
    'users/anna': profil('anna', {
      isTimo: false, kreis: true,
      /* Training ist fuer Anna frei und an (v.35.74.0): sie ist in
         KEINER Gruppe und baut sich ihre Woche selbst. */
      allowedModules: { food: true, watch: true, weather: true, training: true, ski: false, matura: false, maturatracker: false, projects: false },
      modules: { food: true, watch: true, training: true },
    }),
    'kreis/michel': { seit: zeit(-90) },
    'kreis/timo': { seit: zeit(-90) },
    'kreis/anna': { seit: zeit(-30) },

    'groups/g1': {
      name: 'BSV Perspektivkader', art: 'kader', headUid: 'michel',
      /* Essen ist im Kader eingeschaltet (v.35.72.0) — Timothy teilt,
         Lea nicht. Genau daran sieht man den Unterschied zwischen
         "kein Eintrag" und "teilt nicht". */
      bereiche: { termine: true, training: true, video: false, chat: true, essen: true },
      inviteToken: 'attrappe', createdAt: zeit(-60),
      /* Der Assistent der Gruppe ist freigeschaltet (v.35.55.0) und hat
         einen Namen — Lea (nicht im Kreis) sieht nur ihn. */
      ki: true, assistent: { name: 'Coach Maxi', anweisung: 'Trainings sind meistens in Malbun.' },
    },
    'groups/g1/members/michel': { uid: 'michel', rolle: 'head', seit: zeit(-60) },
    'groups/g1/members/timo': { uid: 'timo', rolle: 'mitglied', seit: zeit(-50) },
    'groups/g1/members/lea': { uid: 'lea', rolle: 'mitglied', seit: zeit(-40) },

    'groups/g1/events/t1': { art: 'training', titel: 'Kondi Halle', von: tag(1), zeit: '18:00', ort: 'Malbun', erstelltVon: 'michel', createdAt: zeit(-3) },
    /* Ein Lager mit Programm (v.35.50.0: Termine tragen, was vorher nur die Reise konnte). */
    'groups/g1/events/t2': {
      art: 'lager', titel: 'Herbstlager Saas-Fee', von: tag(4), bis: tag(7), ort: 'Saas-Fee', createdBy: 'michel', createdAt: zeit(-3),
      notiz: 'Treffpunkt Bahnhof Visp.',
      programm: [
        { id: 'l1', date: tag(4), time: '07:00', title: 'Abfahrt Buchs' },
        { id: 'l2', date: tag(4), time: '14:00', title: 'Freies Fahren' },
        { id: 'l3', date: tag(5), time: '08:30', title: 'Riesenslalom-Training' },
        { id: 'l4', date: tag(7), time: '16:00', title: 'Heimreise' },
      ],
      abfahrten: { timo: { zeit: '06:30', ort: 'Bahnhof Buchs' }, lea: { zeit: '06:45', ort: 'Sargans' }, michel: { zeit: '06:30', ort: 'Bahnhof Buchs' } },
      packliste: [{ id: 'k1', name: 'Skischuhe' }, { id: 'k2', name: 'RS-Ski' }, { id: 'k3', name: 'Yogamatte' }, { id: 'k4', name: 'Aussen-Turnschuhe' }],
    },
    'groups/g1/events/t3': { art: 'rennen', titel: 'FIS RS Pitztal', von: tag(18), zeit: '09:30', disziplin: 'RS', erstelltVon: 'michel', createdAt: zeit(-3) },

    /* Essen im Kader: Timothy hat zugesagt und zwei Tage erfasst,
       Lea hat nicht zugesagt. Michel sieht als Kopf beides — und von
       Lea nur, DASS sie nicht teilt. */
    'groups/g1/essenFreigabe/timo': { uid: 'timo', an: true, fassung: 1, seit: zeit(-14) },
    'groups/g1/essenFreigabe/lea': { uid: 'lea', an: false, fassung: 0, seit: zeit(-14) },
    [`groups/g1/essen/timo__${tag(0)}`]: {
      uid: 'timo', datum: tag(0), stand: Date.now(),
      kcal: 1075, protein: 55.4, carbs: 148.3, fat: 29.2, fibre: 14.6,
      mahlzeiten: [
        { id: 'e1', mahlzeit: 'fruehstueck', zutaten: [{ name: 'Haferflocken', g: 80 }, { name: 'Vollmilch', g: 250 }],
          kcal: 460, protein: 19, carbs: 59, fat: 14.6, fibre: 8 },
        { id: 'e2', mahlzeit: 'mittag', zutaten: [{ name: 'Pasta / Teigwaren (gekocht)', g: 300 }, { name: 'Pouletbrust', g: 150 }],
          kcal: 630, protein: 51, carbs: 90, fat: 6, fibre: 6 },
      ],
    },
    [`groups/g1/essen/timo__${tag(-1)}`]: {
      uid: 'timo', datum: tag(-1), stand: Date.now() - 864e5,
      kcal: 745, protein: 30, carbs: 96, fat: 25, fibre: 9,
      mahlzeiten: [
        { id: 'e3', mahlzeit: 'abend', zutaten: [{ name: 'Reis (gekocht)', g: 250 }, { name: 'Lachs', g: 150 }],
          kcal: 745, protein: 30, carbs: 96, fat: 25, fibre: 9 },
      ],
    },

    'groups/g1/plaene/p1': { titel: 'KW 31 · TW 12', fuer: 'timo', json: JSON.stringify(kw31), erstelltVon: 'michel', erstelltAm: zeit(-10) },
    'groups/g1/plaene/p2': { titel: 'Diese Woche', fuer: 'alle', json: JSON.stringify(jetzt), erstelltVon: 'michel', erstelltAm: zeit(-1) },
    'groups/g1/events/t4': { art: 'training', titel: 'Techniktraining Gletscher', von: tag(2), zeit: '07:30', ort: 'Hintertux', erstelltVon: 'michel', createdAt: zeit(-2) },

    /* Die Familie — eine Gruppe der Art familie, mit einer Reise samt
       Programm (v.35.49.0: damit der Kalender etwas zu zeigen hat). */
    'groups/g2': {
      name: 'Familie van Zanten', art: 'familie', headUid: 'michel',
      bereiche: { termine: true, projekte: true, chat: true },
      inviteToken: 'familie', createdAt: zeit(-200),
    },
    'groups/g2/members/michel': { uid: 'michel', rolle: 'head', seit: zeit(-200) },
    'groups/g2/members/timo': { uid: 'timo', rolle: 'mitglied', seit: zeit(-200) },
    'groups/g2/members/anna': { uid: 'anna', rolle: 'mitglied', seit: zeit(-200) },
    'groups/g2/events/f1': { art: 'training', bezeichnung: 'Geburtstag', titel: 'Grosis Geburtstag', von: tag(3), zeit: '12:00', ort: 'Vaduz', erstelltVon: 'michel', createdAt: zeit(-5) },
    /* Eine Feier (v.35.75.0) — die vierte Terminart, die es nur bei
       Familie und Freunden gibt: mit Mitbringliste und Gastlink, sonst
       ein Termin der Gruppe wie jeder andere. */
    'groups/g2/events/f2': {
      art: 'feier', titel: 'Grillabend bei Anna', von: tag(5), zeit: '18:30', ort: 'Garten bei Anna',
      notiz: 'Wir grillen auch bei Regen — es gibt ein Vordach.',
      createdBy: 'michel', createdAt: zeit(-2),
      packliste: [{ id: 'm1', name: 'Salat' }, { id: 'm2', name: 'Getränke' }, { id: 'm3', name: 'Musikbox' }],
      gastToken: 'feier-token',
    },
    'groups/g2/events/f2/zusagen/timo': { uid: 'timo', antwort: 'ja', am: zeit(-1) },
    'groups/g2/events/f2/zusagen/anna': { uid: 'anna', antwort: 'vielleicht', am: zeit(-1) },
    'groups/g2/events/f2/gepackt/timo': { uid: 'timo', erledigt: { m2: true }, eigene: [], am: zeit(-1) },
    'trips/r1': {
      name: 'Herbstferien Toskana', familyId: 'g2', destination: 'Castiglione', startDate: tag(24), endDate: tag(30),
      notes: 'Ferienhaus ab 15 Uhr.', createdBy: 'michel', createdAt: zeit(-20), guestToken: 'reise-token',
      itinerary: [
        { id: 'i1', date: tag(24), time: '06:30', title: 'Abfahrt Schaan' },
        { id: 'i2', date: tag(24), time: '15:00', title: 'Schlüssel abholen' },
        { id: 'i3', date: tag(26), time: '10:00', title: 'Siena, Führung' },
      ],
    },

    /* Eine Aufgabe an der Reise — die Leitung übernimmt beides beim Öffnen. */
    'activities/a1': { tripId: 'r1', name: 'Vignette kaufen', done: false },

    /* Annas eigener Plan (v.35.74.0) — sie ist in keiner Gruppe und
       hat trotzdem eine Trainingswoche. Genau das ist der Punkt. */
    'users/anna/trainingPrograms/ap1': {
      schema: 1, id: 'ap1', updatedAt: zeit(-2),
      json: JSON.stringify({
        schema: 1, eigen: true, name: 'Meine Woche',
        dateRange: { raw: '', start: montag(), end: verschieben(montag(), 6) },
        days: ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'].map((key, i) => ({
          key,
          name: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][i],
          date: verschieben(montag(), i),
          slots: [
            { key: 'vormittag', name: 'Vormittag', items: [] },
            { key: 'nachmittag', name: 'Nachmittag', items: [] },
            {
              key: 'abend', name: 'Abend',
              items: i === 1 || i === 3 ? [{ title: 'Kraft zuhause', unit: 'uAnna' + i, time: '19:00' }] : [],
            },
          ],
        })),
        units: {
          uAnna1: {
            id: 'uAnna1', title: 'Kraft zuhause', kind: 'strength',
            items: [
              { key: 'uAnna1-1-kniebeuge', slug: '1-kniebeuge', no: '1', name: 'Kniebeuge', alt: 'Füsse schulterbreit, Rücken gerade.', video: '', mode: 'sets', sets: [{ label: '1. Satz', reps: '8', weight: '' }, { label: '2. Satz', reps: '8', weight: '' }, { label: '3. Satz', reps: '8', weight: '' }], params: [{ label: 'Gerät', value: 'Langhantel' }], lines: [], pause: '120-180 Sec', tut: '', history: [] },
              { key: 'uAnna1-2-unterarmstuetz', slug: '2-unterarmstuetz', no: '2', name: 'Unterarmstütz', alt: 'Gerade Linie von Kopf bis Ferse.', video: '', mode: 'timed', sets: [], params: [{ label: 'Dauer', value: '45 Sec' }, { label: 'Runden', value: '3' }], lines: [], pause: '', tut: '', history: [] },
            ],
          },
          uAnna3: {
            id: 'uAnna3', title: 'Kraft zuhause', kind: 'strength',
            items: [
              { key: 'uAnna3-1-ausfallschritt', slug: '1-ausfallschritt', no: '1', name: 'Ausfallschritt', alt: 'Grosser Schritt, hinteres Knie tief.', video: '', mode: 'sets', sets: [{ label: '1. Satz', reps: '10/Seite', weight: '' }, { label: '2. Satz', reps: '10/Seite', weight: '' }], params: [], lines: [], pause: '90 Sec', tut: '', history: [] },
            ],
          },
        },
      }),
    },
    /* Und eine eigene Uebung in ihrer Bibliothek. */
    'users/anna/uebungen/au1': {
      id: 'au1', name: 'Nordic Curl', kategorie: 'kraft', anweisung: 'Langsam ablassen, mit den Händen abfangen.',
      geraet: 'Partner oder Bank', modus: 'sets', saetze: 3, reps: '6', dauer: '', pause: '120 Sec',
      video: '', updatedAt: zeit(-2),
    },

    /* Timothys eigene Termine und Erinnerungen — zwei überschneiden sich. */
    'calendarDays/c1': { ownerUid: 'timo', title: 'Zahnarzt', date: tag(2), startTime: '10:00', endTime: '11:00', location: 'Schaan' },
    'calendarDays/c2': { ownerUid: 'timo', title: 'Physio', date: tag(2), startTime: '10:30', endTime: '11:15' },
    'calendarDays/c3': { ownerUid: 'timo', title: 'Matura-Abgabe Entwurf', date: tag(10) },
    'users/timo/reminders/e1': { title: 'Lizenz verlängern', date: tag(-2), completed: false, createdAt: zeit(-9) },
    'users/timo/reminders/e2': { title: 'Wachs kaufen', date: tag(0), time: '17:00', completed: false, createdAt: zeit(-1) },
    'users/timo/reminders/e3': { title: 'Startnummer abholen', date: tag(0), completed: true, createdAt: zeit(-4) },
  };
}
