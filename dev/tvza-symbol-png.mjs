/* Erzeugt assets/icons/tvza-192.png aus assets/icons/tvza.svg.

     node dev/tvza-symbol-png.mjs

   Ohne Abhaengigkeit: das Symbol ist ein Verlauf und zwei Rechtecke, und
   genau die liest das Skript aus dem SVG — Farben, Lage, Groesse. Wer das
   SVG aendert, laesst das Skript laufen, und die PNG kann nicht vom SVG
   abweichen. Die Kanten sind nach Flaechenanteil geglaettet.

   Randlos wie firn-192.png: iOS legt seine eigene Maske darueber, ein
   Symbol mit eigenen runden Ecken bekaeme eine doppelte. */

import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GROESSE = 192;

export function leseSymbol(svg) {
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const stops = [...svg.matchAll(/<stop[^>]*stop-color="(#[0-9A-Fa-f]{6})"/g)].map(m => hex(m[1]));
  const zeichen = svg.match(/<g id="tvzaZeichen">([\s\S]*?)<\/g>/)?.[1] || '';
  const rechtecke = [...zeichen.matchAll(/<rect ([^>]*)\/>/g)].map(([, a]) => {
    const w = n => Number(a.match(new RegExp(`\\b${n}="([^"]+)"`))[1]);
    return { x: w('x'), y: w('y'), b: w('width'), h: w('height'), farbe: hex(a.match(/fill="(#[0-9A-Fa-f]{6})"/)[1]) };
  });
  if (stops.length !== 2 || !rechtecke.length) throw new Error('tvza.svg hat nicht die erwartete Form');
  return { stops, rechtecke };
}

/* Anteil des Pixels [p, p+1], den die Strecke [a, b] bedeckt. */
const anteil = (p, a, b) => Math.max(0, Math.min(p + 1, b) - Math.max(p, a));

export function zeichne({ stops, rechtecke }, n = GROESSE) {
  const s = n / 64;
  const pixel = Buffer.alloc(n * n * 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      /* x1=0 y1=0 x2=1 y2=1: der Verlauf laeuft die Diagonale entlang. */
      const t = (x + y + 1) / (2 * n);
      let farbe = stops[0].map((c, i) => c + (stops[1][i] - c) * t);
      for (const r of rechtecke) {
        const k = anteil(x, r.x * s, (r.x + r.b) * s) * anteil(y, r.y * s, (r.y + r.h) * s);
        if (k > 0) farbe = farbe.map((c, i) => c + (r.farbe[i] - c) * k);
      }
      farbe.forEach((c, i) => { pixel[(y * n + x) * 3 + i] = Math.round(c); });
    }
  }
  return pixel;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function block(typ, daten) {
  const laenge = Buffer.alloc(4); laenge.writeUInt32BE(daten.length);
  const kopf = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const pruef = Buffer.alloc(4); pruef.writeUInt32BE(crc32(kopf));
  return Buffer.concat([laenge, kopf, pruef]);
}

export function png(pixel, n = GROESSE) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 2; /* 8 Bit, RGB */
  const zeilen = Buffer.alloc(n * (n * 3 + 1));
  for (let y = 0; y < n; y++) pixel.copy(zeilen, y * (n * 3 + 1) + 1, y * n * 3, (y + 1) * n * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    block('IHDR', ihdr), block('IDAT', deflateSync(zeilen, { level: 9 })), block('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const svg = await readFile(join(root, 'assets/icons/tvza.svg'), 'utf8');
  const daten = png(zeichne(leseSymbol(svg)));
  await writeFile(join(root, 'assets/icons/tvza-192.png'), daten);
  console.log(`assets/icons/tvza-192.png: ${GROESSE}×${GROESSE}, ${daten.length} Bytes`);
}
