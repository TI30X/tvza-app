/* ══════════════════════════════════════════════════════════════════
   Der dritte Tab — die Gruppe selbst.

   Er heisst nicht "Training" und nicht "Gruppen". Er IST die Gruppe und
   trägt ihren Namen. Was darin steht, hängt daran, was die Gruppe
   eingeschaltet hat: beim Kader Termine, Plan und Kaderliste, bei der
   Familie Projekte und Listen. Dieselbe Seite, andere Inhalte.

   Diese erste Fassung zeigt, was das Modell aus Phase 1 hergibt: wer
   dabei ist, mit welcher Rolle, und wie man weitere hereinholt. Termine
   und Plan kommen in Phase 3 dazu.

   Wichtig ist der leere Bildschirm. Wer noch in keiner Gruppe ist, sieht
   nicht "keine Daten", sondern den einen Knopf, der ihn hineinbringt.
   Das ist die Tagesprobe aus CLAUDE.md: ein brandneues Konto öffnet den
   Tab und hat in einem Tippen etwas zu tun.
   ══════════════════════════════════════════════════════════════════ */

import { requireAuth, getProfile, escHtml, wireOfflineBanner, reportClientError }
  from '../../firebase-config.js';
import { mountShell } from '../../shell.js?v=7';
import {
  beobachteMeineGruppen, ladeMitglieder, gruppeAnlegen,
  beobachteTermine, terminAnlegen, terminAendern, terminLoeschen,
  zusagen, ladeZusagen,
  rolleSetzen, mitgliedEntfernen, uebergeben,
  einladungErzeugen, beitreten,
  waehleAktive, aktiveGruppeSetzen, wort, fuehrt, leitet,
} from '../../groups.js';
import {
  kommende, zeitraum, artWort, BEREICH_DER_ART, pruefe, isoTag,
} from '../../termine.js';

const $ = id => document.getElementById(id);
const t = (key, fallback) => window.TVZAI18n?.t(key) ?? fallback;

let user = null;
let gruppen = [];
let aktiv = null;
let termine = [];
let mitglieder = [];
let offen = null;       // der gerade geoeffnete Termin
let terminAbo = null;   // onSnapshot-Abmeldung der aktuellen Gruppe

/* ── Darstellung ───────────────────────────────────────────────────*/

function zeige(id, an) {
  const el = $(id);
  if (el) el.hidden = !an;
}

/* Reihenfolge im Kader: erst der Haupttrainer, dann die Trainer, dann
   die Athleten. Innerhalb einer Rolle alphabetisch. Eine Kaderliste,
   die nach Beitrittsdatum sortiert, sagt niemandem etwas. */
const RANG = { head: 0, staff: 1, mitglied: 2 };

function sortiere(mitglieder) {
  return [...mitglieder].sort((a, b) => {
    const r = (RANG[a.rolle] ?? 9) - (RANG[b.rolle] ?? 9);
    if (r !== 0) return r;
    return String(a.name || a.uid).localeCompare(String(b.name || b.uid), 'de');
  });
}

function initialen(name) {
  const teile = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (teile.length > 1) return (teile[0][0] + teile[teile.length - 1][0]).toUpperCase();
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return '·';
}

/* Dieselben Bausteine wie auf bereiche.html — .row/.row__body/.row__end
   aus kit.css. Eine eigene Zeilenform waere die neunte im Repo. */
function mitgliedZeile(m, art) {
  const name = m.name || m.uid;
  const rolle = wort(art, m.rolle);
  const suffix = m.uid === user.uid ? ' (du)' : '';

  /* Nur der Kopf verwaltet Leute. Für alle anderen bleibt die Zeile
     eine Zeile und wird nicht zu einem Knopf, der nichts tut. */
  const klickbar = fuehrt(aktiv?.meineRolle);
  const tag = klickbar ? 'button' : 'div';
  const attrs = klickbar ? ` type="button" data-person="${escHtml(m.uid)}"` : '';

  return `
    <${tag} class="row"${attrs} data-bereich="msg">
      <span class="row__icon">${escHtml(initialen(name))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(name + suffix)}</span>
        <span class="row__sub">${escHtml(rolle)}</span>
      </span>
      <span class="row__end"></span>
    </${tag}>`;
}

async function zeichneMitglieder() {
  if (!aktiv) return;
  const liste = $('listMitglieder');
  try {
    mitglieder = sortiere(await ladeMitglieder(aktiv.id));

    $('mitgliederTitel').textContent = wort(aktiv.art, 'mitglieder');
    liste.innerHTML = mitglieder.map(m => mitgliedZeile(m, aktiv.art)).join('');

    const zahl = mitglieder.length;
    const meta = $('grpMeta');
    meta.textContent = `${zahl} ${zahl === 1 ? 'Person' : 'Personen'}`;
    meta.hidden = false;
  } catch (e) {
    reportClientError('gruppe/mitglieder', e);
    /* Der häufigste Grund ist ein fehlender Index oder eine Regel, die
       noch nicht ausgerollt ist — beides sagt dem Nutzer nichts. Also
       eine Zeile, die stimmt, statt einer, die Technik erklärt. */
    liste.innerHTML = '<p class="empty-hint">Die Mitglieder liessen sich nicht laden.</p>';
  }
}

/* ── Termine ───────────────────────────────────────────────────────*/

function terminZeile(t) {
  const bereich = BEREICH_DER_ART[t.art] || '';
  const wann = zeitraum(t);
  const ort = t.ort ? ` · ${t.ort}` : '';
  return `
    <button class="row" type="button" data-termin="${escHtml(t.id)}" data-bereich="${escHtml(bereich)}">
      <span class="row__icon">${escHtml(artWort(t.art).slice(0, 1))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(t.titel)}</span>
        <span class="row__sub">${escHtml(wann + ort)}</span>
      </span>
      <span class="row__end">${escHtml(artWort(t.art))}</span>
    </button>`;
}

function zeichneTermine() {
  const liste = $('listTermine');
  if (!liste) return;

  /* Nur was noch kommt — ein laufendes Lager zählt dazu, bis es vorbei
     ist. Vergangenes gehört in eine Saisonübersicht, nicht auf die
     erste Seite der Gruppe. */
  const naechste = kommende(termine, isoTag(), 6);

  liste.innerHTML = naechste.length
    ? naechste.map(terminZeile).join('')
    : '<p class="empty-hint">Noch keine Termine.</p>';
}

function zeichneWechsel() {
  const mehrere = gruppen.length > 1;
  zeige('secWechsel', mehrere);
  if (!mehrere) return;

  $('grpWahl').innerHTML = gruppen
    .map(g => `<option value="${escHtml(g.id)}"${g.id === aktiv?.id ? ' selected' : ''}>${escHtml(g.name)}</option>`)
    .join('');
}

function zeichne() {
  const hat = !!aktiv;
  const darfFuehren = hat && leitet(aktiv.meineRolle);

  zeige('secLeer', !hat);
  zeige('secTermine', hat);
  zeige('secMitglieder', hat);
  zeige('secAktionen', darfFuehren);
  zeichneWechsel();

  /* Wer nicht führt, sieht den Knopf gar nicht erst. Die Regeln lehnen
     das Schreiben ohnehin ab — aber ein Knopf, der zuverlässig
     scheitert, ist schlechter als keiner. */
  const knopf = $('btnTermin');
  if (knopf) knopf.hidden = !darfFuehren;

  if (!hat) {
    $('grpName').textContent = t('nav.gruppe', 'Gruppe');
    $('grpMeta').hidden = true;
    formSchliessen();
    return;
  }

  $('grpName').textContent = aktiv.name;
  zeichneMitglieder();
  zeichneTermine();
}

/* ── Handlungen ────────────────────────────────────────────────────*/

async function neueGruppe() {
  const name = prompt('Wie soll die Gruppe heissen?');
  if (name === null) return;
  const sauber = name.trim();
  if (!sauber) return;

  /* Die Art entscheidet nur über Wortwahl und Vorgabe-Bereiche, nicht
     über den Ablauf — deshalb reicht hier eine einzige Frage. */
  const kader = confirm(
    'Ist das ein Trainings- oder Rennkader?\n\n'
    + 'OK  — Kader (Haupttrainer, Trainer, Athleten)\n'
    + 'Abbrechen — Familie oder Freundeskreis');

  const btn = $('btnNeu');
  btn.disabled = true;
  try {
    const gid = await gruppeAnlegen(user.uid, { name: sauber, art: kader ? 'kader' : 'familie' });
    aktiveGruppeSetzen(gid);
    /* Kein reload: beobachteMeineGruppen meldet die neue Gruppe von
       selbst, und der Umschalter steht dann schon richtig. */
  } catch (e) {
    reportClientError('gruppe/anlegen', e);
    alert('Die Gruppe konnte nicht erstellt werden.');
  } finally {
    btn.disabled = false;
  }
}

/* ── Ein Termin von nahem ──────────────────────────────────────────
   Für Athleten die Zusage, für die Leitung das Ergebnis. Beides an
   derselben Stelle, weil ein Rennen genau das ist: etwas mit einem
   Vorher und einem Nachher. */

function zusagenText(liste) {
  const zahl = a => liste.filter(z => z.antwort === a).length;
  const ja = zahl('ja');
  const nein = zahl('nein');
  const vielleicht = zahl('vielleicht');
  /* Wer nicht geantwortet hat, ist nicht dasselbe wie wer abgesagt hat —
     und für einen Trainer ist genau das die Zahl, die zählt. */
  const stumm = Math.max(0, mitglieder.length - liste.length);

  const teile = [];
  if (ja) teile.push(`${ja} zugesagt`);
  if (vielleicht) teile.push(`${vielleicht} vielleicht`);
  if (nein) teile.push(`${nein} abgesagt`);
  if (stumm) teile.push(`${stumm} offen`);
  return teile.length ? teile.join(' · ') : 'Noch keine Antworten.';
}

async function zeichneZusagen() {
  if (!offen || !aktiv) return;
  const feld = $('dZusagen');
  try {
    const liste = await ladeZusagen(aktiv.id, offen.id);
    feld.textContent = zusagenText(liste);
    feld.hidden = false;

    /* Die eigene Antwort wird hervorgehoben, statt sie in einem
       separaten Satz zu wiederholen. */
    const meine = liste.find(z => z.uid === user.uid)?.antwort || '';
    $('zusageKnoepfe').querySelectorAll('[data-antwort]').forEach(btn => {
      /* Der Zustand hängt allein an aria-pressed: die CSS liest es
         direkt, und ein Screenreader bekommt damit dieselbe Wahrheit
         wie das Auge — statt einer Klasse, die nur sichtbar ist. */
      btn.setAttribute('aria-pressed', String(btn.dataset.antwort === meine));
    });
  } catch (e) {
    reportClientError('gruppe/zusagen', e);
    feld.hidden = true;
  }
}

function detailOeffnen(eid) {
  offen = termine.find(t => t.id === eid) || null;
  if (!offen) return;

  const darfFuehren = leitet(aktiv?.meineRolle);
  const teile = [artWort(offen.art), zeitraum(offen)];
  if (offen.ort) teile.push(offen.ort);
  if (offen.disziplin) teile.push(offen.disziplin);

  $('dTitel').textContent = offen.titel;
  $('dMeta').textContent = teile.filter(Boolean).join(' · ');
  $('dMeta').hidden = false;

  /* Ein Ergebnis gibt es nur beim Rennen, und eintragen darf es nur
     die Leitung. Bei einem Krafttraining stünde das Feld sinnlos da. */
  zeige('grpErgebnis', offen.art === 'rennen' && darfFuehren);
  $('eRang').value = offen.ergebnis?.rang ?? '';
  $('eZeit').value = offen.ergebnis?.zeit ?? '';
  $('ePunkte').value = offen.ergebnis?.punkte ?? '';

  const loeschen = $('btnLoeschen');
  if (loeschen) loeschen.hidden = !darfFuehren;

  zeige('secDetail', true);
  zeige('secTermine', false);
  zeige('secMitglieder', false);
  zeichneZusagen();
}

function detailSchliessen() {
  offen = null;
  zeige('secDetail', false);
  zeige('secTermine', !!aktiv);
  zeige('secMitglieder', !!aktiv);
}

async function antworten(antwort) {
  if (!offen || !aktiv) return;
  try {
    await zusagen(aktiv.id, offen.id, user.uid, antwort);
    await zeichneZusagen();
  } catch (e) {
    reportClientError('gruppe/zusage', e);
    $('dZusagen').textContent = 'Die Antwort konnte nicht gespeichert werden.';
    $('dZusagen').hidden = false;
  }
}

async function ergebnisSpeichern() {
  if (!offen || !aktiv) return;
  const rang = $('eRang').value.trim();
  const zeit = $('eZeit').value.trim();
  const punkte = $('ePunkte').value.trim();

  /* Leere Felder werden nicht als '' geschrieben — ein Ergebnis mit
     rang:'' läse sich später wie "es gibt einen Rang, er ist bloss
     leer". Ist gar nichts ausgefüllt, wird das Ergebnis entfernt. */
  const ergebnis = {};
  if (rang) ergebnis.rang = Number(rang);
  if (zeit) ergebnis.zeit = zeit;
  if (punkte) ergebnis.punkte = punkte;

  const btn = $('btnErgebnis');
  btn.disabled = true;
  try {
    await terminAendern(aktiv.id, offen.id,
      { ergebnis: Object.keys(ergebnis).length ? ergebnis : null });
    btn.textContent = 'Gespeichert';
    setTimeout(() => { btn.textContent = 'Ergebnis speichern'; }, 1600);
  } catch (e) {
    reportClientError('gruppe/ergebnis', e);
    alert('Das Ergebnis konnte nicht gespeichert werden.');
  } finally {
    btn.disabled = false;
  }
}

async function terminEntfernen() {
  if (!offen || !aktiv) return;
  if (!confirm(`"${offen.titel}" wirklich löschen?`)) return;
  try {
    await terminLoeschen(aktiv.id, offen.id);
    detailSchliessen();
  } catch (e) {
    reportClientError('gruppe/termin-loeschen', e);
    alert('Der Termin konnte nicht gelöscht werden.');
  }
}

/* ── Das Terminformular ────────────────────────────────────────────*/

/* Die Felder richten sich nach der Art. Ein Bis-Datum an einem
   zweistündigen Training ist Ballast, eine Disziplin an einem
   Krafttraining ist irreführend — pruefe() in termine.js lehnt sie
   ohnehin ab. */
function formAnpassen() {
  const art = $('fArt').value;
  zeige('grpBis', art === 'lager');
  zeige('grpZeit', art !== 'lager');
  zeige('grpDisziplin', art === 'rennen');
}

function formOeffnen() {
  $('fArt').value = 'training';
  $('fTitel').value = '';
  $('fVon').value = isoTag();
  $('fBis').value = '';
  $('fZeit').value = '';
  $('fDisziplin').value = '';
  $('fOrt').value = '';
  $('formFehler').hidden = true;
  formAnpassen();
  zeige('secForm', true);
  zeige('secTermine', false);
  $('fTitel').focus();
}

function formSchliessen() {
  zeige('secForm', false);
  zeige('secTermine', !!aktiv);
}

function formLesen() {
  const art = $('fArt').value;
  return {
    art,
    titel: $('fTitel').value.trim(),
    von: $('fVon').value,
    /* Bis und Zeit nur dort, wo das Feld auch sichtbar war — sonst
       schleppt ein Training ein Enddatum mit, das niemand eingegeben
       hat, weil der Browser einen alten Wert behalten hat. */
    bis: art === 'lager' ? ($('fBis').value || null) : null,
    zeit: art === 'lager' ? null : ($('fZeit').value || null),
    disziplin: art === 'rennen' ? ($('fDisziplin').value || null) : null,
    ort: $('fOrt').value.trim() || null,
  };
}

async function terminSpeichern() {
  if (!aktiv) return;
  const entwurf = formLesen();

  const fehler = pruefe(entwurf);
  if (fehler.length) {
    const feld = $('formFehler');
    feld.textContent = fehler[0];
    feld.hidden = false;
    return;
  }

  const btn = $('btnSpeichern');
  btn.disabled = true;
  try {
    await terminAnlegen(aktiv.id, user.uid, entwurf);
    formSchliessen();
    /* Kein Neuzeichnen von Hand: beobachteTermine meldet den neuen
       Termin von selbst. */
  } catch (e) {
    reportClientError('gruppe/termin', e);
    const feld = $('formFehler');
    feld.textContent = 'Der Termin konnte nicht gespeichert werden.';
    feld.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ── Kaderverwaltung ───────────────────────────────────────────────
   Nur für den Kopf. Rollen vergibt er allein — dürfte die Leitung das,
   könnten sich zwei Trainer gegenseitig herabstufen. Die Regel besteht
   ohnehin darauf; hier steht es, damit die Oberfläche gar nicht erst
   etwas anbietet, das scheitern würde. */

let person = null;   // das gerade geöffnete Mitglied

function personOeffnen(uid) {
  if (!aktiv || !fuehrt(aktiv.meineRolle)) return;
  person = mitglieder.find(m => m.uid === uid) || null;
  if (!person) return;

  const name = person.name || person.uid;
  const istKopf = person.rolle === 'head';
  const ichSelbst = person.uid === user.uid;

  $('pName').textContent = name;
  $('pMeta').textContent = wort(aktiv.art, person.rolle);
  $('pMeta').hidden = false;

  $('rolleWahl').querySelectorAll('[data-rolle]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.rolle === person.rolle));
    /* Am Kopf lässt sich die Rolle nicht drehen — er übergibt zuerst,
       sonst stünde die Gruppe ohne Kopf da. */
    btn.disabled = istKopf;
  });

  /* An sich selbst übergibt niemand, und den Kopf entfernt niemand. */
  $('btnUebergeben').hidden = istKopf || ichSelbst;
  $('btnEntfernen').hidden = istKopf;

  zeige('secPerson', true);
  zeige('secMitglieder', false);
  zeige('secTermine', false);
}

function personSchliessen() {
  person = null;
  zeige('secPerson', false);
  zeige('secMitglieder', !!aktiv);
  zeige('secTermine', !!aktiv);
}

async function rolleAendern(rolle) {
  if (!person || !aktiv || person.rolle === rolle) return;
  try {
    await rolleSetzen(aktiv.id, person.uid, rolle);
    await zeichneMitglieder();
    personOeffnen(person.uid);
  } catch (e) {
    reportClientError('gruppe/rolle', e);
    alert('Die Rolle konnte nicht geändert werden.');
  }
}

async function personEntfernen() {
  if (!person || !aktiv) return;
  const name = person.name || person.uid;
  if (!confirm(`${name} wirklich aus der Gruppe entfernen?`)) return;
  try {
    await mitgliedEntfernen(aktiv.id, person.uid);
    personSchliessen();
    await zeichneMitglieder();
  } catch (e) {
    reportClientError('gruppe/entfernen', e);
    alert('Das Mitglied konnte nicht entfernt werden.');
  }
}

async function leitungUebergeben() {
  if (!person || !aktiv) return;
  const name = person.name || person.uid;
  /* Eine Übergabe ist nicht rückgängig zu machen: danach bist du nicht
     mehr der Kopf und kannst sie nicht zurückholen. Das gehört gesagt,
     bevor jemand tippt. */
  if (!confirm(
    `Die Leitung an ${name} übergeben?\n\n`
    + 'Danach bist du nur noch Trainer und kannst die Leitung nicht '
    + 'selbst zurückholen.')) return;

  try {
    await uebergeben(aktiv.id, person.uid);
    personSchliessen();
    /* beobachteMeineGruppen meldet die neue Rolle von selbst; die Seite
       zeichnet sich daraufhin mit den passenden Rechten neu. */
  } catch (e) {
    reportClientError('gruppe/uebergeben', e);
    alert('Die Übergabe hat nicht geklappt.');
  }
}

/* ── Beitreten ─────────────────────────────────────────────────────*/

async function codeEinloesen() {
  const eingabe = prompt('Einladungscode eingeben:');
  if (eingabe === null) return;
  const sauber = eingabe.trim();
  if (!sauber) return;

  const btn = $('btnBeitreten');
  btn.disabled = true;
  try {
    const gid = await beitreten(sauber, user.uid);
    aktiveGruppeSetzen(gid);
  } catch (e) {
    reportClientError('gruppe/beitreten', e);
    alert(e?.message || 'Der Beitritt hat nicht geklappt.');
  } finally {
    btn.disabled = false;
  }
}

async function einladen() {
  if (!aktiv) return;
  const btn = $('btnEinladen');
  btn.disabled = true;
  try {
    const kennung = await einladungErzeugen(aktiv.id, user.uid);
    const feld = $('einladungText');
    feld.textContent = kennung;
    feld.hidden = false;
    try {
      await navigator.clipboard.writeText(kennung);
      btn.textContent = 'Kopiert';
      setTimeout(() => { btn.textContent = 'Einladungscode erzeugen'; }, 1600);
    } catch {
      /* Ohne Zwischenablage — älteres iOS, kein sicherer Kontext —
         steht der Code wenigstens lesbar darunter. */
    }
  } catch (e) {
    reportClientError('gruppe/einladen', e);
    alert('Der Code konnte nicht erzeugt werden.');
  } finally {
    btn.disabled = false;
  }
}

/* ── Start ─────────────────────────────────────────────────────────*/

(async function () {
  try { user = await requireAuth('../login.html'); }
  catch { return; }

  wireOfflineBanner();

  let profile = {};
  try { profile = await getProfile(user); } catch { /* Kopf bleibt schlicht */ }

  mountShell({
    variant: 'bereich',
    title: t('nav.gruppe', 'Gruppe'),
    backHref: '../index.html',
    profile,
    onSettings: () => window.tvzaOpenSettings?.(),
  });

  $('btnNeu')?.addEventListener('click', neueGruppe);
  $('btnEinladen')?.addEventListener('click', einladen);
  $('btnTermin')?.addEventListener('click', formOeffnen);
  $('btnAbbrechen')?.addEventListener('click', formSchliessen);
  $('btnSpeichern')?.addEventListener('click', terminSpeichern);
  $('fArt')?.addEventListener('change', formAnpassen);

  /* Ein Zuhörer auf der Liste statt einer pro Zeile: die Zeilen werden
     bei jeder Änderung neu gezeichnet, einzeln gebundene Zuhörer wären
     nach dem ersten Neuzeichnen ins Leere gebunden. */
  $('listTermine')?.addEventListener('click', event => {
    const eid = event.target.closest('[data-termin]')?.dataset.termin;
    if (eid) detailOeffnen(eid);
  });
  $('zusageKnoepfe')?.addEventListener('click', event => {
    const antwort = event.target.closest('[data-antwort]')?.dataset.antwort;
    if (antwort) antworten(antwort);
  });
  $('btnZurueck')?.addEventListener('click', detailSchliessen);
  $('btnErgebnis')?.addEventListener('click', ergebnisSpeichern);
  $('btnLoeschen')?.addEventListener('click', terminEntfernen);

  $('btnBeitreten')?.addEventListener('click', codeEinloesen);
  $('listMitglieder')?.addEventListener('click', event => {
    const uid = event.target.closest('[data-person]')?.dataset.person;
    if (uid) personOeffnen(uid);
  });
  $('rolleWahl')?.addEventListener('click', event => {
    const rolle = event.target.closest('[data-rolle]')?.dataset.rolle;
    if (rolle) rolleAendern(rolle);
  });
  $('btnPersonZurueck')?.addEventListener('click', personSchliessen);
  $('btnEntfernen')?.addEventListener('click', personEntfernen);
  $('btnUebergeben')?.addEventListener('click', leitungUebergeben);

  $('grpWahl')?.addEventListener('change', event => {
    aktiveGruppeSetzen(event.target.value);
    aktiv = gruppen.find(g => g.id === event.target.value) || aktiv;
    hoereAufTermine();
    zeichne();
  });

  beobachteMeineGruppen(user.uid, liste => {
    gruppen = liste;
    const vorher = aktiv?.id;
    aktiv = waehleAktive(liste);
    if (aktiv?.id !== vorher) hoereAufTermine();
    zeichne();
  });
}());

/* Beim Gruppenwechsel muss das alte Abo weg. Ohne das liefen nach
   dreimal Umschalten drei Zuhörer nebeneinander, und der zuletzt
   antwortende überschriebe die Liste — die Termine der falschen
   Gruppe stünden dann auf der richtigen Seite. */
function hoereAufTermine() {
  detailSchliessen();
  terminAbo?.();
  terminAbo = null;
  termine = [];
  zeichneTermine();

  if (!aktiv) return;
  const fuer = aktiv.id;
  terminAbo = beobachteTermine(fuer, liste => {
    /* Eine späte Antwort der vorigen Gruppe darf die aktuelle nicht
       überschreiben. */
    if (aktiv?.id !== fuer) return;
    termine = liste;
    if (offen && !termine.some(t => t.id === offen.id)) detailSchliessen();
    zeichneTermine();
  });
}

/* fuehrt() wird inzwischen wirklich gebraucht — für die Kaderverwaltung.
   Der Blind-Export, der es bis dahin am Leben hielt, kann weg. */
