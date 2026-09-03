/* Erzeugt assets/i18n/<lang>.json aus den Tabellen in dev/i18n-src/.
 *
 *     node dev/i18n-src/build.mjs
 *
 * ── Warum es das neben build.py gibt ──────────────────────────────
 * Auf dem Rechner, auf dem diese App gebaut wird, ist kein Python
 * installiert. Damit war der Katalog monatelang nicht mehr baubar, und
 * jede neue Beschriftung aus den Phasen 2 bis 5 blieb ohne Schluessel
 * — auf Deutsch richtig, in den anderen sechs Sprachen auch.
 *
 * Node ist da, weil die Testsuite darauf laeuft. Also liest dieses
 * Skript dieselben catalog*.py-Tabellen und erzeugt dieselben Dateien.
 * Die Tabellen bleiben unangetastet: sie sind die Quelle, und 800
 * Zeilen Uebersetzungen in ein anderes Format zu giessen waere ein
 * Risiko ohne Gegenwert.
 *
 * build.py bleibt liegen und funktioniert weiter. Beide erzeugen
 * dasselbe; dev/i18n-build.test.mjs haelt das fest.
 *
 * ── Der Parser ────────────────────────────────────────────────────
 * Kein Python-Interpreter, sondern ein Leser fuer genau die eine Form,
 * die diese Tabellen haben:
 *
 *     'schluessel': ('de', 'en', 'fr', 'it', 'pl', 'nl', 'es'),
 *
 * Zeichenketten werden mit einem Tokenizer gelesen und nicht mit einem
 * regulaeren Ausdruck: eine franzoesische Beschriftung wie
 * "l'entraînement" enthaelt ein Anfuehrungszeichen, und ein Regex
 * zaehlt an so etwas falsch.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..', '..');

/* ── Python-Zeichenketten lesen ────────────────────────────────────*/

/**
 * Liest ab position eine Zeichenkette und gibt sie samt Endposition
 * zurueck. Beherrscht ' und " sowie die Escapes, die in diesen
 * Tabellen vorkommen koennen.
 */
function leseZeichenkette(text, position) {
  const anfuehrung = text[position];
  if (anfuehrung !== "'" && anfuehrung !== '"') return null;

  let raus = '';
  let i = position + 1;

  while (i < text.length) {
    const z = text[i];

    if (z === '\\') {
      const naechstes = text[i + 1];
      /* Nur die Escapes, die hier real auftreten. Alles andere bleibt
         woertlich stehen, statt still etwas anderes zu bedeuten. */
      if (naechstes === 'n') raus += '\n';
      else if (naechstes === 't') raus += '\t';
      else if (naechstes === '\\') raus += '\\';
      else if (naechstes === "'") raus += "'";
      else if (naechstes === '"') raus += '"';
      else raus += `\\${naechstes}`;
      i += 2;
      continue;
    }

    if (z === anfuehrung) return { wert: raus, ende: i + 1 };
    raus += z;
    i += 1;
  }

  throw new Error(`Nicht geschlossene Zeichenkette ab Position ${position}`);
}

/** Alle Zeichenketten in einem Textstueck, in ihrer Reihenfolge. */
function zeichenkettenIn(text) {
  const raus = [];
  let i = 0;
  while (i < text.length) {
    const z = text[i];
    if (z === '#') break;                       // Kommentar bis Zeilenende
    if (z === "'" || z === '"') {
      const s = leseZeichenkette(text, i);
      raus.push(s.wert);
      i = s.ende;
      continue;
    }
    i += 1;
  }
  return raus;
}

/* ── Eine Tabelle lesen ────────────────────────────────────────────*/

/**
 * Gelesen wird der ganze KEYS-Block als Strom, nicht Zeile fuer Zeile.
 *
 * Der erste Anlauf war zeilenweise, und er ist an den langen Zeilen
 * zerbrochen: eine Reihe mit sieben Uebersetzungen passt nicht immer
 * in eine Zeile, und dann wurde aus einer franzoesischen Beschriftung
 * ploetzlich ein Schluessel. Wer Klammern zaehlt statt Zeilen, dem ist
 * es egal, wo umgebrochen wird.
 */
export function leseKatalog(quelle) {
  const anfang = quelle.indexOf('KEYS = {');
  if (anfang < 0) throw new Error('KEYS = { nicht gefunden');

  const text = quelle.slice(anfang + 'KEYS = {'.length);
  const eintraege = new Map();
  let i = 0;

  const ueberspringen = () => {
    while (i < text.length) {
      const z = text[i];
      if (z === '#') { while (i < text.length && text[i] !== '\n') i += 1; continue; }
      if (z === ' ' || z === '\t' || z === '\n' || z === '\r' || z === ',') { i += 1; continue; }
      break;
    }
  };

  while (i < text.length) {
    ueberspringen();
    if (i >= text.length || text[i] === '}') break;

    /* Ein Eintrag beginnt immer mit dem Schluessel als Zeichenkette. */
    if (text[i] !== "'" && text[i] !== '"') { i += 1; continue; }
    const schluessel = leseZeichenkette(text, i);
    i = schluessel.ende;

    ueberspringen();
    if (text[i] !== ':') continue;
    i += 1;

    ueberspringen();
    if (text[i] !== '(') continue;
    i += 1;

    /* Alles bis zur schliessenden Klammer gehoert zu dieser Reihe —
       ueber beliebig viele Zeilen. */
    const werte = [];
    while (i < text.length) {
      ueberspringen();
      if (text[i] === ')') { i += 1; break; }
      if (text[i] === "'" || text[i] === '"') {
        const s = leseZeichenkette(text, i);
        werte.push(s.wert);
        i = s.ende;
        continue;
      }
      i += 1;
    }

    eintraege.set(schluessel.wert, werte);
  }

  return eintraege;
}

export function leseSprachen(quelle) {
  const zeile = quelle.split('\n').find(z => z.trimStart().startsWith('LANGS'));
  if (!zeile) throw new Error('LANGS nicht gefunden');
  return zeichenkettenIn(zeile);
}

/* ── Zusammenfuehren ───────────────────────────────────────────────*/

export function fuehreZusammen(tabellen, sprachen) {
  const zusammen = new Map();
  const herkunft = new Map();

  for (const [name, eintraege] of tabellen) {
    for (const [schluessel, werte] of eintraege) {
      /* Ein doppelter Schluessel ueber zwei Tabellen bricht den Bau —
         genauso wie in build.py. Sonst gewaenne stillschweigend die
         zuletzt gelesene Tabelle. */
      if (zusammen.has(schluessel)) {
        throw new Error(
          `Schluessel doppelt: ${schluessel} (${herkunft.get(schluessel)} und ${name})`);
      }
      zusammen.set(schluessel, werte);
      herkunft.set(schluessel, name);
    }
  }

  const falscheBreite = [...zusammen].filter(([, w]) => w.length !== sprachen.length);
  if (falscheBreite.length) {
    throw new Error('Zeilen mit falscher Spaltenzahl: '
      + falscheBreite.map(([k, w]) => `${k} (${w.length})`).join(', '));
  }

  const leere = [...zusammen].filter(([, w]) => w.some(v => !String(v).trim()));
  if (leere.length) {
    throw new Error('Leere Uebersetzung in: ' + leere.map(([k]) => k).join(', '));
  }

  return zusammen;
}

/** Genau die Form, die json.dump(ensure_ascii=False, indent=1, sort_keys=True) erzeugt. */
export function alsJson(zusammen, index) {
  const sortiert = [...zusammen.keys()].sort();
  const objekt = {};
  for (const schluessel of sortiert) objekt[schluessel] = zusammen.get(schluessel)[index];
  return `${JSON.stringify(objekt, null, 1)}\n`;
}

/* ── Ausfuehren ────────────────────────────────────────────────────*/

export async function baue({ schreiben = true } = {}) {
  const dateien = (await readdir(HIER))
    .filter(n => n === 'catalog.py' || (n.startsWith('catalog_') && n.endsWith('.py')))
    .sort((a, b) => (a === 'catalog.py' ? -1 : b === 'catalog.py' ? 1 : a.localeCompare(b)));

  const haupt = await readFile(join(HIER, 'catalog.py'), 'utf8');
  const sprachen = leseSprachen(haupt);

  const tabellen = [];
  for (const name of dateien) {
    tabellen.push([name, leseKatalog(await readFile(join(HIER, name), 'utf8'))]);
  }

  const zusammen = fuehreZusammen(tabellen, sprachen);
  const ziel = join(WURZEL, 'assets', 'i18n');
  const raus = new Map();

  for (const [index, sprache] of sprachen.entries()) {
    raus.set(sprache, alsJson(zusammen, index));
  }

  if (schreiben) {
    await mkdir(ziel, { recursive: true });
    for (const [sprache, inhalt] of raus) {
      await writeFile(join(ziel, `${sprache}.json`), inhalt, 'utf8');
    }
  }

  return { zusammen, sprachen, dateien, raus };
}

/* Direkt aufgerufen: bauen und berichten. Importiert: nur die
   Funktionen bereitstellen, damit der Test ohne Schreiben pruefen
   kann. */
if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const { zusammen, sprachen, dateien } = await baue();
  console.log(`${zusammen.size} Schluessel aus ${dateien.length} Tabellen -> ${sprachen.length} Dateien`);
}
