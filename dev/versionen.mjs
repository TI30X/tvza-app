/* Zieht die ?v= einer geaenderten Datei nach — samt Kette.

     node dev/versionen.mjs assets/css/kit.css assets/js/shell.js

   Falle 1 in CLAUDE.md: aendert sich eine Datei, die mit ?v= geladen
   wird, muss die Zahl an JEDER Stelle mitwandern. Und wer sie laedt,
   hat damit selbst eine neue Zeile — ist er seinerseits mit ?v=
   geladen, wandert auch seine Zahl. shell.js aendern heisst gruppe.js
   aendern heisst gruppe.html und sw.js aendern. Von Hand vergisst man
   genau das eine Glied, und der Browser mischt dann alten und neuen Code.

   Das Werkzeug liest alle Seiten, alle Skripte unter assets/js und
   sw.js, loest jeden Verweis mit ?v= relativ zur Datei auf (sw.js:
   relativ zur Wurzel) und zaehlt hoch, bis sich nichts mehr bewegt.
   Verweise ohne ?v= bleiben, wie sie sind. APP_VERSION und CACHE sind
   eine eigene Sache und bleiben unberuehrt. */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, posix } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERWEIS = /(["'`])((?:\.{1,2}\/)*[\w-][\w./-]*?\.(?:js|css))\?v=(\d+)\1/g;

async function dateien() {
  const raus = ['sw.js'];
  for (const f of await readdir(root)) if (f.endsWith('.html')) raus.push(f);
  for (const f of await readdir(join(root, 'pages'))) if (f.endsWith('.html')) raus.push(`pages/${f}`);
  async function js(verzeichnis) {
    for (const e of await readdir(join(root, verzeichnis), { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${e.name}`;
      if (e.isDirectory()) await js(pfad);
      else if (e.name.endsWith('.js')) raus.push(pfad);
    }
  }
  await js('assets/js');
  return raus;
}

/** Wohin ein Verweis aus einer Datei zeigt, als Pfad ab der Wurzel. */
export function ziel(datei, spec) {
  const basis = datei === 'sw.js' ? '' : posix.dirname(datei);
  return posix.normalize(posix.join(basis, spec));
}

/** Zieht nach; gibt [{ datei, alt, neu, von }] zurueck. Schreibt nur, wenn schreiben. */
export async function nachziehen(start, { schreiben = true, lesen } = {}) {
  const liste = await dateien();
  const text = {};
  for (const f of liste) text[f] = lesen ? await lesen(f) : await readFile(join(root, f), 'utf8');

  const aenderungen = [];
  const warteschlange = start.map(s => posix.normalize(s));
  const erledigt = new Set();
  while (warteschlange.length) {
    const f = warteschlange.shift();
    if (erledigt.has(f)) continue;
    erledigt.add(f);

    const alte = new Set();
    for (const d of liste) for (const m of text[d].matchAll(VERWEIS)) if (ziel(d, m[2]) === f) alte.add(Number(m[3]));
    if (!alte.size) continue;
    if (alte.size > 1) throw new Error(`${f} wird mit verschiedenen ?v= geladen: ${[...alte].join(', ')}`);
    const alt = [...alte][0], neu = alt + 1;

    for (const d of liste) {
      let getroffen = false;
      text[d] = text[d].replace(VERWEIS, (ganz, q, spec, v) => {
        if (ziel(d, spec) !== f) return ganz;
        getroffen = true;
        return `${q}${spec}?v=${neu}${q}`;
      });
      if (getroffen) {
        aenderungen.push({ datei: d, von: f, alt, neu });
        if (d.endsWith('.js') && d !== 'sw.js') warteschlange.push(d);
      }
    }
  }
  if (schreiben) {
    for (const d of new Set(aenderungen.map(a => a.datei))) await writeFile(join(root, d), text[d]);
  }
  return aenderungen;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const start = process.argv.slice(2).map(p => relative(root, join(process.cwd(), p)).split('\\').join('/'));
  if (!start.length) { console.log('node dev/versionen.mjs <datei> [<datei> …]'); process.exit(1); }
  const aenderungen = await nachziehen(start);
  const je = {};
  for (const a of aenderungen) (je[`${a.von}  ?v=${a.alt} → ${a.neu}`] ||= []).push(a.datei);
  for (const [was, wo] of Object.entries(je)) console.log(`${was}\n    ${wo.join(', ')}`);
  if (!aenderungen.length) console.log('nichts nachzuziehen — die Datei wird nirgends mit ?v= geladen');
}
