/* ══════════════════════════════════════════════════════════════════
   Mehrere Kalender (v.35.60.0) — rein, ohne Firebase und ohne DOM.

   Michel: "die Gruppe soll in der Lage sein, mehrere Kalender zu
   erstellen … auch persönlich sollte man mehrere Kalender erstellen
   können, vielleicht persönliche und Erinnerungen, und dann einen für
   das, was meine Familie macht … oder zwischen Trainings, Trainingslager
   und Rennen unterscheiden — Rennplan".

   Jede Quelle hat einen Schlüssel; ausgeschaltet wird über eine Menge
   solcher Schlüssel (im Gerät gemerkt, wie bisher):

     'p'                  Persönlich — eigene Termine ohne eigenen Kalender
     'pk:<id>'            ein eigener Kalender (users/{uid}/kalender/{id})
     'r'                  Erinnerungen
     'g:<gid>'            eine Gruppe als Ganzes — schaltet alles darunter
     'g:<gid>:art:<art>'  ihre Trainings, Lager, Rennen (die Arten der
                          Termine, die es schon gibt — nichts anzulegen)
     'g:<gid>:k:<id>'     ein Kalender, den die Leitung angelegt hat
                          (groups/{gid}/kalender/{id}, "Rennplan")
     'g:<gid>:plaene'     die Einheiten der Trainingspläne

   Ein Termin, der einem Kalender der Gruppe zugeordnet ist (kalender am
   Termin), steht dort statt unter seiner Art. Gibt es den Kalender nicht
   mehr, fällt er zurück — nichts verschwindet mit einem gelöschten
   Kalender.
   ══════════════════════════════════════════════════════════════════ */

export const KALENDER_NAME_MAX = 40;
export const KALENDER_MAX = 12;

export const kalenderName = name => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, KALENDER_NAME_MAX);

/** Die nächste Farbe, die noch niemand hat — sonst die erste. */
export function naechsteFarbe(vergeben = [], palette = []) {
  const belegt = new Set(vergeben);
  return palette.find(f => !belegt.has(f)) || palette[0] || '';
}

/**
 * Zu welcher Quelle ein Eintrag des Kalenders gehört (eintraege.js).
 * @param e  ein Eintrag ({ art, ref })
 * @param o.eigene  Set der eigenen Kalender-ids
 * @param o.jeGruppe  Map gid -> Set der Kalender-ids der Gruppe
 */
export function quelleVon(e, { eigene = new Set(), jeGruppe = new Map() } = {}) {
  const x = e?.ref || {};
  switch (e?.art) {
    case 'tag': return x.kalender && eigene.has(x.kalender) ? `pk:${x.kalender}` : 'p';
    case 'erinnerung': return 'r';
    case 'team': {
      const gid = x.gid || '';
      if (x.kalender && jeGruppe.get(gid)?.has(x.kalender)) return `g:${gid}:k:${x.kalender}`;
      return `g:${gid}:art:${x.art || 'training'}`;
    }
    case 'training': return `g:${x.gid || ''}:plaene`;
    case 'reise': return `g:${x.familyId || ''}`;
    default: return '';
  }
}

/** Sichtbar, wenn weder die Quelle noch ihre Gruppe ausgeschaltet ist. */
export function sichtbar(schluessel, aus = new Set()) {
  if (aus.has(schluessel)) return false;
  const [art, gid] = String(schluessel).split(':');
  return !(art === 'g' && aus.has(`g:${gid}`));
}

/**
 * Die Liste "Meine Kalender": oben das Eigene, dann jede Gruppe mit
 * ihren Kalendern darunter.
 *
 * @param o.eigene        [{ id, name, farbe }]
 * @param o.gruppen       [{ id, name, art }]
 * @param o.jeGruppe      Map gid -> [{ id, name, farbe }]
 * @param o.mitPlaenen    Set der gids mit Trainingsplänen
 * @param o.farbeVon      gid -> Farbe der Gruppe
 * @param o.arten         gruppenart -> ['training', 'lager', …]
 * @param o.artWort       (art, gruppenart) -> "Trainingslager"
 * @param o.t             (schlüssel, deutsch) -> Text
 * @returns [{ schluessel, name, farbe, eigen?, kinder: [...] }]
 */
export function quellenBaum({
  eigene = [], gruppen = [], jeGruppe = new Map(), mitPlaenen = new Set(),
  farbePersoenlich = '', farbeVon = () => '', arten = () => [], artWort = a => a, t = (k, d) => d,
} = {}) {
  const raus = [
    { schluessel: 'p', name: t('kal.persoenlich', 'Persönlich'), farbe: farbePersoenlich, kinder: [] },
    ...eigene.map(k => ({ schluessel: `pk:${k.id}`, name: k.name, farbe: k.farbe || farbePersoenlich, eigen: true, id: k.id, kinder: [] })),
    { schluessel: 'r', name: t('cal.erinnerungen', 'Erinnerungen'), farbe: farbePersoenlich, kinder: [] },
  ];
  for (const g of gruppen) {
    const farbe = farbeVon(g.id);
    const kinder = [
      /* Eine eigene Farbe der Art geht der Gruppe vor (v.35.68.0, artFarben). */
      ...arten(g.art).map(art => ({ schluessel: `g:${g.id}:art:${art}`, name: artWort(art, g.art), farbe: g.artFarben?.[art] || farbe })),
      ...(jeGruppe.get(g.id) || []).map(k => ({ schluessel: `g:${g.id}:k:${k.id}`, name: k.name, farbe: k.farbe || farbe, id: k.id })),
      ...(mitPlaenen.has(g.id) ? [{ schluessel: `g:${g.id}:plaene`, name: t('kal.plaene', 'Trainingspläne'), farbe }] : []),
    ];
    raus.push({ schluessel: `g:${g.id}`, name: g.name || t('nav.gruppe', 'Gruppe'), farbe, gruppe: true, kinder });
  }
  return raus;
}

/**
 * Was vom Gerät gemerkt war, als Menge ausgeschalteter Schlüssel. Bis
 * v.35.59.0 hiess es { personal:false, teamsAus:[gid] } — das gilt weiter.
 */
export function ausGemerkt(gemerkt) {
  const aus = new Set(Array.isArray(gemerkt?.aus) ? gemerkt.aus.filter(s => typeof s === 'string') : []);
  if (gemerkt?.personal === false) { aus.add('p'); aus.add('r'); }
  for (const gid of Array.isArray(gemerkt?.teamsAus) ? gemerkt.teamsAus : []) aus.add(`g:${gid}`);
  return aus;
}
