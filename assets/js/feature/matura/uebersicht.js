/* Die Maturaarbeit — Übersicht: der Einstieg der Seite.

   Zeichnet die Seite (uebersicht-ansicht.js), meldet an und gleicht den
   Fortschritt mit Firestore ab (matura-sync.js). Die Leiste kommt aus
   nav.js — bis v.35.33.0 ein zweites Modul-Tag in der Seite. */

import '../../nav.js?v=20';
import { requireAuth } from '../../firebase-config.js';
import { connectMaturaProgress } from '../../matura-sync.js';
import { starteUebersicht } from './uebersicht-ansicht.js';

const { bridge } = starteUebersicht();
const user = await requireAuth('../login.html');
bridge.useUser(user.uid);
const sync = await connectMaturaProgress({
  user,
  documentId: 'overview',
  storageKey: bridge.storageKey(),
  allowedKeys: bridge.allowedKeys,
  getLocalState: bridge.getState,
  applyState: bridge.applyState,
});
bridge.connect(sync.save);
