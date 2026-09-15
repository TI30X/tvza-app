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

import { requireAuth, getProfile, escHtml, wireOfflineBanner, reportClientError, imKreis }
  from '../../firebase-config.js';
import { mountShell, setShellTitle, setShellTitleWahl } from '../../shell.js?v=24';
import {
  beobachteMeineGruppen, ladeMitglieder, gruppeAnlegen,
  beobachteTermine, terminAnlegen, terminLoeschen,
  zusagen, ladeZusagen,
  rolleSetzen, mitgliedEntfernen, uebergeben,
  einladungErzeugen, beitreten, gruppenEinladungen, einladungZuruecknehmen, kontakte, assistentSetzen,
  ladeErgebnisse, ergebnisSpeichern,
  ladePlaene, planVeroeffentlichen, planLoeschen, eigeneProgramme, PLAN_FUER_ALLE,
  ladeProtokolle, ladeKontakt, ladeKontakte, kontaktSpeichern,
  abonnementErneuern, abonnementAdresse,
  terminAbsagen, absageZuruecknehmen,
  ladeAnhaenge, anhangSpeichern, anhangUmbenennen, anhangLoeschen, alsBlob,
  waehleAktive, aktiveGruppeSetzen, wort, fuehrt, leitet, eigeneKarte,
  terminAendern, programmSetzen, beobachteGepackt, gepacktSetzen,
  gastTokenSetzen, ladeGaeste, gastEntfernen, reisenDerGruppeUebernehmen,
  gruppeAendern, gruppeLoeschen, ladeGruppenKalender, gruppenKalenderAnlegen, gruppenKalenderLoeschen,
} from '../../groups.js';
import { kalenderName, naechsteFarbe, KALENDER_MAX } from '../../kalender-quellen.js';
import {
  seiteLesen, programmMitSeite, neuerPunkt, punktSetzen, punkteHtml, jetztFuer,
  abfahrtVon, abfahrtenSauber, packlisteFuer, neuerPackpunkt, haeufigste,
  programmZeigen, programmNeuZeichnen, sichereAdresse, SEITE_MAX, PACKLISTE_MAX,
} from '../../programm.js';
import {
  wochenTage, nachDatum, planZusammenfassung, planTitelVorschlag, planTageMitDatum, ersetztePlaene,
} from '../../wochenplan.js';
import { agendaAnsicht, tagName, kurzDatum } from '../woche/woche.js';
import { frage, eingabe, meldung, mehrere } from '../../dialog.js';
import { einladungsLink, einladungsText, codeZeigen, gemerktEinloesen } from '../../einladung.js';
import { gespraechspartner, anMehrere } from '../../chat-senden.js';
import { assistentSauber, gruppeFrei } from '../../ki.js';
import { gruppeWaehlen, gruppenStil, gruppenFarbe, FARBEN, kuerzel } from '../../gruppenwahl.js';
import {
  kontaktSauber, pruefeKontakt, verteiler, ohneAdresse, mailtoAdresse, istEmail, ELTERN_MAX,
} from '../../kontakte.js';
import {
  zeitraum, artWort, artName, BEREICH_DER_ART, pruefe, isoTag,
  artenFuer, kenntDisziplinen, istAbgesagt, alsIcsEintrag,
} from '../../termine.js';
import { buildCalendarIcs } from '../../calendar-interop.js';
import { gewichtsVerlauf } from '../../einheit.js';
import {
  rennpunkte, gesamtpunkte, standMit, standJeDisziplin,
} from '../../fispunkte.js';
import { WORKER_BASIS, KALENDER_ABO } from '../../worker-config.js';
import { passendesMitglied } from '../../zuordnung.js';

const $ = id => document.getElementById(id);
/* Ohne i18n.js fehlte hier das Einsetzen der Platzhalter: aus
   "{grund}" wurde kein Grund, sondern das Wort {grund} selbst. */
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

/* Plural ueber Intl, nicht ueber ein Fragezeichen: Polnisch hat drei
   Formen, und "1 Person / 2 Personen" trifft nur zwei davon. Ohne
   Katalog gibt format.plural den Schluessel zurueck — dann greift die
   deutsche Ruecklage. */
const tPlural = (key, n, eins, mehr) => {
  const wert = window.TVZAI18n?.format?.plural(key, n);
  return (!wert || String(wert).startsWith(key)) ? `${n} ${n === 1 ? eins : mehr}` : wert;
};

let user = null;
let meinProfil = {};
let gruppen = [];
let aktiv = null;
let termine = [];
let mitglieder = [];
let offen = null;       // der gerade geoeffnete Termin
let terminAbo = null;   // onSnapshot-Abmeldung der aktuellen Gruppe
const adresse = new URLSearchParams(location.search);
let gruppeAusAdresse = adresse.get('g') || '';
let terminAusAdresse = adresse.get('termin') || '';
/* ?g=<gruppe>&neu=<tag>: "Gruppentermin" im Kalender (v.35.49.0) öffnet
   hier das Formular für einen neuen Termin an diesem Tag — bei der
   Leitung. Ein Mitglied, das so hierher kommt, sieht einfach die Gruppe. */
let neuAusAdresse = /^\d{4}-\d{2}-\d{2}$/.test(adresse.get('neu') || '') ? adresse.get('neu') : '';
/* ?anlegen=1: "+ Neue Gruppe" in der Leiste am Laptop (v.35.49.0). */
let anlegenAusAdresse = adresse.get('anlegen') === '1';
/* ?einst=1: aus den Einstellungen der App direkt in die der Gruppe (v.35.60.0). */
let einstAusAdresse = adresse.get('einst') === '1';

/* Die Einmal-Anweisungen oben sind gelesen — raus aus der Adresse
   (v.35.57.1). Michel: "beim Neuladen spickt das plötzlich raus": nach
   "+ Neue Gruppe" stand ?anlegen=1 weiter in der Adresszeile, und jedes
   Neuladen öffnete das Formular "Neue Gruppe" wieder über der Woche.
   Dasselbe mit ?neu= (Formular) und ?termin= (Termin ging wieder auf). Im
   Rahmen gehört die Adresszeile dem Router — er erfährt es über
   tvzaAdresseErsetzen. */
const EINMAL = ['anlegen', 'neu', 'termin', 'g', 'einst'];
function adresseAufraeumen() {
  const url = new URL(location.href);
  if (!EINMAL.some(p => url.searchParams.has(p))) return;
  for (const p of EINMAL) url.searchParams.delete(p);
  try { history.replaceState(history.state, '', url.pathname + url.search + url.hash); } catch { /* egal */ }
  url.searchParams.delete('tvzaFrame');
  window.tvzaAdresseErsetzen?.(url.href);
}

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
  /* Die Funktion steht seit v.35.59.0 als Überschrift über der Liste;
     unter dem Namen nur noch, wer die Gruppe führt (Haupttrainer). */
  const rolle = fuehrt(m.rolle) ? wort(art, m.rolle) : '';
  const suffix = m.uid === user.uid ? ' (du)' : '';

  /* Jede Zeile führt ins Profil — ein Kader, in dem niemand weiss, wer
     wie fährt, ist kein Kader. Was man dort DARF, entscheidet die
     Rolle; was man dort SIEHT, nicht. */
  return `
    <button class="row" type="button" data-person="${escHtml(m.uid)}" data-bereich="msg">
      <span class="row__icon">${escHtml(initialen(name))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(name + suffix)}</span>
        ${rolle ? `<span class="row__sub">${escHtml(rolle)}</span>` : ''}
      </span>
      <span class="row__end"></span>
    </button>`;
}

/* Die Liste nach Funktion (v.35.59.0). Michel: "könntest du nach den
   verschiedenen Funktionen sortieren, das wäre viel nützlicher, als
   einfach die Namen aufzulisten und unten dran hinzuschreiben, zu
   welcher sie gehören". Erst die Leitung (Kopf und Trainer), dann die
   Athleten — je mit Überschrift und Zahl. */
function mitgliederNachFunktion(liste, art) {
  const teil = (was, leute) => (leute.length ? `
    <p class="grp-funktion"><span>${escHtml(wort(art, was))}</span><span>${leute.length}</span></p>
    ${leute.map(m => mitgliedZeile(m, art)).join('')}` : '');
  return teil('leitungen', liste.filter(m => leitet(m.rolle)))
    + teil('mitgliederPl', liste.filter(m => !leitet(m.rolle)));
}

async function zeichneMitglieder() {
  if (!aktiv) return;
  const liste = $('listMitglieder');
  try {
    mitglieder = sortiere(await ladeMitglieder(aktiv.id));
    /* Die Abfahrten nennen Namen — ist ein Termin schon offen, bevor die
       Mitglieder da sind, stünde dort sonst "Unbekannt". */
    if (offen && !abfahrtenBearbeiten) zeichneAbfahrten();

    $('mitgliederTitel').textContent = wort(aktiv.art, 'mitglieder');
    liste.innerHTML = mitgliederNachFunktion(mitglieder, aktiv.art);

    const zahl = mitglieder.length;
    const meta = $('mitgliederZahl');
    meta.textContent = tPlural('grp.personen', zahl, 'Person', 'Personen');
    meta.hidden = false;
    /* Die Personenwahl der Woche nennt Namen — sie kommen erst jetzt. */
    if (plaene.length) zeichnePersonWahl();
  } catch (e) {
    reportClientError('gruppe/mitglieder', e);
    /* Der häufigste Grund ist ein fehlender Index oder eine Regel, die
       noch nicht ausgerollt ist — beides sagt dem Nutzer nichts. Also
       eine Zeile, die stimmt, statt einer, die Technik erklärt. */
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('grp.f.mitglieder', 'Die Mitglieder liessen sich nicht laden.'))}</p>`;
  }
}

/* ── Die Woche: Termine und Pläne in einem Kalender ─────────────────
   Seit v.35.42.0 stehen Termine und Plan nicht mehr in zwei Abschnitten
   untereinander, sondern in EINER Woche (feature/woche/woche.js): jeder
   Tag mit seinen Terminen und Einheiten, zum Blättern. Hier bleibt, was
   nur die Gruppe tut: Pläne laden, wessen Woche die Leitung sieht, einen
   neuen Plan veröffentlichen, einen Termin öffnen oder anlegen.

   Ein Plan gilt für den ganzen Kader oder für genau einen Athleten —
   die Excel des Kaders ist meist pro Athlet. Die Leitung sieht alle;
   oben wählt sie, wessen Woche: "Alle in der Gruppe" (die Pläne für
   alle) oder ein Athlet (seine Woche, wie er sie selbst sieht, samt dem,
   was er eingetragen hat). Bis dahin wählte man einen PLAN aus einer
   Liste, und jede Excel war eine eigene Woche ohne Nachbarn. */

let plaene = [];
let protokolle = {};          // des Menschen, dessen Woche steht — nach Datum
let wochePerson = '';         // Leitung: PLAN_FUER_ALLE oder eine uid
const programme = new Map();  // plan.id -> geparstes Programm (oder null)

let agenda = null;
function agendaHolen() {
  return agenda ||= agendaAnsicht({
    el: $('agenda'),
    zurueck: 'gruppe',
    beiTermin: termin => detailOeffnen(termin.id),
    beiNeuerTermin: datum => formOeffnen(datum),
  });
}

/* Die Athleten, für die es einen eigenen Plan gibt — nach Namen. */
function personenMitPlan() {
  const name = uid => mitglieder.find(m => m.uid === uid)?.name || '';
  return [...new Set(plaene.filter(p => p.fuer && p.fuer !== PLAN_FUER_ALLE).map(p => p.fuer))]
    .map(uid => ({ uid, name: name(uid) || t('grp.einAthlet', 'ein Athlet') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function zeichnePersonWahl() {
  const wahl = $('planPerson');
  if (!wahl) return;
  const personen = leitet(aktiv?.meineRolle) ? personenMitPlan() : [];
  wahl.hidden = !personen.length;
  if (!personen.length) { wochePerson = PLAN_FUER_ALLE; return; }
  if (wochePerson !== PLAN_FUER_ALLE && !personen.some(p => p.uid === wochePerson)) {
    /* Gibt es einen Plan für alle, ist das die Woche der Gruppe. Sonst
       der erste Athlet — wer nur Einzelpläne einliest, soll nicht vor
       einer Woche ohne Plan stehen. */
    wochePerson = plaene.some(p => p.fuer === PLAN_FUER_ALLE) ? PLAN_FUER_ALLE : personen[0].uid;
  }
  wahl.innerHTML = [
    `<option value="${PLAN_FUER_ALLE}">${escHtml(t('grp.alleInGruppe', 'Alle in der Gruppe'))}</option>`,
    ...personen.map(p => `<option value="${escHtml(p.uid)}">${escHtml(p.name)}</option>`),
  ].join('');
  wahl.value = wochePerson;
}

/* Welche Pläne in der Woche stehen. Ein Mitglied bekommt ohnehin nur
   seine (die Abfrage filtert). Die Leitung sieht, wessen Woche sie
   gewählt hat. */
function plaeneDerWoche() {
  if (!leitet(aktiv?.meineRolle)) return plaene;
  return plaene.filter(p => p.fuer === PLAN_FUER_ALLE || (wochePerson && p.fuer === wochePerson));
}

/* Ein Plan aus einer kaputten oder künftigen Fassung darf die Woche
   nicht mitreissen. Einmal gelesen je Plan — die Woche wird bei jeder
   Terminänderung neu gezeichnet, und ein Plan kann fast ein MB sein. */
function programmVon(plan) {
  if (!programme.has(plan.id)) {
    let programm = null;
    try { programm = JSON.parse(plan.json); }
    catch (e) { reportClientError('gruppe/planLesen', e); }
    programme.set(plan.id, programm);
  }
  return programme.get(plan.id);
}

function zeichneWoche() {
  if (!aktiv || !$('agenda')) return;
  const darf = leitet(aktiv.meineRolle);
  const quellen = plaeneDerWoche()
    .map(plan => ({ gid: aktiv.id, plan, programm: programmVon(plan) }))
    .filter(q => q.programm && wochenTage(q.programm).length);
  const leer = quellen.length || (darf && plaene.length) ? ''
    : darf ? t('grp.keinPlan', 'Noch kein Plan veröffentlicht.')
    : t('grp.keinPlanFuerDich', 'Für dich liegt noch kein Plan bereit.');
  agendaHolen().setze({
    quellen,
    termine: termine.map(x => ({ ...x, gid: aktiv.id, gruppenart: aktiv.art })),
    protokolleJe: new Map([[aktiv.id, protokolle]]),
    darfTermine: darf,
    leer,
    schluessel: `${aktiv.id}|${wochePerson}`,
  });
}

/* Der Fortschritt dessen, dessen Woche steht: die Leitung, die einen
   Athleten gewählt hat, sieht, was ER eingetragen hat. */
async function ladeProtokolleDerWoche() {
  const wer = leitet(aktiv?.meineRolle) && wochePerson && wochePerson !== PLAN_FUER_ALLE ? wochePerson : user.uid;
  try { protokolle = nachDatum(await ladeProtokolle(aktiv.id, wer)); }
  catch (e) {
    /* Beiwerk: geht er nicht durch, steht die Woche trotzdem da —
       nur ohne Balken und Zähler. */
    reportClientError('gruppe/protokolle', e);
    protokolle = {};
  }
}

async function zeichnePlaene() {
  if (!aktiv) return;
  const fuer = aktiv.id;
  const darfFuehren = leitet(aktiv.meineRolle);
  $('btnPlanNeu').hidden = !darfFuehren;
  let neu = [];
  try { neu = await ladePlaene(fuer, user.uid, darfFuehren); }
  catch (e) { reportClientError('gruppe/plaene', e); }
  if (aktiv?.id !== fuer) return;
  plaene = neu;
  zeichnePersonWahl();
  await ladeProtokolleDerWoche();
  if (aktiv?.id !== fuer) return;
  zeichneWoche();
}

/* ── Die Excel einlesen ─────────────────────────────────────────────
   Die Kader-Vorlage wird HIER gelesen, im Browser — der Spark-Tarif
   hat keinen Server, der das koennte. training-import.js laedt SheetJS
   erst beim ersten Einlesen nach, training-parser.js macht daraus das
   Programm. Beides dynamisch: wer die Gruppe nur ansieht, laedt keins
   von beiden.

   Bis v.35.25.0 ging das nur ueber die alte persoenliche Trainingsseite.
   Die Gruppe hatte ein Auswahlfeld mit dem, was man DORT eingelesen
   hatte — fuer jeden, der die Seite nie geoeffnet hatte, leer.

   Seit v.35.43.0 auch mehrere Dateien auf einmal: die Excel des Kaders
   ist meist pro Athlet. Aus jeder liest Firn den Namen ("Name: Van
   Zanten Timothy") und schlaegt das Mitglied vor, das so heisst
   (zuordnung.js). Wo es niemanden oder mehrere findet, fragt es — ein
   Athlet soll nie den Plan eines anderen bekommen, weil zwei Namen sich
   aehnelten. */
let eingelesen = [];            // je Datei: { datei, programm, json, vorschlag, fuer } oder { datei, fehler }
/* "Mehrere Personen" (v.35.60.0): Michel: "nicht nur an eine Person oder
   an alle, sondern auch an mehrere gleichzeitig — ähnlich wie bei den
   Chats". Gewählt wird im selben Dialog wie im Chat (mehrere()); jede
   Person bekommt ihren eigenen Plan. Ein Plan gilt weiter für alle oder
   für einen — so bleiben Regeln, Woche und "der neuere gewinnt", wie sie
   sind. */
const PLAN_MEHRERE = 'mehrere';
let planMehrere = [];
let alsListe = false;           // mehrere Dateien: Karten statt Vorschau und "Für wen"
let bilder = null;

/* Die Bilder zu den Uebungen der Kadervorlage (Fussgymnastik,
   Neuroathletik) entscheiden im Parser mit, was eine Uebung und was nur
   eine Ueberschrift ist. Fehlen sie, liest er trotzdem — nur ohne. */
async function bilderLaden() {
  if (bilder) return bilder;
  try {
    const antwort = await fetch(new URL('../assets/data/training/images.json', location.href));
    bilder = antwort.ok ? await antwort.json() : {};
  } catch { bilder = {}; }
  return bilder;
}

function planVorschau(programm) {
  const z = planZusammenfassung(programm);
  const kurz = iso => (iso ? kurzDatum(iso) : '');
  const kopf = [
    z.kw ? `KW ${z.kw}` : z.label,
    z.von && z.bis ? `${kurz(z.von)} – ${kurz(z.bis)}` : '',
  ].filter(Boolean).join(' · ');
  const zahlen = [
    tPlural('grp.planEinheiten', z.einheiten, 'Einheit', 'Einheiten'),
    tPlural('eh.uebungen', z.uebungen, 'Übung', 'Übungen'),
    z.athlet,
  ].filter(Boolean).join(' · ');

  /* Die Woche, wie sie gelesen wurde — damit ein Trainer sieht, dass
     es seine ist, BEVOR der Kader sie bekommt. */
  const tage = z.tage.map(tag => `
    <li class="plan-vorschau__tag">
      <span class="plan-vorschau__name">${escHtml(tag.datum ? tagName({ datum: tag.datum }).slice(0, 2) : tag.name.slice(0, 2))}</span>
      <span class="plan-vorschau__was">${escHtml(tag.titel.join(', ') || t('grp.frei', 'frei'))}</span>
    </li>`).join('');

  /* Was im Wochenplan steht, aber kein Blatt hat. Meist gewollt
     ("evtl. Spiel"), manchmal ein Tippfehler in der Vorlage ("Kraft
     Bein") — beides soll man sehen. */
  const ohne = z.ohneBlatt.length
    ? `<p class="plan-vorschau__hinweis">${escHtml(t('grp.planOhneBlatt',
        'Ohne Übungsblatt: {was}. Diese Einträge stehen im Plan, haben aber nichts zum Abhaken.',
        { was: [...new Set(z.ohneBlatt)].join(', ') }))}</p>`
    : '';

  $('planVorschau').innerHTML = `
    <div class="row" data-bereich="t-training">
      <span class="row__icon">${escHtml(z.kw ? String(z.kw) : '·')}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(kopf || t('grp.planOhneWoche', 'Woche ohne Datum'))}</span>
        <span class="row__sub">${escHtml(zahlen)}</span>
      </span>
    </div>
    <ul class="plan-vorschau__woche">${tage}</ul>
    ${ohne}`;
  zeige('planVorschau', true);
}

/* Wem die Datei gehoert, als Satz — unter "Für wen" oder in der Karte. */
function zuordnungText(x) {
  const excel = String(x.programm?.athlete || '').trim();
  const name = uid => mitglieder.find(m => m.uid === uid)?.name || uid;
  switch (x.vorschlag?.grund) {
    case 'passt': return t('grp.zuordnungPasst', 'Aus der Excel: {excel} → {name}', { excel, name: name(x.vorschlag.uid) });
    case 'unbekannt': return t('grp.zuordnungUnbekannt', 'In der Excel steht „{excel}“, aber niemand in der Gruppe heisst so. Wähle, für wen der Plan ist.', { excel });
    case 'mehrdeutig': return t('grp.zuordnungMehrdeutig', '„{excel}“ passt auf mehrere in der Gruppe. Wähle, für wen der Plan ist.', { excel });
    case 'ohneName': return t('grp.zuordnungOhneName', 'In der Excel steht kein Name — der Plan ist für alle, wenn du nichts anderes wählst.');
    default: return '';
  }
}

/* Die Auswahl "für wen": alle, dann die Mitglieder. Ohne Vorschlag
   steht "— wählen —" oben, damit niemand aus Versehen "alle" erwischt. */
function fuerOptionen(wert, { nurWen = false } = {}) {
  const auswahl = v => (v === wert ? ' selected' : '');
  return [
    wert === '' ? `<option value=""${auswahl('')}>${escHtml(t('grp.waehlen', '— wählen —'))}</option>` : '',
    `<option value="${PLAN_FUER_ALLE}"${auswahl(PLAN_FUER_ALLE)}>${escHtml(t('grp.alleInGruppe', 'Alle in der Gruppe'))}</option>`,
    nurWen && mitglieder.length > 1
      ? `<option value="${PLAN_MEHRERE}"${auswahl(PLAN_MEHRERE)}>${escHtml(wert === PLAN_MEHRERE && planMehrere.length
        ? t('grp.mehrereN', 'Mehrere Personen ({n})', { n: planMehrere.length })
        : t('grp.mehrere', 'Mehrere Personen …'))}</option>`
      : '',
    ...mitglieder.map(m => {
      const wen = m.name || m.uid;
      return `<option value="${escHtml(m.uid)}"${auswahl(m.uid)}>${escHtml(nurWen ? t('grp.nurWen', 'Nur {wen}', { wen }) : wen)}</option>`;
    }),
  ].join('');
}

/* Eine Datei: die Woche als Vorschau, Titel und "Für wen" wie bisher —
   nur mit dem Vorschlag aus der Excel. */
function einzelnZeigen(x) {
  alsListe = false;
  planVorschau(x.programm);
  zeige('planListe', false);
  zeige('grpPlanTitel', true);
  zeige('grpPlanFuer', true);
  /* Der Titel ist die Woche. Wer schon einen eigenen getippt hat,
     behaelt ihn. */
  const titel = $('planTitel');
  if (!titel.value.trim()) titel.value = planTitelVorschlag(x.programm);
  planFuerVorher = x.fuer;
  $('planFuer').innerHTML = fuerOptionen(x.fuer, { nurWen: true });
  const hinweis = $('planFuerHinweis');
  hinweis.textContent = zuordnungText(x);
  hinweis.hidden = !hinweis.textContent;
}

/* Mehrere: je Datei eine Karte mit Woche und Zuordnung. */
function mehrereZeigen() {
  alsListe = true;
  zeige('planVorschau', false);
  zeige('grpPlanTitel', false);
  zeige('grpPlanFuer', false);

  /* Dieselbe Person, dieselbe Woche, zwei Dateien: in der Woche gewinnt
     die spaeter veroeffentlichte (agendaTage). Das soll man vorher sehen. */
  const zuletzt = new Map();
  eingelesen.forEach((x, i) => {
    if (x.fehler || !x.fuer) return;
    const erster = planTageMitDatum(x.programm, isoTag())[0]?.datum || '';
    if (erster) zuletzt.set(`${x.fuer}|${erster}`, i);
  });

  $('planListe').innerHTML = eingelesen.map((x, i) => {
    if (x.fehler) {
      return `
        <div class="plan-datei ist-kaputt">
          <div class="plan-datei__kopf"><span class="plan-datei__name">${escHtml(x.datei)}</span></div>
          <p class="plan-datei__hinweis">${escHtml(t('grp.f.einlesen', 'Die Datei liess sich nicht lesen. {grund}', { grund: x.fehler }))}</p>
        </div>`;
    }
    const z = planZusammenfassung(x.programm);
    const woche = [z.kw ? `KW ${z.kw}` : z.label, z.von && z.bis ? `${kurzDatum(z.von)} – ${kurzDatum(z.bis)}` : '']
      .filter(Boolean).join(' · ');
    const erster = planTageMitDatum(x.programm, isoTag())[0]?.datum || '';
    const spaeter = x.fuer && erster ? zuletzt.get(`${x.fuer}|${erster}`) : i;
    const doppelt = spaeter !== undefined && spaeter !== i
      ? ` ${t('grp.planDoppelt', 'Dieselbe Woche wie {datei} — es gilt die spätere.', { datei: eingelesen[spaeter].datei })}`
      : '';
    return `
      <div class="plan-datei${x.fuer ? '' : ' ist-offen'}">
        <div class="plan-datei__kopf">
          <span class="plan-datei__name">${escHtml(x.datei)}</span>
          <span class="plan-datei__woche">${escHtml(woche || t('grp.planOhneWoche', 'Woche ohne Datum'))}</span>
        </div>
        <select class="form-select" data-datei-fuer="${i}" aria-label="${escHtml(t('grp.planFuer', 'Für wen'))}">${fuerOptionen(x.fuer)}</select>
        <p class="plan-datei__hinweis">${escHtml(zuordnungText(x) + doppelt)}</p>
      </div>`;
  }).join('');
  zeige('planListe', true);
}

async function planDateiGewaehlt(liste) {
  const dateien = [...(liste || [])];
  if (!dateien.length) return;
  const status = $('planDateiStatus');
  status.textContent = dateien.length > 1
    ? t('grp.planLiestN', '{n} Dateien werden gelesen …', { n: dateien.length })
    : t('grp.planLiest', 'Datei wird gelesen …');
  status.hidden = false;
  zeige('planVorschau', false);
  zeige('planListe', false);
  $('planFehler').hidden = true;
  $('planFuerHinweis').hidden = true;
  eingelesen = [];

  try {
    const [{ gridFromFile }, { parseProgram }, bildTabelle] = await Promise.all([
      import('../../training-import.js'),
      import('../../training-parser.js'),
      bilderLaden(),
    ]);
    /* Eine nach der anderen: eine kaputte Datei nimmt die anderen nicht mit. */
    for (const datei of dateien) {
      try {
        const programm = parseProgram(await gridFromFile(datei), { images: bildTabelle });
        const vorschlag = passendesMitglied(programm.athlete, mitglieder);
        eingelesen.push({
          datei: datei.name || '', programm, json: JSON.stringify(programm), vorschlag,
          /* Ohne Namen in der Excel ist es ein Plan fuer den Kader. Mit
             einem Namen, der auf niemanden passt, bleibt die Wahl offen. */
          fuer: vorschlag.uid || (vorschlag.grund === 'ohneName' ? PLAN_FUER_ALLE : ''),
        });
      } catch (e) {
        reportClientError('gruppe/plan-einlesen', e);
        /* Der Parser sagt, was fehlt ("Kein Wochenplan-Blatt gefunden.") —
           das hilft mehr als ein Ersatzsatz. */
        eingelesen.push({ datei: datei.name || '', fehler: e?.message || '' });
      }
    }
  } catch (e) {
    reportClientError('gruppe/plan-einlesen', e);
    eingelesen = dateien.map(d => ({ datei: d.name || '', fehler: e?.message || '' }));
  } finally {
    $('planDatei').value = '';
  }

  if (dateien.length === 1) {
    const [x] = eingelesen;
    if (x.fehler) {
      eingelesen = [];
      status.textContent = t('grp.f.einlesen', 'Die Datei liess sich nicht lesen. {grund}', { grund: x.fehler });
      return;
    }
    status.hidden = true;
    einzelnZeigen(x);
    $('planDateiKnopf').textContent = t('grp.planAndereDatei', 'Andere Datei wählen');
  } else {
    status.hidden = true;
    mehrereZeigen();
    $('planDateiKnopf').textContent = t('grp.planAndereDateien', 'Andere Dateien wählen');
  }
  zeige('grpPlanQuelle', false);
}

async function planFormOeffnen() {
  if (!aktiv) return;

  eingelesen = [];
  $('planDateiKnopf').textContent = t('grp.planDateienWaehlen', 'Excel-Dateien wählen');
  $('planDateiStatus').hidden = true;
  $('planFuerHinweis').hidden = true;
  zeige('planVorschau', false);
  zeige('planListe', false);
  zeige('grpPlanTitel', true);
  zeige('grpPlanFuer', true);
  alsListe = false;

  /* Frueher Eingelesenes als zweiter Weg — nur, wenn es das gibt. Ein
     Auswahlfeld mit "Du hast noch kein Programm eingelesen" als
     einzigem Eintrag war die ganze Oberflaeche dieses Formulars. */
  const quelle = $('planQuelle');
  try {
    const programme = await eigeneProgramme(user.uid);
    quelle.innerHTML = [
      `<option value="">—</option>`,
      ...programme.map(p => `<option value="${escHtml(p.id)}">${escHtml(p.id)}</option>`),
    ].join('');
    /* Der Rohtext wird am Element gemerkt, damit das Speichern nicht
       noch einmal lesen muss. */
    quelle.dataset.json = JSON.stringify(
      Object.fromEntries(programme.map(p => [p.id, p.json])));
    zeige('grpPlanQuelle', programme.length > 0);
  } catch (e) {
    reportClientError('gruppe/programme', e);
    quelle.innerHTML = '';
    quelle.dataset.json = '{}';
    zeige('grpPlanQuelle', false);
  }

  /* "Alle" zuerst — der Normalfall ist ein Plan für den ganzen Kader.
     Ein Plan nur für einen Athleten ist die Ausnahme, und genau die
     soll möglich sein. */
  planMehrere = [];
  planFuerVorher = PLAN_FUER_ALLE;
  $('planFuer').innerHTML = fuerOptionen(PLAN_FUER_ALLE, { nurWen: true });

  $('planTitel').value = '';
  $('planFehler').hidden = true;
  zeige('secPlanForm', true);
  zeige('secWoche', false);
  zeige('secMitglieder', false);
}

/* "Mehrere Personen …" gewählt: der Dialog wie im Chat. Abbrechen
   stellt die vorige Wahl wieder her; eine einzige Person ist "Nur …". */
let planFuerVorher = PLAN_FUER_ALLE;
async function planFuerGeaendert() {
  const feld = $('planFuer');
  if (feld.value !== PLAN_MEHRERE) { planFuerVorher = feld.value; $('planFuerHinweis').hidden = true; return; }
  const wahl = await mehrere({
    titel: t('grp.planFuer', 'Für wen'),
    text: t('grp.mehrereText', 'Jede Person bekommt den Plan als ihren eigenen.'),
    optionen: mitglieder.map(m => ({ wert: m.uid, titel: m.name || m.uid, text: wort(aktiv?.art, m.rolle), an: planMehrere.includes(m.uid) })),
    ja: t('common.ok', 'OK'),
  });
  if (wahl === null || !wahl.length) {
    feld.innerHTML = fuerOptionen(planFuerVorher, { nurWen: true });
  } else if (wahl.length === 1) {
    planFuerVorher = wahl[0];
    feld.innerHTML = fuerOptionen(wahl[0], { nurWen: true });
  } else {
    planMehrere = wahl;
    planFuerVorher = PLAN_MEHRERE;
    feld.innerHTML = fuerOptionen(PLAN_MEHRERE, { nurWen: true });
  }
  mehrereHinweis();
}

function mehrereHinweis() {
  const hinweis = $('planFuerHinweis');
  if ($('planFuer').value !== PLAN_MEHRERE) return;
  const namen = planMehrere.map(uid => mitglieder.find(m => m.uid === uid)?.name || uid);
  hinweis.textContent = t('grp.mehrereFuer', 'Für {namen}', { namen: namen.join(', ') });
  hinweis.hidden = false;
}

function planFormSchliessen() {
  zeige('secPlanForm', false);
  zeige('secWoche', !!aktiv);
  zeige('secMitglieder', !!aktiv);
}

async function planSpeichern() {
  if (!aktiv) return;
  const quelle = $('planQuelle');
  const fehler = $('planFehler');
  fehler.hidden = true;

  if (alsListe) { await mehrereVeroeffentlichen(); return; }

  /* Die eben eingelesene Datei zuerst; sonst ein frueheres Programm. */
  const x = eingelesen[0];
  let json = x?.json || '';
  let programmId = x ? planTitelVorschlag(x.programm) || x.datei : '';
  if (!json && quelle.value) {
    programmId = quelle.value;
    try { json = JSON.parse(quelle.dataset.json || '{}')[programmId] || ''; }
    catch { json = ''; }
  }

  if (!json) {
    fehler.textContent = t('grp.f.keineDatei', 'Wähle zuerst die Excel mit dem Wochenplan.');
    fehler.hidden = false;
    return;
  }

  const fuer = $('planFuer').value;
  const ziele = fuer === PLAN_MEHRERE ? [...planMehrere] : [fuer].filter(Boolean);
  if (!ziele.length) {
    fehler.textContent = t('grp.f.fuerWen', 'Wähle, für wen der Plan ist.');
    fehler.hidden = false;
    return;
  }

  let neuesProgramm = null;
  try { neuesProgramm = JSON.parse(json); } catch { /* ohne Programm ersetzt der Plan nichts */ }
  const ersetzt = neuesProgramm
    ? ersetztePlaene(ziele.map(wer => ({ fuer: wer, programm: neuesProgramm })), bestehendePlaene(), isoTag())
    : [];

  const btn = $('btnPlanSpeichern');
  btn.disabled = true;
  try {
    /* Je Person ein eigener Plan (siehe PLAN_MEHRERE). */
    for (const wer of ziele) {
      await planVeroeffentlichen(aktiv.id, user.uid, {
        titel: $('planTitel').value.trim() || programmId,
        json,
        fuer: wer,
      });
    }
    planMehrere = [];
    eingelesen = [];
    planFormSchliessen();
    await aeltereLoeschen(ersetzt);
    /* Wer eben die Excel für Timo eingelesen hat, will Timos Woche sehen
       — und zwar die, in der der Plan liegt, nicht heute. */
    wochePerson = ziele[0] || PLAN_FUER_ALLE;
    await zeichnePlaene();
    let ersterTag = '';
    try { ersterTag = planTageMitDatum(JSON.parse(json), isoTag())[0]?.datum || ''; } catch { /* ohne Datum bleibt die Woche */ }
    if (ersterTag) agendaHolen().springeZu(ersterTag);
  } catch (e) {
    reportClientError('gruppe/plan', e);
    fehler.textContent = e?.message || t('grp.f.plan', 'Der Plan konnte nicht veröffentlicht werden.');
    fehler.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* Die aelteren Fassungen (v.35.44.0). Wer dieselbe Woche fuer dieselbe
   Person noch einmal einliest, ersetzt sie — in der Woche gewinnt der
   neuere ohnehin, der aeltere laege aber fuer immer in Firestore. Gefragt
   wird NACH dem Veroeffentlichen: scheitert das, ist nichts geloescht.
   Das Protokoll haengt am Tag und nicht am Plan; was ein Athlet schon
   eingetragen hat, bleibt. */
function bestehendePlaene() {
  return plaene.map(plan => ({ plan, programm: programmVon(plan) })).filter(x => x.programm);
}

async function aeltereLoeschen(ersetzt) {
  if (!ersetzt.length) return;
  const wem = uid => (uid === PLAN_FUER_ALLE
    ? t('grp.alleInGruppe', 'Alle in der Gruppe')
    : mitglieder.find(m => m.uid === uid)?.name || t('grp.einAthlet', 'ein Athlet'));
  const was = ersetzt.map(({ plan, programm }) => `${planTitelVorschlag(programm) || plan.titel} · ${wem(plan.fuer)}`).join(', ');
  const ja = await frage({
    titel: ersetzt.length === 1
      ? t('grp.aeltereTitel', 'Die ältere Fassung löschen?')
      : t('grp.aeltereTitelN', 'Die {n} älteren Fassungen löschen?', { n: ersetzt.length }),
    text: t('grp.aeltereText', 'Für {was} gab es schon einen Plan. Es gilt der neue. Was schon eingetragen ist, bleibt.', { was }),
    ja: t('grp.aeltereLoeschen', 'Löschen'),
    nein: t('grp.aeltereBehalten', 'Behalten'),
    gefahr: true,
  });
  if (!ja) return;
  for (const { plan } of ersetzt) {
    try {
      await planLoeschen(aktiv.id, plan.id);
      programme.delete(plan.id);
    } catch (e) {
      /* Ein Plan, der bleibt, stört niemanden — der neuere gilt. */
      reportClientError('gruppe/planLoeschen', e);
    }
  }
}

/* Mehrere Dateien: jede als eigener Plan, fuer die Person, die in ihrer
   Karte steht. Veroeffentlicht wird erst, wenn jede jemanden hat. Geht
   mitten drin etwas schief, bleiben nur die Dateien in der Liste, die
   noch nicht draussen sind — ein zweiter Versuch doppelt nichts. */
async function mehrereVeroeffentlichen() {
  const fehler = $('planFehler');
  const gut = eingelesen.filter(x => !x.fehler);
  if (!gut.length) {
    fehler.textContent = t('grp.f.keineDatei', 'Wähle zuerst die Excel mit dem Wochenplan.');
    fehler.hidden = false;
    return;
  }
  if (gut.some(x => !x.fuer)) {
    fehler.textContent = t('grp.f.zuordnen', 'Nicht jede Datei hat jemanden. Wähle, für wen sie ist.');
    fehler.hidden = false;
    return;
  }

  const ersetzt = ersetztePlaene(gut.map(x => ({ fuer: x.fuer, programm: x.programm })), bestehendePlaene(), isoTag());
  const btn = $('btnPlanSpeichern');
  btn.disabled = true;
  const draussen = [];
  try {
    for (const x of gut) {
      await planVeroeffentlichen(aktiv.id, user.uid, {
        titel: planTitelVorschlag(x.programm) || x.datei,
        json: x.json,
        fuer: x.fuer,
      });
      draussen.push(x);
    }
    const erster = gut[0];
    eingelesen = [];
    planFormSchliessen();
    await aeltereLoeschen(ersetzt);
    /* Die Woche des ersten, dort, wo sein Plan liegt. */
    wochePerson = erster.fuer;
    await zeichnePlaene();
    const tag = planTageMitDatum(erster.programm, isoTag())[0]?.datum || '';
    if (tag) agendaHolen().springeZu(tag);
  } catch (e) {
    reportClientError('gruppe/plan', e);
    eingelesen = eingelesen.filter(x => !draussen.includes(x));
    mehrereZeigen();
    fehler.textContent = t('grp.f.planTeil', '{fertig} von {n} Plänen veröffentlicht, dann ging es nicht weiter. {grund}',
      { fertig: draussen.length, n: gut.length, grund: e?.message || '' });
    fehler.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* Die Karte oben: wo man gerade ist, in der Farbe der Gruppe (dieselbe
   wie im Kalender), mit der eigenen Rolle und wie viele Gruppen es
   noch gibt. Ein Tipp oeffnet die Wahl. */
/* Wechseln: über den Namen der Gruppe im Kopf — ein Tipp, dann die
   Karten aus gruppenwahl.js. Bis v.35.48.0 stand dafür eine eigene,
   grosse Karte oben auf der Seite (Michel: "so eine grosse Zeile nur zum
   Gruppenwechsel scheint mir zu umständlich"). Am Laptop stehen die
   Gruppen ausserdem als Liste in der Leiste. */
function zeichneWechsel() {
  const mehrere = gruppen.length > 1 && !!aktiv;
  setShellTitleWahl(
    mehrere ? () => gruppeWaehlen(gruppen, aktiv?.id, { rolleWort: wort, setzen: aktiveGruppeSetzen }) : null,
    t('grp.wechseln', 'Gruppe wechseln'),
  );
}

/* Der Wechsel kommt von der Karte hier ODER von der Leiste. Beide gehen
   ueber aktiveGruppeSetzen, und das meldet 'firn-gruppe' — hier wird
   also nur an einer Stelle umgeschaltet. Eine Gruppe, die noch nicht in
   der Liste steht (gerade angelegt, der Snapshot kommt gleich), bleibt
   dem naechsten Snapshot ueberlassen. */
function wechsleZu(gid) {
  const neu = gruppen.find(g => g.id === gid);
  if (!neu || neu.id === aktiv?.id) return;
  einstSchliessen();
  aktiv = neu;
  hoereAufTermine();
  zeichne();
}

function zeichne() {
  const hat = !!aktiv;
  const darfFuehren = hat && leitet(aktiv.meineRolle);
  /* Stehen die Einstellungen der Gruppe offen, bleibt das Übrige zu —
     auch wenn eine neue Meldung die Seite neu zeichnet. */
  const inEinst = hat && $('secGruppeEinst')?.hidden === false;
  if (!hat) zeige('secGruppeEinst', false);

  zeige('secLeer', !hat);
  zeige('secWoche', hat && !inEinst);
  zeige('secMitglieder', hat && !inEinst);
  zeige('secAktionen', darfFuehren && !inEinst);
  zeige('secWeitere', hat && !inEinst);
  zeichneWechsel();

  /* Wer nicht führt, sieht den Knopf gar nicht erst. Die Regeln lehnen
     das Schreiben ohnehin ab — aber ein Knopf, der zuverlässig
     scheitert, ist schlechter als keiner. */
  const knopf = $('btnTermin');
  if (knopf) knopf.hidden = !darfFuehren;
  const verteilerKnopf = $('btnVerteiler');
  if (verteilerKnopf) verteilerKnopf.hidden = !darfFuehren;
  const loeschen = $('grpLoeschen');
  if (loeschen) loeschen.hidden = !hat || !fuehrt(aktiv.meineRolle);
  zeige('grpEinstZeile', darfFuehren && !inEinst);
  seiteFaerben();
  kalenderDerGruppeLaden();

  /* Ohne Worker gibt es keine Adresse, die man abonnieren könnte —
     eine statische Seite kann kein text/calendar ausliefern. */
  const abo = $('btnAbo');
  if (abo) abo.hidden = !darfFuehren || !WORKER_BASIS || !KALENDER_ABO;

  if (!hat) {
    setShellTitle(t('nav.gruppe', 'Gruppe'));
    $('mitgliederZahl').hidden = true;
    formSchliessen();
    return;
  }

  setShellTitle(aktiv.name);
  zeichneMitglieder();
  zeichneWoche();
  zeichnePlaene();
  zeichneAssistent();
  zeichneFarbwahl();
}

/* ── Die Einstellungen der Gruppe (v.35.60.0) ──────────────────────
   Farbe, Kalender, Assistent, Abo, Löschen — eine eigene Ansicht statt
   offen unter der Kaderliste (Michel: "nicht so öffentlich … man kommt
   sehr schnell durcheinander"). */
const HAUPTTEILE = ['secWoche', 'secMitglieder', 'secAktionen', 'grpEinstZeile', 'secWeitere'];
function einstOeffnen() {
  if (!aktiv || !leitet(aktiv.meineRolle)) return;
  for (const id of HAUPTTEILE) zeige(id, false);
  $('grpEinstTitel').textContent = t('grp.einstVon', 'Einstellungen · {name}', { name: aktiv.name });
  zeichneFarbwahl();
  zeichneAssistent();
  zeichneKalenderDerGruppe();
  zeige('secGruppeEinst', true);
  window.scrollTo?.(0, 0);
}
function einstSchliessen() {
  if ($('secGruppeEinst')?.hidden !== false) return;
  zeige('secGruppeEinst', false);
  const darf = !!aktiv && leitet(aktiv.meineRolle);
  zeige('secWoche', !!aktiv);
  zeige('secMitglieder', !!aktiv);
  zeige('secAktionen', darf);
  zeige('grpEinstZeile', darf);
  zeige('secWeitere', !!aktiv);
}

/* Die Kalender der Gruppe (v.35.60.0, kalender-quellen.js). */
let kalenderDerGruppe = [];
let kalenderFuer = '';
async function kalenderDerGruppeLaden() {
  if (!aktiv) { kalenderDerGruppe = []; return; }
  const gid = aktiv.id;
  kalenderFuer = gid;
  try {
    const liste = await ladeGruppenKalender(gid);
    if (kalenderFuer !== gid) return;
    kalenderDerGruppe = liste;
  } catch (e) {
    reportClientError('gruppe/kalender', e);
    kalenderDerGruppe = [];
  }
  zeichneKalenderDerGruppe();
  kalenderWahl($('fKalender')?.value || '');
}
function zeichneKalenderDerGruppe() {
  const liste = $('gruppeKalenderListe');
  if (!liste) return;
  liste.innerHTML = kalenderDerGruppe.map(k => `
    <div class="grp-kalender__zeile" style="--tint:${escHtml(k.farbe || '')}">
      <span class="grp-kalender__punkt" aria-hidden="true"></span>
      <span class="grp-kalender__name">${escHtml(k.name)}</span>
      <button class="row__aktion row__aktion--gefahr" type="button" data-kalender-weg="${escHtml(k.id)}"
              aria-label="${escHtml(t('kal.kalenderLoeschen', '«{name}» löschen', { name: k.name }))}"
              title="${escHtml(t('kal.kalenderLoeschen', '«{name}» löschen', { name: k.name }))}">
        <svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>`).join('');
}
async function kalenderAnlegen() {
  if (!aktiv) return;
  const feld = $('gruppeKalenderName');
  const fehler = $('gruppeKalenderFehler');
  fehler.hidden = true;
  const name = kalenderName(feld.value);
  if (!name) { feld.focus(); return; }
  if (kalenderDerGruppe.length >= KALENDER_MAX) {
    fehler.textContent = t('kal.kalenderGenug', 'Mehr als {n} eigene Kalender gehen nicht.', { n: KALENDER_MAX });
    fehler.hidden = false;
    return;
  }
  const farbe = naechsteFarbe([gruppenFarbe(gruppen, aktiv.id), ...kalenderDerGruppe.map(k => k.farbe)], FARBEN.map(f => f.value));
  const knopf = $('btnGruppeKalender');
  knopf.disabled = true;
  try {
    const id = await gruppenKalenderAnlegen(aktiv.id, user.uid, { name, farbe });
    kalenderDerGruppe = [...kalenderDerGruppe, { id, name, farbe }].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    feld.value = '';
    zeichneKalenderDerGruppe();
    kalenderWahl($('fKalender')?.value || '');
    try { localStorage.setItem('firn.daten', String(Date.now())); } catch {}
  } catch (e) {
    reportClientError('gruppe/kalenderAnlegen', e);
    fehler.textContent = t('kal.f.anlegen', 'Der Kalender liess sich nicht anlegen.');
    fehler.hidden = false;
  } finally {
    knopf.disabled = false;
  }
}
async function kalenderLoeschen(id) {
  const k = kalenderDerGruppe.find(x => x.id === id);
  if (!k || !aktiv) return;
  const ja = await frage({
    titel: t('kal.kalenderLoeschen', '«{name}» löschen', { name: k.name }),
    text: t('grp.kalenderLoeschenText', 'Die Termine darin bleiben und stehen danach wieder unter ihrer Art.'),
    ja: t('common.loeschen', 'Löschen'),
    nein: t('common.abbrechen', 'Abbrechen'),
    gefahr: true,
  });
  if (!ja) return;
  try {
    await gruppenKalenderLoeschen(aktiv.id, id);
    kalenderDerGruppe = kalenderDerGruppe.filter(x => x.id !== id);
    zeichneKalenderDerGruppe();
    kalenderWahl($('fKalender')?.value || '');
    try { localStorage.setItem('firn.daten', String(Date.now())); } catch {}
  } catch (e) {
    reportClientError('gruppe/kalenderLoeschen', e);
  }
}
/* Im Terminformular: in welchem Kalender. Ohne Kalender der Gruppe
   fehlt das Feld — dann entscheidet die Art. */
function kalenderWahl(wert = '') {
  const wahl = $('fKalender');
  if (!wahl) return;
  wahl.innerHTML = [`<option value="">${escHtml(t('grp.kalenderNachArt', 'Nach Art (Training, Lager, Rennen)'))}</option>`,
    ...kalenderDerGruppe.map(k => `<option value="${escHtml(k.id)}">${escHtml(k.name)}</option>`)].join('');
  wahl.value = kalenderDerGruppe.some(k => k.id === wert) ? wert : '';
  zeige('grpKalender', kalenderDerGruppe.length > 0);
}

/* ── Die Farbe der Gruppe (v.35.59.0) ──────────────────────────────
   Michel: "es sieht auch gar nicht anders aus, vielleicht muss man
   Farben unterscheiden können". Die Farbe gab es (teamFarben: Leiste,
   Kalender, Pille), gewählt hat sie der Zufall der Reihenfolge. Jetzt
   wählt die Leitung aus den Kalenderfarben, und die Seite trägt sie
   oben als Band. Ein Logo braucht Speicher für Bilder — später. */
function seiteFaerben() {
  const wurzel = document.documentElement;
  if (aktiv) wurzel.style.setProperty('--gruppe-farbe', gruppenFarbe(gruppen, aktiv.id));
  else wurzel.style.removeProperty('--gruppe-farbe');
}

function zeichneFarbwahl() {
  const feld = $('gruppeFarbe');
  if (!feld || !aktiv) return;
  const jetzt = gruppenFarbe(gruppen, aktiv.id);
  feld.innerHTML = FARBEN.map(f => `
    <button class="farbwahl__feld" type="button" role="radio" data-farbe="${escHtml(f.value)}"
            aria-checked="${f.value === jetzt}" aria-label="${escHtml(f.label)}" title="${escHtml(f.label)}"
            style="--tint:${escHtml(f.value)}"></button>`).join('');
}

async function farbeWaehlen(farbe) {
  if (!aktiv || !FARBEN.some(f => f.value === farbe)) return;
  const vorher = aktiv.farbe;
  aktiv = { ...aktiv, farbe };
  gruppen = gruppen.map(g => (g.id === aktiv.id ? aktiv : g));
  zeichneFarbwahl();
  seiteFaerben();
  gruppeGeaendert(aktiv.id, { farbe });
  try {
    await gruppeAendern(aktiv.id, { farbe });
  } catch (e) {
    reportClientError('gruppe/farbe', e);
    aktiv = { ...aktiv, farbe: vorher };
    gruppen = gruppen.map(g => (g.id === aktiv.id ? aktiv : g));
    zeichneFarbwahl();
    seiteFaerben();
    gruppeGeaendert(aktiv.id, { farbe: vorher });
    await meldung({ titel: t('grp.farbe', 'Farbe der Gruppe'), text: t('grp.f.farbe', 'Die Farbe liess sich nicht speichern.') });
  }
}

/* Die Leiste und die Pille leben im obersten Dokument (die Gruppe steht
   oft im Rahmen des Routers). Sie hören auf die Mitgliedschaften, und die
   ändern sich bei einer neuen Farbe nicht — also Bescheid sagen. */
function gruppeGeaendert(id, patch) {
  try {
    const oben = window.top || window;
    oben.dispatchEvent(new oben.CustomEvent('firn-gruppe-geaendert', { detail: { id, patch } }));
  } catch { /* ohne Leiste nichts zu tun */ }
}

/* ── Die Gruppe löschen (v.35.59.0) ────────────────────────────────
   Nur der Kopf; gefragt wird mit dem Namen, und was verloren geht. */
async function gruppeLoeschenFragen() {
  const weg = aktiv;
  if (!weg || !fuehrt(weg.meineRolle)) return;
  const ja = await frage({
    titel: t('grp.loeschenFrage', '«{name}» löschen?', { name: weg.name }),
    text: t('grp.loeschenText', 'Alle verlieren die Gruppe mit ihren Terminen und Plänen. Das lässt sich nicht rückgängig machen.'),
    ja: t('grp.loeschen', 'Gruppe löschen'),
    nein: t('common.abbrechen', 'Abbrechen'),
    gefahr: true,
  });
  if (!ja) return;
  const knopf = $('btnGruppeLoeschen');
  knopf.disabled = true;
  try {
    await gruppeLoeschen(weg.id, user.uid);
    const naechste = gruppen.find(g => g.id !== weg.id);
    aktiveGruppeSetzen(naechste?.id || '');
  } catch (e) {
    reportClientError('gruppe/loeschen', e);
    await meldung({ titel: t('grp.loeschen', 'Gruppe löschen'), text: t('grp.f.loeschen', 'Die Gruppe liess sich nicht löschen.') });
  } finally {
    knopf.disabled = false;
  }
}

/* ── Der Assistent der Gruppe (v.35.53.0) ──────────────────────────
   Michel: "wäre cool, wenn Gruppen die Möglichkeit hätten, ihren
   Assistenten in der Gruppe zu benennen und einen eigenen zu haben."
   Name und Anweisung stehen an der Gruppe (assistent), die Pille
   (ki-pille.js) trägt den Namen, und die Anweisung geht mit jeder Frage
   an den Assistenten. Ändern darf die Leitung. */
function zeichneAssistent() {
  const name = $('assistentName');
  const anweisung = $('assistentAnweisung');
  if (!name || !anweisung) return;
  /* Nur, wenn es den Assistenten der Gruppe gibt — freigeschaltet
     (groups.ki, v.35.55.0) oder für die Person selbst (gruppeFrei,
     v.35.58.0) —, sonst gibt es nichts zu benennen, und warum nicht,
     steht nirgends. */
  const frei = !!aktiv && gruppeFrei(aktiv, meinProfil, imKreis(meinProfil));
  const einst = $('assistentEinst');
  if (einst) einst.hidden = !frei;
  if (!frei) return;
  /* Nicht überschreiben, was gerade jemand tippt. */
  if (document.activeElement !== name) name.value = aktiv?.assistent?.name || '';
  if (document.activeElement !== anweisung) anweisung.value = aktiv?.assistent?.anweisung || '';
}

async function assistentSpeichern() {
  if (!aktiv) return;
  const btn = $('btnAssistent');
  const stand = $('assistentStand');
  const neu = assistentSauber({ name: $('assistentName').value, anweisung: $('assistentAnweisung').value });
  btn.disabled = true;
  try {
    await assistentSetzen(aktiv.id, neu);
    aktiv = { ...aktiv, assistent: neu || undefined };
    gruppen = gruppen.map(g => (g.id === aktiv.id ? aktiv : g));
    stand.textContent = neu
      ? t('ki.gespeichert', '{name} ist jetzt der Assistent eurer Gruppe.', { name: neu.name })
      : t('ki.standard', 'Der Assistent heisst wieder «Assistent».');
    /* Die Pille lebt im obersten Dokument (die Gruppe steht oft im Rahmen
       des Routers): dort die Liste nachtragen und Bescheid sagen. Die
       Mitgliedschaften, auf die die Leiste hört, ändern sich dabei nicht —
       von allein käme der neue Name erst beim nächsten Laden. */
    try { localStorage.setItem('firn.daten', String(Date.now())); } catch {}
    try {
      const oben = window.parent || window;
      if (Array.isArray(oben.__firnGruppen)) {
        oben.__firnGruppen = oben.__firnGruppen.map(g => (g.id === aktiv.id ? { ...g, assistent: neu || undefined } : g));
      }
      oben.dispatchEvent(new oben.CustomEvent('firn-gruppen'));
    } catch { /* ohne Pille nichts zu tun */ }
  } catch (e) {
    reportClientError('gruppe/assistent', e);
    stand.textContent = t('ki.f.speichern', 'Der Assistent liess sich nicht speichern.');
  } finally {
    stand.hidden = false;
    btn.disabled = false;
  }
}

/* ── Handlungen ────────────────────────────────────────────────────*/

/* Eine Gruppe anlegen: ein Formular auf der Seite, mit drei Karten
   fuer die Art. Hier standen zwei prompt() — der Name, dann eine
   ZIFFER fuer die Art, weil drei Antworten fuer confirm() zu viele
   sind. Die Art entscheidet ueber Wortwahl und Rollennamen, nicht ueber
   den Ablauf; darum steht der Rennkader vorn, aber nichts ist falsch. */
let neueArt = 'kader';

function setzeNeueArt(art) {
  neueArt = art;
  document.querySelectorAll('#neuArt [data-art]').forEach(karte => {
    karte.setAttribute('aria-checked', karte.dataset.art === art ? 'true' : 'false');
  });
}

function neueGruppe() {
  setzeNeueArt('kader');
  $('neuName').value = '';
  $('neuFehler').hidden = true;
  /* Wer schon eine Gruppe hat, legt die neue ohne die alte darunter an —
     sonst läse sich das Formular wie ein Teil der aktiven Gruppe. */
  for (const id of ['secLeer', 'secWoche', 'secMitglieder', 'secAktionen', 'secWeitere']) zeige(id, false);
  zeige('secGruppeNeu', true);
  window.scrollTo(0, 0);
  $('neuName').focus();
}

function neueGruppeSchliessen() {
  zeige('secGruppeNeu', false);
  zeichne();
}

async function gruppeErstellen(event) {
  event?.preventDefault();
  const name = $('neuName').value.trim();
  const fehler = $('neuFehler');
  if (!name) {
    fehler.textContent = t('grp.f.nameFehlt', 'Die Gruppe braucht einen Namen.');
    fehler.hidden = false;
    $('neuName').focus();
    return;
  }

  const btn = $('btnGruppeAnlegen');
  btn.disabled = true;
  try {
    const gid = await gruppeAnlegen(user.uid, { name, art: neueArt });
    aktiveGruppeSetzen(gid);
    zeige('secGruppeNeu', false);
    /* Kein reload: beobachteMeineGruppen meldet die neue Gruppe von
       selbst, und der Umschalter steht dann schon richtig. */
  } catch (e) {
    reportClientError('gruppe/anlegen', e);
    fehler.textContent = t('grp.f.gruppe', 'Die Gruppe konnte nicht erstellt werden.');
    fehler.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* Die vorhandenen Texte tragen Frage und Erklaerung in EINEM String,
   getrennt durch eine Leerzeile — so waren sie fuer confirm() gebaut.
   Der gestaltete Dialog hat einen Titel und einen Text; die Leerzeile
   ist die Naht. Alle sieben Sprachen bleiben, ohne neue Schluessel. */
function geteilt(s) {
  const [titel, ...rest] = String(s).split('\n\n');
  return { titel, text: rest.join('\n\n') };
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

/* Der offene Termin wird bei jeder Änderung neu gezeichnet (beobachte-
   Termine). Was nur beim ÖFFNEN geschehen soll — die Aufgaben abonnieren,
   die Gäste laden —, hängt an offenId. */
let offenId = null;

function detailOeffnen(eid) {
  offen = termine.find(t => t.id === eid) || null;
  if (!offen) return;
  const neuGeoeffnet = offenId !== offen.id;
  if (neuGeoeffnet) { programmLeerZeigen = false; packlisteLeerZeigen = false; abfahrtenBearbeiten = false; punktAbbrechen(); }
  offenId = offen.id;

  const darfFuehren = leitet(aktiv?.meineRolle);
  const abgesagt = istAbgesagt(offen);

  /* Die Absage steht ganz vorn — wer die Ansicht öffnet, soll sie
     nicht erst im dritten Absatz finden. */
  const teile = [
    abgesagt ? 'ABGESAGT' : '',
    artName(offen, aktiv?.art),
    zeitraum(offen),
  ];
  if (offen.ort) teile.push(offen.ort);
  if (offen.disziplin) teile.push(offen.disziplin);
  if (abgesagt && offen.absageGrund) teile.push(offen.absageGrund);

  $('dTitel').textContent = offen.titel;
  $('dMeta').textContent = teile.filter(Boolean).join(' · ');
  $('dMeta').hidden = false;
  const notiz = String(offen.notiz || '').trim();
  $('dNotiz').textContent = notiz;
  $('dNotiz').hidden = !notiz;

  /* Bearbeiten, Programm, Gäste: die Leitung (v.35.50.0 — bis dahin
     liess sich ein Termin nur löschen und neu anlegen). */
  $('btnBearbeiten').hidden = !darfFuehren;
  $('btnGastLink').hidden = !darfFuehren;
  $('btnAbfahrten').hidden = !darfFuehren;
  $('btnGastLink').textContent = t('prog.gastLink', 'Gast-Link kopieren');
  zeichneProgramm();
  zeichneAbfahrten();
  zeichnePackliste();
  if (neuGeoeffnet) {
    packlisteHoeren();
    zeichneGaeste();
    /* Ein Termin beginnt oben — auch wenn man aus der Woche weit unten kam. */
    window.scrollTo?.(0, 0);
  }

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
  zeige('secWoche', false);
  zeige('secMitglieder', false);
  /* Der Leitungsbereich gehört nicht unter einen Termin. */
  zeige('secAktionen', false);
  zeichneZusagen();
  zeichneAnhaenge();
}

function detailSchliessen() {
  offen = null;
  offenId = null;
  gepacktAbmelden?.();
  gepacktAbmelden = null;
  gepackt = null;
  zeige('secDetail', false);
  zeige('secWoche', !!aktiv);
  zeige('secMitglieder', !!aktiv);
  zeige('secAktionen', !!aktiv && leitet(aktiv.meineRolle));
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

/* Unterlagen bringt und ändert die Leitung — auch seit Termine und
   Reisen eins sind (v.35.50.0). Michel: ändern soll nur, wer führt. */
const darfAnhang = () => leitet(aktiv?.meineRolle);

function anhangZeile(a) {
  const kb = Math.round((a.size || 0) / 1024);
  const typ = String(a.type || '');
  const zeichen = typ.includes('pdf') ? 'PDF' : typ.startsWith('image/') ? t('grp.bild', 'Bild') : t('grp.datei', 'Datei');
  return `
    <div class="row${darfAnhang(a) ? '' : ' row--static'}" data-anhang="${escHtml(a.id)}" data-bereich="kalender">
      <span class="row__icon">${escHtml(zeichen)}</span>
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

  zeige('grpAnhaenge', true);
  $('anhangKnopf').hidden = !darfAnhang();

  try { anhaenge = await ladeAnhaenge(aktiv.id, offen.id); }
  catch (e) { reportClientError('gruppe/anhaenge', e); anhaenge = []; }

  liste.innerHTML = anhaenge.length
    ? anhaenge.map(anhangZeile).join('')
      + (anhaenge.some(darfAnhang)
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
  if (!offen || !aktiv) return;
  const a = anhaenge.find(x => x.id === id);
  if (!a || !darfAnhang(a)) return;

  const name = await eingabe({
    ...geteilt(t('grp.frageAnhangName',
      'Neuer Name für die Unterlage.\n\nLeer lassen und OK drücken, um sie zu entfernen.')),
    wert: a.name,
    maxlength: 120,
  });
  if (name === null) return;

  try {
    if (!name.trim()) {
      if (!await frage({
        titel: t('grp.frageAnhangWeg', '"{was}" wirklich entfernen?', { was: a.name }),
        ja: t('grp.entfernenKurz', 'Entfernen'), gefahr: true,
      })) return;
      await anhangLoeschen(aktiv.id, offen.id, id);
    } else {
      await anhangUmbenennen(aktiv.id, offen.id, id, name, user.uid);
    }
    await zeichneAnhaenge();
  } catch (e) {
    reportClientError('gruppe/anhang-verwalten', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
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

/* ── Das Programm am Termin ────────────────────────────────────────
   Bis v.35.49.0 hatte das nur die Reise, und die Reise stand nie hier.
   Jetzt: Punkte nach Tagen (aus einer eingelesenen Seite oder von Hand).
   Die Leitung legt sie an und ändert sie; abgehakt wird nichts — was
   vorbei ist, blendet sich von selbst ab, und der nächste Punkt ist
   markiert (Michel). "Programm öffnen" zeigt es gross mit dem Original. */

let programmLeerZeigen = false;   // die Leitung hat "Programm anlegen" gedrückt
let punktInArbeit = null;         // der Punkt, der gerade geändert wird
const programmSchluessel = () => `termin:${aktiv?.id}:${offen?.id}`;

function programmOptionen() {
  const termin = offen;
  return {
    schluessel: programmSchluessel(),
    eyebrow: aktiv?.name || '',
    titel: termin.titel,
    zeitraum: zeitraum(termin),
    ort: termin.ort || '',
    notiz: termin.notiz || '',
    punkte: termin.programm || [],
    abfahrt: abfahrtVon(termin, user.uid),
    seite: { html: termin.planHtml || '', url: termin.planUrl || '' },
  };
}

function zeichneProgramm() {
  if (!offen || !aktiv) return;
  const darfFuehren = leitet(aktiv.meineRolle);
  const punkte = offen.programm || [];
  const seite = !!(offen.planHtml || offen.planUrl);
  const zeigen = punkte.length > 0 || seite || (darfFuehren && programmLeerZeigen);
  zeige('grpProgramm', zeigen);
  $('btnProgrammNeu').hidden = !darfFuehren || zeigen;
  if (!zeigen) return;
  $('btnProgrammOeffnen').hidden = !punkte.length && !seite;
  $('listProgramm').innerHTML = punkte.length || !darfFuehren
    ? punkteHtml(punkte, { jetzt: jetztFuer(new Date()), bearbeitbar: darfFuehren })
    : '';
  zeige('progNeu', darfFuehren);
  if (darfFuehren && !$('pDatum').value) $('pDatum').value = offen.von || '';
  $('btnPunkt').textContent = punktInArbeit ? t('common.speichern', 'Speichern') : t('prog.hinzufuegen', 'Hinzufügen');
  $('btnPunktAbbrechen').hidden = !punktInArbeit;
  programmNeuZeichnen(programmSchluessel(), programmOptionen());
}

/* Ein Tipp auf einen Punkt (Leitung): er steht zum Ändern in den Feldern. */
function punktBearbeiten(id) {
  const p = (offen?.programm || []).find(x => x.id === id);
  if (!p) return;
  punktInArbeit = p;
  $('pTitel').value = p.title || '';
  $('pDatum').value = p.date || '';
  $('pZeit').value = p.time || '';
  $('pNotiz').value = p.notes || '';
  zeichneProgramm();
  $('pTitel').focus();
}

function punktAbbrechen() {
  punktInArbeit = null;
  for (const id of ['pTitel', 'pZeit', 'pNotiz']) if ($(id)) $(id).value = '';
  if ($('btnPunkt')) zeichneProgramm();
}

async function punktSpeichern() {
  if (!offen || !aktiv) return;
  const titel = $('pTitel').value.trim();
  if (!titel) { $('pTitel').focus(); return; }
  const termin = offen;
  /* Geändert wird der Punkt als eigener: ein neues Einlesen der Seite
     ersetzt ihn dann nicht mehr (programmMitSeite). */
  const punkt = neuerPunkt({
    id: punktInArbeit?.id || '',
    date: $('pDatum').value, time: $('pZeit').value, title: titel, notes: $('pNotiz').value,
  });
  const neu = punktSetzen(termin.programm, punkt);
  $('btnPunkt').disabled = true;
  try {
    await programmSetzen(aktiv.id, termin.id, neu);
    termin.programm = neu;
    punktAbbrechen();
    $('pTitel').focus();
  } catch (e) {
    reportClientError('gruppe/punkt', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  } finally {
    $('btnPunkt').disabled = false;
  }
}

async function punktEntfernen(id) {
  if (!offen || !aktiv) return;
  const termin = offen;
  const neu = (termin.programm || []).filter(p => p.id !== id);
  try {
    await programmSetzen(aktiv.id, termin.id, neu);
    termin.programm = neu;
    if (punktInArbeit?.id === id) punktAbbrechen();
    zeichneProgramm();
  } catch (e) {
    reportClientError('gruppe/punkt-weg', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  }
}

/* ── Abfahrten ─────────────────────────────────────────────────────
   Wann und wo jeder losfährt — die Leitung trägt es ein, jeder sieht
   oben im Termin seine eigene. Die Leitung sieht die ganze Liste. */

let abfahrtenBearbeiten = false;

function zeichneAbfahrten() {
  if (!offen || !aktiv) return;
  const darfFuehren = leitet(aktiv.meineRolle);
  const meine = abfahrtVon(offen, user.uid);
  const feld = $('abfahrtMeine');
  feld.innerHTML = meine
    ? `<span>${escHtml(t('prog.deineAbfahrt', 'Deine Abfahrt'))}</span><strong>${escHtml([meine.zeit, meine.ort].filter(Boolean).join(' · '))}</strong>`
    : '';
  feld.hidden = !meine;

  const alle = Object.entries(offen.abfahrten || {});
  zeige('grpAbfahrten', darfFuehren && (alle.length > 0 || abfahrtenBearbeiten));
  if (!darfFuehren) return;
  $('btnAbfahrten').textContent = alle.length
    ? t('prog.abfahrtenAendern', 'Abfahrten ändern')
    : t('prog.abfahrtenEintragen', 'Abfahrten eintragen');
  const name = uid => mitglieder.find(m => m.uid === uid)?.name || t('grp.unbekannt', 'Unbekannt');
  $('listAbfahrten').innerHTML = abfahrtenBearbeiten ? '' : alle
    .sort((a, b) => `${a[1].zeit || ''}${name(a[0])}`.localeCompare(`${b[1].zeit || ''}${name(b[0])}`))
    .map(([uid, a]) => `<div class="row row--static">
      <span class="row__time prog-zeit">${escHtml(a.zeit || '')}</span>
      <span class="row__body"><span class="row__title">${escHtml(name(uid))}</span>
        ${a.ort ? `<span class="row__sub">${escHtml(a.ort)}</span>` : ''}</span>
    </div>`).join('');
  zeige('abfahrtenEditor', abfahrtenBearbeiten);
}

function abfahrtenOeffnen() {
  if (!offen || !aktiv || !leitet(aktiv.meineRolle)) return;
  abfahrtenBearbeiten = true;
  const stand = offen.abfahrten || {};
  $('abfahrtAlleZeit').value = '';
  $('abfahrtAlleOrt').value = '';
  $('abfahrtZeilen').innerHTML = sortiere(mitglieder).map(m => {
    const a = stand[m.uid] || {};
    return `<div class="abfahrt-zeile" data-abfahrt="${escHtml(m.uid)}">
      <span class="abfahrt-zeile__name">${escHtml(m.name || '')}</span>
      <input class="form-input" type="time" data-feld="zeit" value="${escHtml(a.zeit || '')}" aria-label="${escHtml(t('grp.zeit', 'Uhrzeit'))}" />
      <input class="form-input" type="text" maxlength="80" list="ortVorschlaege" data-feld="ort" value="${escHtml(a.ort || '')}" aria-label="${escHtml(t('grp.ort', 'Ort'))}" />
    </div>`;
  }).join('');
  zeichneAbfahrten();
  zeige('grpAbfahrten', true);
  $('abfahrtAlleZeit').focus();
}

/* "Für alle": füllt jede Zeile — danach passt man einzelne an. */
function abfahrtFuerAlle(feld, wert) {
  document.querySelectorAll(`#abfahrtZeilen [data-feld="${feld}"]`).forEach(el => { el.value = wert; });
}

async function abfahrtenSpeichern() {
  if (!offen || !aktiv) return;
  const eingabe = {};
  document.querySelectorAll('#abfahrtZeilen [data-abfahrt]').forEach(zeile => {
    eingabe[zeile.dataset.abfahrt] = {
      zeit: zeile.querySelector('[data-feld="zeit"]').value,
      ort: zeile.querySelector('[data-feld="ort"]').value,
    };
  });
  const abfahrten = abfahrtenSauber(eingabe);
  const termin = offen;
  $('btnAbfahrtenSpeichern').disabled = true;
  try {
    await terminAendern(aktiv.id, termin.id, { abfahrten });
    termin.abfahrten = abfahrten;
    abfahrtenBearbeiten = false;
    zeichneAbfahrten();
    zeichneProgramm();
  } catch (e) {
    reportClientError('gruppe/abfahrten', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  } finally {
    $('btnAbfahrtenSpeichern').disabled = false;
  }
}

/* ── Die Packliste ─────────────────────────────────────────────────
   Die Punkte ("Yogamatte", "Aussen-Turnschuhe") legt die Leitung an und
   ändert sie; abgehakt wird für jede Person einzeln (gepackt/{uid}), und
   wer mag, schreibt sich eigene Punkte dazu, die nur er sieht. */

let packlisteLeerZeigen = false;
let gepackt = null;
let gepacktAbmelden = null;

function packlisteHoeren() {
  gepacktAbmelden?.();
  gepackt = null;
  if (!offen || !aktiv) return;
  const eid = offen.id;
  gepacktAbmelden = beobachteGepackt(aktiv.id, eid, user.uid, stand => {
    if (offen?.id !== eid) return;
    gepackt = stand;
    zeichnePackliste();
  });
}

function zeichnePackliste() {
  if (!offen || !aktiv) return;
  const darfFuehren = leitet(aktiv.meineRolle);
  const punkte = packlisteFuer(offen, gepackt);
  const zeigen = punkte.length > 0 || (darfFuehren && packlisteLeerZeigen);
  zeige('grpPackliste', zeigen);
  $('btnPacklisteNeu').hidden = !darfFuehren || zeigen;
  if (!zeigen) return;
  const an = punkte.filter(p => p.an).length;
  $('packStand').textContent = punkte.length ? t('prog.gepacktStand', '{n} / {m}', { n: an, m: punkte.length }) : '';
  $('packName').placeholder = darfFuehren
    ? t('prog.packPhLeitung', 'Für alle, z.B. Yogamatte')
    : t('prog.packPhEigen', 'Nur für dich, z.B. Ladekabel');
  $('listPackliste').innerHTML = punkte.map(p => {
    const aendern = p.eigen || darfFuehren;
    return `<div class="row row--static pack-punkt${p.an ? ' is-an' : ''}">
      <button class="haken${p.an ? ' is-an' : ''}" type="button" data-pack-haken="${escHtml(p.id)}"
        aria-pressed="${p.an}" aria-label="${escHtml(p.an ? t('prog.wiederOffen', 'Wieder öffnen') : t('prog.gepackt', 'Gepackt'))}"></button>
      <span class="row__body">
        <span class="row__title">${escHtml(p.name)}</span>
        ${p.eigen ? `<span class="row__sub">${escHtml(t('prog.nurFuerDich', 'nur für dich'))}</span>` : ''}
      </span>
      ${aendern ? `<span class="row__end">
        <button class="row__aktion" type="button" data-pack-aendern="${escHtml(p.id)}"
          title="${escHtml(t('prog.bearbeiten', 'Bearbeiten'))}" aria-label="${escHtml(t('prog.bearbeiten', 'Bearbeiten'))}"><svg class="ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
      </span>` : ''}
    </div>`;
  }).join('');
}

const eigenerStand = () => ({ erledigt: { ...(gepackt?.erledigt || {}) }, eigene: [...(gepackt?.eigene || [])] });

async function eigenenStandSchreiben(stand) {
  const vorher = gepackt;
  gepackt = { ...(gepackt || {}), ...stand };
  zeichnePackliste();
  try {
    await gepacktSetzen(aktiv.id, offen.id, user.uid, stand);
  } catch (e) {
    reportClientError('gruppe/gepackt', e);
    gepackt = vorher;
    zeichnePackliste();
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  }
}

async function packlisteSchreiben(liste) {
  const termin = offen;
  try {
    await terminAendern(aktiv.id, termin.id, { packliste: liste });
    termin.packliste = liste;
    zeichnePackliste();
  } catch (e) {
    reportClientError('gruppe/packliste', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  }
}

async function packpunktHinzufuegen(event) {
  event?.preventDefault();
  if (!offen || !aktiv) return;
  const name = $('packName').value.trim();
  if (!name) { $('packName').focus(); return; }
  const punkt = neuerPackpunkt(name);
  $('packName').value = '';
  /* Die Leitung schreibt für alle, alle anderen für sich. */
  if (leitet(aktiv.meineRolle)) {
    await packlisteSchreiben([...(offen.packliste || []), punkt].slice(0, PACKLISTE_MAX));
  } else {
    const stand = eigenerStand();
    stand.eigene.push(punkt);
    await eigenenStandSchreiben(stand);
  }
  $('packName').focus();
}

async function packAktion(event) {
  if (!offen || !aktiv) return;
  const haken = event.target.closest('[data-pack-haken]');
  if (haken) {
    const stand = eigenerStand();
    const id = haken.dataset.packHaken;
    stand.erledigt[id] = !stand.erledigt[id];
    await eigenenStandSchreiben(stand);
    return;
  }
  const aendern = event.target.closest('[data-pack-aendern]');
  if (!aendern) return;
  const id = aendern.dataset.packAendern;
  const eigen = (gepackt?.eigene || []).find(p => p.id === id);
  const gemeinsam = (offen.packliste || []).find(p => p.id === id);
  const punkt = eigen || gemeinsam;
  if (!punkt || (!eigen && !leitet(aktiv.meineRolle))) return;
  const name = await eingabe({
    ...geteilt(t('prog.frageAendern', 'Punkt ändern.\n\nLeer lassen und OK drücken, um ihn zu entfernen.')),
    wert: punkt.name,
    maxlength: 120,
  });
  if (name === null) return;
  const neu = name.trim();
  if (eigen) {
    const stand = eigenerStand();
    stand.eigene = neu
      ? stand.eigene.map(p => (p.id === id ? { ...p, name: neu.slice(0, 120) } : p))
      : stand.eigene.filter(p => p.id !== id);
    if (!neu) delete stand.erledigt[id];
    await eigenenStandSchreiben(stand);
  } else {
    await packlisteSchreiben(neu
      ? offen.packliste.map(p => (p.id === id ? { ...p, name: neu.slice(0, 120) } : p))
      : offen.packliste.filter(p => p.id !== id));
  }
}

/* ── Was oft vorkommt ──────────────────────────────────────────────
   Michel: was man oft einträgt, soll nicht jedes Mal neu von Hand gehen.
   Die Vorschlagslisten (Titel, Orte, Packpunkte) kommen aus dem, was die
   Gruppe schon hat; im Formular stehen die häufigsten Termine zum
   Antippen — ein Tipp füllt Art, Titel, Zeit und Ort. */

function vorschlaegeFuellen() {
  const liste = (id, werte) => {
    const el = $(id);
    if (el) el.innerHTML = werte.map(w => `<option value="${escHtml(w)}"></option>`).join('');
  };
  liste('titelVorschlaege', haeufigste([
    ...termine.map(x => x.titel),
    ...termine.flatMap(x => (x.programm || []).map(p => p.title)),
  ], 30));
  liste('ortVorschlaege', haeufigste([
    ...termine.map(x => x.ort),
    ...termine.flatMap(x => Object.values(x.abfahrten || {}).map(a => a.ort)),
  ], 30));
  liste('packVorschlaege', haeufigste(termine.flatMap(x => (x.packliste || []).map(p => p.name)), 30));
}

/** Die häufigsten Termine der Gruppe — gleiche Art, gleiches Wort, gleicher
 *  Titel, gleiche Zeit und gleicher Ort, mindestens zweimal. */
function haeufigeTermine(max = 6) {
  const zaehler = new Map();
  for (const x of termine) {
    if (!x?.titel) continue;
    const schluessel = [x.art, x.bezeichnung || '', x.titel, x.zeit || '', x.bisZeit || '', x.ort || ''].join('|');
    const eintrag = zaehler.get(schluessel) || { termin: x, n: 0 };
    eintrag.n += 1;
    zaehler.set(schluessel, eintrag);
  }
  return [...zaehler.values()].filter(e => e.n >= 2)
    .sort((a, b) => b.n - a.n || String(a.termin.titel).localeCompare(String(b.termin.titel)))
    .slice(0, max).map(e => e.termin);
}

let vorlagen = [];
function zeichneHaeufige() {
  vorlagen = bearbeitet ? [] : haeufigeTermine();
  const box = $('fHaeufig');
  box.innerHTML = vorlagen.map((x, i) => `<button class="haeufig__knopf" type="button" data-vorlage="${i}">
    ${escHtml(x.titel)}${x.zeit || x.ort ? ` <small>${escHtml([x.zeit, x.ort].filter(Boolean).join(' · '))}</small>` : ''}
  </button>`).join('');
  box.hidden = !vorlagen.length;
}

function vorlageUebernehmen(i) {
  const x = vorlagen[i];
  if (!x) return;
  if (x.bezeichnung) {
    setzeArtWahl('eigene');
    $('fArt').value = x.art;
    $('fBezeichnung').value = x.bezeichnung;
    formAnpassen();
  } else {
    setzeArtWahl(x.art);
  }
  $('fTitel').value = x.titel || '';
  $('fZeit').value = x.zeit || '';
  $('fBisZeit').value = x.bisZeit || '';
  $('fOrt').value = x.ort || '';
  if (x.disziplin) $('fDisziplin').value = x.disziplin;
  formAnpassen();
  $('fVon').focus();
}

/* ── Gäste ─────────────────────────────────────────────────────────
   Ein Link, mit dem jemand ohne Mitgliedschaft genau diesen Termin
   sieht — Programm, Seite, und einen Chat mit der Person, die ihn
   angelegt hat. Wie bis v.35.49.0 an der Reise. */

/* Der Termin für den eigenen Kalender — die Reise hatte ihr ".ics". */
function icsHerunterladen() {
  if (!offen) return;
  const inhalt = buildCalendarIcs({ events: [alsIcsEintrag(offen, aktiv?.id)], calendarName: aktiv?.name || 'Firn' });
  const adresse = URL.createObjectURL(new Blob([inhalt], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = adresse;
  a.download = `${String(offen.titel || 'termin').replace(/[^\w.-]+/g, '-')}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}

function neuesToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(36)).join('').slice(0, 16);
}

async function zeichneGaeste() {
  zeige('grpGaeste', false);
  if (!offen || !aktiv || !leitet(aktiv.meineRolle)) return;
  const eid = offen.id;
  let liste = [];
  try { liste = await ladeGaeste(eid); }
  catch (e) { reportClientError('gruppe/gaeste', e); }
  if (offen?.id !== eid) return;
  const tagMs = 86400000;
  $('listGaeste').innerHTML = liste.map(g => {
    const zuletzt = g.lastActiveAt?.toDate ? g.lastActiveAt.toDate().getTime() : 0;
    const tage = zuletzt ? Math.floor((Date.now() - zuletzt) / tagMs) : null;
    const sub = tage === null ? t('prog.nieAktiv', 'noch nie aktiv')
      : tage <= 0 ? t('prog.heuteAktiv', 'heute aktiv')
      : t('prog.aktivVor', 'vor {n} Tagen aktiv', { n: tage });
    return `<div class="row row--static">
      <span class="row__body">
        <span class="row__title">${escHtml(g.name)}</span>
        <span class="row__sub">${escHtml(sub)}</span>
      </span>
      <span class="row__end">
        <button class="row__aktion" type="button" data-gast-chat="${escHtml(g.uid)}" data-gast-name="${escHtml(g.name)}"
          title="${escHtml(t('prog.chat', 'Nachricht'))}" aria-label="${escHtml(t('prog.chat', 'Nachricht'))}"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
        <button class="row__aktion row__aktion--gefahr" type="button" data-gast-weg="${escHtml(g.docId)}"
          title="${escHtml(t('prog.entfernen', 'Entfernen'))}" aria-label="${escHtml(t('prog.entfernen', 'Entfernen'))}"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
      </span>
    </div>`;
  }).join('');
  zeige('grpGaeste', liste.length > 0);
}

async function gastAktion(event) {
  const chat = event.target.closest('[data-gast-chat]');
  if (chat) {
    const ziel = `./messages.html?to=${encodeURIComponent(chat.dataset.gastChat)}&name=${encodeURIComponent(chat.dataset.gastName)}`;
    if (!window.tvzaNavigate?.(ziel)) location.href = ziel;
    return;
  }
  const weg = event.target.closest('[data-gast-weg]');
  if (!weg) return;
  if (!await frage({
    titel: t('prog.frageGastWeg', 'Gast-Zugang entfernen?'),
    ja: t('grp.entfernenKurz', 'Entfernen'), gefahr: true,
  })) return;
  try {
    await gastEntfernen(weg.dataset.gastWeg);
    await zeichneGaeste();
  } catch (e) {
    reportClientError('gruppe/gast-weg', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  }
}

async function gastLinkKopieren() {
  if (!offen || !aktiv) return;
  const knopf = $('btnGastLink');
  const termin = offen;
  try {
    let token = termin.gastToken;
    if (!token) {
      token = neuesToken();
      await gastTokenSetzen(aktiv.id, termin.id, token);
      termin.gastToken = token;
    }
    const link = new URL(`guest.html?g=${encodeURIComponent(aktiv.id)}&termin=${encodeURIComponent(termin.id)}&token=${encodeURIComponent(token)}`, location.href).href;
    try {
      await navigator.clipboard.writeText(link);
      knopf.textContent = t('prog.linkKopiert', 'Link kopiert');
      setTimeout(() => { knopf.textContent = t('prog.gastLink', 'Gast-Link kopieren'); }, 2000);
    } catch {
      /* Ohne Zwischenablage (Rahmen, altes Safari): der Link zum
         Markieren, statt eines Browserfensters (Falle 7). */
      await eingabe({
        titel: t('prog.gastLink', 'Gast-Link kopieren'),
        text: t('prog.gastLinkText', 'Wer diesen Link hat, sieht den Termin mit Programm und kann dir schreiben.'),
        wert: link,
      });
    }
  } catch (e) {
    reportClientError('gruppe/gast-link', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  }
}

/* ── Absagen ───────────────────────────────────────────────────────*/

async function absageUmschalten() {
  if (!offen || !aktiv) return;

  try {
    if (istAbgesagt(offen)) {
      if (!await frage({ titel: t('grp.frageFindetStatt', '"{was}" findet doch statt?', { was: offen.titel }) })) return;
      await absageZuruecknehmen(aktiv.id, offen.id);
    } else {
      /* Der Grund ist freiwillig, aber er ist das, was die Leute
         wirklich wissen wollen — "zu wenig Schnee" beantwortet die
         Rückfragen, bevor sie kommen. */
      const grund = await eingabe({
        ...geteilt(t('grp.frageAbsagen', '"{was}" absagen.\n\nGrund (optional, wird allen angezeigt):',
          { was: offen.titel })),
        platzhalter: t('grp.absageGrundPh', 'z.B. zu wenig Schnee'),
        ja: t('grp.absagenKurz', 'Absagen'),
        mehrzeilig: true, maxlength: 200,
      });
      if (grund === null) return;
      await terminAbsagen(aktiv.id, offen.id, grund);
    }
    /* beobachteTermine meldet die Änderung; die Detailansicht muss
       ihren eigenen Stand nachziehen. */
  } catch (e) {
    reportClientError('gruppe/absagen', e);
    await meldung({ titel: t('grp.f.allgemein', 'Das hat nicht geklappt.') });
  }
}

async function terminEntfernen() {
  if (!offen || !aktiv) return;
  if (!await frage({
    titel: t('grp.frageTerminWeg', '"{was}" wirklich löschen?', { was: offen.titel }),
    ja: t('grp.loeschenKurz', 'Löschen'), gefahr: true,
  })) return;
  try {
    await terminLoeschen(aktiv.id, offen.id);
    detailSchliessen();
  } catch (e) {
    reportClientError('gruppe/termin-loeschen', e);
    await meldung({ titel: t('grp.f.terminLoeschen', 'Der Termin konnte nicht gelöscht werden.') });
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
  /* Ein Ende am Tag erst, wenn es einen Anfang gibt — sonst stünde neben
     "Von" wieder eine leere Hälfte. */
  zeige('grpBisZeit', art !== 'lager' && !!($('fZeit').value || $('fBisZeit').value));
  /* Die Disziplin hängt an der GRUPPENART, nicht an der Terminart. Ein
     Hyrox-Wettkampf im Gym hat ein Ergebnis, aber keinen FIS-Faktor —
     das Feld stünde dort sinnlos da. */
  zeige('grpDisziplin', art === 'rennen' && kenntDisziplinen(aktiv?.art));
}

/* Welche Art gewaehlt ist: eine der drei, oder 'eigene'. Die eigene
   verhaelt sich wie ein Training — ein Tag, eine Uhrzeit — und traegt
   ihr eigenes Wort. fArt haelt immer die Art fuer den Rest des Codes. */
let artWahl = 'training';

function setzeArtWahl(wahl) {
  artWahl = wahl;
  $('fArt').value = wahl === 'eigene' ? 'training' : wahl;
  document.querySelectorAll('#fArtWahl [data-art-wahl]').forEach(k => {
    k.setAttribute('aria-checked', k.dataset.artWahl === wahl ? 'true' : 'false');
  });
  zeige('grpBezeichnung', wahl === 'eigene');
  formAnpassen();
}

/* Der Termin im Formular: null für einen neuen. Bearbeiten gibt es seit
   v.35.50.0 — bis dahin liess sich ein Termin nur löschen und neu
   anlegen, die Reise dagegen bearbeiten. */
let bearbeitet = null;

/* ── Die Seite zum Termin ──────────────────────────────────────────
   Einfügen, Datei oder Link — wie bei der Reise. Aus HTML (eingefügt
   oder als Datei) liest Firn das Programm nach Tagen; ein Link wird nur
   geöffnet. */
let seiteArt = 'html';
let seiteDateiHtml = '';

function setzeSeiteArt(art) {
  seiteArt = art;
  document.querySelectorAll('#fSeiteArt [data-seite-art]').forEach(k => {
    k.setAttribute('aria-pressed', String(k.dataset.seiteArt === art));
  });
  document.querySelectorAll('#grpSeite [data-seite-teil]').forEach(teil => {
    teil.hidden = teil.dataset.seiteTeil !== art;
  });
  seiteRueckmeldung();
}

function seiteRueckmeldung() {
  const feld = $('fSeiteStatus');
  feld.className = 'prog-rueckmeldung';
  if (seiteArt === 'link') {
    feld.textContent = t('prog.hinweisLink', 'Die Seite wird verlinkt und lässt sich öffnen. Programmpunkte liest Firn aus eingefügtem HTML oder einer Datei.');
    return;
  }
  const html = seiteArt === 'datei' ? seiteDateiHtml : $('fSeiteHtml').value;
  if (!html.trim()) {
    feld.textContent = t('prog.hinweis', 'Firn liest Tage und Programmpunkte heraus; die Seite selbst bleibt öffnbar. Skripte laufen nicht mit.');
    return;
  }
  const { punkte, tage } = seiteLesen(html, $('fVon').value);
  if (punkte.length) {
    feld.classList.add('is-gut');
    feld.textContent = t('prog.erkannt', 'Erkannt: {n} Programmpunkte an {m} Tagen.', { n: punkte.length, m: tage });
  } else {
    feld.classList.add('is-warnung');
    feld.textContent = t('prog.nichtsErkannt', 'Die Seite wird gespeichert und lässt sich öffnen, aber Programmpunkte waren keine zu finden.');
  }
}

function seiteZeigenImFormular(an) {
  zeige('grpSeite', an);
  $('btnSeite').hidden = an;
  if (an) seiteRueckmeldung();
}

/** Was im Formular als Seite steht: { planHtml, planUrl }. Zugeklappt
 *  bleibt die Seite, wie sie war. */
function seiteAusFormular() {
  if ($('grpSeite').hidden) {
    return { planHtml: bearbeitet?.planHtml || '', planUrl: bearbeitet?.planUrl || '' };
  }
  if (seiteArt === 'link') return { planHtml: '', planUrl: $('fSeiteLink').value.trim() };
  if (seiteArt === 'datei') return { planHtml: seiteDateiHtml || bearbeitet?.planHtml || '', planUrl: '' };
  return { planHtml: $('fSeiteHtml').value.trim(), planUrl: '' };
}

function formOeffnen(datum, termin = null) {
  bearbeitet = termin && typeof termin === 'object' && termin.id ? termin : null;
  /* Was die Gruppe anbietet, entscheidet die Gruppenart: eine Familie
     braucht keinen Wettkampf-Eintrag. Die Knoepfe entstehen darum im
     Code und nicht im Markup — mit der Farbe ihrer Art, damit man sie
     in der Liste wiedererkennt. */
  $('fArtWahl').innerHTML = [
    ...artenFuer(aktiv?.art).map(a => `
      <button class="wahl__knopf" type="button" role="radio" aria-checked="false"
              data-art-wahl="${a}" data-bereich="${BEREICH_DER_ART[a] || ''}">${escHtml(artWort(a, aktiv?.art))}</button>`),
    `<button class="wahl__knopf" type="button" role="radio" aria-checked="false"
             data-art-wahl="eigene">${escHtml(t('grp.artEigene', 'Eigene …'))}</button>`,
  ].join('');
  $('formTitel').textContent = bearbeitet
    ? t('prog.terminBearbeiten', 'Termin bearbeiten')
    : t('grp.terminTitel', 'Neuer Termin');

  const x = bearbeitet || {};
  $('fBezeichnung').value = x.bezeichnung || '';
  if (bearbeitet) {
    /* Die Art bleibt, wie sie ist (die Regel lässt sie nicht ändern) —
       nur ihr eigenes Wort lässt sich anpassen. */
    artWahl = x.bezeichnung ? 'eigene' : x.art;
    $('fArt').value = x.art;
    zeige('grpBezeichnung', !!x.bezeichnung);
  } else {
    setzeArtWahl(artenFuer(aktiv?.art)[0] || 'training');
  }
  zeige('grpArt', !bearbeitet);
  $('fTitel').value = x.titel || '';
  /* "+" an einem Tag der Woche bringt sein Datum mit; der Knopf unter
     der Woche bringt ein Klick-Ereignis, und dann gilt heute. */
  $('fVon').value = x.von || (typeof datum === 'string' && datum ? datum : isoTag());
  $('fBis').value = x.bis || '';
  $('fZeit').value = x.zeit || '';
  $('fBisZeit').value = x.bisZeit || '';
  $('fDisziplin').value = x.disziplin || '';
  $('fOrt').value = x.ort || '';
  $('fNotiz').value = x.notiz || '';
  kalenderWahl(x.kalender || '');

  seiteDateiHtml = '';
  $('fSeiteDatei').value = '';
  $('fSeiteDateiName').textContent = t('prog.dateiWaehlen', 'HTML-Datei wählen');
  $('fSeiteHtml').value = x.planHtml || '';
  $('fSeiteLink').value = x.planUrl || '';
  setzeSeiteArt(x.planUrl && !x.planHtml ? 'link' : 'html');
  seiteZeigenImFormular(!!(x.planHtml || x.planUrl));

  $('formFehler').hidden = true;
  formAnpassen();
  vorschlaegeFuellen();
  zeichneHaeufige();
  zeige('secForm', true);
  zeige('secWoche', false);
  zeige('secDetail', false);
  $('fTitel').focus();
}

function formSchliessen() {
  zeige('secForm', false);
  /* Wer aus einem Termin heraus bearbeitet hat, kommt dorthin zurück. */
  if (bearbeitet && offen) {
    bearbeitet = null;
    detailOeffnen(offen.id);
    zeige('secDetail', true);
    return;
  }
  bearbeitet = null;
  zeige('secWoche', !!aktiv);
}

function formLesen() {
  const art = $('fArt').value;
  return {
    art,
    bezeichnung: artWahl === 'eigene' ? $('fBezeichnung').value.trim() : null,
    titel: $('fTitel').value.trim(),
    von: $('fVon').value,
    /* Bis und Zeit nur dort, wo das Feld auch sichtbar war — sonst
       schleppt ein Training ein Enddatum mit, das niemand eingegeben
       hat, weil der Browser einen alten Wert behalten hat. */
    bis: art === 'lager' ? ($('fBis').value || null) : null,
    zeit: art === 'lager' ? null : ($('fZeit').value || null),
    bisZeit: art === 'lager' || !$('fZeit').value ? null : ($('fBisZeit').value || null),
    disziplin: art === 'rennen' ? ($('fDisziplin').value || null) : null,
    ort: $('fOrt').value.trim() || null,
    notiz: $('fNotiz').value.trim() || null,
    kalender: $('fKalender')?.value || null,
  };
}

function formFehler(text) {
  const feld = $('formFehler');
  feld.textContent = text;
  feld.hidden = false;
}

async function terminSpeichern() {
  if (!aktiv) return;
  const entwurf = formLesen();

  /* "Eigene" ohne Wort waere ein Training, das so tut, als sei es etwas
     anderes. Das Feld steht offen da — also danach fragen. */
  if (artWahl === 'eigene' && !entwurf.bezeichnung) {
    formFehler(t('grp.f.bezeichnung', 'Wie heisst diese Art von Termin?'));
    $('fBezeichnung').focus();
    return;
  }

  const fehler = pruefe(entwurf);
  if (fehler.length) { formFehler(fehler[0]); return; }

  const seite = seiteAusFormular();
  if (seite.planUrl && !sichereAdresse(seite.planUrl)) {
    formFehler(t('prog.f.link', 'Der Link muss mit https:// beginnen.'));
    return;
  }
  if (seite.planHtml.length > SEITE_MAX) {
    formFehler(t('prog.f.gross', 'Die Seite ist zu gross — verlinke sie lieber.'));
    return;
  }
  /* Eine neue oder geänderte Seite ersetzt die Punkte vom letzten
     Einlesen; von Hand angelegte bleiben (programmMitSeite). */
  const vorher = bearbeitet?.programm || [];
  const seiteNeu = seite.planHtml && seite.planHtml !== (bearbeitet?.planHtml || '');
  const programm = seiteNeu ? programmMitSeite(vorher, seite.planHtml, entwurf.von) : vorher;
  const daten = { ...entwurf, ...seite, programm };

  const btn = $('btnSpeichern');
  btn.disabled = true;
  try {
    if (bearbeitet) {
      await terminAendern(aktiv.id, bearbeitet.id, daten);
      /* Der eigene Stand gleich, ohne auf das Abo zu warten. */
      Object.assign(bearbeitet, daten);
    } else {
      const id = await terminAnlegen(aktiv.id, user.uid, daten);
      /* Mit Programm geht der neue Termin gleich auf — dort sieht man,
         was aus der Seite geworden ist. Sonst meldet beobachteTermine
         ihn in der Woche. */
      if (programm.length && id) terminAusAdresse = id;
    }
    formSchliessen();
  } catch (e) {
    reportClientError('gruppe/termin', e);
    formFehler(t('grp.f.terminSpeichern', 'Der Termin konnte nicht gespeichert werden.'));
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
  zeige('secWoche', false);

  zeichneErgebnisse();

  /* Mit wie viel Gewicht wirklich trainiert wird (Michel, v.35.50.0):
     die Leitung sieht es hier, statt eine Nachricht zu bekommen — und
     die Person selbst ihren eigenen Verlauf. */
  const darfGewichte = darfErfassen || ichSelbst;
  zeige('secGewichte', false);
  if (darfGewichte) zeichneGewichte(person.uid);

  /* Den Kontakt sehen die Leitung und die Person selbst — sonst
     niemand. Die Regeln lehnen jede andere Abfrage ab; hier wird sie
     gar nicht erst gestellt. */
  const darfKontakt = darfErfassen || ichSelbst;
  zeige('secKontakt', darfKontakt);
  if (darfKontakt) zeichneKontakt();
}

/* ── Gewichte ──────────────────────────────────────────────────────
   Je Übung die letzten Tage, an denen jemand Sätze eingetragen hat:
   "Kniebeuge vorne — 14. Sept.: 9× 60 kg · 9× 60 kg · 7× 62 kg". Die
   Namen kommen aus den Plänen der Gruppe, die Werte aus dem Protokoll. */
async function zeichneGewichte(uid) {
  let liste = [];
  try { liste = gewichtsVerlauf(plaene, await ladeProtokolle(aktiv.id, uid), { tage: 3 }); }
  catch (e) { reportClientError('gruppe/gewichte', e); }
  if (person?.uid !== uid) return;
  const kg = w => (/^\d+([.,]\d+)?$/.test(w) ? `${w} kg` : w);
  const satz = s => [s.reps && `${s.reps}×`, s.weight && kg(s.weight)].filter(Boolean).join(' ');
  const tag = d => kurzDatum(d);
  $('listGewichte').innerHTML = liste.slice(0, 12).map(u => `
    <div class="row row--static">
      <span class="row__body">
        <span class="row__title">${escHtml(u.name)}</span>
        ${u.tage.map((d, i) => `<span class="row__sub">${escHtml(tag(d.datum))}: ${escHtml(d.sets.map(satz).join(' · '))}</span>`).join('')}
      </span>
    </div>`).join('');
  zeige('secGewichte', liste.length > 0);
}

/* ── Kontakt ───────────────────────────────────────────────────────
   Alles, was ein Trainer ueber eine Person wissen muss: Geburtsdatum,
   Telefon, Adresse, eine Notiz (Allergie, Medikamente), Eltern. */
let kontakt = null;       // die Karte der gerade geoeffneten Person

/* Eine Nummer wird zu einem tel:-Link nur aus Ziffern, Plus und
   Leerzeichen; eine Adresse zu mailto: nur, wenn sie eine ist. Beides
   kommt aus einem Formular, das jemand anders ausgefuellt hat. */
const telLink = nr => {
  const sauber = String(nr || '').replace(/[^\d+]/g, '');
  return sauber.length >= 3 ? `tel:${sauber}` : '';
};
const mailLink = adr => (istEmail(adr) ? `mailto:${encodeURIComponent(String(adr).trim())}` : '');

/* Gezeichnete Symbole wie in jeder anderen Zeile der App — kein
   Sternchen fuer den Geburtstag. Eltern tragen ihren Anfangsbuchstaben. */
const KONTAKT_SYMBOLE = {
  telefon: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  geburt: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  adresse: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  notiz: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
};

function kontaktZeile({ icon, titel, sub = '', link = '' }) {
  const bild = KONTAKT_SYMBOLE[icon]
    ? `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${KONTAKT_SYMBOLE[icon]}</svg>`
    : escHtml(icon);
  const innen = `
    <span class="row__icon">${bild}</span>
    <span class="row__body">
      <span class="row__title">${escHtml(titel)}</span>
      ${sub ? `<span class="row__sub">${escHtml(sub)}</span>` : ''}
    </span>`;
  return link
    ? `<a class="row" href="${escHtml(link)}" data-bereich="msg">${innen}</a>`
    : `<div class="row row--still" data-bereich="msg">${innen}</div>`;
}

async function zeichneKontakt() {
  const liste = $('kontaktAnzeige');
  const fuer = person;
  liste.innerHTML = '';
  try {
    kontakt = await ladeKontakt(aktiv.id, fuer.uid);
  } catch (e) {
    reportClientError('gruppe/kontakt', e);
    kontakt = { uid: fuer.uid };
  }
  /* Wer inzwischen jemand anderen geoeffnet hat, bekommt nicht die
     Karte des Vorigen. */
  if (person?.uid !== fuer.uid) return;

  const zeilen = [];
  if (kontakt.telefon) zeilen.push(kontaktZeile({ icon: 'telefon', titel: kontakt.telefon, sub: t('grp.kTelefon', 'Telefon'), link: telLink(kontakt.telefon) }));
  if (kontakt.email) zeilen.push(kontaktZeile({ icon: 'mail', titel: kontakt.email, sub: t('grp.kEmail', 'E-Mail'), link: mailLink(kontakt.email) }));
  if (kontakt.geburt) {
    const d = new Date(`${kontakt.geburt}T00:00:00`);
    const datum = window.TVZAI18n?.format?.date(d) ?? d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
    zeilen.push(kontaktZeile({ icon: 'geburt', titel: datum, sub: t('grp.kGeburt', 'Geburtsdatum') }));
  }
  if (kontakt.adresse) zeilen.push(kontaktZeile({ icon: 'adresse', titel: kontakt.adresse, sub: t('grp.kAdresse', 'Adresse') }));
  if (kontakt.notiz) zeilen.push(kontaktZeile({ icon: 'notiz', titel: kontakt.notiz, sub: t('grp.kNotiz', 'Wichtig für die Trainer') }));
  for (const e of kontakt.eltern || []) {
    const wer = [e.name, e.beziehung].filter(Boolean).join(' · ') || t('grp.elternteil', 'Elternteil');
    const wie = [e.email, e.telefon].filter(Boolean).join(' · ');
    zeilen.push(kontaktZeile({
      icon: (e.name || '·').slice(0, 1).toUpperCase(),
      titel: wer,
      sub: wie,
      link: mailLink(e.email) || telLink(e.telefon),
    }));
  }

  liste.innerHTML = zeilen.length
    ? zeilen.join('')
    : `<p class="empty-hint">${escHtml(t('grp.kontaktLeer', 'Noch keine Kontaktdaten.'))}</p>`;
}

/* ── Das Formular ──────────────────────────────────────────────────*/
function elternZeile(e = {}, i = 0) {
  return `
    <div class="eltern__karte" data-eltern="${i}">
      <div class="form-row">
        <input class="form-input" data-feld="name" type="text" maxlength="80" autocomplete="off"
               value="${escHtml(e.name || '')}" placeholder="${escHtml(t('grp.elternName', 'Name'))}"
               aria-label="${escHtml(t('grp.elternName', 'Name'))}" />
        <input class="form-input" data-feld="beziehung" type="text" maxlength="40" autocomplete="off"
               value="${escHtml(e.beziehung || '')}" placeholder="${escHtml(t('grp.elternBeziehung', 'Mutter, Vater …'))}"
               aria-label="${escHtml(t('grp.elternBeziehungLabel', 'Beziehung'))}" />
      </div>
      <div class="form-row">
        <input class="form-input" data-feld="email" type="email" maxlength="120" autocomplete="off"
               value="${escHtml(e.email || '')}" placeholder="${escHtml(t('grp.kEmail', 'E-Mail'))}"
               aria-label="${escHtml(t('grp.kEmail', 'E-Mail'))}" />
        <input class="form-input" data-feld="telefon" type="tel" maxlength="30" autocomplete="off"
               value="${escHtml(e.telefon || '')}" placeholder="${escHtml(t('grp.kTelefon', 'Telefon'))}"
               aria-label="${escHtml(t('grp.kTelefon', 'Telefon'))}" />
      </div>
      <button class="backlink eltern__weg" type="button" data-eltern-weg="${i}">${escHtml(t('grp.elternWeg', 'Entfernen'))}</button>
    </div>`;
}

function elternLesen() {
  return [...document.querySelectorAll('#kEltern [data-eltern]')].map(karte => {
    const feld = name => karte.querySelector(`[data-feld="${name}"]`)?.value || '';
    return { name: feld('name'), beziehung: feld('beziehung'), email: feld('email'), telefon: feld('telefon') };
  });
}

function elternZeichnen(liste) {
  $('kEltern').innerHTML = liste.map((e, i) => elternZeile(e, i)).join('');
  $('btnElternNeu').hidden = liste.length >= ELTERN_MAX;
}

function kontaktFormOeffnen() {
  if (!person || !kontakt) return;
  const k = kontakt;
  $('kontaktTitel').textContent = `${t('grp.kontakt', 'Kontakt')} · ${person.name || ''}`;
  $('kGeburt').value = k.geburt || '';
  $('kTelefon').value = k.telefon || '';
  $('kEmail').value = k.email || '';
  $('kAdresse').value = k.adresse || '';
  $('kNotiz').value = k.notiz || '';
  /* Ein leeres Elternteil steht schon da, wenn noch keins erfasst ist —
     der haeufigste Grund, das Formular zu oeffnen. */
  elternZeichnen(k.eltern?.length ? k.eltern : [{}]);
  $('kontaktFehler').hidden = true;
  zeige('secPerson', false);
  zeige('secKontaktForm', true);
}

function kontaktFormSchliessen() {
  zeige('secKontaktForm', false);
  zeige('secPerson', !!person);
}

async function kontaktFormSpeichern(event) {
  event?.preventDefault();
  if (!person || !aktiv) return;
  const neu = kontaktSauber({
    geburt: $('kGeburt').value,
    telefon: $('kTelefon').value,
    email: $('kEmail').value,
    adresse: $('kAdresse').value,
    notiz: $('kNotiz').value,
    eltern: elternLesen(),
  });

  const fehler = pruefeKontakt(neu);
  const feld = $('kontaktFehler');
  if (fehler.length) {
    feld.textContent = fehler[0];
    feld.hidden = false;
    return;
  }

  const btn = $('btnKontaktSpeichern');
  btn.disabled = true;
  try {
    await kontaktSpeichern(aktiv.id, person.uid, neu, user.uid);
    kontakt = { ...neu, uid: person.uid };
    kontaktFormSchliessen();
    zeichneKontakt();
  } catch (e) {
    reportClientError('gruppe/kontakt-speichern', e);
    feld.textContent = t('grp.f.kontakt', 'Der Kontakt konnte nicht gespeichert werden.');
    feld.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ── Der Verteiler ─────────────────────────────────────────────────
   Eine Mail an alle, nur an die Eltern oder ohne sie — ueber das
   eigene Mailprogramm, alle Adressen im BCC. Wer keine gueltige
   Adresse hat, wird genannt, damit man sie nachtraegt. */
let verteilerKontakte = [];
let verteilerWer = 'alle';

function verteilerZeichnen() {
  const adressen = verteiler(verteilerKontakte, verteilerWer);
  document.querySelectorAll('#verteilerWahl [data-wer]').forEach(k => {
    k.setAttribute('aria-checked', k.dataset.wer === verteilerWer ? 'true' : 'false');
  });

  $('verteilerZahl').textContent = adressen.length
    ? tPlural('grp.adressen', adressen.length, 'Adresse', 'Adressen')
    : t('grp.keineAdressen', 'Noch keine E-Mail-Adressen hinterlegt. Sie stehen in der Kontaktkarte jeder Person.');

  const fehlen = ohneAdresse(mitglieder, verteilerKontakte, verteilerWer);
  const fehlt = $('verteilerFehlt');
  fehlt.textContent = fehlen.length && adressen.length
    ? t('grp.ohneAdresse', 'Ohne Adresse: {wer}', { wer: fehlen.map(m => m.name || m.uid).join(', ') })
    : '';
  fehlt.hidden = !fehlt.textContent;

  const link = $('lnkVerteiler');
  link.href = mailtoAdresse(adressen, { betreff: $('verteilerBetreff').value.trim() });
  link.classList.toggle('is-leer', !adressen.length);
  link.setAttribute('aria-disabled', adressen.length ? 'false' : 'true');
  $('btnVerteilerKopieren').disabled = !adressen.length;
}

async function verteilerOeffnen() {
  if (!aktiv || !leitet(aktiv.meineRolle)) return;
  $('btnVerteilerKopieren').textContent = t('grp.adressenKopieren', 'Adressen kopieren');
  $('verteilerBetreff').value = aktiv.name || '';
  try {
    verteilerKontakte = await ladeKontakte(aktiv.id);
  } catch (e) {
    reportClientError('gruppe/verteiler', e);
    verteilerKontakte = [];
  }
  verteilerZeichnen();
  zeige('secMitglieder', false);
  zeige('secWoche', false);
  zeige('secAktionen', false);
  zeige('secVerteiler', true);
}

function verteilerSchliessen() {
  zeige('secVerteiler', false);
  zeige('secMitglieder', !!aktiv);
  zeige('secWoche', !!aktiv);
  zeige('secAktionen', !!aktiv && leitet(aktiv.meineRolle));
}

async function verteilerKopieren() {
  const adressen = verteiler(verteilerKontakte, verteilerWer);
  if (!adressen.length) return;
  const btn = $('btnVerteilerKopieren');
  try {
    await navigator.clipboard.writeText(adressen.join(', '));
    btn.textContent = t('grp.kopiert', 'Kopiert');
    setTimeout(() => { btn.textContent = t('grp.adressenKopieren', 'Adressen kopieren'); }, 1600);
  } catch {
    /* Ohne Zwischenablage (aelteres iOS, kein sicherer Kontext): die
       Adressen stehen dann im Dialog zum Markieren. */
    await meldung({ titel: t('grp.adressen.other', '{n} Adressen', { n: adressen.length }), text: adressen.join(', ') });
  }
}

function personSchliessen() {
  person = null;
  personErgebnisse = [];
  zeige('secErgForm', false);
  zeige('secPerson', false);
  zeige('secMitglieder', !!aktiv);
  zeige('secWoche', !!aktiv);
}

async function rolleAendern(rolle) {
  if (!person || !aktiv || person.rolle === rolle) return;
  try {
    await rolleSetzen(aktiv.id, person.uid, rolle);
    await zeichneMitglieder();
    personOeffnen(person.uid);
  } catch (e) {
    reportClientError('gruppe/rolle', e);
    await meldung({ titel: t('grp.f.rolle', 'Die Rolle konnte nicht geändert werden.') });
  }
}

async function personEntfernen() {
  if (!person || !aktiv) return;
  const name = person.name || person.uid;
  if (!await frage({
    titel: t('grp.frageMitgliedWeg', '{wer} wirklich aus der Gruppe entfernen?', { wer: name }),
    ja: t('grp.entfernenKurz', 'Entfernen'), gefahr: true,
  })) return;
  try {
    await mitgliedEntfernen(aktiv.id, person.uid);
    personSchliessen();
    await zeichneMitglieder();
  } catch (e) {
    reportClientError('gruppe/entfernen', e);
    await meldung({ titel: t('grp.f.entfernen', 'Das Mitglied konnte nicht entfernt werden.') });
  }
}

async function leitungUebergeben() {
  if (!person || !aktiv) return;
  const name = person.name || person.uid;
  /* Eine Übergabe ist nicht rückgängig zu machen: danach bist du nicht
     mehr der Kopf und kannst sie nicht zurückholen. Das gehört gesagt,
     bevor jemand tippt. */
  if (!await frage({
    ...geteilt(t('grp.frageUebergabe',
      'Die Leitung an {wer} übergeben?\n\n'
      + 'Danach bist du nur noch Trainer und kannst die Leitung nicht '
      + 'selbst zurückholen.', { wer: name })),
    ja: t('grp.uebergebenKurz', 'Übergeben'), gefahr: true,
  })) return;

  try {
    await uebergeben(aktiv.id, person.uid);
    personSchliessen();
    /* beobachteMeineGruppen meldet die neue Rolle von selbst; die Seite
       zeichnet sich daraufhin mit den passenden Rechten neu. */
  } catch (e) {
    reportClientError('gruppe/uebergeben', e);
    await meldung({ titel: t('grp.f.uebergabe', 'Die Übergabe hat nicht geklappt.') });
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
  const code = await eingabe({
    titel: t('grp.beitretenTitel', 'Einer Gruppe beitreten'),
    text: t('grp.beitretenText', 'Den Code bekommst du von deinem Trainer oder aus der Einladung.'),
    platzhalter: 'K7Q3-M9XP',
    ja: t('grp.beitretenKurz', 'Beitreten'),
    /* Lang genug für den ganzen Link — wer ihn einfügt statt des Codes,
       soll trotzdem hineinkommen (codeSauber in einladung.js). */
    maxlength: 300, gross: true,
  });
  if (code === null) return;
  const sauber = code.trim();
  if (!sauber) return;

  /* Der Knopf steht im leeren Zustand; von "mit Code beitreten" unten
     aus gibt es ihn nicht sichtbar — dann eben ohne Sperre. */
  const btn = $('btnBeitreten');
  if (btn) btn.disabled = true;
  try {
    const gid = await beitreten(sauber, user.uid);
    aktiveGruppeSetzen(gid);
  } catch (e) {
    reportClientError('gruppe/beitreten', e);
    await meldung({
      titel: t('grp.f.beitritt', 'Der Beitritt hat nicht geklappt.'),
      text: e?.message || '',
    });
  } finally {
    if (btn) btn.disabled = false;
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
    if (aktiv.icsToken && !await frage({
      ...geteilt(t('grp.frageAboNeu',
        'Es gibt schon ein Abo für diese Gruppe.\n\n'
        + 'Ein neues zu erzeugen macht die alte Adresse ungültig — wer sie '
        + 'abonniert hat, sieht die Termine nicht mehr.')),
      ja: t('grp.aboNeuKurz', 'Neu erzeugen'), gefahr: true,
    })) {
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

/* ── Einladen (v.35.53.0) ─────────────────────────────────────────
   Michel: "ein Link zum Anmelden direkt mit Code, aber gekürzt … über
   den Firn-Chat verschicken … auf Teilen, dann das Teilen-Menü öffnen
   und gleich an mehrere schicken, WhatsApp-Gruppe, whatever. Wichtig
   ist, dass der Code mal abläuft." Bis dahin: ein nackter Code aus 24
   Hexzeichen, ohne Ablauf, in die Zwischenablage.

   Jetzt eine Karte mit dem kurzen Link (einladung.js), dem Code zum
   Abtippen und bis wann er gilt; darunter Teilen (das Menü des Telefons),
   im Firn-Chat senden (an mehrere) und Kopieren. Eine noch gültige
   Einladung wird wieder gezeigt statt neu angelegt. */

let einladung = null;   // { code, bis }

async function einladen() {
  if (!aktiv) return;
  const btn = $('btnEinladen');
  btn.disabled = true;
  try {
    let offene = null;
    try {
      /* Mindestens noch einen Tag gültig — sonst verschickt man einen
         Link, der morgen nichts mehr taugt. */
      offene = (await gruppenEinladungen(aktiv.id))
        .find(e => e.bis.getTime() - Date.now() > 86400000) || null;
    } catch { /* offline oder alte Regel: dann eben eine neue */ }
    einladung = offene ? { code: offene.code, bis: offene.bis } : await einladungErzeugen(aktiv.id, user.uid);
    einladungZeigen();
  } catch (e) {
    reportClientError('gruppe/einladen', e);
    await meldung({ titel: t('grp.f.code', 'Der Code konnte nicht erzeugt werden.') });
  } finally {
    btn.disabled = false;
  }
}

function einladungZeigen(hinweis = '') {
  const karte = $('einladung');
  if (!karte) return;
  karte.hidden = !einladung;
  $('einladungText').hidden = !hinweis;
  $('einladungText').textContent = hinweis;
  if (!einladung) return;
  /* Ohne https:// — kürzer zum Lesen, der Link selbst bleibt ganz. */
  $('einladungLink').textContent = einladungsLink(einladung.code).replace(/^https?:\/\//, '');
  $('einladungMeta').textContent = t('einl.meta', 'Code {code} · gilt bis {bis}', {
    code: codeZeigen(einladung.code),
    bis: einladung.bis.toLocaleDateString('de-CH', { day: 'numeric', month: 'long' }),
  });
}

const einladungsNachricht = () => einladungsText({
  gruppe: aktiv?.name, link: einladungsLink(einladung.code), bis: einladung.bis, t,
});

async function einladungTeilen() {
  if (!einladung) return;
  /* Das Teilen-Menü des Telefons: WhatsApp, Nachrichten, Mail — dort
     wählt man auch mehrere oder eine ganze Gruppe. Nur der Text, der Link
     steht darin; mit url dazu setzte iOS ihn zweimal hinein. */
  if (navigator.share) {
    try { await navigator.share({ title: aktiv?.name || 'Firn', text: einladungsNachricht() }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  await einladungKopieren();
}

async function einladungKopieren() {
  if (!einladung) return;
  try {
    await navigator.clipboard.writeText(einladungsNachricht());
    einladungZeigen(t('einl.kopiert', 'Kopiert — mit dem Namen der Gruppe und bis wann der Link gilt.'));
  } catch {
    /* Ohne Zwischenablage (älteres iOS, kein sicherer Kontext) steht
       der Link ja lesbar in der Karte. */
    einladungZeigen(t('einl.nichtKopiert', 'Kopieren ging nicht — der Link steht oben.'));
  }
}

/* An wen im Firn-Chat: wen man aus den eigenen Gruppen kennt und mit
   wem man schon schreibt — ohne die, die schon in dieser Gruppe sind. */
async function einladungImChat() {
  if (!einladung || !aktiv) return;
  const btn = $('btnEinladungChat');
  btn.disabled = true;
  try {
    const [bekannte, partner] = await Promise.all([
      kontakte(user.uid, { kreis: imKreis(meinProfil) }).catch(() => []),
      gespraechspartner(user.uid),
    ]);
    const drin = new Set(mitglieder.map(m => m.uid));
    const nach = new Map();
    for (const b of bekannte) nach.set(b.uid, { uid: b.uid, name: b.name, text: (b.gruppen || []).join(', ') });
    for (const p of partner) if (!nach.has(p.uid) && p.name) nach.set(p.uid, { uid: p.uid, name: p.name, text: '' });
    const liste = [...nach.values()]
      .filter(p => p.uid !== user.uid && !drin.has(p.uid))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const wahl = await mehrere({
      titel: t('einl.chatTitel', 'Im Chat senden'),
      text: t('einl.chatText', 'Wer soll den Link bekommen?'),
      optionen: liste.map(p => ({ wert: p, titel: p.name, text: p.text })),
      ja: t('einl.senden', 'Senden'),
      leer: t('einl.chatLeer', 'Alle, die du im Chat erreichst, sind schon in der Gruppe. Teile den Link stattdessen.'),
    });
    if (!wahl?.length) return;
    const { gesendet, fehler } = await anMehrere({
      ich: user.uid, meinName: meinProfil.displayName || '', empfaenger: wahl, text: einladungsNachricht(),
    });
    einladungZeigen(fehler
      ? t('einl.teilweise', 'An {n} gesendet, an {f} nicht.', { n: gesendet, f: fehler })
      : gesendet === 1
        ? t('einl.gesendetEins', 'An 1 Person gesendet.')
        : t('einl.gesendet', 'An {n} Personen gesendet.', { n: gesendet }));
  } catch (e) {
    reportClientError('gruppe/einladung-chat', e);
    einladungZeigen(t('einl.f.chat', 'Das Senden hat nicht geklappt.'));
  } finally {
    btn.disabled = false;
  }
}

async function einladungZurueckziehen() {
  if (!einladung) return;
  if (!await frage({
    titel: t('einl.frageWeg', 'Einladung zurückziehen?'),
    text: t('einl.frageWegText', 'Der Link führt danach nirgends mehr hin. Wer schon beigetreten ist, bleibt in der Gruppe.'),
    ja: t('einl.zurueckziehen', 'Zurückziehen'), gefahr: true,
  })) return;
  try {
    await einladungZuruecknehmen(einladung.code);
    einladung = null;
    einladungZeigen();
  } catch (e) {
    reportClientError('gruppe/einladung-weg', e);
    await meldung({ titel: t('einl.f.weg', 'Die Einladung liess sich nicht zurückziehen.') });
  }
}

/* ── Start ─────────────────────────────────────────────────────────*/

(async function () {
  try { user = await requireAuth('../login.html'); }
  catch { return; }

  wireOfflineBanner();

  let profile = {};
  try { profile = await getProfile(user); } catch { /* Kopf bleibt schlicht */ }
  meinProfil = profile || {};
  /* Wer nur je die Gruppe öffnet, soll in der Kaderliste trotzdem mit
     Namen stehen (personen.js). Still und im Hintergrund. */
  void eigeneKarte(user.uid, profile);

  /* Die Gruppe ist ein TAB, keine Unterseite: kein Zurueck-Pfeil. Er
     stand hier bis v.35.23.0 und am Laptop direkt neben dem
     Klappknopf der Leiste — zwei gleiche Winkel, zwei Bedeutungen.
     Die Einstellungen stehen im Konto, nicht als eigenes Zahnrad. */
  mountShell({
    variant: 'tab',
    title: t('nav.gruppe', 'Gruppe'),
    profile,
  });
  /* Nach mountShell: erst dann steht der Router (oben) bzw. die Brücke
     (im Rahmen), der die saubere Adresse gemeldet wird. */
  adresseAufraeumen();

  $('btnNeu')?.addEventListener('click', neueGruppe);
  $('btnEinladen')?.addEventListener('click', einladen);
  $('btnEinladungTeilen')?.addEventListener('click', einladungTeilen);
  $('btnEinladungChat')?.addEventListener('click', einladungImChat);
  $('btnEinladungKopieren')?.addEventListener('click', einladungKopieren);
  $('btnEinladungWeg')?.addEventListener('click', einladungZurueckziehen);
  $('btnAssistent')?.addEventListener('click', assistentSpeichern);
  $('gruppeFarbe')?.addEventListener('click', event => {
    const feld = event.target.closest('[data-farbe]');
    if (feld) farbeWaehlen(feld.dataset.farbe);
  });
  $('btnGruppeLoeschen')?.addEventListener('click', gruppeLoeschenFragen);
  $('btnGruppeEinst')?.addEventListener('click', einstOeffnen);
  $('btnGruppeEinstZurueck')?.addEventListener('click', einstSchliessen);
  $('btnGruppeKalender')?.addEventListener('click', kalenderAnlegen);
  $('gruppeKalenderName')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); kalenderAnlegen(); } });
  $('gruppeKalenderListe')?.addEventListener('click', e => {
    const weg = e.target.closest('[data-kalender-weg]');
    if (weg) kalenderLoeschen(weg.dataset.kalenderWeg);
  });
  $('btnAbo')?.addEventListener('click', aboErzeugen);
  $('btnTermin')?.addEventListener('click', formOeffnen);
  $('btnAbbrechen')?.addEventListener('click', formSchliessen);
  $('btnSpeichern')?.addEventListener('click', terminSpeichern);
  $('fArtWahl')?.addEventListener('click', event => {
    const wahl = event.target.closest('[data-art-wahl]')?.dataset.artWahl;
    if (wahl) setzeArtWahl(wahl);
  });
  $('neuArt')?.addEventListener('click', event => {
    const art = event.target.closest('[data-art]')?.dataset.art;
    if (art) setzeNeueArt(art);
  });
  $('formGruppeNeu')?.addEventListener('submit', gruppeErstellen);
  $('btnKontaktBearbeiten')?.addEventListener('click', kontaktFormOeffnen);
  $('btnKontaktZurueck')?.addEventListener('click', kontaktFormSchliessen);
  $('formKontakt')?.addEventListener('submit', kontaktFormSpeichern);
  $('btnElternNeu')?.addEventListener('click', () => {
    const liste = elternLesen();
    if (liste.length >= ELTERN_MAX) return;
    elternZeichnen([...liste, {}]);
    document.querySelector('#kEltern [data-eltern]:last-child [data-feld="name"]')?.focus();
  });
  $('kEltern')?.addEventListener('click', event => {
    const weg = event.target.closest('[data-eltern-weg]');
    if (!weg) return;
    const i = Number(weg.dataset.elternWeg);
    elternZeichnen(elternLesen().filter((_, n) => n !== i));
  });
  $('btnVerteiler')?.addEventListener('click', verteilerOeffnen);
  $('btnVerteilerZurueck')?.addEventListener('click', verteilerSchliessen);
  $('verteilerWahl')?.addEventListener('click', event => {
    const wer = event.target.closest('[data-wer]')?.dataset.wer;
    if (wer) { verteilerWer = wer; verteilerZeichnen(); }
  });
  $('verteilerBetreff')?.addEventListener('input', verteilerZeichnen);
  $('btnVerteilerKopieren')?.addEventListener('click', verteilerKopieren);
  /* Ein leerer Verteiler oeffnet kein leeres Mailprogramm. */
  $('lnkVerteiler')?.addEventListener('click', event => {
    if ($('lnkVerteiler').getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
  $('btnGruppeNeuZurueck')?.addEventListener('click', neueGruppeSchliessen);

  /* Ein Zuhörer auf der Liste statt einer pro Zeile: die Zeilen werden
     bei jeder Änderung neu gezeichnet, einzeln gebundene Zuhörer wären
     nach dem ersten Neuzeichnen ins Leere gebunden. */
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

  /* Was der Termin von der Reise übernommen hat (v.35.50.0). */
  $('btnBearbeiten')?.addEventListener('click', () => { if (offen) formOeffnen(null, offen); });
  $('btnProgrammNeu')?.addEventListener('click', () => {
    programmLeerZeigen = true;
    zeichneProgramm();
    $('pTitel')?.focus();
  });
  $('btnProgrammOeffnen')?.addEventListener('click', () => { if (offen) programmZeigen(programmOptionen()); });
  $('listProgramm')?.addEventListener('click', event => {
    const weg = event.target.closest('[data-punkt-weg]');
    if (weg) { punktEntfernen(weg.dataset.punktWeg); return; }
    const punkt = event.target.closest('[data-punkt]');
    if (punkt) punktBearbeiten(punkt.dataset.punkt);
  });
  $('btnPunkt')?.addEventListener('click', punktSpeichern);
  $('btnPunktAbbrechen')?.addEventListener('click', punktAbbrechen);
  $('pTitel')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); punktSpeichern(); }
  });
  $('btnAbfahrten')?.addEventListener('click', abfahrtenOeffnen);
  $('btnAbfahrtenAbbrechen')?.addEventListener('click', () => { abfahrtenBearbeiten = false; zeichneAbfahrten(); });
  $('btnAbfahrtenSpeichern')?.addEventListener('click', abfahrtenSpeichern);
  $('abfahrtAlleZeit')?.addEventListener('input', event => abfahrtFuerAlle('zeit', event.target.value));
  $('abfahrtAlleOrt')?.addEventListener('input', event => abfahrtFuerAlle('ort', event.target.value));
  $('btnPacklisteNeu')?.addEventListener('click', () => {
    packlisteLeerZeigen = true;
    zeichnePackliste();
    $('packName')?.focus();
  });
  $('packNeu')?.addEventListener('submit', packpunktHinzufuegen);
  $('listPackliste')?.addEventListener('click', packAktion);
  $('fHaeufig')?.addEventListener('click', event => {
    const knopf = event.target.closest('[data-vorlage]');
    if (knopf) vorlageUebernehmen(Number(knopf.dataset.vorlage));
  });
  $('btnGastLink')?.addEventListener('click', gastLinkKopieren);
  $('btnIcs')?.addEventListener('click', icsHerunterladen);
  $('listGaeste')?.addEventListener('click', gastAktion);

  $('btnSeite')?.addEventListener('click', () => { seiteZeigenImFormular(true); $('fSeiteHtml')?.focus(); });
  $('fSeiteArt')?.addEventListener('click', event => {
    const art = event.target.closest('[data-seite-art]')?.dataset.seiteArt;
    if (art) setzeSeiteArt(art);
  });
  $('fSeiteHtml')?.addEventListener('input', seiteRueckmeldung);
  $('fSeiteDatei')?.addEventListener('change', event => {
    const datei = event.target.files?.[0];
    if (!datei) return;
    const leser = new FileReader();
    leser.onload = () => {
      seiteDateiHtml = String(leser.result || '');
      $('fSeiteDateiName').textContent = datei.name;
      seiteRueckmeldung();
    };
    leser.readAsText(datei);
  });
  /* Die Tage einer Seite ohne Jahreszahl rechnet Firn vom Von-Datum aus. */
  $('fVon')?.addEventListener('change', () => { if (!$('grpSeite').hidden) seiteRueckmeldung(); });
  $('fZeit')?.addEventListener('input', formAnpassen);

  $('btnBeitreten')?.addEventListener('click', codeEinloesen);
  $('btnWeitereNeu')?.addEventListener('click', neueGruppe);
  $('btnWeitereCode')?.addEventListener('click', codeEinloesen);
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
  $('planPerson')?.addEventListener('change', async () => {
    wochePerson = $('planPerson').value;
    await ladeProtokolleDerWoche();
    zeichneWoche();
  });
  $('btnPlanNeu')?.addEventListener('click', planFormOeffnen);
  $('planDatei')?.addEventListener('change', event => planDateiGewaehlt(event.target.files));
  /* Die Zuordnung je Datei. Ein Zuhoerer fuer die ganze Liste — die
     Karten werden bei jeder Wahl neu gezeichnet. */
  $('planListe')?.addEventListener('change', event => {
    const feld = event.target.closest('[data-datei-fuer]');
    const x = feld && eingelesen[Number(feld.dataset.dateiFuer)];
    if (!x) return;
    x.fuer = feld.value;
    $('planFehler').hidden = true;
    mehrereZeigen();
  });
  $('planQuelle')?.addEventListener('change', () => {
    /* Wer ein frueheres Programm waehlt, will die eingelesene Datei
       nicht mehr — sonst gewaenne sie still beim Speichern. */
    if ($('planQuelle').value) {
      eingelesen = [];
      zeige('planVorschau', false);
      zeige('planListe', false);
      zeige('grpPlanTitel', true);
      zeige('grpPlanFuer', true);
      alsListe = false;
      $('planFuerHinweis').hidden = true;
      $('planDateiKnopf').textContent = t('grp.planDateienWaehlen', 'Excel-Dateien wählen');
    }
  });
  $('btnPlanAbbrechen')?.addEventListener('click', planFormSchliessen);
  $('btnPlanSpeichern')?.addEventListener('click', planSpeichern);
  $('planFuer')?.addEventListener('change', planFuerGeaendert);
  for (const id of ['ergRennen', 'ergZeit', 'ergSieger', 'ergZuschlag']) {
    $(id)?.addEventListener('input', ergVorschau);
    $(id)?.addEventListener('change', ergVorschau);
  }
  $('btnEntfernen')?.addEventListener('click', personEntfernen);
  $('btnUebergeben')?.addEventListener('click', leitungUebergeben);

  window.addEventListener('firn-gruppe', event => wechsleZu(event.detail?.gid));

  beobachteMeineGruppen(user.uid, liste => {
    gruppen = liste;
    /* ?g=<gruppe>&termin=<id>: der Bereich Training zeigt die Termine
       aller Gruppen, geöffnet werden sie hier. Die Gruppe wird aktiv,
       der Termin geht auf, sobald er da ist (hoereAufTermine). */
    if (gruppeAusAdresse && liste.some(g => g.id === gruppeAusAdresse)) aktiveGruppeSetzen(gruppeAusAdresse);
    gruppeAusAdresse = '';
    const vorher = aktiv?.id;
    aktiv = waehleAktive(liste);
    if (aktiv?.id !== vorher) hoereAufTermine();
    zeichne();
    if (neuAusAdresse && aktiv) {
      const tag = neuAusAdresse;
      neuAusAdresse = '';
      if (leitet(aktiv.meineRolle)) formOeffnen(tag);
    }
    if (anlegenAusAdresse) {
      anlegenAusAdresse = false;
      neueGruppe();
    }
    if (einstAusAdresse && aktiv) {
      einstAusAdresse = false;
      einstOeffnen();
    }
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
  /* Die Pläne und die gewählte Person gehören zur alten Gruppe — bis
     die neue geladen ist, stünden sonst ihre Einheiten in der Woche. */
  plaene = [];
  wochePerson = '';
  zeichneWoche();

  if (!aktiv) return;
  const fuer = aktiv.id;
  /* Die Reisen dieser Gruppe werden Termine (reise-uebernahme.js) — bei
     der Leitung, im Hintergrund, einmal je Sitzung und Reise. */
  if (leitet(aktiv.meineRolle)) {
    reisenDerGruppeUebernehmen(fuer, user.uid, aktiv.art)
      .catch(e => reportClientError('gruppe/reisen-uebernehmen', e));
  }
  terminAbo = beobachteTermine(fuer, liste => {
    /* Eine späte Antwort der vorigen Gruppe darf die aktuelle nicht
       überschreiben. */
    if (aktiv?.id !== fuer) return;
    termine = liste;
    if (terminAusAdresse && termine.some(x => x.id === terminAusAdresse)) {
      const id = terminAusAdresse;
      terminAusAdresse = '';
      detailOeffnen(id);
    }
    if (offen && !termine.some(t => t.id === offen.id)) detailSchliessen();
    /* Wurde der offene Termin geaendert — etwa abgesagt —, muss die
       Detailansicht ihren Stand nachziehen. Steht er gerade im
       Formular, bleibt das Formular vorn. */
    else if (offen) {
      const neu = termine.find(t => t.id === offen.id);
      if (neu && $('secForm').hidden) detailOeffnen(neu.id);
      else if (neu) offen = neu;
    }
    zeichneWoche();
  });
}

/* fuehrt() wird inzwischen wirklich gebraucht — für die Kaderverwaltung.
   Der Blind-Export, der es bis dahin am Leben hielt, kann weg. */
