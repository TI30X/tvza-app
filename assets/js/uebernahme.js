/* ══════════════════════════════════════════════════════════════════
   Eine Familie aus dem alten Kalendermodell wird eine Gruppe.

   Bis v.35.31.0 gab es zwei Gruppenmodelle nebeneinander: die Gruppen
   (groups/{gid}, Kader, Verein, Familie — mit Rollen, Terminen, Plaenen)
   und im Kalender die "Kalendergruppen" (families/{id}, mit Mitglieder-
   liste, Beitrittsanfragen, eigenem Einladungslink und den Reisen).
   Zwei Verwaltungen, zwei Einladungswege, zwei Farben fuer dieselben
   Menschen.

   ── Wie die Uebernahme geht ───────────────────────────────────────
   Die neue Gruppe traegt DIESELBE Kennung wie die Familie:
   groups/{familyId}. Damit gehoeren die Reisen (trips.familyId) ohne
   eine einzige Umschreibung zur Gruppe, und der Gastzugang, der am
   Reise-Dokument haengt, bleibt, wie er ist.

   Der Kopf der Familie uebernimmt sie, sobald er den Kalender oeffnet:
     1. Gruppe und Kopf in einem Stapel (die Regel verlangt beides
        zusammen — eine Gruppe entsteht nie ohne Kopf);
     2. die uebrigen Mitglieder, Verwaltung → staff, sonst mitglied —
        ein eigener Stapel, denn "der Kopf ernennt" prueft die Gruppe
        VOR dem Schreiben, und im ersten Stapel gibt es sie noch nicht;
     3. an der Familie die Marke uebernommen: true.

   Nichts wird geloescht: die Familie bleibt stehen, falls etwas
   schiefgeht. Jeder Schritt laesst sich wiederholen — steht die Gruppe
   schon, wird sie nicht noch einmal angelegt; wer schon Mitglied ist,
   wird nicht noch einmal aufgenommen.

   ── Reines Modul ──────────────────────────────────────────────────
   Die Firestore-Funktionen kommen als Parameter herein. So laeuft die
   Reihenfolge in den Tests gegen eine Attrappe, und dieselbe Datei tut
   im Kalender das Echte.
   ══════════════════════════════════════════════════════════════════ */

/** Das Gruppendokument aus einer Familie — nur Felder, die die Regel fuer
    groups/{gid} zulaesst. */
export function gruppeAusFamilie(familie, uid, { bereiche, token, palette = [] } = {}) {
  const name = String(familie?.name || '').trim().slice(0, 80) || 'Familie';
  const gruppe = { name, art: 'familie', headUid: uid, bereiche: { ...(bereiche || {}) }, inviteToken: token };
  /* Die Kalenderfarbe wandert mit — sonst waere die Familie nach der
     Uebernahme ploetzlich anders gefaerbt. */
  if (palette.includes(familie?.calendarColor)) gruppe.farbe = familie.calendarColor;
  return gruppe;
}

/** Wer aus der Familie in der Gruppe noch fehlt, mit seiner Rolle. */
export function fehlendeMitglieder(familie, vorhanden = new Set()) {
  const verwaltung = new Set(familie?.managers || []);
  const gesehen = new Set();
  return (familie?.members || [])
    .filter(uid => typeof uid === 'string' && uid && uid !== familie.headUid && !vorhanden.has(uid))
    .filter(uid => (gesehen.has(uid) ? false : gesehen.add(uid)))
    .map(uid => ({ uid, rolle: verwaltung.has(uid) ? 'staff' : 'mitglied' }));
}

/** EINE Liste fuer den Kalender: alle Gruppen, dazu jede Familie, die
    (noch) keine Gruppe mit derselben Kennung ist. Eine uebernommene
    Familie erscheint nur als Gruppe — ihre Reisen haengen an derselben
    Kennung und bleiben damit sichtbar. Die Kalenderfarbe einer alten
    Familie wird zu ihrer Farbe (farbe), damit teamFarben sie ehrt. */
export function vereinigeGruppen(gruppen = [], familien = []) {
  const ids = new Set(gruppen.map(g => g.id));
  const alt = familien
    .filter(f => f && !ids.has(f.id))
    .map(f => ({ ...f, farbe: f.calendarColor, alt: true }));
  return [...gruppen, ...alt].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
}

/** Soll dieser Nutzer diese Familie jetzt uebernehmen? Nur der Kopf,
    und nur solange sie nicht als uebernommen markiert ist. */
export function sollUebernehmen(familie, uid) {
  return !!familie && familie.headUid === uid && familie.uebernommen !== true;
}

/**
 * Fuehrt die Uebernahme aus. Gibt zurueck, was geschah:
 *   'nichts'       — nicht der Kopf, oder schon erledigt
 *   'uebernommen'  — Gruppe steht, Mitglieder drin, Familie markiert
 *
 * @param fs  { doc, collection, getDocs, writeBatch, updateDoc, serverTimestamp }
 * @param istGruppe  ob groups/{familyId} schon existiert (der Kopf ist
 *                   dann Mitglied und sieht sie in seiner Gruppenliste)
 */
export async function familieUebernehmen({ db, fs, familie, uid, istGruppe, bereiche, token, palette }) {
  if (!sollUebernehmen(familie, uid)) return 'nichts';
  const gid = familie.id;

  if (!istGruppe) {
    await fs.writeBatch(db)
      .set(fs.doc(db, 'groups', gid), {
        ...gruppeAusFamilie(familie, uid, { bereiche, token, palette }),
        createdAt: fs.serverTimestamp(),
      })
      .set(fs.doc(db, 'groups', gid, 'members', uid), { uid, rolle: 'head', seit: fs.serverTimestamp() })
      .commit();
  }

  const snap = await fs.getDocs(fs.collection(db, 'groups', gid, 'members'));
  const vorhanden = new Set(snap.docs.map(d => d.id));
  const fehlend = fehlendeMitglieder(familie, vorhanden);
  if (fehlend.length) {
    const stapel = fs.writeBatch(db);
    for (const { uid: wer, rolle } of fehlend) {
      stapel.set(fs.doc(db, 'groups', gid, 'members', wer), { uid: wer, rolle, seit: fs.serverTimestamp() });
    }
    await stapel.commit();
  }

  await fs.updateDoc(fs.doc(db, 'families', gid), { uebernommen: true });
  return 'uebernommen';
}
