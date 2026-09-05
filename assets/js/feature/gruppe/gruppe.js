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
import { mountShell, setShellTitle } from '../../shell.js?v=7';
import {
  beobachteMeineGruppen, ladeMitglieder, gruppeAnlegen,
  beobachteTermine, terminAnlegen, terminLoeschen,
  zusagen, ladeZusagen,
  rolleSetzen, mitgliedEntfernen, uebergeben,
  einladungErzeugen, beitreten,
  ladeErgebnisse, ergebnisSpeichern,
  ladePlaene, planVeroeffentlichen, eigeneProgramme, PLAN_FUER_ALLE,
  abonnementErneuern, abonnementAdresse,
  terminAbsagen, absageZuruecknehmen,
  ladeAnhaenge, anhangSpeichern, anhangUmbenennen, anhangLoeschen, alsBlob,
  waehleAktive, aktiveGruppeSetzen, wort, fuehrt, leitet,
} from '../../groups.js';
import {
  kommende, zeitraum, artWort, BEREICH_DER_ART, pruefe, isoTag,
  artenFuer, kenntDisziplinen, istAbgesagt,
} from '../../termine.js';
import {
  rennpunkte, gesamtpunkte, standMit, standJeDisziplin,
} from '../../fispunkte.js';
import { WORKER_BASIS } from '../../worker-config.js';

const $ = id => document.getElementById(id);
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars) ?? fallback;

/* Plural ueber Intl, nicht ueber ein Fragezeichen: Polnisch hat drei
   Formen, und "1 Person / 2 Personen" trifft nur zwei davon. Ohne
   Katalog gibt format.plural den Schluessel zurueck — dann greift die
   deutsche Ruecklage. */
const tPlural = (key, n, eins, mehr) => {
  const wert = window.TVZAI18n?.format?.plural(key, n);
  return (!wert || String(wert).startsWith(key)) ? `${n} ${n === 1 ? eins : mehr}` : wert;
};

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

/* Dieselben Bausteine wie auf Start — .row/.row__body/.row__end
   aus kit.css. Eine eigene Zeilenform waere die neunte im Repo. */
function mitgliedZeile(m, art) {
  const name = m.name || m.uid;
  const rolle = wort(art, m.rolle);
  const suffix = m.uid === user.uid ? ' (du)' : '';

  /* Jede Zeile führt ins Profil — ein Kader, in dem niemand weiss, wer
     wie fährt, ist kein Kader. Was man dort DARF, entscheidet die
     Rolle; was man dort SIEHT, nicht. */
  return `
    <button class="row" type="button" data-person="${escHtml(m.uid)}" data-bereich="msg">
      <span class="row__icon">${escHtml(initialen(name))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(name + suffix)}</span>
        <span class="row__sub">${escHtml(rolle)}</span>
      </span>
      <span class="row__end"></span>
    </button>`;
}

async function zeichneMitglieder() {
  if (!aktiv) return;
  const liste = $('listMitglieder');
  try {
    mitglieder = sortiere(await ladeMitglieder(aktiv.id));

    $('mitgliederTitel').textContent = wort(aktiv.art, 'mitglieder');
    liste.innerHTML = mitglieder.map(m => mitgliedZeile(m, aktiv.art)).join('');

    const zahl = mitglieder.length;
    const meta = $('mitgliederZahl');
    meta.textContent = tPlural('grp.personen', zahl, 'Person', 'Personen');
    meta.hidden = false;
  } catch (e) {
    reportClientError('gruppe/mitglieder', e);
    /* Der häufigste Grund ist ein fehlender Index oder eine Regel, die
       noch nicht ausgerollt ist — beides sagt dem Nutzer nichts. Also
       eine Zeile, die stimmt, statt einer, die Technik erklärt. */
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('grp.f.mitglieder', 'Die Mitglieder liessen sich nicht laden.'))}</p>`;
  }
}

/* ── Termine ───────────────────────────────────────────────────────*/

function terminZeile(t) {
  const bereich = BEREICH_DER_ART[t.art] || '';
  const wann = zeitraum(t);
  const ort = t.ort ? ` · ${t.ort}` : '';
  /* Abgesagtes bleibt in der Liste — sonst faehrt jemand hin. Aber es
     muss auf den ersten Blick anders aussehen als der Rest. */
  const ab = istAbgesagt(t);
  return `
    <button class="row" type="button" data-termin="${escHtml(t.id)}" data-bereich="${escHtml(bereich)}">
      <span class="row__icon">${escHtml(artWort(t.art, aktiv?.art).slice(0, 1))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(ab ? `${t.titel} — abgesagt` : t.titel)}</span>
        <span class="row__sub">${escHtml(wann + ort)}</span>
      </span>
      <span class="row__end">${escHtml(ab ? t('grp.abgesagt', 'Abgesagt') : artWort(t.art, aktiv?.art))}</span>
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
    : `<p class="empty-hint">${escHtml(t('grp.keineTermine', 'Noch keine Termine.'))}</p>`;
}

/* ── Pläne ─────────────────────────────────────────────────────────
   Ein Plan gilt für den ganzen Kader oder für genau einen Athleten.
   Das ist der Unterschied, den das alte Modell nicht abbilden konnte:
   dort lag ein Programm unter users/{uid} und gehörte damit dem
   Athleten, nicht dem Trainer. */

let plaene = [];

function planZeile(p) {
  const fuerAlle = p.fuer === PLAN_FUER_ALLE;
  const empfaenger = fuerAlle
    ? wort(aktiv?.art, 'mitglieder')
    : (mitglieder.find(m => m.uid === p.fuer)?.name || t('grp.einAthlet', 'ein Athlet'));

  /* Ein Plan ist zum Machen da, nicht zum Ansehen: die Zeile führt
     direkt in den Einheiten-Player. */
  const ziel = `./einheit.html?g=${encodeURIComponent(aktiv.id)}&p=${encodeURIComponent(p.id)}`;

  return `
    <a class="row" href="${escHtml(ziel)}" data-bereich="t-training">
      <span class="row__icon">P</span>
      <span class="row__body">
        <span class="row__title">${escHtml(p.titel)}</span>
        <span class="row__sub">${escHtml(fuerAlle ? t('grp.fuerAlle', 'Für {wen}', { wen: empfaenger }) : t('grp.nurFuer', 'Nur für {wen}', { wen: empfaenger }))}</span>
      </span>
      <span class="row__end">
        <svg class="ic row__chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </a>`;
}

async function zeichnePlaene() {
  const liste = $('listPlaene');
  if (!liste || !aktiv) return;

  const darfFuehren = leitet(aktiv.meineRolle);
  zeige('secPlaene', true);
  $('btnPlanNeu').hidden = !darfFuehren;

  try {
    plaene = await ladePlaene(aktiv.id, user.uid, darfFuehren);
  } catch (e) {
    reportClientError('gruppe/plaene', e);
    plaene = [];
  }

  liste.innerHTML = plaene.length
    ? plaene.map(planZeile).join('')
    : `<p class="empty-hint">${darfFuehren
        ? t('grp.keinPlan', 'Noch kein Plan veröffentlicht.')
        : t('grp.keinPlanFuerDich', 'Für dich liegt noch kein Plan bereit.')}</p>`;
}

async function planFormOeffnen() {
  if (!aktiv) return;

  const quelle = $('planQuelle');
  try {
    const programme = await eigeneProgramme(user.uid);
    quelle.innerHTML = programme.length
      ? programme.map(p => `<option value="${escHtml(p.id)}">${escHtml(p.id)}</option>`).join('')
      : `<option value="">${escHtml(t('grp.keinProgramm', 'Du hast noch kein Programm eingelesen'))}</option>`;
    /* Der Rohtext wird am Element gemerkt, damit das Speichern nicht
       noch einmal lesen muss. */
    quelle.dataset.json = JSON.stringify(
      Object.fromEntries(programme.map(p => [p.id, p.json])));
  } catch (e) {
    reportClientError('gruppe/programme', e);
    quelle.innerHTML = `<option value="">${escHtml(t('grp.programmeUnlesbar', 'Programme nicht lesbar'))}</option>`;
  }

  /* "Alle" zuerst — der Normalfall ist ein Plan für den ganzen Kader.
     Ein Plan nur für einen Athleten ist die Ausnahme, und genau die
     soll möglich sein. */
  $('planFuer').innerHTML = [
    `<option value="${PLAN_FUER_ALLE}">${escHtml(t('grp.alleInGruppe', 'Alle in der Gruppe'))}</option>`,
    ...mitglieder.map(m =>
      `<option value="${escHtml(m.uid)}">${escHtml(t('grp.nurWen', 'Nur {wen}', { wen: m.name || m.uid }))}</option>`),
  ].join('');

  $('planTitel').value = '';
  $('planFehler').hidden = true;
  zeige('secPlanForm', true);
  zeige('secPlaene', false);
  zeige('secTermine', false);
  zeige('secMitglieder', false);
}

function planFormSchliessen() {
  zeige('secPlanForm', false);
  zeige('secPlaene', !!aktiv);
  zeige('secTermine', !!aktiv);
  zeige('secMitglieder', !!aktiv);
}

async function planSpeichern() {
  if (!aktiv) return;
  const quelle = $('planQuelle');
  const programmId = quelle.value;
  const fehler = $('planFehler');

  let json = '';
  try { json = JSON.parse(quelle.dataset.json || '{}')[programmId] || ''; }
  catch { json = ''; }

  if (!json) {
    fehler.textContent = t('grp.f.keinProgramm', 'Es ist kein Programm ausgewählt, das sich veröffentlichen liesse.');
    fehler.hidden = false;
    return;
  }

  const btn = $('btnPlanSpeichern');
  btn.disabled = true;
  try {
    await planVeroeffentlichen(aktiv.id, user.uid, {
      titel: $('planTitel').value.trim() || programmId,
      json,
      fuer: $('planFuer').value,
    });
    planFormSchliessen();
    await zeichnePlaene();
  } catch (e) {
    reportClientError('gruppe/plan', e);
    fehler.textContent = e?.message || t('grp.f.plan', 'Der Plan konnte nicht veröffentlicht werden.');
    fehler.hidden = false;
  } finally {
    btn.disabled = false;
  }
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

  /* Ohne Worker gibt es keine Adresse, die man abonnieren könnte —
     eine statische Seite kann kein text/calendar ausliefern. */
  const abo = $('btnAbo');
  if (abo) abo.hidden = !darfFuehren || !WORKER_BASIS;

  if (!hat) {
    setShellTitle(t('nav.gruppe', 'Gruppe'));
    $('mitgliederZahl').hidden = true;
    formSchliessen();
    return;
  }

  setShellTitle(aktiv.name);
  zeichneMitglieder();
  zeichneTermine();
  zeichnePlaene();
}

/* ── Handlungen ────────────────────────────────────────────────────*/

async function neueGruppe() {
  const name = prompt(t('grp.frageName', 'Wie soll die Gruppe heissen?'));
  if (name === null) return;
  const sauber = name.trim();
  if (!sauber) return;

  /* Die Art entscheidet nur über Wortwahl und Vorgabe-Bereiche, nicht
     über den Ablauf. Drei Möglichkeiten sind für ein confirm zu viele,
     also eine Ziffer — bis das Anlegen ein eigenes Formular bekommt. */
  const wahl = prompt(
    t('grp.frageArt',
      'Was für eine Gruppe ist das?\n\n'
      + '1 — Rennkader: Haupttrainer, Trainer, Athleten\n'
      + '2 — Verein oder Gym: Leitung, Trainer, Mitglieder\n'
      + '3 — Familie oder Freundeskreis'), '1');
  if (wahl === null) return;
  const art = { 1: 'kader', 2: 'organisation', 3: 'familie' }[wahl.trim()] || 'kader';

  const btn = $('btnNeu');
  btn.disabled = true;
  try {
    const gid = await gruppeAnlegen(user.uid, { name: sauber, art });
    aktiveGruppeSetzen(gid);
    /* Kein reload: beobachteMeineGruppen meldet die neue Gruppe von
       selbst, und der Umschalter steht dann schon richtig. */
  } catch (e) {
    reportClientError('gruppe/anlegen', e);
    alert(t('grp.f.gruppe', 'Die Gruppe konnte nicht erstellt werden.'));
  } finally {
    btn.disabled = false;
  }
}

/* ── Ein Termin von nahem ──────────────────────────────────────────
   Hier steht die Frage "kommst du?" — und sonst nichts.

   Das Rennergebnis stand kurz auch hier und ist wieder raus. Zwei
   Gründe: Eine Anmeldung fragt nach vorne, ein Ergebnis blickt zurück;
   beides im selben Feld zu haben, hiess dem Athleten beim Zusagen ein
   leeres Rang-Feld hinzustellen. Und schwerer wiegt der Modellfehler:
   ein Rennen hat ein Ergebnis PRO ATHLET, nicht eines für die ganze
   Gruppe. Das gehört ins Profil des Athleten. */

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
  return teile.length ? teile.join(' · ') : t('grp.keineAntworten', 'Noch keine Antworten.');
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
  const abgesagt = istAbgesagt(offen);

  /* Die Absage steht ganz vorn — wer die Ansicht öffnet, soll sie
     nicht erst im dritten Absatz finden. */
  const teile = [
    abgesagt ? 'ABGESAGT' : '',
    artWort(offen.art, aktiv?.art),
    zeitraum(offen),
  ];
  if (offen.ort) teile.push(offen.ort);
  if (offen.disziplin) teile.push(offen.disziplin);
  if (abgesagt && offen.absageGrund) teile.push(offen.absageGrund);

  $('dTitel').textContent = offen.titel;
  $('dMeta').textContent = teile.filter(Boolean).join(' · ');
  $('dMeta').hidden = false;

  /* Bei einem abgesagten Termin ist die Frage "kommst du?" gegenstandslos. */
  zeige('grpZusage', !abgesagt);

  const loeschen = $('btnLoeschen');
  if (loeschen) loeschen.hidden = !darfFuehren;

  const absagen = $('btnAbsagen');
  if (absagen) {
    absagen.hidden = !darfFuehren;
    absagen.textContent = abgesagt ? t('grp.absageZurueck', 'Absage zurücknehmen') : t('grp.terminAbsagen', 'Termin absagen');
  }

  zeige('secDetail', true);
  zeige('secTermine', false);
  zeige('secMitglieder', false);
  zeige('secPlaene', false);
  zeichneZusagen();
  zeichneAnhaenge();
}

function detailSchliessen() {
  offen = null;
  zeige('secDetail', false);
  zeige('secTermine', !!aktiv);
  zeige('secMitglieder', !!aktiv);
  zeige('secPlaene', !!aktiv);
}

async function antworten(antwort) {
  if (!offen || !aktiv) return;
  try {
    await zusagen(aktiv.id, offen.id, user.uid, antwort);
    await zeichneZusagen();
  } catch (e) {
    reportClientError('gruppe/zusage', e);
    $('dZusagen').textContent = t('grp.f.antwort', 'Die Antwort konnte nicht gespeichert werden.');
    $('dZusagen').hidden = false;
  }
}

/* ergebnisSpeichern() ist entfallen. Ein Rennergebnis gehoert nicht an
   die Anmeldung — und es gehoert pro Athlet gespeichert, nicht einmal
   pro Termin. Beides zieht ins Athletenprofil um. */

/* ── Unterlagen am Termin ──────────────────────────────────────────
   Bei einem Lager oder Rennen kommt die Ausschreibung als PDF. Sie
   gehört an den Termin — nicht in eine Mail, die drei Wochen später
   niemand mehr findet.

   Nach dem Hochladen bleibt sie bearbeitbar: umbenennen, ersetzen,
   entfernen. Ein Anhang, den man nur löschen und neu anlegen kann,
   verliert dabei jedes Mal seinen Platz in der Liste. */

let anhaenge = [];

function anhangZeile(a) {
  const kb = Math.round((a.size || 0) / 1024);
  return `
    <div class="row" data-anhang="${escHtml(a.id)}" data-bereich="kalender">
      <span class="row__icon">PDF</span>
      <span class="row__body">
        <span class="row__title">${escHtml(a.name)}</span>
        <span class="row__sub">${escHtml(`${kb} KB`)}</span>
      </span>
      <span class="row__end">
        <button class="b b--secondary" type="button" data-anhang-oeffnen="${escHtml(a.id)}">Öffnen</button>
      </span>
    </div>`;
}

async function zeichneAnhaenge() {
  if (!offen || !aktiv) return;
  const liste = $('listAnhaenge');
  const darfFuehren = leitet(aktiv.meineRolle);

  zeige('grpAnhaenge', true);
  $('anhangKnopf').hidden = !darfFuehren;

  try { anhaenge = await ladeAnhaenge(aktiv.id, offen.id); }
  catch (e) { reportClientError('gruppe/anhaenge', e); anhaenge = []; }

  liste.innerHTML = anhaenge.length
    ? anhaenge.map(anhangZeile).join('')
      + (darfFuehren
        ? `<p class="empty-hint">${escHtml(t('grp.anhangTipp', 'Zum Umbenennen oder Entfernen auf den Namen tippen.'))}</p>`
        : '')
    : `<p class="empty-hint">${escHtml(t('grp.keineUnterlagen', 'Noch keine Unterlagen.'))}</p>`;
}

function anhangOeffnen(id) {
  const a = anhaenge.find(x => x.id === id);
  if (!a) return;
  const blob = alsBlob(a.dataUrl);
  if (!blob) return;
  /* Ein Objekt-URL statt der Data-URL direkt: Safari weigert sich, eine
     mehrere hundert Kilobyte lange data:-Adresse zu öffnen. */
  const adresse = URL.createObjectURL(blob);
  window.open(adresse, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(adresse), 60_000);
}

async function anhangVerwalten(id) {
  if (!offen || !aktiv || !leitet(aktiv.meineRolle)) return;
  const a = anhaenge.find(x => x.id === id);
  if (!a) return;

  const name = prompt(
    t('grp.frageAnhangName',
      'Neuer Name für die Unterlage.\n\nLeer lassen und OK drücken, um sie zu entfernen.'),
    a.name);
  if (name === null) return;

  try {
    if (!name.trim()) {
      if (!confirm(t('grp.frageAnhangWeg', '"{was}" wirklich entfernen?', { was: a.name }))) return;
      await anhangLoeschen(aktiv.id, offen.id, id);
    } else {
      await anhangUmbenennen(aktiv.id, offen.id, id, name, user.uid);
    }
    await zeichneAnhaenge();
  } catch (e) {
    reportClientError('gruppe/anhang-verwalten', e);
    alert(t('grp.f.allgemein', 'Das hat nicht geklappt.'));
  }
}

async function anhangHochladen(datei) {
  if (!offen || !aktiv || !datei) return;
  const feld = $('anhangFehler');
  feld.hidden = true;

  try {
    await anhangSpeichern(aktiv.id, offen.id, user.uid, datei);
    await zeichneAnhaenge();
  } catch (e) {
    reportClientError('gruppe/anhang', e);
    /* Bei "zu gross" steht der Grund schon im Fehler und ist
       brauchbar — den soll der Nutzer sehen, nicht einen Ersatzsatz. */
    feld.textContent = e?.message || t('grp.f.datei', 'Die Datei konnte nicht angehängt werden.');
    feld.hidden = false;
  }
}

/* ── Absagen ───────────────────────────────────────────────────────*/

async function absageUmschalten() {
  if (!offen || !aktiv) return;

  try {
    if (istAbgesagt(offen)) {
      if (!confirm(t('grp.frageFindetStatt', '"{was}" findet doch statt?', { was: offen.titel }))) return;
      await absageZuruecknehmen(aktiv.id, offen.id);
    } else {
      /* Der Grund ist freiwillig, aber er ist das, was die Leute
         wirklich wissen wollen — "zu wenig Schnee" beantwortet die
         Rückfragen, bevor sie kommen. */
      const grund = prompt(
        t('grp.frageAbsagen', '"{was}" absagen.\n\nGrund (optional, wird allen angezeigt):',
          { was: offen.titel }), '');
      if (grund === null) return;
      await terminAbsagen(aktiv.id, offen.id, grund);
    }
    /* beobachteTermine meldet die Änderung; die Detailansicht muss
       ihren eigenen Stand nachziehen. */
  } catch (e) {
    reportClientError('gruppe/absagen', e);
    alert(t('grp.f.allgemein', 'Das hat nicht geklappt.'));
  }
}

async function terminEntfernen() {
  if (!offen || !aktiv) return;
  if (!confirm(t('grp.frageTerminWeg', '"{was}" wirklich löschen?', { was: offen.titel }))) return;
  try {
    await terminLoeschen(aktiv.id, offen.id);
    detailSchliessen();
  } catch (e) {
    reportClientError('gruppe/termin-loeschen', e);
    alert(t('grp.f.terminLoeschen', 'Der Termin konnte nicht gelöscht werden.'));
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
  /* Die Disziplin hängt an der GRUPPENART, nicht an der Terminart. Ein
     Hyrox-Wettkampf im Gym hat ein Ergebnis, aber keinen FIS-Faktor —
     das Feld stünde dort sinnlos da. */
  zeige('grpDisziplin', art === 'rennen' && kenntDisziplinen(aktiv?.art));
}

function formOeffnen() {
  /* Was die Gruppe anbietet, entscheidet die Gruppenart: eine Familie
     braucht keinen Wettkampf-Eintrag. Die Liste entsteht darum im
     Code und nicht im Markup. */
  $('fArt').innerHTML = artenFuer(aktiv?.art)
    .map(a => `<option value="${a}">${escHtml(artWort(a, aktiv?.art))}</option>`)
    .join('');
  $('fArt').value = artenFuer(aktiv?.art)[0] || 'training';
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
    feld.textContent = t('grp.f.terminSpeichern', 'Der Termin konnte nicht gespeichert werden.');
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

let person = null;        // das gerade geöffnete Mitglied
let personErgebnisse = []; // dessen Rennen

/* Die Woerter stehen im Katalog — Abfahrt heisst Downhill, und die
   Auswahl im Formular zieht dieselben Schluessel. Eine zweite Liste
   hier waere die Stelle, an der beide auseinanderlaufen. */
const DISZIPLIN_DE = { SL: 'Slalom', RS: 'Riesenslalom', SG: 'Super-G', DH: 'Abfahrt' };
const disziplinWort = kuerzel =>
  DISZIPLIN_DE[kuerzel] ? t(`disziplin.${kuerzel}`, DISZIPLIN_DE[kuerzel]) : kuerzel;

/* Ein Ergebnis kennt nur Zeiten. Die Disziplin steht am Rennen — sonst
   müsste sie bei jedem Ergebnis mitgeschrieben werden und könnte vom
   Rennen abweichen. */
function rennenZu(eventId) {
  return termine.find(t => t.id === eventId) || null;
}

function punkteVon(ergebnis) {
  const rennen = rennenZu(ergebnis.eventId);
  if (!rennen?.disziplin) return null;
  return rennpunkte(ergebnis.zeit, ergebnis.siegerZeit, rennen.disziplin);
}

function zeichnePunkte() {
  const liste = $('listPunkte');
  if (!liste) return;

  /* FIS-Punkte gehören dem alpinen Skirennsport. In einem Gym oder in
     einer Familie hat der Abschnitt keinen Sinn und erscheint nicht —
     ein leerer Kasten mit einer Fachüberschrift ist schlechter als
     kein Kasten. */
  if (!kenntDisziplinen(aktiv?.art)) {
    zeige('secPunkte', false);
    return;
  }

  /* Für den Stand zählen nur Ergebnisse, aus denen sich Punkte rechnen
     lassen — mit Disziplin und zwei brauchbaren Zeiten. */
  const mitPunkten = personErgebnisse
    .map(e => ({ disziplin: rennenZu(e.eventId)?.disziplin, punkte: punkteVon(e) }))
    .filter(e => e.disziplin && e.punkte != null);

  const stand = standJeDisziplin(mitPunkten);
  const eintraege = Object.entries(stand);

  zeige('secPunkte', true);
  if (!eintraege.length) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('grp.keineZeiten', 'Noch keine Rennen mit Zeiten erfasst.'))}</p>`;
    return;
  }

  liste.innerHTML = eintraege.map(([d, s]) => `
    <div class="row" data-bereich="t-rennen">
      <span class="row__icon">${escHtml(d)}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(s.punkte.toFixed(2))} Punkte</span>
        <span class="row__sub">${escHtml(disziplinWort(d))} · ${
          s.vorlaeufig
            ? t('grp.vorlaeufig', 'vorläufig, erst ein Rennen')
            : t('grp.schnittZwei', 'Schnitt der zwei besten aus {n}', { n: s.aus })}</span>
      </span>
      <span class="row__end"></span>
    </div>`).join('');
}

function ergebnisZeile(e) {
  const rennen = rennenZu(e.eventId);
  const punkte = punkteVon(e);
  const gesamt = punkte != null ? gesamtpunkte(punkte, e.zuschlag) : null;

  /* "Rennpunkte" und "FIS-Punkte" sind nicht dasselbe. Ohne Zuschlag
     gibt es nur die ersten, und das steht auch so da. */
  const rechts = gesamt != null
    ? `${gesamt.toFixed(2)}`
    : punkte != null ? `${punkte.toFixed(2)}*` : '—';

  const teile = [];
  if (e.rang) teile.push(t('grp.rangN', 'Rang {n}', { n: e.rang }));
  if (e.zeit) teile.push(e.zeit);
  if (rennen?.disziplin) teile.push(rennen.disziplin);

  return `
    <div class="row" data-bereich="t-rennen">
      <span class="row__icon">R</span>
      <span class="row__body">
        <span class="row__title">${escHtml(rennen?.titel || t('grp.rennenFeld', 'Rennen'))}</span>
        <span class="row__sub">${escHtml(teile.join(' · ') || '—')}</span>
      </span>
      <span class="row__end">${escHtml(rechts)}</span>
    </div>`;
}

async function zeichneErgebnisse() {
  if (!person || !aktiv) return;
  const liste = $('listErgebnisse');
  zeige('secErgebnisse', true);

  try {
    personErgebnisse = await ladeErgebnisse(aktiv.id, person.uid);
  } catch (e) {
    reportClientError('gruppe/ergebnisse', e);
    personErgebnisse = [];
  }

  const sortiert = [...personErgebnisse].sort((a, b) => {
    const ra = rennenZu(a.eventId)?.von || '';
    const rb = rennenZu(b.eventId)?.von || '';
    return ra < rb ? 1 : ra > rb ? -1 : 0;   // neueste zuerst
  });

  liste.innerHTML = sortiert.length
    ? sortiert.map(ergebnisZeile).join('')
      + `<p class="empty-hint">${escHtml(t('grp.nurRennpunkte', '* nur Rennpunkte — der Zuschlag ist nicht bekannt.'))}</p>`
    : `<p class="empty-hint">${escHtml(t('grp.keineRennen', 'Noch keine Rennen erfasst.'))}</p>`;

  zeichnePunkte();
}

function personOeffnen(uid) {
  if (!aktiv) return;
  /* Das Profil sehen alle in der Gruppe — ein Kader, in dem niemand
     weiss, wer wie fährt, ist kein Kader. Verwaltet wird es nur vom
     Kopf; das entscheidet sich weiter unten, Knopf für Knopf. */
  person = mitglieder.find(m => m.uid === uid) || null;
  if (!person) return;

  const name = person.name || person.uid;
  const istKopf = person.rolle === 'head';
  const ichSelbst = person.uid === user.uid;

  $('pName').textContent = name;

  /* Hier stand die Rolle — und damit dasselbe Wort, das die Segmentwahl
     zwei Zeilen tiefer schon zeigt. Eine Zeile, die nichts hinzufügt,
     ist eine Zeile zu viel. Stattdessen das, was sonst nirgends steht:
     seit wann jemand dabei ist. */
  const seit = person.seit?.toDate?.();
  $('pMeta').textContent = seit
    ? t('grp.dabeiSeit', 'Dabei seit {datum}', {
        datum: window.TVZAI18n?.format?.date(seit)
          ?? seit.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) })
    : '';
  $('pMeta').hidden = !$('pMeta').textContent;

  /* Verwaltet wird nur vom Kopf. Wer nicht führt, sieht das Profil,
     aber keine Knöpfe, die für ihn ohnehin scheitern würden. */
  const darfVerwalten = fuehrt(aktiv.meineRolle);
  const darfErfassen = leitet(aktiv.meineRolle);

  zeige('grpRolle', darfVerwalten);
  $('rolleWahl').querySelectorAll('[data-rolle]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.rolle === person.rolle));
    /* Die Rollen heissen nicht überall gleich: im Gym steht dort
       Mitglied und nicht Athlet, in der Familie Verwaltung und nicht
       Trainer. Bisher stand im Markup fest "Trainer"/"Athlet" — die
       Wörter der Gruppenart gab es also überall ausser genau hier,
       wo man die Rolle vergibt. */
    btn.textContent = wort(aktiv.art, btn.dataset.rolle);
    /* Am Kopf lässt sich die Rolle nicht drehen — er übergibt zuerst,
       sonst stünde die Gruppe ohne Kopf da. */
    btn.disabled = istKopf;
  });

  /* An sich selbst übergibt niemand, und den Kopf entfernt niemand. */
  $('btnUebergeben').hidden = !darfVerwalten || istKopf || ichSelbst;
  $('btnEntfernen').hidden = !darfVerwalten || istKopf;
  $('btnErgebnisNeu').hidden = !darfErfassen;

  zeige('secPerson', true);
  zeige('secMitglieder', false);
  zeige('secTermine', false);
  zeige('secPlaene', false);

  zeichneErgebnisse();
}

function personSchliessen() {
  person = null;
  personErgebnisse = [];
  zeige('secErgForm', false);
  zeige('secPerson', false);
  zeige('secMitglieder', !!aktiv);
  zeige('secTermine', !!aktiv);
  zeige('secPlaene', !!aktiv);
}

async function rolleAendern(rolle) {
  if (!person || !aktiv || person.rolle === rolle) return;
  try {
    await rolleSetzen(aktiv.id, person.uid, rolle);
    await zeichneMitglieder();
    personOeffnen(person.uid);
  } catch (e) {
    reportClientError('gruppe/rolle', e);
    alert(t('grp.f.rolle', 'Die Rolle konnte nicht geändert werden.'));
  }
}

async function personEntfernen() {
  if (!person || !aktiv) return;
  const name = person.name || person.uid;
  if (!confirm(t('grp.frageMitgliedWeg', '{wer} wirklich aus der Gruppe entfernen?', { wer: name }))) return;
  try {
    await mitgliedEntfernen(aktiv.id, person.uid);
    personSchliessen();
    await zeichneMitglieder();
  } catch (e) {
    reportClientError('gruppe/entfernen', e);
    alert(t('grp.f.entfernen', 'Das Mitglied konnte nicht entfernt werden.'));
  }
}

async function leitungUebergeben() {
  if (!person || !aktiv) return;
  const name = person.name || person.uid;
  /* Eine Übergabe ist nicht rückgängig zu machen: danach bist du nicht
     mehr der Kopf und kannst sie nicht zurückholen. Das gehört gesagt,
     bevor jemand tippt. */
  if (!confirm(
    t('grp.frageUebergabe',
      'Die Leitung an {wer} übergeben?\n\n'
      + 'Danach bist du nur noch Trainer und kannst die Leitung nicht '
      + 'selbst zurückholen.', { wer: name }))) return;

  try {
    await uebergeben(aktiv.id, person.uid);
    personSchliessen();
    /* beobachteMeineGruppen meldet die neue Rolle von selbst; die Seite
       zeichnet sich daraufhin mit den passenden Rechten neu. */
  } catch (e) {
    reportClientError('gruppe/uebergeben', e);
    alert(t('grp.f.uebergabe', 'Die Übergabe hat nicht geklappt.'));
  }
}

/* ── Ein Ergebnis erfassen ─────────────────────────────────────────
   Hier und nicht bei der Anmeldung. Zwei Zeiten und die Disziplin des
   Rennens genügen für die Rennpunkte; der Zuschlag ist optional, weil
   er aus den Punkten des ganzen Feldes entsteht und damit aus der
   FIS-Datenbank kommt, nicht aus unserer. */

function ergFormOeffnen() {
  if (!person || !aktiv) return;

  /* Nur Rennen — bei einem Krafttraining gibt es nichts zu werten.
     Und nur vergangene: ein Ergebnis für morgen wäre eine Prognose. */
  const heute = isoTag();
  const rennen = termine
    .filter(t => t.art === 'rennen' && t.von <= heute)
    .sort((a, b) => (a.von < b.von ? 1 : -1));

  const wahl = $('ergRennen');
  wahl.innerHTML = rennen.length
    ? rennen.map(r => `<option value="${escHtml(r.id)}">${escHtml(r.titel)}${
        r.disziplin ? ` · ${escHtml(r.disziplin)}` : ''}</option>`).join('')
    : `<option value="">${escHtml(t('grp.keinVergangenes', 'Kein vergangenes Rennen vorhanden'))}</option>`;

  $('ergTitel').textContent = t('grp.ergebnisVon', 'Ergebnis · {wer}', { wer: person.name || person.uid });
  $('ergRang').value = '';
  $('ergZeit').value = '';
  $('ergSieger').value = '';
  $('ergZuschlag').value = '';
  $('ergFehler').hidden = true;
  ergVorschau();

  zeige('secErgForm', true);
  zeige('secPerson', false);
}

function ergFormSchliessen() {
  zeige('secErgForm', false);
  zeige('secPerson', !!person);
}

/* Die Punkte erscheinen beim Tippen. Das ist der eigentliche Nutzen:
   man sieht sofort, was eine Zeit wert ist, statt es nachzuschlagen. */
function ergVorschau() {
  const feld = $('ergVorschau');
  const rennen = rennenZu($('ergRennen').value);
  const p = rennpunkte($('ergZeit').value, $('ergSieger').value, rennen?.disziplin);

  if (p == null) {
    feld.textContent = rennen?.disziplin
      ? t('grp.zweiZeiten', 'Zwei Zeiten eingeben, dann erscheinen die Rennpunkte.')
      : t('grp.ohneDisziplin', 'Ohne Disziplin am Rennen lassen sich keine Punkte rechnen.');
    return;
  }

  const gesamt = gesamtpunkte(p, $('ergZuschlag').value);
  const bisher = personErgebnisse
    .map(punkteVon)
    .filter(x => x != null);
  const wirkung = standMit(bisher, p);

  const teile = [t('grp.rennpunkteN', '{n} Rennpunkte', { n: p.toFixed(2) })];
  if (gesamt != null) teile.push(t('grp.fisMitZuschlag', '{n} FIS-Punkte mit Zuschlag', { n: gesamt.toFixed(2) }));
  if (wirkung.verbesserung > 0) teile.push(t('grp.verbessertUm', 'verbessert den Stand um {n}', { n: wirkung.verbesserung.toFixed(2) }));
  else if (wirkung.vorher.punkte != null) teile.push(t('grp.aendertNichts', 'ändert den Stand nicht'));

  feld.textContent = teile.join(' · ');
}

async function ergSpeichern() {
  if (!person || !aktiv) return;
  const eventId = $('ergRennen').value;
  if (!eventId) return;

  const btn = $('btnErgSpeichern');
  btn.disabled = true;
  try {
    await ergebnisSpeichern(aktiv.id, {
      eventId,
      uid: person.uid,
      rang: $('ergRang').value ? Number($('ergRang').value) : null,
      zeit: $('ergZeit').value.trim() || null,
      siegerZeit: $('ergSieger').value.trim() || null,
      zuschlag: $('ergZuschlag').value.trim() || null,
    }, user.uid);

    ergFormSchliessen();
    await zeichneErgebnisse();
  } catch (e) {
    reportClientError('gruppe/ergebnis', e);
    const feld = $('ergFehler');
    feld.textContent = t('grp.f.ergebnis', 'Das Ergebnis konnte nicht gespeichert werden.');
    feld.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ── Beitreten ─────────────────────────────────────────────────────*/

async function codeEinloesen() {
  const eingabe = prompt(t('grp.frageCode', 'Einladungscode eingeben:'));
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
    alert(e?.message || t('grp.f.beitritt', 'Der Beitritt hat nicht geklappt.'));
  } finally {
    btn.disabled = false;
  }
}

/* ── Kalender-Abo ──────────────────────────────────────────────────
   Eine Adresse, die Eltern in Apple Calendar abonnieren — ohne Konto,
   ohne Mail, ohne Installation. Der Knopf erscheint nur, wenn es einen
   Worker gibt: eine statische Seite kann kein text/calendar ausliefern,
   und ein Knopf, der zuverlässig scheitert, ist schlechter als keiner. */

async function aboErzeugen() {
  if (!aktiv) return;
  const btn = $('btnAbo');
  const feld = $('aboText');
  btn.disabled = true;

  try {
    /* Neu setzen heisst gleichzeitig zurückziehen: die alte Adresse
       trägt danach ins Leere. Das ist der Weg, wenn jemand den Verein
       verlässt. Darum die Rückfrage, wenn es schon eine gibt. */
    if (aktiv.icsToken && !confirm(
      t('grp.frageAboNeu',
        'Es gibt schon ein Abo für diese Gruppe.\n\n'
        + 'Ein neues zu erzeugen macht die alte Adresse ungültig — wer sie '
        + 'abonniert hat, sieht die Termine nicht mehr.'))) {
      return;
    }

    const token = await abonnementErneuern(aktiv.id);
    aktiv = { ...aktiv, icsToken: token };
    const adresse = abonnementAdresse(WORKER_BASIS, aktiv.id, token);

    feld.textContent = adresse;
    feld.hidden = false;
    try { await navigator.clipboard.writeText(adresse); }
    catch { /* dann steht sie wenigstens lesbar da */ }
  } catch (e) {
    reportClientError('gruppe/abo', e);
    feld.textContent = t('grp.f.abo', 'Das Abo konnte nicht erzeugt werden.');
    feld.hidden = false;
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
      btn.textContent = t('grp.kopiert', 'Kopiert');
      setTimeout(() => { btn.textContent = t('grp.einladen', 'Einladungscode erzeugen'); }, 1600);
    } catch {
      /* Ohne Zwischenablage — älteres iOS, kein sicherer Kontext —
         steht der Code wenigstens lesbar darunter. */
    }
  } catch (e) {
    reportClientError('gruppe/einladen', e);
    alert(t('grp.f.code', 'Der Code konnte nicht erzeugt werden.'));
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
  $('btnAbo')?.addEventListener('click', aboErzeugen);
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
  $('btnAbsagen')?.addEventListener('click', absageUmschalten);
  $('anhangWahl')?.addEventListener('change', event => {
    const datei = event.target.files?.[0];
    /* Zurücksetzen, sonst löst dieselbe Datei beim zweiten Mal kein
       change-Ereignis aus und der Nutzer denkt, es sei kaputt. */
    event.target.value = '';
    if (datei) anhangHochladen(datei);
  });
  $('listAnhaenge')?.addEventListener('click', event => {
    const oeffnen = event.target.closest('[data-anhang-oeffnen]');
    if (oeffnen) { anhangOeffnen(oeffnen.dataset.anhangOeffnen); return; }
    /* Ein Klick auf die Zeile selbst — nicht auf "Öffnen" — verwaltet
       den Anhang. Die ID steht am Element, nicht im Text: eine Suche
       über den Namen kippt, sobald zwei Unterlagen ähnlich heissen. */
    const zeile = event.target.closest('[data-anhang]');
    if (zeile) anhangVerwalten(zeile.dataset.anhang);
  });
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
  $('btnErgebnisNeu')?.addEventListener('click', ergFormOeffnen);
  $('btnErgAbbrechen')?.addEventListener('click', ergFormSchliessen);
  $('btnErgSpeichern')?.addEventListener('click', ergSpeichern);
  $('btnPlanNeu')?.addEventListener('click', planFormOeffnen);
  $('btnPlanAbbrechen')?.addEventListener('click', planFormSchliessen);
  $('btnPlanSpeichern')?.addEventListener('click', planSpeichern);
  for (const id of ['ergRennen', 'ergZeit', 'ergSieger', 'ergZuschlag']) {
    $(id)?.addEventListener('input', ergVorschau);
    $(id)?.addEventListener('change', ergVorschau);
  }
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
    /* Wurde der offene Termin geaendert — etwa abgesagt —, muss die
       Detailansicht ihren Stand nachziehen. */
    else if (offen) { const neu = termine.find(t => t.id === offen.id); if (neu) detailOeffnen(neu.id); }
    zeichneTermine();
  });
}

/* fuehrt() wird inzwischen wirklich gebraucht — für die Kaderverwaltung.
   Der Blind-Export, der es bis dahin am Leben hielt, kann weg. */
