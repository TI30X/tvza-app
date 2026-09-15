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
   Liste lädt nichts. */

export const NOCHMAL_MS = 1500;
export const VERSUCHE = 3;

export function mitgliedschaftenFolgen(laden, cb, { warten = (fn, ms) => setTimeout(fn, ms) } = {}) {
  let letzte = null;
  let unvollstaendig = false;
  let lauf = 0;
  let versuche = 0;

  async function aufnehmen(liste, schluessel) {
    const meiner = ++lauf;
    const gruppen = await laden(liste);
    /* Eine neuere Meldung ist schon unterwegs: deren Liste gilt. */
    if (meiner !== lauf) return;
    letzte = schluessel;
    /* groups.js sagt es genau (eine gelöschte Gruppe fehlt zu Recht);
       ohne diese Angabe zählt jede fehlende. */
    unvollstaendig = gruppen.unvollstaendig ?? gruppen.length < liste.length;
    cb(gruppen);
    if (!unvollstaendig) { versuche = 0; return; }
    if (versuche >= VERSUCHE) return;
    versuche += 1;
    warten(() => { if (unvollstaendig && letzte === schluessel && meiner === lauf) aufnehmen(liste, schluessel); }, NOCHMAL_MS * versuche);
  }

  return snap => {
    const liste = snap.docs.map(d => ({ gid: d.ref.parent.parent.id, rolle: d.data().rolle || '' }));
    const schluessel = JSON.stringify(liste);
    if (schluessel === letzte && !unvollstaendig) return undefined;
    if (schluessel !== letzte) versuche = 0;
    return aufnehmen(liste, schluessel);
  };
}
