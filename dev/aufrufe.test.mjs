/* Kein Aufruf ins Leere.

   Zweimal ist es passiert, jedes Mal in nav.js:

   - v.35.19.0 loeschte refreshAreaNavigation, liess aber zwei Aufrufe
     stehen. Syntaktisch gueltig, zur Laufzeit ein ReferenceError — bei
     JEDEM Laden einer Seite, weil der erste Profil-Snapshot immer
     kommt. Kein Test hat es gemerkt, weil ein Aufruf eines unbekannten
     Namens nichts ist, was ein Parser beanstandet.

   - v.35.23.0 nahm TABS aus dem Import, obwohl primeNavigation es
     weiter brauchte. Diesmal im selben Durchgang bemerkt, aber nur,
     weil jemand zufaellig hingesehen hat.

   Ohne Typpruefung und ohne Linter ist das die Luecke. Dieser Test
   schliesst sie grob: jeder nackte Aufruf name(…) in einem Modul muss
   im selben Modul definiert, importiert oder ein bekanntes Globales
   sein. Grob heisst: er kennt keine Gueltigkeitsbereiche. Er faengt
   nicht jeden Fehler — aber genau die Sorte, die zweimal durchkam.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function module(dir) {
  const raus = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) raus.push(...await module(p));
    else if (e.name.endsWith('.js')) raus.push(p);
  }
  return raus;
}

const GLOBAL = new Set(`
  if for while switch catch function return typeof new await import super
  delete void yield in of do else try throw case async get set static
  window document console navigator location history localStorage
  sessionStorage fetch setTimeout clearTimeout setInterval clearInterval
  requestAnimationFrame cancelAnimationFrame queueMicrotask structuredClone
  alert confirm prompt atob btoa encodeURIComponent decodeURIComponent
  encodeURI decodeURI escape unescape parseInt parseFloat isNaN isFinite
  Number String Boolean Object Array Date Math JSON Promise Map Set WeakMap
  WeakSet Symbol RegExp Error TypeError RangeError URL URLSearchParams Blob
  File FileReader FormData Headers Request Response AbortController
  CustomEvent Event MouseEvent KeyboardEvent Intl TextEncoder TextDecoder
  DecompressionStream CompressionStream DOMParser XMLSerializer Image
  IntersectionObserver ResizeObserver MutationObserver getComputedStyle
  matchMedia importScripts self caches clients registration postMessage
  addEventListener removeEventListener dispatchEvent BigInt Uint8Array
  Int8Array Uint16Array Int16Array Uint32Array Int32Array Float32Array
  Float64Array ArrayBuffer DataView Reflect Proxy globalThis performance
  crypto WebSocket Worker Notification scrollTo open close print
  createImageBitmap OffscreenCanvas VideoFrame Audio speechSynthesis
  SpeechSynthesisUtterance CSS NaN Infinity
`.split(/\s+/).filter(Boolean));

/* Namen, die dieses Modul irgendwo einfuehrt — ohne Rücksicht auf den
   Gueltigkeitsbereich. Lieber zu viel als falscher Alarm. */
function eingefuehrt(q) {
  const namen = new Set();
  const nimm = s => String(s).split(/[^A-Za-z0-9_$]+/).filter(Boolean).forEach(n => namen.add(n));

  for (const m of q.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+['"]/g)) nimm(m[1].replace(/\bas\b/g, ' '));
  for (const m of q.matchAll(/\b(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) namen.add(m[1]);
  for (const m of q.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) namen.add(m[1]);
  /* Mehrere in einer Zeile: const EDGE = 90, MAX = 16 */
  for (const m of q.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) namen.add(m[1]);
  /* Destrukturierung: const { a, b: c } = …, const [x, y] = … */
  for (const m of q.matchAll(/\b(?:const|let|var)\s*(\{[^}]*\}|\[[^\]]*\])\s*=/g)) nimm(m[1]);
  /* Parameter: function f(a, { b }), (a, b) =>, a => */
  for (const m of q.matchAll(/\bfunction\*?\s*[\w$]*\s*\(([^)]*)\)/g)) nimm(m[1]);
  for (const m of q.matchAll(/\(([^()]*)\)\s*=>/g)) nimm(m[1]);
  for (const m of q.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) namen.add(m[1]);
  /* Methoden in Objekten und Klassen: name(…) { */
  /* [^()]* und nicht [^)]*: sonst frisst registerSortable({ … commit()
     sich bis zur Klammer von commit durch, und die Methode geht verloren. */
  for (const m of q.matchAll(/(?:^|[{,;])\s*(?:(?:async|get|set|static)\s+)*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)) namen.add(m[1]);
  for (const m of q.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) namen.add(m[1]);
  return namen;
}

/* Kommentare, Zeichenketten und Vorlagen-Text raus — "Aufrufe" darin
   sind Prosa. ${…} in Vorlagen bleibt, das ist Code. */
function nurCode(q) {
  let raus = '';
  let i = 0;
  while (i < q.length) {
    const c = q[i], d = q[i + 1];
    if (c === '/' && d === '*') { const e = q.indexOf('*/', i + 2); i = e < 0 ? q.length : e + 2; continue; }
    if (c === '/' && d === '/') { const e = q.indexOf('\n', i); i = e < 0 ? q.length : e; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < q.length && q[j] !== c) { if (q[j] === '\\') j++; if (q[j] === '\n') break; j++; }
      raus += '""'; i = j + 1; continue;
    }
    if (c === '`') {
      /* Vorlage: Text weglassen, ${…} behalten. */
      let j = i + 1;
      while (j < q.length && q[j] !== '`') {
        if (q[j] === '\\') { j += 2; continue; }
        if (q[j] === '$' && q[j + 1] === '{') {
          let t = 1, k = j + 2;
          while (k < q.length && t > 0) { if (q[k] === '{') t++; else if (q[k] === '}') t--; k++; }
          raus += ' ' + nurCode(q.slice(j + 2, k - 1)) + ' ';
          j = k; continue;
        }
        j++;
      }
      raus += '""'; i = j + 1; continue;
    }
    raus += c; i++;
  }
  return raus;
}

/* Regex-Literale grob entfernen: /…/flags nach einem Operator oder am
   Zeilenanfang. */
function ohneRegex(q) {
  return q.replace(/([=(,:;!&|?{}\[\n]\s*)\/(?![*/])(?:\\.|\[[^\]\n]*\]|[^/\\\n])+\/[gimsuyd]*/g, '$1""');
}

function nackteAufrufe(code) {
  const raus = new Set();
  /* Ein Punkt davor heisst Eigenschaft (a.b()) — ausser es sind drei:
     ...TABS ist ein Spread, und TABS darin ein ganz gewoehnlicher Name. */
  const vorn = String.raw`(^|[^.\w$?]|\.\.\.)`;
  for (const m of code.matchAll(new RegExp(vorn + String.raw`([A-Za-z_$][\w$]*)\s*\(`, 'g'))) raus.add(m[2]);
  /* Dazu Konstanten in Grossbuchstaben — TABS, MODULES, ICONS. Sie
     werden selten aufgerufen, aber genauso ins Leere benutzt:
     ...TABS.map(…) nach einem Import, der TABS nicht mehr enthielt. */
  for (const m of code.matchAll(new RegExp(vorn + String.raw`([A-Z][A-Z0-9_]{2,})\b(?!\s*:)`, 'g'))) raus.add(m[2]);
  return raus;
}

const dateien = [
  ...await module(join(root, 'assets/js')),
];

test('jeder nackte Aufruf hat einen Namen, den das Modul kennt', async () => {
  const funde = [];
  for (const pfad of dateien) {
    const roh = await readFile(pfad, 'utf8');
    const code = ohneRegex(nurCode(roh));
    const bekannt = eingefuehrt(code);
    for (const name of nackteAufrufe(code)) {
      if (GLOBAL.has(name) || bekannt.has(name)) continue;
      funde.push(`${relative(root, pfad).replace(/\\/g, '/')}: ${name}()`);
    }
  }
  assert.deepEqual(funde, [], `Aufrufe ohne Definition:\n  ${funde.join('\n  ')}`);
});

test('der Test findet einen Aufruf ins Leere wirklich', () => {
  /* Ein Test, der nie rot wird, beweist nichts. Das hier ist der
     Fehler aus v.35.19.0 in Kleinformat. */
  const code = ohneRegex(nurCode(`
    import { a } from './x.js';
    function b() { return a(); }
    onSnapshot(ref, s => { refreshAreaNavigation(s); });
  `));
  const bekannt = eingefuehrt(code);
  const offen = [...nackteAufrufe(code)].filter(n => !GLOBAL.has(n) && !bekannt.has(n));
  assert.deepEqual(offen.sort(), ['onSnapshot', 'refreshAreaNavigation']);
});
