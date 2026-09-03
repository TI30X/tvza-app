/* ══════════════════════════════════════════════════════════════════
   Firestore aus einem Cloudflare Worker.

   firebase-admin läuft hier nicht: es braucht Node-APIs, die es auf
   Workers nicht gibt. Bleibt die REST-Schnittstelle — und die will ein
   OAuth-Token, das man sich aus dem Service-Account-Schlüssel selbst
   besorgt.

   ── Der Umweg über das Token ──────────────────────────────────────
   Google verlangt einen JWT, der mit dem privaten Schlüssel des
   Service-Accounts signiert ist (RS256), und tauscht ihn gegen ein
   Zugriffstoken. WebCrypto kann das; man muss den PEM-Schlüssel nur
   erst in das Format bringen, das importKey erwartet.

   Das Token gilt eine Stunde und wird im Modul behalten. Ein Worker
   lebt zwar nur kurz, aber Cloudflare hält Instanzen für mehrere
   Anfragen — ohne Zwischenspeicher wäre jeder Kalenderabruf zwei
   HTTP-Runden statt einer.

   ── Was hier leicht falsch wird ───────────────────────────────────
   Firestore gibt Werte typisiert zurück: { stringValue: "x" } statt
   "x". Wer das nicht auspackt, schreibt "[object Object]" in einen
   Kalender. Das Auspacken ist deshalb eine reine Funktion mit Tests —
   die Netzteile darunter kann man ohne Ausrollen nicht prüfen, das
   Auspacken schon.
   ══════════════════════════════════════════════════════════════════ */

/* ── Werte auspacken ───────────────────────────────────────────────*/

/**
 * Ein typisierter Firestore-Wert als gewöhnlicher JS-Wert.
 * Unbekannte Typen ergeben null statt eines halben Objekts.
 */
export function wert(v) {
  if (v == null || typeof v !== 'object') return null;

  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue === true;

  /* integerValue kommt als ZEICHENKETTE — Firestore-Ganzzahlen sind
     64 Bit und passen nicht sicher in eine JS-Zahl. Für Ränge und
     Startnummern ist Number richtig; wer je grössere Zahlen speichert,
     muss hier hinschauen. */
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);

  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return felder(v.mapValue?.fields);
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(wert);

  /* bytesValue, referenceValue, geoPointValue — nichts davon kommt in
     diesem Datenmodell vor. Lieber null als etwas Erfundenes. */
  return null;
}

/** Ein ganzes fields-Objekt auspacken. */
export function felder(fields) {
  const raus = {};
  for (const [name, v] of Object.entries(fields || {})) raus[name] = wert(v);
  return raus;
}

/** Die Dokument-ID aus einem REST-Namen: projects/…/documents/a/b/c → c */
export function idAus(name) {
  const teile = String(name ?? '').split('/');
  return teile[teile.length - 1] || '';
}

/** Ein REST-Dokument als { id, …felder }. */
export function dokument(doc) {
  if (!doc?.name) return null;
  return { id: idAus(doc.name), ...felder(doc.fields) };
}

/* ── Der Schlüssel ─────────────────────────────────────────────────*/

const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * PEM in das Format bringen, das WebCrypto erwartet.
 *
 * Der Schlüssel kommt aus der Service-Account-JSON und trägt dort
 * echte "\n" als zwei Zeichen. Wer sie nicht ersetzt, bekommt von
 * importKey eine unbrauchbare Fehlermeldung.
 */
export function pemZuBytes(pem) {
  const roh = String(pem ?? '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  if (!roh) throw new Error('Der private Schlüssel ist leer.');

  const binaer = atob(roh);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

/* ── Token ─────────────────────────────────────────────────────────*/

const BEREICH = 'https://www.googleapis.com/auth/datastore';
let gemerkt = { token: '', bis: 0 };

export async function zugriffsToken(konto, jetzt = Date.now()) {
  /* Eine Minute Sicherheitsabstand: ein Token, das während der Anfrage
     abläuft, ergibt einen 401, den niemand erwartet. */
  if (gemerkt.token && gemerkt.bis - 60_000 > jetzt) return gemerkt.token;

  if (!konto?.client_email || !konto?.private_key) {
    throw new Error('Der Service-Account ist unvollständig.');
  }

  const sekunden = Math.floor(jetzt / 1000);
  const kopf = { alg: 'RS256', typ: 'JWT' };
  const nutzlast = {
    iss: konto.client_email,
    scope: BEREICH,
    aud: 'https://oauth2.googleapis.com/token',
    iat: sekunden,
    exp: sekunden + 3600,
  };

  const kodiere = obj => base64url(new TextEncoder().encode(JSON.stringify(obj)));
  const zuSignieren = `${kodiere(kopf)}.${kodiere(nutzlast)}`;

  const schluessel = await crypto.subtle.importKey(
    'pkcs8',
    pemZuBytes(konto.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatur = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', schluessel, new TextEncoder().encode(zuSignieren));

  const antwort = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${zuSignieren}.${base64url(signatur)}`,
    }),
  });
  if (!antwort.ok) {
    throw new Error(`Token abgelehnt (${antwort.status}): ${await antwort.text()}`);
  }

  const daten = await antwort.json();
  gemerkt = { token: daten.access_token, bis: jetzt + (daten.expires_in || 3600) * 1000 };
  return gemerkt.token;
}

/** Nur für Tests: den Zwischenspeicher leeren. */
export function vergesseToken() { gemerkt = { token: '', bis: 0 }; }

/* ── Lesen ─────────────────────────────────────────────────────────*/

const basis = projekt =>
  `https://firestore.googleapis.com/v1/projects/${projekt}/databases/(default)/documents`;

export async function leseDokument(umgebung, pfad) {
  const token = await zugriffsToken(umgebung.konto);
  const antwort = await fetch(`${basis(umgebung.projekt)}/${pfad}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (antwort.status === 404) return null;
  if (!antwort.ok) throw new Error(`Firestore ${antwort.status} bei ${pfad}`);
  return dokument(await antwort.json());
}

/**
 * Eine Sammlung, seitenweise. Firestore liefert höchstens, was
 * pageSize erlaubt, und einen nextPageToken — ohne die Schleife fehlten
 * bei einem Kader mit langer Saison die späteren Termine, ohne dass es
 * auffällt.
 */
export async function leseSammlung(umgebung, pfad, { seite = 300, maximal = 3000 } = {}) {
  const token = await zugriffsToken(umgebung.konto);
  const raus = [];
  let weiter = '';

  do {
    const adresse = new URL(`${basis(umgebung.projekt)}/${pfad}`);
    adresse.searchParams.set('pageSize', String(seite));
    if (weiter) adresse.searchParams.set('pageToken', weiter);

    const antwort = await fetch(adresse, { headers: { authorization: `Bearer ${token}` } });
    if (antwort.status === 404) return raus;
    if (!antwort.ok) throw new Error(`Firestore ${antwort.status} bei ${pfad}`);

    const daten = await antwort.json();
    for (const d of daten.documents || []) {
      const doku = dokument(d);
      if (doku) raus.push(doku);
    }
    weiter = daten.nextPageToken || '';
  } while (weiter && raus.length < maximal);

  return raus;
}
