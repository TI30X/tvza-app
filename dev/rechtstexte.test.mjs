/* Datenschutz, Betreiber und der Weg dorthin (v.35.70.0).
 *
 * Michel: "Ich wuerde im Footer drei getrennte Seiten verlinken:
 * Nutzungsbedingungen · Datenschutz · Betreiber & Kontakt." Und zu den
 * Angaben, die noch fehlen: "Max Mustermann ist hier allerdings kein
 * zulaessiger Ersatz fuer die tatsaechliche Identitaet."
 *
 * Was dieser Test haelt, sind nicht die Formulierungen, sondern:
 * - dass die drei Seiten existieren, offline im Vorrat liegen und die
 *   Seiten-Invariante halten,
 * - dass jede Seite zu den beiden anderen fuehrt,
 * - dass die Datenschutzerklaerung die Dienste NENNT, die wirklich
 *   mitarbeiten, statt allgemein zu bleiben,
 * - und dass die Luecke auf der Betreiber-Seite sichtbar bleibt,
 *   solange sie besteht.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const lies = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const SEITEN = ['nutzung.html', 'datenschutz.html', 'betreiber.html'];

test('die drei Rechtstexte halten die Seiten-Invariante', async () => {
  for (const seite of SEITEN) {
    const html = await lies(seite);
    assert.doesNotMatch(html, /<style[\s>]/, `style-Block in ${seite}`);
    assert.doesNotMatch(html, /\sstyle="/, `style-Attribut in ${seite}`);
    assert.doesNotMatch(html, /<script type="module">/, `Inline-Modul in ${seite}`);

    const hex = [...html.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map(m => m[0]);
    const erlaubt = [...html.matchAll(/theme-color" content="(#[0-9A-Fa-f]{3,8})"/g)].map(m => m[1]);
    assert.deepEqual(hex.filter(h => !erlaubt.includes(h)), [],
      `Hex-Farbe ausserhalb von theme-color in ${seite}`);
  }
});

test('jede der drei Seiten fuehrt zu den beiden anderen', async () => {
  for (const seite of SEITEN) {
    const html = await lies(seite);
    for (const ziel of SEITEN.filter(s => s !== seite)) {
      assert.ok(html.includes(`href="${ziel}"`), `${seite} fuehrt nicht zu ${ziel}`);
    }
  }
});

test('auch aus der App heraus findet man sie', async () => {
  /* Bis v.35.70.0 fuehrte aus der angemeldeten App KEIN Weg zu den
     Bedingungen: sie standen nur auf der Willkommen-Seite, die ein
     angemeldetes Konto nie wieder sieht. */
  const index = await lies('index.html');
  for (const ziel of SEITEN) {
    assert.ok(index.includes(`href="${ziel}"`), `der Fuss der Startseite fuehrt nicht zu ${ziel}`);
  }
});

test('sie liegen offline im Vorrat', async () => {
  const sw = await lies('sw.js');
  for (const seite of SEITEN) {
    assert.ok(sw.includes(`'./${seite}'`), `${seite} fehlt im Vorrat des Service Workers`);
  }
});

test('die Datenschutzerklaerung nennt die Dienste beim Namen', async () => {
  /* Michel: "Diese Angaben sollten wir nicht erfinden oder durch
     allgemeine Saetze wie 'Deine Daten sind sicher' ersetzen."
     Jeder dieser Namen ist im Code belegt: firebase-config.js,
     worker/ki.js, die <link>-Zeilen jeder Seite. */
  const ds = await lies('datenschutz.html');
  for (const dienst of ['Firebase', 'Cloudflare', 'Gemini', 'GitHub Pages', 'Google Fonts']) {
    assert.ok(ds.includes(dienst), `die Erklaerung nennt ${dienst} nicht`);
  }

  /* Der Ort der Datenbank ist eine Tatsache, keine Einschaetzung:
     `firebase firestore:databases:get "(default)"` sagt europe-west6. */
  assert.match(ds, /europe-west6/, 'der Ort der Datenbank fehlt');

  /* Und der Satz, der in Fassung 1 der Bedingungen falsch war. */
  assert.doesNotMatch(ds, /Deine Daten sind sicher|geben sie nicht weiter/,
    'die Erklaerung beruhigt, statt zu beschreiben');

  /* Was an die KI geht, steht als Liste da — und was nicht. */
  assert.match(ds, /<strong>Nicht<\/strong>/,
    'es steht nicht da, was NICHT an den Assistenten geht');
});

test('die Luecke auf der Betreiber-Seite bleibt sichtbar, solange sie besteht', async () => {
  /* Die Anschrift kennt nur Michel. Erfunden wird sie nicht — und
     verschwiegen auch nicht: solange "[noch einzutragen]" dasteht,
     muss der Hinweis oben stehen. Wer die Angaben eintraegt, nimmt den
     Hinweis mit weg; wer den Hinweis wegnimmt, ohne die Angaben
     einzutragen, steht hier wieder. */
  /* Ohne Kommentare: im Quelltext der Seite steht Michels Satz ueber
     Max Mustermann als Begruendung — gemeint ist der sichtbare Text. */
  const bt = (await lies('betreiber.html')).replace(/<!--[\s\S]*?-->/g, '');
  const offen = bt.includes('[noch einzutragen');
  const hinweis = bt.includes('class="nb__entwurf"');

  assert.equal(offen, hinweis,
    offen
      ? 'die Angaben fehlen, aber der Hinweis darauf steht nicht mehr da'
      : 'die Angaben stehen, aber der Hinweis behauptet weiter, sie fehlten');

  /* Der Name des Betreibers steht in jedem Fall. */
  assert.match(bt, /Timothy van Zanten/, 'die Seite nennt den Betreiber nicht');
  assert.doesNotMatch(bt, /Max Mustermann|Erika Musterfrau/,
    'ein erfundener Name als Betreiber');
});

test('die Anmeldeseite fuehrt aus dem vergessenen Passwort heraus', async () => {
  /* Bis v.35.70.0 gab es keinen Weg zurueck: wer sein Passwort vergass,
     kam an sein Konto nicht mehr heran. Firebase verschickt die Mail
     selbst — das braucht keinen Server (Spark-Tarif). */
  const login = await lies('login.html');

  assert.match(login, /sendPasswordResetEmail/, 'kein Versand fuer ein neues Passwort');
  assert.match(login, /id="btnVergessen"/, 'kein Knopf fuer ein vergessenes Passwort');
  assert.match(login, /addEventListener\('keydown'/, 'der Knopf ist nur mit der Maus erreichbar');

  /* Die Antwort verraet NICHT, ob es das Konto gibt — dieselbe
     Zurueckhaltung wie bei der Anmeldung (login-i18n.test.mjs). */
  const de = JSON.parse(await lies('assets/i18n/de.json'));
  assert.match(de['login.resetGesendet'], /Gibt es ein Konto/,
    'die Bestaetigung sagt, ob es das Konto gibt');
  for (const sprache of ['de', 'en', 'fr', 'it', 'pl', 'nl', 'es']) {
    const katalog = JSON.parse(await lies(`assets/i18n/${sprache}.json`));
    assert.doesNotMatch(katalog['login.resetGesendet'],
      /kein Konto|not found|nicht gefunden|no account|no existe/i,
      `login.resetGesendet in ${sprache} verraet, ob es das Konto gibt`);
  }
});

test('die Formulare erklaeren, was sie verlangen', async () => {
  /* Michel: "Die tatsaechlichen Passwortanforderungen gehoeren
     zusaetzlich sichtbar unter das Feld." Sechs Zeichen ist, was
     Firebase Auth verlangt — die Zahl im Hinweis und die Zahl in der
     Fehlermeldung muessen dieselbe sein. */
  const de = JSON.parse(await lies('assets/i18n/de.json'));
  const ausHinweis = de['login.passHinweis'].match(/(\d+)\s*Zeichen/)?.[1];
  const ausFehler = de['login.fehler.schwach'].match(/(\d+)\s*Zeichen/)?.[1];
  assert.equal(ausHinweis, ausFehler,
    'der Hinweis unter dem Feld nennt eine andere Laenge als die Fehlermeldung');

  const login = await lies('login.html');
  assert.match(login, /id="passHinweis"/, 'kein Hinweis unter dem Passwortfeld');
  assert.match(login, /id="mailHinweis"/, 'kein Hinweis unter dem E-Mail-Feld');
  assert.match(login, /data-i18n="login\.nameHinweis"/, 'kein Hinweis unter dem Namensfeld');

  /* Die Beispiele gehoeren niemandem: example.com ist dafuer
     reserviert (RFC 2606), "z.B. Timo" war ein echter Mensch. */
  assert.match(de['login.mailPh'], /@example\.com$/, 'das Beispiel ist keine reservierte Adresse');
  assert.doesNotMatch(de['login.namePh'], /Timo/, 'das Beispiel nennt einen echten Menschen');
});

test('die Beispiele in der App gehoeren niemandem', async () => {
  /* Michel: Beispiele wie "Timo", "BSV Perspektivkader" und "Malbun"
     lassen das Produkt wie eine Anwendung fuer einen bestimmten
     privaten Kreis wirken. Geprueft werden die fest eingebauten
     Platzhalter — nicht die Daten, die jemand eingetragen hat. */
  const de = JSON.parse(await lies('assets/i18n/de.json'));
  const platzhalter = Object.entries(de)
    .filter(([key]) => /Ph$|Beispiel|Bsp/.test(key))
    .map(([key, wert]) => `${key}: ${wert}`);

  const privat = platzhalter.filter(z => /Malbun|BSV|Perspektivkader|Coach Maxi|\bTimo\b/.test(z));
  assert.deepEqual(privat, [], 'ein Platzhalter nennt einen bestimmten Kreis');
});
