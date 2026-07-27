import { db, reportClientError } from './firebase-config.js';
import {
  doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function cleanState(value, allowedKeys) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clean = {};
  allowedKeys.forEach(key => {
    if (!own(source, key)) return;
    const item = source[key];
    if (typeof item === 'boolean') clean[key] = item;
    else if (typeof item === 'string' && item.length <= 40) clean[key] = item;
  });
  return clean;
}

/* A device that has never used cloud sync may contain additional completed
   points. During that device's one-time migration, the more complete copy
   wins and its checked values are merged with the other copy. That prevents
   a 29-point desktop from being replaced by a fresh 20-point phone without
   resurrecting old defaults when a browser store is cleared later. */
function mergeFirstSync(localState, cloudState, allowedKeys) {
  const local = cleanState(localState, allowedKeys);
  const cloud = cleanState(cloudState, allowedKeys);
  const merged = { ...cloud };
  const localDone = Object.values(local).filter(value => value === true).length;
  const cloudDone = Object.values(cloud).filter(value => value === true).length;
  if (localDone <= cloudDone) {
    allowedKeys.forEach(key => {
      if (!own(cloud, key) && typeof local[key] === 'string') merged[key] = local[key];
    });
    return merged;
  }
  allowedKeys.forEach(key => {
    const localValue = local[key];
    const cloudValue = cloud[key];
    if (localValue === true || cloudValue === true) merged[key] = true;
    else if (!own(cloud, key) && own(local, key)) merged[key] = localValue;
  });
  return merged;
}

export async function connectMaturaProgress({
  user,
  documentId,
  storageKey,
  allowedKeys,
  getLocalState,
  applyState,
}) {
  const progressRef = doc(db, 'users', user.uid, 'maturaProgress', documentId);
  const migrationKey = `${storageKey}_cloud_v1`;
  let lastState = '';
  let unsubscribe = () => {};

  const applyCloudState = next => {
    const clean = cleanState(next, allowedKeys);
    const serialised = JSON.stringify(clean);
    if (serialised === lastState) return;
    lastState = serialised;
    applyState(clean);
  };

  try {
    const local = cleanState(getLocalState(), allowedKeys);
    const snapshot = await getDoc(progressRef);
    const cloud = snapshot.exists() ? cleanState(snapshot.data()?.state, allowedKeys) : {};
    const migrated = localStorage.getItem(migrationKey) === '1';
    const initial = snapshot.exists() && migrated
      ? cloud
      : mergeFirstSync(local, cloud, allowedKeys);

    lastState = JSON.stringify(initial);
    applyState(initial);
    await setDoc(progressRef, {
      state: initial,
      schema: 1,
      updatedAt: serverTimestamp(),
    });
    localStorage.setItem(migrationKey, '1');

    unsubscribe = onSnapshot(progressRef, nextSnapshot => {
      if (nextSnapshot.exists()) applyCloudState(nextSnapshot.data()?.state);
    }, error => reportClientError('matura-sync-live', error));
  } catch (error) {
    reportClientError('matura-sync-start', error);
  }

  const save = async (nextState, changedKey, options = {}) => {
    const clean = cleanState(nextState, allowedKeys);
    lastState = JSON.stringify(clean);
    try {
      if (options.reset || !changedKey) {
        await setDoc(progressRef, {
          state: clean,
          schema: 1,
          updatedAt: serverTimestamp(),
        });
      } else if (allowedKeys.includes(changedKey)) {
        await updateDoc(progressRef, {
          [`state.${changedKey}`]: clean[changedKey],
          updatedAt: serverTimestamp(),
        });
      }
      localStorage.setItem(migrationKey, '1');
    } catch (error) {
      reportClientError('matura-sync-save', error);
    }
  };

  return { save, unsubscribe };
}
