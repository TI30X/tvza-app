/* Der Maturaarbeit-Tracker: der Einstieg der Seite.

   Zeichnet (tracker-ansicht.js), meldet an, gleicht mit Firestore ab
   (matura-sync.js). Die Leiste kommt aus nav.js — bis v.35.33.0 ein
   zweites Modul-Tag in der Seite. */

import '../../nav.js?v=24';
import { requireAuth } from '../../firebase-config.js';
import { connectMaturaProgress } from '../../matura-sync.js';
import { richteTrackerEin } from './tracker-ansicht.js';

const { startTracker, bridge } = richteTrackerEin();
const user = await requireAuth('../login.html');
startTracker(user.uid, user.displayName || user.email || '');

const sync = await connectMaturaProgress({
  user,
  documentId: 'tracker',
  storageKey: bridge.storageKey(),
  allowedKeys: bridge.allowedKeys(),
  getLocalState: bridge.getState,
  applyState: bridge.applyState,
});
bridge.connect(sync.save);
