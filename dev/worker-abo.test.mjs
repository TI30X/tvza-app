/* Tests für den Worker-Einstieg und das Kalender-Abo.
 *
 * Der Worker selbst braucht Netz und Cloudflare-Globals; geprüft wird
 * hier, was ohne Ausrollen prüfbar ist — und das sind genau die
 * Stellen, an denen ein Fehler etwas verrät oder etwas unbrauchbar
 * macht.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(join(root, name), 'utf8');

test('falsches Token und fehlende Gruppe geben dieselbe Antwort', async () => {
  const js = await read('worker/index.js');

  // Ein 403 würde bestätigen, dass die Gruppe existiert — und damit
  // verraten, dass man nur noch das Token raten muss.
  assert.match(js, /if \(!gruppe \|\| !gruppe\.icsToken \|\| !gleichOhneZeit\(gruppe\.icsToken, token\)\) \{\s*\n\s*return text\('Nicht gefunden\.', 404\);/);

  /* Auf den STATUS prüfen, nicht auf den Text: der Kommentar im Worker
     erklärt gerade, warum es keine 403 gibt, und enthält die Zahl
     darum selbst. Der erste Anlauf dieses Tests ist daran gescheitert. */
  const ohneKommentare = js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(z => z.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(ohneKommentare, /,\s*403\s*[,)]/);
});

test('das Token wird ohne Zeitunterschied verglichen', async () => {
  const js = await read('worker/index.js');

  // Ein gewöhnliches === bricht beim ersten falschen Zeichen ab, und
  // daraus lässt sich ein Token Zeichen für Zeichen erraten.
  assert.match(js, /function gleichOhneZeit\(a, b\)/);
  assert.match(js, /diff \|= x\.charCodeAt\(i\) \^ y\.charCodeAt\(i\)/);
  assert.match(js, /return diff === 0/);
});

test('der Worker antwortet auf HEAD, nicht nur auf GET', async () => {
  const js = await read('worker/index.js');

  // Kalender-Clients schicken oft erst ein HEAD, um zu sehen, ob es
  // die Adresse gibt. Wer nur GET beantwortet, wird von manchen gar
  // nicht erst abonniert.
  assert.match(js, /request\.method !== 'GET' && request\.method !== 'HEAD'/);
  assert.match(js, /request\.method === 'HEAD'\s*\n?\s*\? new Response\(null,/);
});

test('die Antwort trägt die Kopfzeilen, die ein Abo braucht', async () => {
  const js = await read('worker/index.js');

  assert.match(js, /'content-type': 'text\/calendar; charset=utf-8'/);
  // inline, nicht attachment: manche Clients laden sonst eine Datei
  // herunter statt zu abonnieren.
  assert.match(js, /inline; filename=/);
  assert.match(js, /'cache-control': 'public, max-age=900'/);
  assert.match(js, /'access-control-allow-origin': '\*'/);
});

test('Fehlermeldungen gehen ins Log, nicht an den Abonnenten', async () => {
  const js = await read('worker/index.js');

  // Eine Meldung kann den Projektnamen oder die Service-Account-Adresse
  // enthalten. Der Abonnent bekommt einen Satz, das Log den Grund.
  assert.match(js, /console\.error\('\[firn-worker\]'/);
  assert.match(js, /return text\('Da ist etwas schiefgelaufen\.', 500\)/);
});

test('das Abo-Token ist ein eigenes, nicht der Beitrittscode', async () => {
  const [rules, groups] = await Promise.all([
    read('firestore.rules'), read('assets/js/groups.js'),
  ]);

  // Wer den Kalender liest, soll nicht beitreten können. Zwei Dinge,
  // zwei Codes — dieselbe Trennung wie überall sonst im Modell.
  assert.match(rules, /'inviteToken', 'icsToken', 'farbe', 'createdAt'/);
  assert.match(rules, /hasOnly\(\['name', 'farbe', 'bereiche', 'inviteToken', 'icsToken'\]\)/);
  assert.match(groups, /export async function abonnementErneuern\(gid\)/);
  assert.match(groups, /updateDoc\(gruppeRef\(gid\), \{ icsToken: token \}\)/);

  // Und das Token kommt aus crypto, wie der Beitrittscode.
  assert.match(groups, /const token = code\(\)/);
});

test('ohne Worker gibt es keinen Abo-Knopf', async () => {
  const [config, js, html] = await Promise.all([
    read('assets/js/worker-config.js'),
    read('assets/js/feature/gruppe/gruppe.js'),
    read('pages/gruppe.html'),
  ]);

  // Eine statische Seite kann kein text/calendar ausliefern. Ein Knopf,
  // der zuverlässig scheitert, ist schlechter als keiner.
  assert.match(config, /export const WORKER_BASIS = ''/);
  assert.match(js, /abo\.hidden = !darfFuehren \|\| !WORKER_BASIS/);
  assert.match(html, /id="btnAbo"[^>]*hidden/);
});

test('ein neues Abo zieht das alte zurück, und das wird gesagt', async () => {
  const js = await read('assets/js/feature/gruppe/gruppe.js');

  // Neu setzen heisst gleichzeitig zurückziehen — das ist der Weg,
  // wenn jemand den Verein verlässt. Aber wer nur die Adresse noch
  // einmal sehen will, soll nicht versehentlich alle Abos brechen.
  assert.match(js, /if \(aktiv\.icsToken && !confirm\(/);
  assert.match(js, /macht die alte Adresse ungültig/);
});

test('die Wortwahl im Abo kommt aus termine.js, nicht aus einer Kopie', async () => {
  const js = await read('worker/index.js');

  // Ein Gym-Kurs soll im Abo "Kurs" heissen und nicht "Training". Eine
  // zweite Wortliste im Worker wäre die Sorte Dublette, die
  // auseinanderläuft.
  assert.match(js, /import \{ artWort \} from '\.\.\/assets\/js\/termine\.js'/);
  assert.match(js, /artWort: art => artWort\(art, gruppe\.art\)/);
});

test('der Worker braucht keine Node-Verträglichkeit', async () => {
  const toml = await read('worker/wrangler.toml');

  // Nur fetch, WebCrypto und TextEncoder. Sollte hier je eine
  // Node-Abhängigkeit nötig werden, ist das ein Zeichen, dass die
  // Aufgabe nicht auf einen Worker gehört.
  assert.doesNotMatch(toml, /^\s*compatibility_flags/m);
  assert.match(toml, /main = "index\.js"/);

  // Und das Geheimnis steht nicht in der Konfiguration.
  assert.doesNotMatch(toml, /SERVICE_ACCOUNT\s*=/);
  assert.match(toml, /wrangler secret put SERVICE_ACCOUNT/);
});

test('der Service-Account-Schlüssel kann nicht ins Repo geraten', async () => {
  const ignore = await read('.gitignore');

  // Dieselbe Regel wie für mailer/: der private Schlüssel darf nie in
  // Git, nie in die Website und nie in Firestore.
  assert.match(ignore, /\*\*\/\*service-account\*\.json/);
});
