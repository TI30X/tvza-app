/* Die Startseite als EINE Quelle.
 *
 * Bis v.35.10.0 stand der ganze Code der Startseite als Inline-Modul
 * in index.html, und dreizehn Testdateien lasen ihn von dort. Seit
 * dem Umzug liegt er in assets/js/feature/start/.
 *
 * Die Tests pruefen aber keine Dateigrenzen, sondern Zusagen: dass die
 * Kachel am Modul haengt, dass die Termine je Gruppe geladen werden,
 * dass der Einladungscode aus crypto kommt. Diese Zusagen gelten
 * unabhaengig davon, in welcher Datei die Zeile steht — also bekommen
 * sie ein Lesegeraet, das die Seite SAMT ihrer Module sieht.
 *
 * Damit ueberlebt der naechste Umzug ebenfalls, ohne dass dreizehn
 * Dateien angefasst werden muessen.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Die Module, die index.html mitbringt — in der Reihenfolge des Markups. */
export const START_MODULE = [
  'assets/js/feature/start/start.js',
  'assets/js/feature/start/wetter-chip.js',
  'assets/js/feature/start/heute.js',
];

/**
 * Ein Ersatz fuer `read`, der index.html mit ihren Modulen ausliefert.
 * Jede andere Datei geht unveraendert durch.
 */
export function leserMitStart(root) {
  return async function read(relative) {
    const inhalt = await readFile(join(root, relative), 'utf8');
    if (relative !== 'index.html') return inhalt;

    const module = await Promise.all(
      START_MODULE.map(pfad => readFile(join(root, pfad), 'utf8')));
    return inhalt + '\n' + module.join('\n');
  };
}
