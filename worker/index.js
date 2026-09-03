/* ══════════════════════════════════════════════════════════════════
   Der Firn-Worker.

   Alles, was eine statische Seite auf GitHub Pages nicht kann: eine
   Kopfzeile setzen, ohne Anmeldung lesen, auf einen Zeitplan reagieren.

   ── Was heute darin läuft ─────────────────────────────────────────
   GET /ics/<gruppe>?t=<token>
       Der Kalender einer Gruppe als iCalendar. Eltern abonnieren das
       in Apple Calendar, OHNE ein Konto bei Firn zu haben. Das ist der
       Weg, auf dem ein Verein eine App wirklich einführt.

   GET /health
       Sagt, ob der Worker steht und ob er den Service-Account sieht.
       Beim ersten Ausrollen ist genau das die Frage.

   ── Was noch nicht darin läuft, und warum ─────────────────────────
   Die Mail-Warteschlange. Cloudflare Workers können KEIN SMTP — es
   gibt keine TCP-Sockets, nur HTTP. Der vorhandene mailer/ benutzt
   nodemailer über SMTP und firebase-admin, und beides läuft hier
   nicht. Das ist keine Kleinigkeit, die man nachträgt, sondern eine
   Entscheidung: entweder ein HTTP-Mailversand (Resend, Postmark,
   Brevo) oder der bestehende Node-Worker auf einem Host, der TCP
   erlaubt. Siehe README.

   ── Warum ein eigenes Token und nicht der Beitrittscode ───────────
   Wer den Kalender liest, soll nicht beitreten können. Zwei Dinge,
   zwei Codes — dieselbe Trennung, die das Gruppenmodell überall sonst
   auch zieht. Der Kopf kann das Abo-Token neu setzen, ohne den
   Beitrittscode zu ändern, und umgekehrt.
   ══════════════════════════════════════════════════════════════════ */

import { leseDokument, leseSammlung } from './firestore.js';
import { alsKalender } from './ics.js';
import { artWort } from '../assets/js/termine.js';

/* ── Hilfen ────────────────────────────────────────────────────────*/

const text = (koerper, status = 200, kopfzeilen = {}) =>
  new Response(koerper, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...kopfzeilen },
  });

/**
 * Zeichenketten ohne Zeitunterschied vergleichen.
 *
 * Ein gewöhnliches === bricht beim ersten falschen Zeichen ab, und
 * daraus lässt sich ein Token Zeichen für Zeichen erraten. Bei 24
 * Hexzeichen ist das theoretisch, aber es kostet nichts, es richtig
 * zu machen.
 */
function gleichOhneZeit(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function umgebungAus(env) {
  const projekt = env.FIREBASE_PROJECT_ID;
  if (!projekt) throw new Error('FIREBASE_PROJECT_ID fehlt.');

  let konto;
  try { konto = JSON.parse(env.SERVICE_ACCOUNT || '{}'); }
  catch { throw new Error('SERVICE_ACCOUNT ist kein gültiges JSON.'); }

  return { projekt, konto };
}

/* ── Der Kalender ──────────────────────────────────────────────────*/

async function kalender(gid, token, env) {
  const umgebung = umgebungAus(env);
  const gruppe = await leseDokument(umgebung, `groups/${gid}`);

  /* Falsches Token und nicht vorhandene Gruppe geben DASSELBE zurück.
     Ein 403 würde bestätigen, dass die Gruppe existiert, und damit
     verraten, dass man nur noch das Token braten muss. */
  if (!gruppe || !gruppe.icsToken || !gleichOhneZeit(gruppe.icsToken, token)) {
    return text('Nicht gefunden.', 404);
  }

  const termine = await leseSammlung(umgebung, `groups/${gid}/events`);
  const inhalt = alsKalender({
    name: gruppe.name || 'Firn',
    gid,
    termine,
    /* Die Wortwahl kommt aus termine.js, damit ein Gym-Kurs im Abo
       "Kurs" heisst und nicht "Training". Eine zweite Wortliste im
       Worker wäre die Sorte Dublette, die auseinanderläuft. */
    artWort: art => artWort(art, gruppe.art),
  });

  const datei = `${String(gruppe.name || 'firn').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.ics`;

  return new Response(inhalt, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      /* inline, nicht attachment: manche Clients laden sonst eine Datei
         herunter statt zu abonnieren. */
      'content-disposition': `inline; filename="${datei}"`,
      /* Eine Viertelstunde. Kürzer bringt nichts — Apple fragt selten
         nach —, länger macht eine Terminänderung unnötig zäh. */
      'cache-control': 'public, max-age=900',
      /* Kalender-Clients kommen von überall her. */
      'access-control-allow-origin': '*',
    },
  });
}

/* ── Einstieg ──────────────────────────────────────────────────────*/

export default {
  async fetch(request, env) {
    const adresse = new URL(request.url);
    const pfad = adresse.pathname.replace(/\/+$/, '') || '/';

    /* Kalender-Clients schicken oft erst ein HEAD, um zu sehen, ob es
       die Adresse gibt. Wer nur GET beantwortet, wird von manchen gar
       nicht erst abonniert. */
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text('Nur GET.', 405, { allow: 'GET, HEAD' });
    }

    try {
      if (pfad === '/health') {
        const umgebung = umgebungAus(env);
        return text(`ok · projekt=${umgebung.projekt} · konto=${
          umgebung.konto.client_email ? 'vorhanden' : 'FEHLT'}`);
      }

      const ics = pfad.match(/^\/ics\/([A-Za-z0-9_-]{1,64})$/);
      if (ics) {
        const antwort = await kalender(ics[1], adresse.searchParams.get('t') || '', env);
        /* Bei HEAD denselben Kopf, aber keinen Körper. */
        return request.method === 'HEAD'
          ? new Response(null, { status: antwort.status, headers: antwort.headers })
          : antwort;
      }

      return text('Nicht gefunden.', 404);
    } catch (fehler) {
      /* Die Meldung geht ins Log, nicht an den Abonnenten: sie kann den
         Projektnamen oder die Service-Account-Adresse enthalten. */
      console.error('[firn-worker]', fehler?.message || fehler);
      return text('Da ist etwas schiefgelaufen.', 500);
    }
  },
};
