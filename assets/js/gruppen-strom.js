/* Die eigenen Gruppen aus dem Strom der Mitgliedschaften (v.35.59.0).

   Rein, ohne Firebase: groups.js reicht jede Momentaufnahme der Abfrage
   "meine Mitgliedschaften" herein, dieses Modul lädt die Gruppen dazu.

   Michel: "wenn du eine neue Gruppe erstellst, wirst du direkt
   reingebracht, aber sie wird nicht direkt in der Leiste aktualisiert".
   Die Mitgliedschaft der neuen Gruppe meldet Firestore sofort, noch bevor
   der Stapel auf dem Server steht (oder, aus dem Rahmen des Routers, über
   den geteilten Speicher). In diesem Augenblick lässt die Regel die Gruppe
   noch nicht lesen — sie verlangt die Mitgliedschaft auf dem Server —, und
   die Gruppe fiel still aus der Liste. Die Bestätigung danach ändert an
   den Mitgliedschaften nichts, nur an ihren Metadaten, und die meldete
   onSnapshot ohne includeMetadataChanges gar nicht. Die Leiste blieb ohne
   die neue Gruppe, bis man neu lud.

   Jetzt: fehlt eine Gruppe, gilt die Liste als unvollständig, und die
   nächste Meldung — auch eine nur der Metadaten — lädt sie nochmals;
   zusätzlich ein paar Versuche nach der Uhr. Eine gleiche, vollständige
   Liste lädt nichts.

   ── Und danach wird weiter gefragt (v.35.70.5) ────────────────────
   Michel: "auf dem PC habe ich 3 Gruppen und nur eine ist auf dem
   Handy, und auf dem Handy habe ich 2 und auf dem PC ist nur eine
   davon." Der Code ist auf beiden Geräten derselbe; verschieden ist,
   was das Gerät gerade lesen konnte. Bis hierher hörte der Strom nach
   VERSUCHE Anläufen (nach gut vier Sekunden) auf zu fragen — wer in
   diesem Moment kein Netz hatte, behielt die halbe Liste für die ganze
   Sitzung, und zwar auf jedem Gerät eine andere halbe.

   Jetzt hört er nicht auf: nach den schnellen Versuchen fragt er
   langsam weiter (SPAETER_MS), und wer von aussen Bescheid gibt — das
   Netz ist zurück, die App ist wieder im Vordergrund —, ruft
   `folgen.nochmal()` und bekommt sofort einen Versuch. Sobald die Liste
   vollständig ist, hört alles davon auf. */

export const NOCHMAL_MS = 1500;
export const VERSUCHE = 3;
/* Nach den schnellen Anläufen: selten, aber nie nie. */
export const SPAETER_MS = 30000;

export function mitgliedschaftenFolgen(laden, cb, { warten = (fn, ms) => setTimeout(fn, ms) } = {}) {
  let letzte = null;
  let letzteListe = null;
  let unvollstaendig = false;
  let lauf = 0;
  let versuche = 0;
  let geplant = false;

  async function aufnehmen(liste, schluessel) {
    const meiner = ++lauf;
    const gruppen = await laden(liste);
    /* Eine neuere Meldung ist schon unterwegs: deren Liste gilt. */
    if (meiner !== lauf) return;
    letzte = schluessel;
    letzteListe = liste;
    /* groups.js sagt es genau (eine gelöschte Gruppe fehlt zu Recht);
       ohne diese Angabe zählt jede fehlende. */
    unvollstaendig = gruppen.unvollstaendig ?? gruppen.length < liste.length;
    cb(gruppen);
    if (!unvollstaendig) { versuche = 0; return; }
    plane(liste, schluessel, meiner);
  }

  /* Ein Versuch ist immer geplant, solange etwas fehlt — schnell die
     ersten, danach langsam. Zwei gleichzeitige Uhren gibt es nicht. */
  function plane(liste, schluessel, meiner) {
    if (geplant) return;
    versuche += 1;
    geplant = true;
    warten(() => {
      geplant = false;
      if (unvollstaendig && letzte === schluessel && meiner === lauf) aufnehmen(liste, schluessel);
    }, versuche <= VERSUCHE ? NOCHMAL_MS * versuche : SPAETER_MS);
  }

  const folgen = snap => {
    const liste = snap.docs.map(d => ({ gid: d.ref.parent.parent.id, rolle: d.data().rolle || '' }));
    const schluessel = JSON.stringify(liste);
    if (schluessel === letzte && !unvollstaendig) return undefined;
    if (schluessel !== letzte) versuche = 0;
    return aufnehmen(liste, schluessel);
  };

  /* Von aussen anstossen: das Netz ist zurück, die App ist wieder da.
     Ohne fehlende Gruppe passiert nichts — kein Lesezugriff umsonst. */
  folgen.nochmal = () => {
    if (!unvollstaendig || !letzteListe) return false;
    versuche = 0;
    void aufnehmen(letzteListe, letzte);
    return true;
  };
  return folgen;
}
