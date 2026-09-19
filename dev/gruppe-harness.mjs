/* Die Gruppenseite im jsdom — gemeinsam fuer mehrere Tests.

   Firestore, die Anmeldung und die Huelle sind Data-URL-Module; alles
   andere (Wochenplan, Termine, Dialoge, FIS-Punkte) ist echter Code.
   Was die Seite an groups.js schickt, landet in globalThis.__aufrufe,
   damit ein Test pruefen kann, WAS gespeichert worden waere. */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const datei = p => pathToFileURL(join(root, p)).href;
const dataUrl = quelle => 'data:text/javascript;base64,' + Buffer.from(quelle).toString('base64');
let lauf = 0;

const FIREBASE_STUB = `
  export const escHtml = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  export const requireAuth = () => Promise.resolve({ uid: 'timo', email: 't@example.test' });
  export const getProfile = () => Promise.resolve(globalThis.__profil || { displayName: 'Timothy' });
  export const wireOfflineBanner = () => {};
  export const imKreis = p => !!p?.kreis;
  export const reportClientError = (wo, e) => { (globalThis.__fehler ||= []).push([wo, String(e)]); };
`;

/* Die Hülle tut hier, was die echte tut: den Kopf der Seite entfernen und
   einen neuen bauen. Bis v.35.45.0 tat mountShell hier gar nichts — und
   verbarg damit, dass der Einheiten-Player in einen Kopf schrieb, den es
   in der echten App nicht mehr gab ("Der Plan liess sich nicht laden"). */
const SHELL_STUB = `
  export const mountShell = (o = {}) => {
    document.querySelectorAll('.appbar, .nav').forEach(el => el.remove());
    const bar = document.createElement('header');
    bar.className = 'appbar';
    bar.innerHTML = '<div class="appbar__inner"><div class="appbar__spacer"><span class="appbar__title"></span></div><span class="appbar__end"></span></div>';
    bar.querySelector('.appbar__title').textContent = o.title || '';
    document.body.prepend(bar);
  };
  export const setShellTitle = text => {
    const el = document.querySelector('.appbar__title, .appbar__greet');
    if (el) el.textContent = String(text ?? '');
  };
  export const setShellTitleWahl = (handler, beschriftung = '') => {
    const el = document.querySelector('.appbar__title');
    if (!el) return;
    el.classList.toggle('appbar__title--wahl', !!handler);
    if (handler) { el.setAttribute('role', 'button'); el.title = beschriftung; }
    else { el.removeAttribute('role'); el.removeAttribute('title'); }
    el.onclick = handler ? () => handler() : null;
  };
  /* Der Farbpunkt am Titel (v.35.68.0): wie titelFarbeSetzen im Router. */
  export const setShellTitleFarbe = farbe => {
    const el = document.querySelector('.appbar__title');
    if (!el) return;
    el.classList.toggle('appbar__title--punkt', !!farbe);
    if (farbe) el.style.setProperty('--titel-punkt', farbe); else el.style.removeProperty('--titel-punkt');
  };
  export const setShellMeta = text => {
    const spacer = document.querySelector('.appbar__spacer');
    if (!spacer) return;
    let el = spacer.querySelector('.appbar__date');
    if (!el) { el = document.createElement('div'); el.className = 'appbar__date'; spacer.append(el); }
    el.textContent = String(text ?? '');
    el.hidden = !el.textContent;
  };
`;

/* Essen (v.35.72.0): was die Gruppenseite an essen.js schickt, landet
   in globalThis.__aufrufe; gelesen wird aus globalThis.__essen. */
const ESSEN_STUB = `
  export const freigabeSetzen = async (gid, uid, an) => {
    (globalThis.__aufrufe ||= []).push(['freigabeSetzen', gid, uid, an]);
    if (globalThis.__essenFehler === 'freigabe') throw new Error('Missing or insufficient permissions.');
    globalThis.__essen = { ...(globalThis.__essen || {}), freigabe: an ? { uid, an: true, fassung: 1 } : { uid, an: false, fassung: 0 } };
  };
  export const ladeFreigabe = async () => globalThis.__essen?.freigabe ?? null;
  export const ladeFreigaben = async () => globalThis.__essen?.freigaben ?? null;
  export const beobachteFreigabe = (gid, uid, cb) => { setTimeout(() => cb(globalThis.__essen?.freigabe ?? null), 0); return () => {}; };
  export const ladeTag = async (gid, uid, datum) => {
    (globalThis.__aufrufe ||= []).push(['ladeTag', gid, uid, datum]);
    if (globalThis.__essenFehler === 'tag') throw new Error('Missing or insufficient permissions.');
    return (globalThis.__essen?.tage || []).find(x => x.uid === uid && x.datum === datum) || null;
  };
  export const tagSchreiben = async (gid, uid, datum, mahlzeiten) => {
    (globalThis.__aufrufe ||= []).push(['tagSchreiben', gid, uid, datum, mahlzeiten]);
    if (globalThis.__essenFehler === 'schreiben') throw new Error('Missing or insufficient permissions.');
    const { tagPayload } = await import('${datei('assets/js/essen-modell.js')}');
    const { findFood } = await import('${datei('assets/js/foods.js')}');
    return tagPayload(uid, datum, mahlzeiten, findFood);
  };
  export const tagLoeschen = async (...a) => { (globalThis.__aufrufe ||= []).push(['tagLoeschen', ...a]); };
  export const verlaufLoeschen = async (...a) => { (globalThis.__aufrufe ||= []).push(['verlaufLoeschen', ...a]); return globalThis.__essen?.tage?.length || 0; };
  export const lebensmittelVorschlagen = async (o) => { (globalThis.__aufrufe ||= []).push(['lebensmittelVorschlagen', o]); };
  export const beobachteZeitraum = (gid, von, bis, cb, fehler) => {
    (globalThis.__aufrufe ||= []).push(['beobachteZeitraum', gid, von, bis]);
    setTimeout(() => {
      if (globalThis.__essenFehler === 'zeitraum') fehler?.(new Error('Missing or insufficient permissions.'));
      else cb((globalThis.__essen?.tage || []).filter(t => t.datum >= von && t.datum <= bis));
    }, 0);
    return () => {};
  };
  export const ladeZeitraum = async () => globalThis.__essen?.tage || [];
  export const eigeneTage = async () => globalThis.__essen?.tage || [];
`;

/* Training teilen (v.35.73.0): was der Bereich Training an
   training-freigaben.js schickt, landet in globalThis.__aufrufe;
   gelesen wird aus globalThis.__freigaben. */
const FREIGABEN_STUB = `
  export const freigabeAnlegen = async (uid, o) => {
    (globalThis.__aufrufe ||= []).push(['freigabeAnlegen', uid, o]);
    if (globalThis.__teilenFehler === 'anlegen') throw new Error('Missing or insufficient permissions.');
    return { code: 'ABCDEFGHJKMNPQRSTUVWXYZ234567AB', ownerUid: uid, ...o, bis: new Date(Date.now() + 30 * 86400000), erstellt: new Date() };
  };
  export const freigabeAuffrischen = async (...a) => { (globalThis.__aufrufe ||= []).push(['freigabeAuffrischen', ...a]); };
  export const freigabeVerlaengern = async (...a) => { (globalThis.__aufrufe ||= []).push(['freigabeVerlaengern', ...a]); };
  export const freigabeZurueckziehen = async (...a) => { (globalThis.__aufrufe ||= []).push(['freigabeZurueckziehen', ...a]); };
  export const meineFreigaben = async uid => {
    (globalThis.__aufrufe ||= []).push(['meineFreigaben', uid]);
    return globalThis.__freigaben === undefined ? [] : globalThis.__freigaben;
  };
  export const auszugHolen = async () => null;
`;

/* Eigene Plaene (v.35.74.0): was der Plan-Bauer an eigene-plaene.js
   schickt, landet in globalThis.__aufrufe; gelesen wird aus
   globalThis.__eigenePlaene / __eigeneUebungen / __eigeneVorlagen. */
const EIGEN_STUB = `
  let zaehler = 0;
  export const planSpeichern = async (uid, plan, id) => {
    (globalThis.__aufrufe ||= []).push(['planSpeichern', uid, plan, id]);
    if (globalThis.__eigenFehler === 'speichern') throw new Error('Missing or insufficient permissions.');
    return id || ('p' + (++zaehler));
  };
  export const planHolen = async () => null;
  export const meinePlaene = async uid => {
    (globalThis.__aufrufe ||= []).push(['meinePlaene', uid]);
    return globalThis.__eigenePlaene === undefined ? [] : globalThis.__eigenePlaene;
  };
  export const planWeg = async (...a) => { (globalThis.__aufrufe ||= []).push(['planWeg', ...a]); };
  export const uebungSpeichern = async (uid, u, id) => {
    (globalThis.__aufrufe ||= []).push(['uebungSpeichern', uid, u, id]);
    return id || ('u' + (++zaehler));
  };
  export const meineUebungen = async () => globalThis.__eigeneUebungen || [];
  export const uebungWeg = async (...a) => { (globalThis.__aufrufe ||= []).push(['uebungWeg', ...a]); };
  export const vorlageSpeichern = async (uid, v) => { (globalThis.__aufrufe ||= []).push(['vorlageSpeichern', uid, v]); return 'v1'; };
  export const meineVorlagen = async () => globalThis.__eigeneVorlagen || [];
  export const vorlageWeg = async () => {};
  export const planTitel = p => String(p?.name || '');
`;

/* Nur was die Seite wirklich anfasst. Schreibende Aufrufe werden
   mitgeschrieben, statt etwas zu tun. */
function groupsStub({ gruppen, plaene, protokolle, mitglieder }) {
  const merke = name => `async (...a) => { (globalThis.__aufrufe ||= []).push(['${name}', ...a]); return globalThis.__antwort?.['${name}']; }`;
  return `
    export const PLAN_FUER_ALLE = 'alle';
    /* Der eigene Plan als Quelle (v.35.74.0): EIGEN ist keine Gruppe.
       globalThis.__eigeneQuelle sind die Plaene, die ladePlaene(EIGEN)
       liefert — die Seite liest sie wie die einer Gruppe. */
    export const EIGEN = 'ich';
    export const istEigen = gid => gid === EIGEN;
    export const eigenePlaene = async uid => {
      (globalThis.__aufrufe ||= []).push(['eigenePlaene', uid]);
      return globalThis.__eigeneQuelle || [];
    };
    export const leitet = r => r === 'head' || r === 'staff';
    export const fuehrt = r => r === 'head';
    export const wort = (art, was) => was;
    export const waehleAktive = liste => liste?.[0] ?? null;
    /* Wie das echte: merken UND 'firn-gruppe' melden — darauf schaltet
       die Gruppenseite um, egal ob die Wahl von ihr oder der Leiste kam. */
    export const aktiveGruppeSetzen = id => {
      (globalThis.__aufrufe ||= []).push(['aktiveGruppeSetzen', id]);
      const w = globalThis.window;
      w?.dispatchEvent(new w.CustomEvent('firn-gruppe', { detail: { gid: id } }));
    };
    export const beobachteMeineGruppen = (uid, cb) => { cb(${JSON.stringify(gruppen)}); return () => {}; };
    /* Termine: globalThis.__termine ist eine Liste (für jede Gruppe) oder
       { gid: [...] }. Geliefert wird wie von onSnapshot: später. */
    export const beobachteTermine = (gid, cb) => {
      const alle = globalThis.__termine || [];
      setTimeout(() => cb(Array.isArray(alle) ? alle : (alle[gid] || [])), 0);
      return () => {};
    };
    export const ladeMitglieder = async () => ${JSON.stringify(mitglieder)};
    /* Die Namenskarte schreibt die Seite im Hintergrund; hier gemerkt. */
    export const eigeneKarte = ${merke('eigeneKarte')};
    /* Eine Liste gilt fuer jede Gruppe; ein Objekt { gid: [...] } je
       Gruppe — fuer den Bereich Training, der mehrere liest. */
    export const ladePlaene = async gid => {
      const alle = ${JSON.stringify(plaene)};
      return Array.isArray(alle) ? alle : (alle[gid] || []);
    };
    export const ladeProtokolle = async (gid, uid) => {
      (globalThis.__aufrufe ||= []).push(['ladeProtokolle', gid, uid]);
      return ${JSON.stringify(protokolle)};
    };
    /* Die Übersicht der Leitung (v.35.65.0): die Protokolle eines Tages,
       live — hier einmal; globalThis.__protokolleFehler lässt es scheitern. */
    export const beobachteProtokolleAm = (gid, datum, cb, fehler) => {
      (globalThis.__aufrufe ||= []).push(['beobachteProtokolleAm', gid, datum]);
      setTimeout(() => {
        if (globalThis.__protokolleFehler) fehler?.(new Error('Missing or insufficient permissions.'));
        else cb(${JSON.stringify(protokolle)}.filter(p => p.datum === datum));
      }, 0);
      return () => {};
    };
    export const ladeVorlagen = async () => globalThis.__vorlagen || [];
    export const vorlageSpeichern = ${merke('vorlageSpeichern')};
    export const ladeZusagen = async () => [];
    export const ladeErgebnisse = async () => [];
    export const ladeAnhaenge = async () => [];
    export const eigeneProgramme = async () => [];
    export const gruppeAnlegen = ${merke('gruppeAnlegen')};
    export const terminAnlegen = ${merke('terminAnlegen')};
    export const terminLoeschen = ${merke('terminLoeschen')};
    export const terminAbsagen = ${merke('terminAbsagen')};
    export const absageZuruecknehmen = ${merke('absageZuruecknehmen')};
    export const zusagen = ${merke('zusagen')};
    export const rolleSetzen = ${merke('rolleSetzen')};
    export const mitgliedEntfernen = ${merke('mitgliedEntfernen')};
    export const uebergeben = ${merke('uebergeben')};
    /* Einladung mit Ablauf (v.35.53.0): { code, bis }. */
    export const einladungErzeugen = async (...a) => { (globalThis.__aufrufe ||= []).push(['einladungErzeugen', ...a]); return { code: 'K7Q3M9XP', bis: new Date(Date.now() + 7 * 86400000) }; };
    export const gruppenEinladungen = async () => globalThis.__einladungen || [];
    export const einladungZuruecknehmen = ${merke('einladungZuruecknehmen')};
    export const kontakte = async () => globalThis.__bekannte || [];
    export const assistentSetzen = ${merke('assistentSetzen')};
    export const gruppeAendern = ${merke('gruppeAendern')};
    export const bereichSchalten = ${merke('bereichSchalten')};
    export const gruppeLoeschen = ${merke('gruppeLoeschen')};
    export const ladeGruppenKalender = async gid => (globalThis.__gruppenKalender?.[gid] || []);
    export const gruppenKalenderAnlegen = async (...a) => { (globalThis.__aufrufe ||= []).push(['gruppenKalenderAnlegen', ...a]); return 'k-neu'; };
    export const gruppenKalenderLoeschen = ${merke('gruppenKalenderLoeschen')};
    export const beitreten = ${merke('beitreten')};
    export const ergebnisSpeichern = ${merke('ergebnisSpeichern')};
    /* __planScheitertFuer = uid: der Plan für diese Person scheitert (v.35.65.0). */
    export const planVeroeffentlichen = async (...a) => {
      if (globalThis.__planScheitertFuer && a[2]?.fuer === globalThis.__planScheitertFuer) throw new Error('Missing or insufficient permissions.');
      (globalThis.__aufrufe ||= []).push(['planVeroeffentlichen', ...a]);
    };
    export const planLoeschen = ${merke('planLoeschen')};
    export const abonnementErneuern = async () => '';
    export const abonnementAdresse = () => '';
    export const anhangSpeichern = ${merke('anhangSpeichern')};
    export const anhangUmbenennen = ${merke('anhangUmbenennen')};
    export const anhangLoeschen = ${merke('anhangLoeschen')};
    export const alsBlob = () => null;
    /* Was der Termin von der Reise uebernommen hat (v.35.50.0). */
    export const terminAendern = ${merke('terminAendern')};
    export const programmSetzen = ${merke('programmSetzen')};
    /* Die eigene Packliste: globalThis.__gepackt legt der Test an. */
    export const beobachteGepackt = (gid, eid, uid, cb) => { setTimeout(() => cb(globalThis.__gepackt || { uid, erledigt: {}, eigene: [] }), 0); return () => {}; };
    export const gepacktSetzen = ${merke('gepacktSetzen')};
    export const ladeGepackt = async () => [];
    export const gastTokenSetzen = ${merke('gastTokenSetzen')};
    export const ladeGaeste = async () => globalThis.__gaeste || [];
    export const gastEntfernen = ${merke('gastEntfernen')};
    export const reisenDerGruppeUebernehmen = ${merke('reisenDerGruppeUebernehmen')};
    /* Kontakte: globalThis.__kontakte = { uid: {...} } legt der Test an. */
    export const ladeKontakt = async (gid, uid) => ({ ...(globalThis.__kontakte?.[uid] || {}), uid });
    export const ladeKontakte = async () =>
      Object.entries(globalThis.__kontakte || {}).map(([uid, k]) => ({ ...k, uid }));
    export const kontaktSpeichern = ${merke('kontaktSpeichern')};
    /* Der Player (einheit.js). ladePlan bildet die Regel nach: ein Athlet
       bekommt nur Pläne für alle oder für sich, die Leitung jeden. */
    export const ladeGruppe = async gid => ({ id: gid, name: 'Kader' });
    export const ladePlan = async (gid, id) => {
      const alle = ${JSON.stringify(plaene)};
      const p = (Array.isArray(alle) ? alle : Object.values(alle).flat()).find(x => x.id === id);
      if (!p) return null;
      const rolle = ${JSON.stringify(gruppen[0]?.meineRolle || 'mitglied')};
      if (p.fuer !== 'alle' && p.fuer !== 'timo' && !['head', 'staff'].includes(rolle)) {
        throw new Error('Missing or insufficient permissions.');
      }
      return p;
    };
    export const ladeProtokoll = async (gid, uid, datum) => {
      (globalThis.__aufrufe ||= []).push(['ladeProtokoll', gid, uid, datum]);
      /* Wie die Regel bis v.35.50.0: ein Protokoll, das es noch nicht gibt,
         durfte ein Athlet nicht lesen. */
      if (globalThis.__protokollAbgelehnt) throw new Error('Missing or insufficient permissions.');
      return globalThis.__protokoll?.[uid] || { uid, datum, units: {} };
    };
    /* Seit v.35.64.0 je Übung, in einer Transaktion: mitgeschrieben,
       und alles gilt als geschrieben — ausser der Test legt in
       globalThis.__abgleich eine Antwort (oder einen Fehler) fest. */
    export const protokollAbgleichen = async (...a) => {
      (globalThis.__aufrufe ||= []).push(['protokollAbgleichen', ...a]);
      const antwort = globalThis.__abgleich;
      if (antwort instanceof Error) throw antwort;
      if (typeof antwort === 'function') return antwort(...a);
      return { server: null, geschrieben: a[3].map(x => x.unitId + '\\u001f' + x.key), verworfen: [] };
    };
    /* Live: meldet einmal, was in __protokoll steht; __protokollLive(daten)
       spielt eine Meldung von einem anderen Gerät nach. */
    export const beobachteProtokoll = (gid, uid, datum, cb) => {
      globalThis.__protokollLive = daten => cb({ daten, ausSpeicher: false });
      setTimeout(() => cb({ daten: globalThis.__protokoll?.[uid] || null, ausSpeicher: false }), 0);
      return () => {};
    };
    export const privatEinheit = (gid, unitId) => gid + '~' + unitId;
    export const ladePrivat = async () => globalThis.__privat || {};
    export const privatSetzen = ${merke('privatSetzen')};
  `;
}

/**
 * Laedt pages/gruppe.html samt gruppe.js in einem frischen jsdom.
 *
 * @param {object} o
 * @param {Array}  [o.gruppen]   was beobachteMeineGruppen meldet
 * @param {Array}  [o.plaene]
 * @param {Array}  [o.protokolle]
 * @param {Array}  [o.mitglieder]
 * @param {string} [o.heute]     ISO-Tag, auf den die Uhr gestellt wird
 * @param {Function} [o.bereit]  (document) => boolean, worauf gewartet wird
 */
export function starteGruppe({
  bereit = doc => !doc.getElementById('secMitglieder').hidden || !doc.getElementById('secLeer').hidden,
  ...rest
} = {}) {
  return lade({ seite: 'gruppe', skript: 'assets/js/feature/gruppe/gruppe.js', bereit, ...rest });
}

/** Der Einheiten-Player; suche ist die Adresse, z.B. '?g=g1&p=p1&u=kraft'. */
export function starteEinheit({
  suche = '',
  bereit = doc => !doc.getElementById('secWahl').hidden || !doc.getElementById('secPlayer').hidden
    || !doc.getElementById('ladeFehler').hidden,
  ...rest
} = {}) {
  return lade({ seite: 'einheit', skript: 'assets/js/feature/einheit/einheit.js', suche, bereit, ...rest });
}

/** Der Bereich Training — dieselben Attrappen, eine andere Seite. */
export function starteTraining({
  bereit = doc => !doc.getElementById('secWoche').hidden || !doc.getElementById('secOhne').hidden,
  ...rest
} = {}) {
  return lade({ seite: 'training', skript: 'assets/js/feature/training/training.js', bereit, ...rest });
}

async function lade({
  seite, skript, bereit, suche = '',
  gruppen = [{ id: 'g1', name: 'Kader', art: 'kader', meineRolle: 'mitglied' }],
  plaene = [],
  protokolle = [],
  mitglieder = [{ uid: 'timo', name: 'Timothy', rolle: 'mitglied' }],
  heute = '2026-08-05',
  termine = [],
  profil = null,
  /* Essen (v.35.72.0): { freigabe, freigaben, tage } — die Attrappe
     liest daraus, statt etwas zu speichern. */
  essen = null,
  /* Was scheitern soll: freigabe | tag | schreiben | zeitraum. */
  essenFehler = null,
  /* Training teilen (v.35.73.0). */
  freigaben = [],
  teilenFehler = null,
  /* Eigene Plaene (v.35.74.0). */
  eigenePlaene = [],
  eigeneUebungen = [],
  eigeneVorlagen = [],
  /* Was ladePlaene(EIGEN) liefert — wie ein Gruppenplan geformt. */
  eigeneQuelle = [],
}) {
  const html = await readFile(join(root, `pages/${seite}.html`), 'utf8');
  const dom = new JSDOM(html.replace(/<script\b[^>]*><\/script>/gi, ''), {
    url: `https://firn.test/pages/${seite}.html${suche}`,
  });
  const { window } = dom;

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.location = window.location;
  /* Das Einlesen einer Programmseite (itinerary.js) parst HTML. */
  globalThis.DOMParser = window.DOMParser;
  globalThis.__fehler = [];
  globalThis.__gepackt = null;
  globalThis.__gaeste = [];
  globalThis.__einladungen = [];
  globalThis.__bekannte = [];
  globalThis.__partner = [];
  globalThis.__aufrufe = [];
  globalThis.__abgleich = null;
  globalThis.__privat = null;
  globalThis.__protokollLive = null;
  globalThis.__vorlagen = null;
  globalThis.__essen = essen;
  globalThis.__freigaben = freigaben;
  globalThis.__eigenePlaene = eigenePlaene;
  globalThis.__eigeneQuelle = eigeneQuelle;
  globalThis.__eigeneUebungen = eigeneUebungen;
  globalThis.__eigeneVorlagen = eigeneVorlagen;
  globalThis.__eigenFehler = null;
  globalThis.__teilenFehler = teilenFehler;
  globalThis.__essenFehler = essenFehler;
  globalThis.__protokolleFehler = null;
  globalThis.__termine = termine;
  globalThis.__profil = profil;
  globalThis.__antwort = { gruppeAnlegen: 'g-neu' };

  /* termine.js liest die Systemuhr. Ohne gestellte Uhr hinge der Test
     davon ab, an welchem Tag er laeuft. */
  const echtesDate = Date;
  class FesteZeit extends echtesDate {
    constructor(...args) {
      if (args.length === 0) super(`${heute}T09:00:00`);
      else super(...args);
    }
    static now() { return new echtesDate(`${heute}T09:00:00`).getTime(); }
  }
  globalThis.Date = FesteZeit;
  window.Date = FesteZeit;

  const quelle = (await readFile(join(root, skript), 'utf8'))
    .replace(`'../../firebase-config.js'`, `'${dataUrl(FIREBASE_STUB)}'`)
    /* Mit jeder Versionsnummer: sie wandert bei jeder Aenderung der
       Huelle, und der Test soll daran nicht jedes Mal zerbrechen. */
    .replace(/'\.\.\/\.\.\/shell\.js\?v=\d+'/, `'${dataUrl(SHELL_STUB)}'`)
    .replace(`'../../groups.js'`, `'${dataUrl(groupsStub({ gruppen, plaene, protokolle, mitglieder }))}'`)
    /* Das Einlesen: SheetJS kommt aus dem Netz und ist im Test nicht da.
       gridFromFile liefert darum das Raster, das der Test in
       globalThis.__raster legt — der Parser dahinter ist der echte. */
    .replace(`'../../training-import.js'`, `'${dataUrl(`
      export async function gridFromFile(file) {
        /* __raster ist ein Raster fuer jede Datei, oder eine Funktion
           (datei) => Raster fuer mehrere verschiedene auf einmal. */
        const r = typeof globalThis.__raster === 'function' ? globalThis.__raster(file) : globalThis.__raster;
        if (!r) throw new Error('Kein Wochenplan-Blatt gefunden.');
        return { file: file?.name || 'Import.xlsx', ...r };
      }`)}'`)
    .replace(`'../../training-parser.js'`, `'${datei('assets/js/training-parser.js')}'`)
    .replace(`'../../wochenplan.js'`, `'${datei('assets/js/wochenplan.js')}'`)
    .replace(`'../woche/woche.js'`, `'${datei('assets/js/feature/woche/woche.js')}'`)
    .replace(`'../../dialog.js'`, `'${datei('assets/js/dialog.js')}'`)
    .replace(`'../../gruppenwahl.js'`, `'${datei('assets/js/gruppenwahl.js')}'`)
    .replace(`'../../kontakte.js'`, `'${datei('assets/js/kontakte.js')}'`)
    .replace(`'../../termine.js'`, `'${datei('assets/js/termine.js')}'`)
    .replace(`'../../programm.js'`, `'${datei('assets/js/programm.js')}'`)
    .replace(`'../../calendar-interop.js'`, `'${datei('assets/js/calendar-interop.js')}'`)
    .replace(`'../../einheit.js'`, `'${datei('assets/js/einheit.js')}'`)
    .replace(`'../../protokoll-sicherung.js'`, `'${datei('assets/js/protokoll-sicherung.js')}'`)
    .replace(`'../../zuordnung.js'`, `'${datei('assets/js/zuordnung.js')}'`)
    .replace(`'../../fispunkte.js'`, `'${datei('assets/js/fispunkte.js')}'`)
    .replace(`'../../worker-config.js'`, `'${datei('assets/js/worker-config.js')}'`)
    .replace(`'../../einladung.js'`, `'${datei('assets/js/einladung.js')}'`)
    .replace(`'../../ki.js'`, `'${datei('assets/js/ki.js')}'`)
    .replace(`'../../kalender-quellen.js'`, `'${datei('assets/js/kalender-quellen.js')}'`)
    .replace(`'../../essen-modell.js'`, `'${datei('assets/js/essen-modell.js')}'`)
    /* "Training teilen" zeichnet in einer eigenen Datei — wie Essen in
       der Gruppe. Sie laeuft ECHT; nur ihr Weg nach Firestore ist eine
       Attrappe. Ihre relativen Importe muessen mit umgebogen werden. */
    .replace(`'./teilen.js'`, `'${dataUrl((await readFile(join(root, 'assets/js/feature/training/teilen.js'), 'utf8'))
      .replace(`'../../firebase-config.js'`, `'${dataUrl(FIREBASE_STUB)}'`)
      .replace(`'../../training-freigaben.js'`, `'${dataUrl(FREIGABEN_STUB)}'`)
      .replace(`'../../training-teilen.js'`, `'${datei('assets/js/training-teilen.js')}'`)
      .replace(`'../../einheit.js'`, `'${datei('assets/js/einheit.js')}'`)
      .replace(`'../../wochenplan.js'`, `'${datei('assets/js/wochenplan.js')}'`)
      .replace(`'../../dialog.js'`, `'${datei('assets/js/dialog.js')}'`) + `\n// Lauf ${lauf + 1}`)}'`)
    /* Der Plan-Bauer (v.35.74.0) — dasselbe Muster. */
    .replace(`'./plan-bauen.js'`, `'${dataUrl((await readFile(join(root, 'assets/js/feature/training/plan-bauen.js'), 'utf8'))
      .replace(`'../../firebase-config.js'`, `'${dataUrl(FIREBASE_STUB)}'`)
      .replace(`'../../eigene-plaene.js'`, `'${dataUrl(EIGEN_STUB)}'`)
      .replace(`'../../plan-bauer.js'`, `'${datei('assets/js/plan-bauer.js')}'`)
      .replace(`'../../uebungen-bibliothek.js'`, `'${datei('assets/js/uebungen-bibliothek.js')}'`)
      .replace(`'../../dialog.js'`, `'${datei('assets/js/dialog.js')}'`) + `\n// Lauf ${lauf + 1}`)}'`)
    /* Essen zeichnet in einer eigenen Datei (v.35.72.0). Sie laeuft
       hier ECHT — nur ihre Wege nach Firestore sind Attrappen. Ihre
       eigenen Importe muessen darum genauso umgebogen werden wie die
       von gruppe.js: ein Modul aus einer data-URL loest './x.js'
       gegen die data-URL auf, und die gibt es nicht. */
    .replace(`'./essen.js'`, `'${dataUrl((await readFile(join(root, 'assets/js/feature/gruppe/essen.js'), 'utf8'))
      .replace(`'../../firebase-config.js'`, `'${dataUrl(FIREBASE_STUB)}'`)
      .replace(`'../../groups.js'`, `'${dataUrl(groupsStub({ gruppen, plaene, protokolle, mitglieder }))}'`)
      .replace(`'../../essen.js'`, `'${dataUrl(ESSEN_STUB)}'`)
      .replace(`'../../essen-modell.js'`, `'${datei('assets/js/essen-modell.js')}'`)
      .replace(`'../../foods.js'`, `'${datei('assets/js/foods.js')}'`)
      .replace(`'../../dialog.js'`, `'${datei('assets/js/dialog.js')}'`)
      .replace(`'../essen/erfassung.js'`, `'${datei('assets/js/feature/essen/erfassung.js')}'`) + `\n// Lauf ${lauf + 1}`)}'`)
    /* Der Chat: gesendet wird nichts, nur mitgeschrieben. */
    .replace(`'../../chat-senden.js'`, `'${dataUrl(`
      export const gespraechspartner = async () => globalThis.__partner || [];
      export const anMehrere = async o => { (globalThis.__aufrufe ||= []).push(['anMehrere', o]); return { gesendet: o.empfaenger.length, fehler: 0 }; };`)}'`);

  /* Auch die Untermodule (feature/gruppe/essen.js, feature/training/
     teilen.js) bekommen die Laufnummer: sie halten Zustand, und Node
     liefert zu gleicher data-URL dasselbe schon ausgefuehrte Modul.
     Ohne das liefe der zweite Test mit dem Zustand des ersten. */
  /* Jeder Lauf bekommt eine eigene Adresse. Gleiche Parameter ergaeben
     sonst dieselbe Data-URL, der Modul-Cache lieferte das schon
     ausgefuehrte gruppe.js zurueck, und die neue Seite bliebe
     unverkabelt — der erste Test gruen, jeder weitere rot. */
  await import(dataUrl(`${quelle}\n// Lauf ${++lauf}`));

  for (let i = 0; i < 100; i++) {
    if (bereit(window.document)) break;
    await new Promise(r => setTimeout(r, 10));
  }
  /* Die Uhr bleibt gestellt, solange der Test mit der Seite arbeitet —
     sonst sieht ein Formular, das spaeter geoeffnet wird, einen anderen
     Tag. Der Aufrufer stellt sie mit zurueck() zurueck. */
  return {
    doc: window.document,
    window,
    zurueck: () => { globalThis.Date = echtesDate; },
  };
}

/* Ein Klick, wie ihn ein Mensch macht: bubbelt bis zum Delegierer. */
export function klick(el) {
  if (!el) throw new Error('Element zum Klicken fehlt');
  el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
}

/* Warten, bis etwas eintritt — Dialoge und Speichern sind asynchron. */
export async function warte(bedingung, versuche = 100) {
  for (let i = 0; i < versuche; i++) {
    if (bedingung()) return true;
    await new Promise(r => setTimeout(r, 10));
  }
  return false;
}
