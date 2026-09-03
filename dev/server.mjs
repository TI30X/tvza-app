/* Winziger statischer Server für die lokale Vorschau.

   Die App hat bewusst keinen Build-Schritt, aber sie hat relative
   Pfade (../assets/css/kit.css) und ES-Module — und beides funktioniert
   über file:// nicht zuverlässig. Dieser Server tut nichts weiter, als
   das Repo-Verzeichnis auszuliefern.

   Keine Abhängigkeiten, nichts, was mitgeliefert wird: dev/ gehört
   nicht zur ausgelieferten App.

       node dev/server.mjs          → http://localhost:4173
*/

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PORT = Number(process.env.PORT) || 4173;

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

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  /* Nichts ausserhalb des Repos ausliefern — auch nicht über ..%2F. */
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.writeHead(403).end('Ausserhalb des Projekts');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      /* Sonst zeigt der Browser beim Durchklicken die alte Datei. */
      'cache-control': 'no-store',
    }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
       .end(`Nicht gefunden: ${rel}`);
  }
}).listen(PORT, () => {
  console.log(`Firn — lokale Vorschau auf http://localhost:${PORT}`);
});
