/* Winziger statischer Server für die lokale Vorschau.

   Die App hat bewusst keinen Build-Schritt, aber sie hat relative
   Pfade (../assets/css/kit.css) und ES-Module — und beides funktioniert
   über file:// nicht zuverlässig. Dieser Server tut nichts weiter, als
   das Repo-Verzeichnis auszuliefern.

   Keine Abhängigkeiten, nichts, was mitgeliefert wird: dev/ gehört
   nicht zur ausgelieferten App.

       node dev/server.mjs              → http://localhost:4173
       node dev/server.mjs --attrappe   → http://localhost:4174

   ── Der Attrappen-Modus ───────────────────────────────────────────
   Die ganze App mit einem Testkonto, ohne Firebase: jede ausgelieferte
   Seite bekommt eine Import-Map vorangestellt, die das Firebase-SDK auf
   dev/attrappe/ umlenkt. Alles andere ist der echte Code — auch in den
   Rahmen des Routers und der Einstellungen, weil die ebenfalls über
   diesen Server kommen. Der Service Worker meldet sich dort ab; er würde
   sonst Seiten ohne Import-Map aus seinem Vorrat liefern.

   Konto wechseln: ?attrappe-als=timo an eine Adresse hängen (leer =
   abgemeldet). Zurück auf die Startdaten: attrappeZuruecksetzen() in der
   Konsole. Siehe dev/attrappe/firebase-firestore.js.
*/

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ATTRAPPE = process.argv.includes('--attrappe') || process.env.ATTRAPPE === '1';
const PORT = Number(process.env.PORT) || (ATTRAPPE ? 4174 : 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
};

const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/';
const KARTE = JSON.stringify({ imports: Object.fromEntries(
  ['firebase-app', 'firebase-auth', 'firebase-firestore', 'firebase-app-check']
    .map(n => [`${SDK}${n}.js`, `/dev/attrappe/${n}.js`])) });

/* Vor allem anderen im <head>: eine Import-Map gilt nur, wenn sie vor
   dem ersten Modul steht. Dazu ein Schild, damit kein Bildschirmfoto
   der Attrappe für die echte App gehalten wird. */
const VORSPANN = `
<script type="importmap">${KARTE}</script>
<script>
  /* Jeder unbehandelte Fehler dieses Dokuments, zum Nachsehen:
     window.__attrappeFehler. So fiel auf, dass start.js seit v.35.12.0
     mitten im Modul abbrach. */
  window.__attrappeFehler = [];
  addEventListener('error', e => __attrappeFehler.push(String(e.error?.stack || e.message).split('\\n').slice(0, 2).join(' | ')));
  addEventListener('unhandledrejection', e => __attrappeFehler.push('Promise: ' + String(e.reason?.stack || e.reason).split('\\n').slice(0, 2).join(' | ')));
  addEventListener('DOMContentLoaded', () => {
    if (window.parent !== window) return;
    const s = document.createElement('div');
    const wer = localStorage.getItem('firn.attrappe.uid') ?? 'michel';
    s.textContent = 'Attrappe · ' + (wer || 'abgemeldet');
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:2147483647;font:700 10px/1 system-ui;padding:4px 6px;border-radius:6px;background:#b45309;color:#fff;opacity:.85;pointer-events:none';
    document.body.appendChild(s);
  });
</script>`;

const LEERER_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.registration.unregister());`;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  if (ATTRAPPE && rel === '/sw.js') {
    res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' }).end(LEERER_SW);
    return;
  }

  /* Nichts ausserhalb des Repos ausliefern — auch nicht über ..%2F. */
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.writeHead(403).end('Ausserhalb des Projekts');
    return;
  }

  try {
    let body = await readFile(file);
    const art = extname(file).toLowerCase();
    if (ATTRAPPE && art === '.html') {
      body = Buffer.from(String(body).replace(/<head(\s[^>]*)?>/i, m => m + VORSPANN));
    }
    res.writeHead(200, {
      'content-type': TYPES[art] || 'application/octet-stream',
      /* Sonst zeigt der Browser beim Durchklicken die alte Datei. */
      'cache-control': 'no-store',
    }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
       .end(`Nicht gefunden: ${rel}`);
  }
}).listen(PORT, () => {
  console.log(`Firn — lokale Vorschau auf http://localhost:${PORT}${ATTRAPPE ? '  (Attrappe: ohne Firebase, Testkonto)' : ''}`);
});
