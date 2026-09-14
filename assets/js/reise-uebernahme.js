/* ══════════════════════════════════════════════════════════════════
   Eine Reise wird ein Termin der Gruppe (v.35.50.0).

   Bis v.35.49.0 gab es zwei Dinge für dasselbe: Termine der Gruppe
   (groups/{gid}/events — mit Art, Zusagen, Absage, Unterlagen) und
   Reisen (trips — mit Programm aus einer HTML-Seite, Aufgaben, Dateien,
   Gast-Link). Die Reise tauchte im Gruppe-Tab nie auf, der Termin hatte
   kein Programm. Jetzt kann der Termin alles, was die Reise konnte
   (programm.js), und die Reisen ziehen um.

   ── Wie ─────────────────────────────────────────────────────────
   Wer die Gruppe leitet, übernimmt ihre Reisen, sobald er den Kalender
   oder die Gruppe öffnet — wie bei den Familien (uebernahme.js):
     1. der Termin, mit DERSELBEN Kennung wie die Reise
        (groups/{gid}/events/{tripId}). Damit gilt der Gastzugang der
        Reise (guestAccess/{uid}_{tripId}, mit ihrem Token) ohne Umweg
        auch für den Termin, und alte Links finden ihn;
     2. die Aufgaben der Reise (activities) werden seine Packliste —
        abgehakt wird dort je Person, darum ohne den alten Haken —, die
        Dateien (attachments) seine Unterlagen, unter ihrer alten Kennung;
     3. an der Reise die Marke uebernommen: true — ab da zeigen
        Kalender, Start und Gastseite den Termin.
   Nichts wird gelöscht, und jeder Schritt lässt sich wiederholen: was
   schon da ist, wird nicht noch einmal geschrieben.

   ── Reines Modul ────────────────────────────────────────────────
   Die Firestore-Funktionen kommen als Parameter — die Reihenfolge
   läuft im Test gegen eine Attrappe.
   ══════════════════════════════════════════════════════════════════ */

const istIsoTag = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const istZeit = s => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
const kurz = (s, n) => String(s ?? '').trim().slice(0, n);

/** Der Termin aus einer Reise — nur Felder, die die Regel für
 *  groups/{gid}/events zulässt. null, wenn die Reise kein Datum hat. */
export function terminAusReise(reise, uid, { gruppenart = 'familie', packliste = [] } = {}) {
  const programm = Array.isArray(reise?.itinerary) ? reise.itinerary.slice(0, 300) : [];
  const daten = programm.map(p => p?.date).filter(istIsoTag).sort();
  const von = istIsoTag(reise?.startDate) ? reise.startDate : (daten[0] || '');
  if (!von) return null;
  const bis = istIsoTag(reise?.endDate) && reise.endDate > von ? reise.endDate : '';
  const mehrtaegig = !!bis;

  const termin = {
    /* Mehrtägig ist ein Lager — in der Familie heisst das "Reise",
       sonst "Termin". Anderswo trägt die Reise ihr eigenes Wort, damit
       aus einem Familienausflug im Kader kein "Training" wird. */
    art: mehrtaegig ? 'lager' : 'training',
    titel: kurz(reise?.name, 120) || 'Reise',
    von,
    createdBy: uid,
  };
  if (gruppenart !== 'familie') termin.bezeichnung = mehrtaegig ? 'Reise' : 'Termin';
  if (bis) termin.bis = bis;
  if (!mehrtaegig && istZeit(reise?.startTime)) termin.zeit = reise.startTime;
  if (!mehrtaegig && istZeit(reise?.endTime) && reise.endTime > (termin.zeit || '')) termin.bisZeit = reise.endTime;
  if (kurz(reise?.destination, 80)) termin.ort = kurz(reise.destination, 80);
  if (kurz(reise?.notes, 2000)) termin.notiz = kurz(reise.notes, 2000);
  /* Abgehakt wird ein Programm nicht mehr (v.35.50.0) — itineraryDone
     bleibt an der Reise. */
  if (programm.length) termin.programm = programm;
  if (packliste.length) termin.packliste = packliste.slice(0, 200);
  if (typeof reise?.planHtml === 'string' && reise.planHtml.trim()) termin.planHtml = reise.planHtml;
  if (typeof reise?.planUrl === 'string' && reise.planUrl.trim()) termin.planUrl = reise.planUrl.trim();
  if (typeof reise?.guestToken === 'string' && reise.guestToken) termin.gastToken = reise.guestToken;
  return termin;
}

/** Soll diese Person diese Reise jetzt übernehmen? Nur in eine Gruppe,
 *  die es gibt und die sie leitet — eine alte Familie wird zuerst
 *  selbst eine Gruppe (uebernahme.js). */
export function sollReiseUebernehmen(reise, { istGruppe, leitet }) {
  return !!reise?.id && !reise.uebernommen && !!reise.familyId
    && istGruppe(reise.familyId) && leitet(reise.familyId);
}

/**
 * Übernimmt eine Reise. Gibt true zurück, wenn sie jetzt ein Termin ist.
 * @param o.fs  { doc, collection, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp }
 */
export async function reiseUebernehmen({ db, fs, reise, uid, gruppenart }) {
  const { doc, collection, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp } = fs;
  const gid = reise.familyId;
  const pfad = ['groups', gid, 'events', reise.id];
  const ziel = doc(db, ...pfad);

  if (!(await getDoc(ziel)).exists()) {
    const aufgaben = await getDocs(query(collection(db, 'activities'), where('tripId', '==', reise.id)));
    const packliste = aufgaben.docs
      .map(a => ({ id: a.id, name: kurz(a.data().name, 120) }))
      .filter(p => p.name);
    const termin = terminAusReise(reise, uid, { gruppenart, packliste });
    if (!termin) return false;
    await setDoc(ziel, { ...termin, createdAt: serverTimestamp() });
  }

  const fehlt = async ref => !(await getDoc(ref)).exists();

  const dateien = await getDocs(query(collection(db, 'attachments'), where('parent', '==', reise.id)));
  for (const f of dateien.docs) {
    const ref = doc(db, ...pfad, 'anhaenge', f.id);
    if (!(await fehlt(ref))) continue;
    const d = f.data();
    if (typeof d.dataUrl !== 'string' || !d.dataUrl) continue;
    await setDoc(ref, {
      name: kurz(d.name, 200) || 'Datei',
      type: String(d.type || ''),
      size: Number(d.size) || d.dataUrl.length,
      dataUrl: d.dataUrl,
      by: uid,
      at: Number(d.at) || Date.now(),
    });
  }

  await updateDoc(doc(db, 'trips', reise.id), { uebernommen: true });
  return true;
}
