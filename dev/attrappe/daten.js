/* Die Startdaten der Attrappe — siehe firebase-firestore.js.

   Ein Kader, wie ihn Michel führt: Michel leitet, Timothy und Lea sind
   dabei. Termine liegen um HEUTE herum, damit die Woche beim Öffnen
   etwas zeigt; der Plan ist Timothys echte KW 31 (dev/fixtures), einmal
   so, wie die Excel sie datiert, und einmal in die laufende Woche
   verschoben und für alle.

   Wer die Daten ändert, erhöht VERSION — dann setzt sich jeder Browser
   beim nächsten Laden auf diese Startdaten zurück. Von Hand:
   attrappeZuruecksetzen() in der Konsole. */

export const VERSION = 7;

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
      allowedModules: { food: true, watch: true, weather: true, training: false, ski: false, matura: false, maturatracker: false, projects: false },
      modules: { food: true, watch: true },
    }),
    'kreis/michel': { seit: zeit(-90) },
    'kreis/timo': { seit: zeit(-90) },
    'kreis/anna': { seit: zeit(-30) },

    'groups/g1': {
      name: 'BSV Perspektivkader', art: 'kader', headUid: 'michel',
      bereiche: { termine: true, training: true, video: false, chat: true },
      inviteToken: 'attrappe', createdAt: zeit(-60),
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

    /* Timothys eigene Termine und Erinnerungen — zwei überschneiden sich. */
    'calendarDays/c1': { ownerUid: 'timo', title: 'Zahnarzt', date: tag(2), startTime: '10:00', endTime: '11:00', location: 'Schaan' },
    'calendarDays/c2': { ownerUid: 'timo', title: 'Physio', date: tag(2), startTime: '10:30', endTime: '11:15' },
    'calendarDays/c3': { ownerUid: 'timo', title: 'Matura-Abgabe Entwurf', date: tag(10) },
    'users/timo/reminders/e1': { title: 'Lizenz verlängern', date: tag(-2), completed: false, createdAt: zeit(-9) },
    'users/timo/reminders/e2': { title: 'Wachs kaufen', date: tag(0), time: '17:00', completed: false, createdAt: zeit(-1) },
    'users/timo/reminders/e3': { title: 'Startnummer abholen', date: tag(0), completed: true, createdAt: zeit(-4) },
  };
}
