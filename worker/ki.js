/* ══════════════════════════════════════════════════════════════════
   Der Assistent — POST /ki (v.35.53.0).

   Michel: "Verwende immer ein tiefes Modell und erlaube jedem Nutzer
   dreimal die höhere Stufe … Stelle sicher, dass dieser API-Key NIE
   öffentlich irgendwo steht, sondern in Firebase geschlossen, hinter
   locked doors." Und: "Die KI soll auf die Daten des jeweiligen Kontos
   und nur des jeweiligen Kontos zugreifen und Termine oder Trainings am
   gewünschten Ort eintragen, planen oder übertragen."

   Darum steht der Schlüssel NUR hier, als Secret des Workers
   (GEMINI_API_KEY, gesetzt mit `npx wrangler secret put`). Nicht im Repo,
   nicht in der Website, nicht in Firestore — Firebase auf dem Spark-Tarif
   hat keinen Ort, an dem ein Geheimnis vor dem Browser sicher wäre.

   Der Worker liest selbst KEINE Daten. Was der Assistent über die Person
   weiss, schickt ihr eigener Browser mit — also nur, was sie ohnehin
   lesen darf. Und der Worker schreibt nichts: will der Assistent etwas
   eintragen, antwortet er mit einem Vorschlag (functionCall), den der
   Browser zeigt, und erst nach "Eintragen" schreibt der Browser — mit den
   Rechten der Person, geprüft von den Firestore-Regeln.

   Wer fragt, weist sich mit seinem Firebase-ID-Token aus; der Worker
   prüft die Signatur gegen die öffentlichen Schlüssel von Google. Das
   Kontingent (KV) zählt je Person und Tag: die tiefe Stufe bis
   KI_PRO_TAG, die höhere dreimal (KI_HOCH_PRO_TAG), dazu eine Obergrenze
   für alle zusammen, damit die kostenlose Stufe von Gemini nie reisst.
   ══════════════════════════════════════════════════════════════════ */

import { ARTEN } from '../assets/js/termine.js';
import { ICH, werkzeugeFuer } from '../assets/js/ki.js';
import { leseDokument } from './firestore.js';

export const STANDARD = Object.freeze({
  /* Die tiefe Stufe: schnell, günstig, reicht für "trag mir morgen um
     18 Uhr Wachs kaufen ein". Die "-latest"-Namen lässt Google auf das
     jeweils aktuelle Modell zeigen — mit festen Namen (gemini-2.5-flash-lite)
     scheiterte am 15.09.2026 jede Frage mit 404: Google hatte das Modell
     zurückgezogen (im Log des Workers gesehen). */
  modellNormal: 'gemini-flash-lite-latest',
  /* Die höhere (Deep Thinking): denkt nach — für "plan mir die Trainings
     der nächsten zwei Wochen um das Rennen herum". Flash statt Pro:
     Michel will die günstigste Stufe, die trotzdem nachdenkt. */
  modellHoch: 'gemini-flash-latest',
  hochProTag: 3,
  proTag: 40,
  alleProTag: 600,
});

export const GRENZEN = Object.freeze({
  /* kontext: der Browser kürzt auf 12 000 (ki.js, KONTEXT_MAX); hier Luft
     darüber, damit eine etwas längere Gruppe nicht an der Grenze scheitert. */
  frage: 1000, verlauf: 8, verlaufText: 1500, kontext: 24000, anweisung: 600, name: 30,
});

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/* ── Wer fragt ─────────────────────────────────────────────────────── */

const b64url = s => {
  const roh = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(roh + '='.repeat((4 - (roh.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const json64 = s => JSON.parse(new TextDecoder().decode(b64url(s)));

let schluesselVorrat = { bis: 0, keys: [] };

async function googleSchluessel(holen = fetch, jetzt = Date.now()) {
  if (schluesselVorrat.bis > jetzt && schluesselVorrat.keys.length) return schluesselVorrat.keys;
  const antwort = await holen(JWKS);
  if (!antwort.ok) throw new Error(`JWKS ${antwort.status}`);
  const alter = Number(/max-age=(\d+)/.exec(antwort.headers.get('cache-control') || '')?.[1] || 3600);
  const { keys = [] } = await antwort.json();
  schluesselVorrat = { bis: jetzt + Math.min(alter, 21600) * 1000, keys };
  return keys;
}

/**
 * Ein Firebase-ID-Token prüfen — ohne Bibliothek, mit WebCrypto.
 * Gibt { uid, email } zurück oder wirft. `schluessel` ersetzt im Test die
 * Liste von Google.
 */
export async function idTokenPruefen(token, projekt, { jetzt = Date.now(), schluessel, holen } = {}) {
  const teile = String(token || '').split('.');
  if (teile.length !== 3) throw new Error('kein Token');
  const kopf = json64(teile[0]);
  const inhalt = json64(teile[1]);
  if (kopf.alg !== 'RS256' || !kopf.kid) throw new Error('falscher Algorithmus');

  const keys = schluessel || await googleSchluessel(holen, jetzt);
  const jwk = keys.find(k => k.kid === kopf.kid);
  if (!jwk) throw new Error('unbekannter Schlüssel');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const gueltig = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(teile[2]),
    new TextEncoder().encode(`${teile[0]}.${teile[1]}`));
  if (!gueltig) throw new Error('Signatur');

  const s = Math.floor(jetzt / 1000);
  if (inhalt.aud !== projekt) throw new Error('aud');
  if (inhalt.iss !== `https://securetoken.google.com/${projekt}`) throw new Error('iss');
  if (!(inhalt.exp > s)) throw new Error('abgelaufen');
  if (!(inhalt.iat <= s + 300) || !(inhalt.auth_time <= s + 300)) throw new Error('aus der Zukunft');
  if (!inhalt.sub || typeof inhalt.sub !== 'string') throw new Error('sub');
  /* Gäste (anonyme Anmeldung für einen einzelnen Termin) fragen nicht:
     der Assistent ist für Konten. */
  if (inhalt.firebase?.sign_in_provider === 'anonymous' || !inhalt.email) throw new Error('kein Konto');
  return { uid: inhalt.sub, email: inhalt.email };
}

/* ── Wer welchen Assistenten hat (v.35.55.0) ─────────────────────────
   Dieselbe Regel wie im Browser (ki.js, persoenlichFrei): der persönliche
   für den TVZA-Kreis und für wen der Admin ihn freischaltet (users.ki),
   der einer Gruppe für die Mitglieder einer freigeschalteten Gruppe
   (groups.ki). Nachgeprüft wird hier nur, wenn der Worker den
   Service-Account hat (Kalender-Abo) — ohne ihn kann er Firestore nicht
   lesen und verlässt sich auf die Pille, die ohne Freischaltung gar nicht
   erscheint. Kosten entstehen so oder so keine. */

/* Wie imKreis() in firebase-config.js, das der Worker nicht laden kann
   (es holt Firebase aus dem Netz). ki.test.mjs vergleicht beide an
   denselben Profilen — läuft die Liste auseinander, fällt der Test. */
export const TVZA_BEREICHE = Object.freeze(['matura', 'maturatracker', 'food', 'watch', 'projects']);
const TVZA_STANDARD = Object.freeze({ food: true, watch: true });
export function kreisVon(profil) {
  if (profil?.isTimo === true || profil?.kreis === true) return true;
  if (profil?.kreis === false) return false;
  const frei = { ...TVZA_STANDARD, ...(profil?.allowedModules || {}) };
  return TVZA_BEREICHE.some(key => frei[key] === true);
}

export async function freigabePruefen({ uid, wer, lesen }) {
  if (wer === ICH) {
    const profil = await lesen(`users/${uid}`);
    return !!profil && (profil.ki === true || kreisVon(profil));
  }
  const [gruppe, mitglied] = await Promise.all([lesen(`groups/${wer}`), lesen(`groups/${wer}/members/${uid}`)]);
  if (!gruppe || !mitglied) return false;
  if (gruppe.ki === true) return true;
  /* Wer den persönlichen hat, hat auch den seiner Gruppen (wie ki.js,
     gruppeFrei). */
  const profil = await lesen(`users/${uid}`);
  return !!profil && (profil.ki === true || kreisVon(profil));
}

/* ── Wie viel noch geht ────────────────────────────────────────────── */

export const tagVon = (jetzt = Date.now()) => new Date(jetzt).toISOString().slice(0, 10);

export function umgebung(env = {}) {
  const zahl = (wert, rueck) => (Number.isFinite(Number(wert)) && Number(wert) >= 0 ? Number(wert) : rueck);
  return {
    modellNormal: env.KI_MODELL_NORMAL || STANDARD.modellNormal,
    modellHoch: env.KI_MODELL_HOCH || STANDARD.modellHoch,
    hochProTag: zahl(env.KI_HOCH_PRO_TAG, STANDARD.hochProTag),
    proTag: zahl(env.KI_PRO_TAG, STANDARD.proTag),
    alleProTag: zahl(env.KI_ALLE_PRO_TAG, STANDARD.alleProTag),
  };
}

/** Entscheidet vor der Anfrage: welche Stufe, oder gar keine. */
export function stufeWaehlen({ stand = {}, alle = 0, hochGewuenscht, u }) {
  const n = Number(stand.n) || 0;
  const h = Number(stand.h) || 0;
  if (alle >= u.alleProTag) return { erlaubt: false, grund: 'alle' };
  if (n + h >= u.proTag) return { erlaubt: false, grund: 'person' };
  const hoch = !!hochGewuenscht && h < u.hochProTag;
  return { erlaubt: true, hoch, hochAufgebraucht: !!hochGewuenscht && !hoch };
}

/* ── Was der Assistent darf ────────────────────────────────────────── */

const datum = { type: 'string', description: 'Datum als JJJJ-MM-TT' };
const zeit = { type: 'string', description: 'Uhrzeit als HH:MM (24 Stunden)' };

export const WERKZEUGE = Object.freeze([
  {
    name: 'erinnerung_eintragen',
    description: 'Eine persönliche Erinnerung für diese Person eintragen (nur sie sieht sie).',
    parameters: { type: 'object', properties: {
      titel: { type: 'string' }, datum, zeit, notiz: { type: 'string' },
    }, required: ['titel', 'datum'] },
  },
  {
    name: 'eigenen_termin_eintragen',
    description: 'Einen persönlichen Termin in den eigenen Kalender dieser Person eintragen (nur sie sieht ihn).',
    parameters: { type: 'object', properties: {
      titel: { type: 'string' }, datum, bis: { ...datum, description: 'Letzter Tag, falls mehrtägig' },
      zeit, bisZeit: { ...zeit, description: 'Ende am Tag' }, ort: { type: 'string' }, notiz: { type: 'string' },
    }, required: ['titel', 'datum'] },
  },
  {
    name: 'gruppentermin_eintragen',
    description: 'Einen Termin (Training, Lager, Rennen) in eine Gruppe eintragen. NUR in Gruppen mit leite=true. '
      + 'Für mehrere Tage oder Wiederholungen die Funktion mehrmals aufrufen.',
    parameters: { type: 'object', properties: {
      gruppe_id: { type: 'string', description: 'id der Gruppe aus dem Kontext' },
      art: { type: 'string', enum: [...ARTEN] },
      titel: { type: 'string' }, datum, bis: { ...datum, description: 'Letzter Tag, falls mehrtägig (Lager)' },
      zeit, bisZeit: { ...zeit, description: 'Ende am Tag' }, ort: { type: 'string' }, notiz: { type: 'string' },
    }, required: ['gruppe_id', 'art', 'titel', 'datum'] },
  },
  {
    name: 'nachricht_senden',
    description: 'Eine Chat-Nachricht im Namen dieser Person vorbereiten — NUR, wenn sie ausdrücklich darum bittet, '
      + 'jemandem etwas zu schreiben oder auszurichten. an: der Name der Person oder Gruppe, so wie die Person ihn '
      + 'nennt (mehrere mit Komma). text: die Nachricht genau so, wie sie ankommen soll, in der Ich-Form der Person. '
      + 'Die Person sieht Empfänger und Text und sendet selbst.',
    parameters: { type: 'object', properties: {
      an: { type: 'string', description: 'Name der Person(en) oder Gruppe, wie genannt' },
      text: { type: 'string', description: 'Der Text der Nachricht' },
    }, required: ['an', 'text'] },
  },
  {
    name: 'termin_verschieben',
    description: 'Einen vorhandenen Termin oder eine Erinnerung auf ein anderes Datum oder eine andere Zeit legen. '
      + 'Gruppentermine nur in Gruppen mit leite=true.',
    parameters: { type: 'object', properties: {
      termin_id: { type: 'string', description: 'id aus dem Kontext (termine, eigene oder erinnerungen)' },
      datum, zeit, bis: datum, bisZeit: zeit,
    }, required: ['termin_id', 'datum'] },
  },
]);

/* ── Die Anfrage an Gemini ─────────────────────────────────────────── */

const kurz = (text, max) => String(text ?? '').slice(0, max);

/** Die Anfrage des Browsers — gekürzt und geprüft. Wirft bei Unsinn. */
export function anfrageLesen(koerper) {
  if (!koerper || typeof koerper !== 'object') throw new Error('kein JSON');
  const frage = String(koerper.frage ?? '').trim();
  if (!frage) throw new Error('keine Frage');
  if (frage.length > GRENZEN.frage) throw new Error('Frage zu lang');
  const kontext = koerper.kontext && typeof koerper.kontext === 'object' ? koerper.kontext : {};
  if (JSON.stringify(kontext).length > GRENZEN.kontext) throw new Error('Kontext zu gross');
  const verlauf = (Array.isArray(koerper.verlauf) ? koerper.verlauf : [])
    .slice(-GRENZEN.verlauf)
    .filter(v => v && (v.rolle === 'nutzer' || v.rolle === 'assistent') && String(v.text || '').trim())
    .map(v => ({ rolle: v.rolle, text: kurz(v.text, GRENZEN.verlaufText) }));
  const a = koerper.assistent && typeof koerper.assistent === 'object' ? koerper.assistent : {};
  const wer = koerper.wer === undefined || koerper.wer === ICH ? ICH : String(koerper.wer);
  if (wer !== ICH && !/^[A-Za-z0-9_-]{1,64}$/.test(wer)) throw new Error('wer');
  return {
    wer, frage, kontext: { ...kontext, wer }, verlauf, hoch: koerper.hoch === true,
    assistent: { name: kurz(a.name, GRENZEN.name).trim(), anweisung: kurz(a.anweisung, GRENZEN.anweisung).trim(),
      gruppe: kurz(a.gruppe, 80).trim() },
  };
}

export function systemAnweisung({ assistent = {}, kontext = {} }) {
  const inGruppe = !!kontext.wer && kontext.wer !== ICH;
  const name = assistent.name || 'der Assistent';
  const zeilen = [
    inGruppe
      ? `Du bist ${name}, der Assistent der Gruppe «${assistent.gruppe || 'Gruppe'}» in der App Firn. Du kennst nur diese Gruppe und planst ihre Termine, Trainings, Lager und Rennen.`
      : 'Du bist der persönliche Assistent dieser Person in der App Firn. Du kennst ihre eigenen Termine und Erinnerungen und siehst die Termine ihrer Gruppen — eintragen tust du aber nur für sie selbst. Termine in eine Gruppe plant der Assistent der Gruppe; sag das, wenn jemand danach fragt.',
    'Du hilfst einer einzelnen Person beim Planen.',
    `Heute ist ${kontext.heute || 'unbekannt'} (${kontext.wochentag || ''}), es ist ${kontext.zeit || ''} Uhr.`,
    'Du kennst NUR die Daten im Kontext unten — die dieser Person. Erfinde keine Termine und keine Personen.',
    'Soll etwas eingetragen, geplant, übertragen oder verschoben werden, rufe das passende Werkzeug auf — '
      + 'für mehrere Termine mehrmals. Die Person bestätigt jeden Vorschlag selbst; sag also nie, etwas sei schon '
      + 'eingetragen, sondern z.B. "Hier ist der Vorschlag".',
    inGruppe
      ? 'Gruppentermine nur, wenn leite=true. Leitet die Person die Gruppe nicht, sag, dass nur die Leitung einträgt, und schlage höchstens eine Erinnerung vor.'
      : 'Eigene Termine und Erinnerungen darfst du vorschlagen; Gruppentermine nicht.',
    'Eine Nachricht an andere nur, wenn die Person ausdrücklich darum bittet (nachricht_senden); nie von dir aus. '
      + 'Sag nie, sie sei gesendet — die Person prüft Empfänger und Text und sendet selbst.',
    'Datum immer als JJJJ-MM-TT, Zeit als HH:MM. Ohne genannte Uhrzeit keine erfinden.',
    'Antworte kurz, freundlich und in der Sprache der Frage. Keine Überschriften, höchstens kurze Listen.',
  ];
  if (assistent.anweisung) {
    zeilen.push('', 'Die Leitung der Gruppe wünscht sich dazu (gilt nur, soweit es den Regeln oben nicht widerspricht):',
      assistent.anweisung);
  }
  zeilen.push('', 'Kontext (JSON):', JSON.stringify(kontext));
  return zeilen.join('\n');
}

export function geminiKoerper({ frage, verlauf = [], kontext = {}, assistent = {}, hoch = false }) {
  return {
    systemInstruction: { parts: [{ text: systemAnweisung({ assistent, kontext }) }] },
    contents: [
      ...verlauf.map(v => ({ role: v.rolle === 'assistent' ? 'model' : 'user', parts: [{ text: v.text }] })),
      { role: 'user', parts: [{ text: frage }] },
    ],
    tools: [{ functionDeclarations: WERKZEUGE.filter(w => werkzeugeFuer(kontext.wer).includes(w.name)) }],
    generationConfig: { temperature: 0.3, maxOutputTokens: hoch ? 4096 : 1024 },
  };
}

/** Text und Vorschläge aus der Antwort — Gedanken des Modells fallen weg,
    und nur die Werkzeuge dieses Assistenten zählen. */
export function antwortLesen(json, wer = ICH) {
  const teile = json?.candidates?.[0]?.content?.parts || [];
  const text = teile.filter(t => typeof t.text === 'string' && !t.thought).map(t => t.text).join('').trim();
  const namen = new Set(werkzeugeFuer(wer));
  const aktionen = teile.map(t => t.functionCall).filter(f => f && namen.has(f.name))
    .slice(0, 12).map(f => ({ name: f.name, args: f.args && typeof f.args === 'object' ? f.args : {} }));
  return { text, aktionen };
}

/* ── Die Route ─────────────────────────────────────────────────────── */

const ERLAUBT_STANDARD = ['https://ti30x.github.io', 'http://localhost:4174', 'http://localhost:4173'];

export function corsKopf(request, env = {}) {
  const liste = String(env.KI_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const erlaubt = liste.length ? liste : ERLAUBT_STANDARD;
  const herkunft = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': erlaubt.includes(herkunft) ? herkunft : erlaubt[0],
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const alsJson = (daten, status, kopf) => new Response(JSON.stringify(daten), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...kopf },
});

/* Ein Modell kann Google zurückziehen — dann antwortet es mit 404, und
   jede Frage scheiterte. Darum eine Reihe: das eingestellte, dann die
   "-latest"-Namen, die Google auf das jeweils aktuelle Modell zeigen lässt. */
export function modellReihe(modell, hoch) {
  const reihe = hoch
    ? [modell, 'gemini-flash-latest', 'gemini-flash-lite-latest']
    : [modell, 'gemini-flash-lite-latest', 'gemini-flash-latest'];
  return [...new Set(reihe.filter(Boolean))];
}

/* Kennt Google keines der Modelle der Reihe mehr, fragt der Worker nach,
   welche es gibt, und nimmt das passendste, das Text erzeugt — für die
   tiefe Stufe zuerst ein "flash-lite", dann ein "flash"; für die hohe
   zuerst ein "pro". Gemerkt je Worker-Instanz, damit nicht jede Frage
   die Liste holt. */
let gefunden = { normal: '', hoch: '' };
export function modellAussuchen(modelle = [], hoch = false) {
  const text = modelle
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name || '').replace(/^models\//, ''))
    .filter(n => /^gemini-/.test(n) && !/(image|tts|audio|live|embedding|vision|exp)/.test(n));
  /* Immer das Günstigste, das passt (Michel: "but the least expensive"):
     tief Flash-Lite, hoch Flash — Pro nie von selbst. Vorschauen nur,
     wenn es sonst nichts gibt. */
  const muster = hoch ? [/-flash(?!-lite)/, /-flash-lite/] : [/-flash-lite/, /-flash(?!-lite)/];
  const stabil = text.filter(n => !/preview/.test(n));
  const auswahl = stabil.length ? stabil : text;
  for (const m of muster) {
    const treffer = auswahl.filter(n => m.test(n)).sort().reverse();
    if (treffer.length) return treffer[0];
  }
  return '';
}

async function modellFinden(hoch, schluessel, holen) {
  const art = hoch ? 'hoch' : 'normal';
  if (gefunden[art]) return gefunden[art];
  try {
    const antwort = await holen(`${GEMINI}?pageSize=200`, { headers: { 'x-goog-api-key': schluessel } });
    if (!antwort.ok) { console.error('[ki] modelle', antwort.status); return ''; }
    const { models = [] } = await antwort.json();
    gefunden[art] = modellAussuchen(models, hoch);
    console.error('[ki] modell gefunden', art, gefunden[art] || '(keins)');
    return gefunden[art];
  } catch (fehler) {
    console.error('[ki] modelle', fehler?.message || fehler);
    return '';
  }
}

/* Fragt die Modelle der Reihe nach, bis eines antwortet. Weiter geht es
   nur bei "gibt es nicht" (404); alles andere — voll, Schlüssel falsch —
   ist die Antwort. Ins Log geht, was Google sagt, nie der Schlüssel. */
async function geminiMitReihe(reihe, koerper, schluessel, holen, hoch = false) {
  let antwort = null;
  const versuche = [...reihe];
  for (let i = 0; i < versuche.length; i += 1) {
    const modell = versuche[i];
    antwort = await gemini(modell, koerper, schluessel, holen);
    if (antwort.ok) return { antwort, modell };
    let text = '';
    try { text = (await antwort.clone().text()).slice(0, 300); } catch { /* egal */ }
    console.error('[ki] gemini', modell, antwort.status, text);
    if (antwort.status !== 404) break;
    /* Die ganze Reihe gibt es nicht: Google fragen, was es gibt. */
    if (i === versuche.length - 1) {
      const neu = await modellFinden(hoch, schluessel, holen);
      if (neu && !versuche.includes(neu)) versuche.push(neu);
    }
  }
  return { antwort, modell: null };
}

async function gemini(modell, koerper, schluessel, holen) {
  return holen(`${GEMINI}/${encodeURIComponent(modell)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': schluessel },
    body: JSON.stringify(koerper),
  });
}

/**
 * POST /ki. `hilfen` ersetzt im Test Netz, Uhr und Schlüssel von Google.
 */
export async function kiAnfrage(request, env, { holen = fetch, jetzt = Date.now(), schluessel, lesen: hilfenLesen } = {}) {
  const kopf = corsKopf(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: kopf });
  if (request.method !== 'POST') return alsJson({ fehler: 'methode' }, 405, kopf);
  if (!env.GEMINI_API_KEY || !env.KI) return alsJson({ fehler: 'nicht-eingerichtet' }, 503, kopf);

  let wer;
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    wer = await idTokenPruefen(token, env.FIREBASE_PROJECT_ID, { jetzt, schluessel, holen });
  } catch {
    return alsJson({ fehler: 'anmeldung' }, 401, kopf);
  }

  let anfrage;
  try {
    const roh = await request.text();
    if (roh.length > GRENZEN.kontext + 20000) throw new Error('zu gross');
    anfrage = anfrageLesen(JSON.parse(roh));
  } catch (fehler) {
    console.error('[ki] anfrage', fehler?.message || fehler);
    return alsJson({ fehler: 'anfrage' }, 400, kopf);
  }

  /* Mit Service-Account: nachsehen, ob die Person diesen Assistenten hat. */
  if (env.SERVICE_ACCOUNT) {
    let frei = false;
    try {
      const konto = JSON.parse(env.SERVICE_ACCOUNT);
      const lesen = pfad => (hilfenLesen || (p => leseDokument({ projekt: env.FIREBASE_PROJECT_ID, konto }, p)))(pfad);
      frei = await freigabePruefen({ uid: wer.uid, wer: anfrage.wer, lesen });
    } catch (fehler) {
      console.error('[ki] freigabe', fehler?.message || fehler);
    }
    if (!frei) return alsJson({ fehler: 'nicht-frei' }, 403, kopf);
  }

  const u = umgebung(env);
  const tag = tagVon(jetzt);
  const schluesselPerson = `ki:${wer.uid}:${tag}`;
  const schluesselAlle = `ki:alle:${tag}`;
  const [stand, alle] = await Promise.all([
    env.KI.get(schluesselPerson, 'json').catch(() => null),
    env.KI.get(schluesselAlle).catch(() => null),
  ]);
  const wahl = stufeWaehlen({ stand: stand || {}, alle: Number(alle) || 0, hochGewuenscht: anfrage.hoch, u });
  if (!wahl.erlaubt) return alsJson({ fehler: 'kontingent', grund: wahl.grund }, 429, kopf);

  let hoch = wahl.hoch;
  let { antwort } = await geminiMitReihe(modellReihe(hoch ? u.modellHoch : u.modellNormal, hoch),
    geminiKoerper({ ...anfrage, hoch }), env.GEMINI_API_KEY, holen, hoch);
  /* Ist die höhere Stufe gerade voll oder nicht verfügbar, antwortet die
     tiefe — und die höhere wird nicht gezählt. */
  if (hoch && !antwort.ok) {
    hoch = false;
    ({ antwort } = await geminiMitReihe(modellReihe(u.modellNormal, false),
      geminiKoerper({ ...anfrage, hoch }), env.GEMINI_API_KEY, holen, false));
  }
  if (!antwort.ok) {
    return alsJson({ fehler: antwort.status === 429 ? 'gemini-voll' : 'gemini', status: antwort.status }, 502, kopf);
  }
  const ergebnis = antwortLesen(await antwort.json(), anfrage.wer);

  const neu = { n: (Number(stand?.n) || 0) + (hoch ? 0 : 1), h: (Number(stand?.h) || 0) + (hoch ? 1 : 0) };
  await Promise.all([
    env.KI.put(schluesselPerson, JSON.stringify(neu), { expirationTtl: 172800 }).catch(() => {}),
    env.KI.put(schluesselAlle, String((Number(alle) || 0) + 1), { expirationTtl: 172800 }).catch(() => {}),
  ]);

  return alsJson({
    ...ergebnis,
    stufe: hoch ? 'hoch' : 'normal',
    hochUebrig: Math.max(0, u.hochProTag - neu.h),
    hochAufgebraucht: wahl.hochAufgebraucht || (anfrage.hoch && !hoch),
  }, 200, kopf);
}
