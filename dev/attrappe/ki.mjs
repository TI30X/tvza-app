/* Der Assistent in der Attrappe — ohne Gemini, ohne Schlüssel.

   dev/server.mjs --attrappe beantwortet POST /__ki hiermit, und die
   Seiten bekommen window.FIRN_KI_BASIS = '/__ki-basis' (siehe VORSPANN).
   Die Antworten sind aus Mustern gebaut, nicht klug — genug, um Pille,
   Karten und Eintragen im Rundgang durchzuklicken. Die Form ist genau
   die des Workers (worker/ki.js): { text, aktionen, stufe, hochUebrig }. */

const plus = (tag, n) => {
  const d = new Date(`${tag}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const wochentag = (tag, ziel) => {           // nächster Wochentag (1 = Montag)
  for (let i = 1; i <= 7; i++) {
    const d = plus(tag, i);
    if (new Date(`${d}T12:00:00`).getDay() === ziel % 7) return d;
  }
  return plus(tag, 7);
};
const uhr = text => {
  const m = /(\d{1,2})(?::(\d{2}))?\s*uhr/i.exec(text);
  return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : '';
};

let hochHeute = { tag: '', n: 0 };

export function kiAttrappe(koerper = {}) {
  const frage = String(koerper.frage || '');
  const f = frage.toLowerCase();
  const k = koerper.kontext || {};
  const heute = k.heute || new Date().toISOString().slice(0, 10);
  if (hochHeute.tag !== heute) hochHeute = { tag: heute, n: 0 };
  const hoch = koerper.hoch === true && hochHeute.n < 3;
  if (hoch) hochHeute.n += 1;
  const rahmen = { stufe: hoch ? 'hoch' : 'normal', hochUebrig: 3 - hochHeute.n,
    hochAufgebraucht: koerper.hoch === true && !hoch };

  if (/erinner/.test(f)) {
    const titel = (/an[s]?\s+(?:das\s+|den\s+|die\s+)?(.+)$/i.exec(frage)?.[1] || 'Packen').replace(/[.!?]$/, '');
    return { ...rahmen, text: 'Hier ist mein Vorschlag:', aktionen: [{ name: 'erinnerung_eintragen',
      args: { titel: titel.charAt(0).toUpperCase() + titel.slice(1), datum: /morgen/.test(f) ? plus(heute, 1) : heute,
        zeit: uhr(f) } }] };
  }
  if (/verschieb/.test(f)) {
    const t = (k.termine || []).find(x => x.von >= heute) || (k.eigene || [])[0];
    if (!t) return { ...rahmen, text: 'Ich finde keinen Termin zum Verschieben.', aktionen: [] };
    return { ...rahmen, text: `«${t.titel}» einen Tag später:`, aktionen: [
      { name: 'termin_verschieben', args: { termin_id: t.id, datum: plus(t.von, 1), ...(t.zeit ? { zeit: t.zeit } : {}) } },
    ] };
  }
  if (/training|plan/.test(f)) {
    const g = (k.gruppen || []).find(x => x.leite);
    if (!g) {
      return { ...rahmen, text: 'Du leitest keine Gruppe — ich trage dir das Training als eigenen Termin ein.',
        aktionen: [{ name: 'eigenen_termin_eintragen', args: { titel: 'Training', datum: wochentag(heute, 1), zeit: '18:00' } }] };
    }
    return { ...rahmen, text: `Zwei Trainings für «${g.name}» nächste Woche:`, aktionen: [
      { name: 'gruppentermin_eintragen', args: { gruppe_id: g.id, art: 'training', titel: 'Kondi', datum: wochentag(heute, 1), zeit: '18:00', bisZeit: '19:30', ort: 'Halle' } },
      { name: 'gruppentermin_eintragen', args: { gruppe_id: g.id, art: 'training', titel: 'Kondi', datum: plus(wochentag(heute, 1), 2), zeit: '18:00', bisZeit: '19:30', ort: 'Halle' } },
    ] };
  }
  const bis = plus(heute, 7);
  const woche = [...(k.termine || []), ...(k.eigene || [])].filter(x => x.von >= heute && x.von <= bis);
  return { ...rahmen, aktionen: [], text: woche.length
    ? `Diese Woche steht an:\n${woche.map(x => `• ${x.von}${x.zeit ? ` ${x.zeit}` : ''} — ${x.titel}`).join('\n')}`
    : 'Diese Woche steht nichts an.' };
}
