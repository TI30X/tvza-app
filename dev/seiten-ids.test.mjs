/* Jedes Element, das ein Modul ohne ?. anfasst, steht in seiner Seite.

   Bis v.35.44.0 hängte start.js einen Zuhörer an #openSettingsLink —
   den Einstellungs-Link des alten Startmenüs, den v.35.12.0 abgeschafft
   hatte. document.getElementById gab null, die Zeile warf, und ein
   Fehler auf oberster Ebene eines Moduls beendet das ganze Modul. Alles
   darunter lief über dreissig Versionen lang nie: der Schliessknopf der
   Einstellungen, das Speichern der Modul-Schalter, Teilen, Einladungen,
   "Meine Projekte", der Service Worker. Michel: "manchmal funktioniert
   das Kreuzchen nicht" und "man kann seine Module nicht einstellen".

   Kein Test hat es gesehen, weil jeder nur seinen Baustein prüfte. Dieser
   hier liest je Seite ihr Einstiegsmodul und die Module daneben, die es
   importiert, und sucht getElementById('x'). / $('x'). ohne ?. — ein
   Zugriff, der wirft, wenn es x nicht gibt. x muss im Markup der Seite
   stehen oder in einem Baustein, den das Modul selbst zeichnet
   (id="x" in seinem Code). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = p => readFile(join(root, p), 'utf8').catch(() => '');
const ohneKommentare = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function seiten() {
  const wurzel = (await readdir(root)).filter(f => f.endsWith('.html'));
  const unter = (await readdir(join(root, 'pages'))).filter(f => f.endsWith('.html')).map(f => `pages/${f}`);
  return [...wurzel, ...unter];
}

/* Das Einstiegsmodul einer Seite und, eine Stufe tief, die Module
   daneben, die es relativ importiert (feature/matura/uebersicht.js lädt
   uebersicht-ansicht.js). Gemeinsame Bausteine (shell.js, dialog.js)
   bauen ihr Markup selbst und gehören keiner Seite. */
async function moduleVon(seite, html) {
  const raus = [];
  for (const m of html.matchAll(/<script type="module" src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)) {
    const einstieg = posix.normalize(posix.join(posix.dirname(seite), m[1]));
    if (!einstieg.includes('/feature/')) continue;
    raus.push(einstieg);
    const q = await lies(einstieg);
    for (const i of q.matchAll(/from '\.\/([\w-]+\.js)(?:\?v=\d+)?'/g)) {
      raus.push(posix.join(posix.dirname(einstieg), i[1]));
    }
  }
  return raus;
}

test('kein Modul greift ungeschützt auf ein Element zu, das es in seiner Seite nicht gibt', async () => {
  const funde = [];
  let geprueft = 0;
  for (const seite of await seiten()) {
    const html = await lies(seite);
    const module = await moduleVon(seite, html);
    if (!module.length) continue;
    const quellen = await Promise.all(module.map(lies));
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    /* Was ein Modul selbst zeichnet, gibt es danach ebenfalls. */
    for (const q of quellen) for (const m of q.matchAll(/\bid="([\w-]+)"/g)) ids.add(m[1]);

    module.forEach((pfad, i) => {
      const code = ohneKommentare(quellen[i]);
      for (const m of code.matchAll(/(?:document\.getElementById|(?<![\w.])\$)\('([\w-]+)'\)(?=\s*[.[])(?!\s*\?\.)/g)) {
        geprueft++;
        if (!ids.has(m[1])) funde.push(`${seite} → ${pfad}: #${m[1]}`);
      }
    });
  }
  assert.ok(geprueft > 200, `nur ${geprueft} Zugriffe gefunden — Muster veraltet?`);
  assert.deepEqual([...new Set(funde)], []);
});
