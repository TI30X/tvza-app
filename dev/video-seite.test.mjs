/* Tests für die Videoanalyse-Seite.
 *
 * Neben der üblichen Prüfung Markup-gegen-Skript steht hier ein Test,
 * der aus einem Fehler entstanden ist: die erste Fassung schrieb
 * "wird nicht hochgeladen" in die Oberfläche. Das ist als
 * Produktaussage falsch — Videos WERDEN gespeichert, sonst kann ein
 * Trainer einen Schwung im Januar nicht mit dem vom November
 * vergleichen.
 *
 * Dauerhaft wahr ist etwas Genaueres: die ANALYSE läuft auf dem Gerät.
 * Nur das darf dort stehen, und der Test hält es fest.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(join(root, name), 'utf8');
const seite = () => read('pages/video.html');
const skript = () => read('assets/js/feature/video/video.js');

test('die Seite verspricht nicht, dass nichts hochgeladen wird', async () => {
  const html = await seite();

  // Videos werden gespeichert — das ist der Sinn der Sache. Ein
  // Versprechen in der Oberfläche, das das Produkt später bricht, ist
  // schlimmer als gar keines.
  assert.doesNotMatch(html, /nicht hochgeladen/i);
  assert.doesNotMatch(html, /verlässt das Gerät nicht/i);

  // Was stimmt und stehen darf: die Auswertung läuft im Browser.
  assert.match(html, /Auswertung läuft im\s+Browser/);
  assert.match(html, /an keinen Server geschickt/);
});

test('jede vom Skript gesuchte ID gibt es im Markup', async () => {
  const [html, js] = await Promise.all([seite(), skript()]);
  const vorhanden = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const gesucht = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));

  const fehlend = [...gesucht].filter(id => !vorhanden.has(id));
  assert.deepEqual(fehlend, [], `IDs ohne Element in video.html: ${fehlend}`);
});

test('kein $(...) ohne Anführungszeichen', async () => {
  const js = await skript();
  const nackt = [...js.matchAll(/\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g)]
    .map(m => m[1]).filter(n => n !== 'id');
  assert.deepEqual(nackt, [], `$(...) ohne Anführungszeichen: ${nackt}`);
});

test('das Modell wird erst geladen, wenn ausgewertet wird', async () => {
  const js = await skript();

  // MediaPipe wiegt ein paar Megabyte. Wer nur ein Video ansehen will,
  // soll nichts nachladen.
  assert.match(js, /async function ladeDetektor\(\)/);
  assert.match(js, /await import\(TASKS\)/);

  const analyse = js.slice(js.indexOf('async function analysiere'));
  assert.match(analyse.slice(0, 800), /await ladeDetektor\(\)/);

  // Und der Import steht NICHT oben bei den festen Importen.
  const kopf = js.slice(0, js.indexOf('const $ ='));
  assert.doesNotMatch(kopf, /tasks-vision/);
});

test('eine gescheiterte Analyse nimmt die Wiedergabe nicht mit', async () => {
  const js = await skript();

  // Offline, blockiert, oder das CDN antwortet nicht — das Video soll
  // sich trotzdem ansehen lassen.
  assert.match(js, /Die Auswertung ging nicht\. Das Video lässt sich trotzdem ansehen\./);
  const analyse = js.slice(js.indexOf('async function analysiere'));
  assert.match(analyse, /finally \{/);
  assert.match(analyse, /knopf\.disabled = false/);
});

test('beim Abtasten wird auf seeked gewartet', async () => {
  const js = await skript();

  // Ohne das Ereignis liest der Detektor mehrfach dasselbe Bild, und
  // der Befund beruht auf einem Bruchteil der Daten — ohne dass es
  // auffällt, denn es kommen ja Zahlen heraus.
  assert.match(js, /video\.addEventListener\('seeked', fertig, \{ once: true \}\)/);
});

test('unsichere Punkte werden auch nicht gezeichnet', async () => {
  const js = await skript();

  // Dieselbe Regel wie in pose.js, nur mit Tinte statt Zahlen: eine
  // Linie zu einem geratenen Knie sieht aus wie eine Messung.
  assert.match(js, /\(pa\.visibility \?\? 1\) < 0\.5 \|\| \(pz\.visibility \?\? 1\) < 0\.5/);
  assert.match(js, /if \(!p \|\| \(p\.visibility \?\? 1\) < 0\.5\) continue/);
});

test('der Befund sagt, wie viel überhaupt auswertbar war', async () => {
  const js = await skript();

  // War nur ein Bruchteil auswertbar, sagt der Rest wenig — und das
  // gehört dazugeschrieben statt in einer Fussnote versteckt.
  assert.match(js, /anteil < 60/);
  assert.match(js, /Die Zahlen oben sagen entsprechend wenig/);
});

test('das Skelett rechnet auf das angezeigte Bild um', async () => {
  const js = await skript();

  // Das Video steht mit object-fit: contain in der Bühne. Ohne
  // Umrechnung liegt das Skelett auf den schwarzen Balken daneben.
  assert.match(js, /const seitenVideo = \(video\.videoWidth \|\| 1\) \/ \(video\.videoHeight \|\| 1\)/);
  assert.match(js, /const links = \(breite - b\) \/ 2/);

  const css = await read('assets/css/feature/video.css');
  assert.match(css, /object-fit: contain/);
  // Und das Canvas darf die Klicks nicht abfangen, die dem Video gelten.
  assert.match(css, /\.vid-lage \{[\s\S]*?pointer-events: none/);
});
