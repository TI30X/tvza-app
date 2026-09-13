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
  export const getProfile = () => Promise.resolve({ displayName: 'Timothy' });
  export const wireOfflineBanner = () => {};
  export const reportClientError = (wo, e) => { (globalThis.__fehler ||= []).push([wo, String(e)]); };
`;

const SHELL_STUB = `
  export const mountShell = () => {};
  export const setShellTitle = () => {};
`;

/* Nur was die Seite wirklich anfasst. Schreibende Aufrufe werden
   mitgeschrieben, statt etwas zu tun. */
function groupsStub({ gruppen, plaene, protokolle, mitglieder }) {
  const merke = name => `async (...a) => { (globalThis.__aufrufe ||= []).push(['${name}', ...a]); return globalThis.__antwort?.['${name}']; }`;
  return `
    export const PLAN_FUER_ALLE = 'alle';
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
    export const beobachteTermine = () => () => {};
    export const ladeMitglieder = async () => ${JSON.stringify(mitglieder)};
    /* Eine Liste gilt fuer jede Gruppe; ein Objekt { gid: [...] } je
       Gruppe — fuer den Bereich Training, der mehrere liest. */
    export const ladePlaene = async gid => {
      const alle = ${JSON.stringify(plaene)};
      return Array.isArray(alle) ? alle : (alle[gid] || []);
    };
    export const ladeProtokolle = async () => ${JSON.stringify(protokolle)};
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
    export const einladungErzeugen = async () => 'CODE';
    export const beitreten = ${merke('beitreten')};
    export const ergebnisSpeichern = ${merke('ergebnisSpeichern')};
    export const planVeroeffentlichen = ${merke('planVeroeffentlichen')};
    export const abonnementErneuern = async () => '';
    export const abonnementAdresse = () => '';
    export const anhangSpeichern = ${merke('anhangSpeichern')};
    export const anhangUmbenennen = ${merke('anhangUmbenennen')};
    export const anhangLoeschen = ${merke('anhangLoeschen')};
    export const alsBlob = () => null;
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
      return globalThis.__protokoll?.[uid] || { uid, datum, units: {} };
    };
    export const protokollSpeichern = ${merke('protokollSpeichern')};
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
  globalThis.__fehler = [];
  globalThis.__aufrufe = [];
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
        if (!globalThis.__raster) throw new Error('Kein Wochenplan-Blatt gefunden.');
        return { file: file?.name || 'Import.xlsx', ...globalThis.__raster };
      }`)}'`)
    .replace(`'../../training-parser.js'`, `'${datei('assets/js/training-parser.js')}'`)
    .replace(`'../../wochenplan.js'`, `'${datei('assets/js/wochenplan.js')}'`)
    .replace(`'../woche/woche.js'`, `'${datei('assets/js/feature/woche/woche.js')}'`)
    .replace(`'../../dialog.js'`, `'${datei('assets/js/dialog.js')}'`)
    .replace(`'../../gruppenwahl.js'`, `'${datei('assets/js/gruppenwahl.js')}'`)
    .replace(`'../../kontakte.js'`, `'${datei('assets/js/kontakte.js')}'`)
    .replace(`'../../termine.js'`, `'${datei('assets/js/termine.js')}'`)
    .replace(`'../../einheit.js'`, `'${datei('assets/js/einheit.js')}'`)
    .replace(`'../../fispunkte.js'`, `'${datei('assets/js/fispunkte.js')}'`)
    .replace(`'../../worker-config.js'`, `'${datei('assets/js/worker-config.js')}'`);

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
