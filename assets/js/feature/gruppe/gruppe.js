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
import { mountShell, setShellTitle } from '../../shell.js?v=11';
import {
  beobachteMeineGruppen, ladeMitglieder, gruppeAnlegen,
  beobachteTermine, terminAnlegen, terminLoeschen,
  zusagen, ladeZusagen,
  rolleSetzen, mitgliedEntfernen, uebergeben,
  einladungErzeugen, beitreten,
  ladeErgebnisse, ergebnisSpeichern,
  ladePlaene, planVeroeffentlichen, eigeneProgramme, PLAN_FUER_ALLE,
  ladeProtokolle,
  abonnementErneuern, abonnementAdresse,
  terminAbsagen, absageZuruecknehmen,
  ladeAnhaenge, anhangSpeichern, anhangUmbenennen, anhangLoeschen, alsBlob,
  waehleAktive, aktiveGruppeSetzen, wort, fuehrt, leitet,
} from '../../groups.js';
import {
  wochenTage, standardTag, nachDatum,
  eintragFortschritt, tagPunkte, wochenKopf, einheitZiel,
  planZusammenfassung, planTitelVorschlag,
} from '../../wochenplan.js';
import { frage, eingabe, meldung } from '../../dialog.js';
import {
  kommende, zeitraum, artWort, artName, BEREICH_DER_ART, pruefe, isoTag,
  artenFuer, kenntDisziplinen, istAbgesagt,
} from '../../termine.js';
import {
  rennpunkte, gesamtpunkte, standMit, standJeDisziplin,
} from '../../fispunkte.js';
import { WORKER_BASIS } from '../../worker-config.js';

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
      <span class="row__icon">${escHtml(artName(t, aktiv?.art).slice(0, 1))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(ab ? `${t.titel} — abgesagt` : t.titel)}</span>
        <span class="row__sub">${escHtml(wann + ort)}</span>
      </span>
      <span class="row__end">${escHtml(ab ? t('grp.abgesagt', 'Abgesagt') : artName(t, aktiv?.art))}</span>
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
let planAktiv = '';          // welcher Plan gezeigt wird
let programm = null;         // sein geparstes Wochenprogramm
let wocheTage = [];
let tagAktiv = '';
let protokolle = {};         // nach Datum, fuer den Fortschritt

/* Wochentag und Datum kommen aus dem DATUM, nicht aus dem deutschen
   Namen im Programm: der Plan ist ein Import, die Oberflaeche spricht
   sieben Sprachen. Ohne Datum bleibt der Name aus der Vorlage — besser
   als nichts. */
function alsDatum(iso) {
  return new Date(`${iso}T00:00:00`);
}

function tagName(tag) {
  if (!tag?.datum) return tag?.name || '';
  const d = alsDatum(tag.datum);
  return window.TVZAI18n?.format?.date(d, { weekday: 'long' })
    ?? d.toLocaleDateString('de-CH', { weekday: 'long' });
}

function kurzDatum(iso) {
  if (!iso) return '';
  const d = alsDatum(iso);
  return window.TVZAI18n?.format?.date(d, { day: 'numeric', month: 'short' })
    ?? d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
}

/* ── Der Wochenstreifen ────────────────────────────────────────────
   Sieben Knoepfe. Heute ist markiert, auch wenn ein anderer Tag
   gewaehlt ist — sonst verliert man beim Blaettern den Bezugspunkt. */
function streifen(heute) {
  return wocheTage.map(tag => {
    const punkte = tagPunkte(programm, tag, protokolle)
      .map(p => `<span class="woche__punkt${p.fertig ? ' ist-fertig' : ''}"></span>`)
      .join('');
    const kurz = tag.datum
      ? (window.TVZAI18n?.format?.date(alsDatum(tag.datum), { weekday: 'short' })
         ?? tag.name.slice(0, 2))
      : tag.name.slice(0, 2);
    return `
      <button class="woche__tag${tag.datum === heute ? ' ist-heute' : ''}" type="button"
              role="tab" data-tag="${escHtml(tag.key)}"
              aria-selected="${tag.key === tagAktiv ? 'true' : 'false'}">
        <span class="woche__name">${escHtml(kurz)}</span>
        <span class="woche__datum">${escHtml(tag.datum ? String(Number(tag.datum.slice(8, 10))) : '')}</span>
        <span class="woche__punkte">${punkte}</span>
      </button>`;
  }).join('');
}

/* ── Eine Einheit des Tages ────────────────────────────────────────
   Sie fuehrt direkt in den Player, mit dem GEPLANTEN Datum. Ein
   Eintrag ohne Blatt ("evtl. Spiel") bleibt stehen, aber ohne Weg
   hinein: das ist eine Ansage des Trainers, kein Trainingsblatt. */
function eintragZeile(eintrag, tag) {
  const slot = eintrag.slot
    ? `<span class="eintrag__slot">${escHtml(eintrag.slot)}</span> · `
    : '';

  if (!eintrag.unit) {
    return `
      <div class="row row--ohneBlatt" data-bereich="t-training">
        <span class="row__icon">·</span>
        <span class="row__body">
          <span class="row__title">${escHtml(eintrag.titel)}</span>
          <span class="row__sub">${slot}${escHtml(t('grp.keinBlatt', 'kein Blatt hinterlegt'))}</span>
        </span>
      </div>`;
  }

  const f = eintragFortschritt(programm, eintrag, tag.datum, protokolle);
  const fertig = Boolean(f?.fertig && f.gesamt > 0);

  return `
    <a class="row" href="${escHtml(einheitZiel(aktiv.id, planAktiv, eintrag, tag.datum))}"
       data-bereich="t-training">
      <span class="row__icon">${escHtml(eintrag.titel.slice(0, 1).toUpperCase())}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(eintrag.titel)}</span>
        <span class="row__sub">${slot}${escHtml(f
          ? tPlural('eh.uebungen', f.gesamt, 'Übung', 'Übungen')
          : t('grp.keinBlatt', 'kein Blatt hinterlegt'))}</span>
        ${f && f.gesamt
          ? `<span class="row__bar"><i class="${fertig ? 'ist-fertig' : ''}" style="width:${f.anteil}%"></i></span>`
          : ''}
      </span>
      <span class="row__end">
        <span class="row__zaehler${fertig ? ' ist-fertig' : ''}">${escHtml(f ? `${f.erledigt}/${f.gesamt}` : '')}</span>
        <svg class="ic row__chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </a>`;
}

/* ── Die Woche zeichnen ────────────────────────────────────────────*/
function zeichneWoche() {
  const liste = $('listPlaene');
  const heute = isoTag();

  if (!programm || !wocheTage.length) {
    zeige('wocheStreifen', false);
    zeige('tagTitel', false);
    zeige('planZeitraum', false);
    liste.innerHTML = `<p class="empty-hint">${escHtml(leitet(aktiv?.meineRolle)
      ? t('grp.keinPlan', 'Noch kein Plan veröffentlicht.')
      : t('grp.keinPlanFuerDich', 'Für dich liegt noch kein Plan bereit.'))}</p>`;
    return;
  }

  /* Der Kopf nennt die Woche, nicht den Titel, den der Trainer beim
     Veroeffentlichen getippt hat: "KW 31 · 3.–9. Aug." sagt einem
     Athleten mehr als "Woche 31 — Kraft". Der Titel steht in der
     Auswahl, sobald es mehrere Plaene gibt. */
  const kopf = wochenKopf(programm);
  const plan = plaene.find(p => p.id === planAktiv);
  const teile = [
    kopf.kw ? `KW ${kopf.kw}` : kopf.label,
    kopf.von && kopf.bis ? `${kurzDatum(kopf.von)} – ${kurzDatum(kopf.bis)}` : '',
    /* Dass ein Plan nur fuer einen selbst gilt, ist keine Kleinigkeit
       — der Athlet soll wissen, dass der Kader etwas anderes macht. */
    plan && plan.fuer !== PLAN_FUER_ALLE ? t('grp.nurFuerDich', 'nur für dich') : '',
  ].filter(Boolean);
  $('planZeitraum').textContent = teile.join(' · ');
  zeige('planZeitraum', teile.length > 0);

  $('wocheStreifen').innerHTML = streifen(heute);
  zeige('wocheStreifen', true);

  const tag = wocheTage.find(x => x.key === tagAktiv) || wocheTage[0];
  const istHeute = Boolean(tag.datum) && tag.datum === heute;
  $('tagTitel').innerHTML = [
    `<span>${escHtml(istHeute ? t('grp.heute', 'Heute') : tagName(tag))}</span>`,
    tag.datum
      ? `<span class="tag__datum">${escHtml(istHeute
          ? `${tagName(tag)}, ${kurzDatum(tag.datum)}`
          : kurzDatum(tag.datum))}</span>`
      : '',
  ].filter(Boolean).join('');
  zeige('tagTitel', true);

  liste.innerHTML = tag.eintraege.length
    ? tag.eintraege.map(e => eintragZeile(e, tag)).join('')
    : `<p class="empty-hint">${escHtml(t('grp.ruhetag', 'Ruhetag — nichts geplant.'))}</p>`;
}

/* Den gewaehlten Plan einlesen. Ein Plan aus einer kaputten oder
   kuenftigen Fassung darf die Gruppenseite nicht mitreissen. */
function setzePlan(id) {
  planAktiv = id;
  programm = null;
  wocheTage = [];
  const plan = plaene.find(p => p.id === id);
  if (!plan) return;
  try {
    programm = JSON.parse(plan.json);
    wocheTage = wochenTage(programm);
  } catch (e) {
    reportClientError('gruppe/planLesen', e);
    programm = null;
    wocheTage = [];
  }
  tagAktiv = standardTag(wocheTage, isoTag());
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

  /* Der Fortschritt ist Beiwerk: geht er nicht durch, steht die Woche
     trotzdem da — nur ohne Punkte und ohne Zaehler. */
  try {
    protokolle = nachDatum(await ladeProtokolle(aktiv.id, user.uid));
  } catch (e) {
    reportClientError('gruppe/protokolle', e);
    protokolle = {};
  }

  /* Ein Auswahlfeld mit einem einzigen Eintrag ist eine Luege — wie
     beim Gruppenwechsler eine Zeile weiter oben. */
  const mehrere = plaene.length > 1;
  zeige('planWahl', mehrere);
  if (mehrere) {
    $('planWahl').innerHTML = plaene.map(p => {
      const wem = p.fuer === PLAN_FUER_ALLE
        ? wort(aktiv?.art, 'mitglieder')
        : (mitglieder.find(m => m.uid === p.fuer)?.name || t('grp.einAthlet', 'ein Athlet'));
      return `<option value="${escHtml(p.id)}">${escHtml(p.titel)} — ${escHtml(wem)}</option>`;
    }).join('');
  }

  if (plaene.length) {
    setzePlan(plaene.some(p => p.id === planAktiv) ? planAktiv : plaene[0].id);
    if (mehrere) $('planWahl').value = planAktiv;
  } else {
    planAktiv = '';
    programm = null;
    wocheTage = [];
  }

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
   hatte — fuer jeden, der die Seite nie geoeffnet hatte, leer. */
let eingelesen = null;          // { programm, json, datei }
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

async function planDateiGewaehlt(datei) {
  if (!datei) return;
  const status = $('planDateiStatus');
  status.textContent = t('grp.planLiest', 'Datei wird gelesen …');
  status.hidden = false;
  zeige('planVorschau', false);
  $('planFehler').hidden = true;

  try {
    const [{ gridFromFile }, { parseProgram }, bildTabelle] = await Promise.all([
      import('../../training-import.js'),
      import('../../training-parser.js'),
      bilderLaden(),
    ]);
    const programm = parseProgram(await gridFromFile(datei), { images: bildTabelle });
    eingelesen = { programm, json: JSON.stringify(programm), datei: datei.name || '' };
    status.hidden = true;
    planVorschau(programm);

    /* Der Titel ist die Woche. Wer schon einen eigenen getippt hat,
       behaelt ihn. */
    const titel = $('planTitel');
    if (!titel.value.trim()) titel.value = planTitelVorschlag(programm);
    $('planDateiKnopf').textContent = t('grp.planAndereDatei', 'Andere Datei wählen');
    zeige('grpPlanQuelle', false);
  } catch (e) {
    reportClientError('gruppe/plan-einlesen', e);
    eingelesen = null;
    /* Der Parser sagt, was fehlt ("Kein Wochenplan-Blatt gefunden.") —
       das hilft mehr als ein Ersatzsatz. */
    status.textContent = t('grp.f.einlesen', 'Die Datei liess sich nicht lesen. {grund}',
      { grund: e?.message || '' });
  } finally {
    $('planDatei').value = '';
  }
}

async function planFormOeffnen() {
  if (!aktiv) return;

  eingelesen = null;
  $('planDateiKnopf').textContent = t('grp.planDateiWaehlen', 'Excel-Datei wählen');
  $('planDateiStatus').hidden = true;
  zeige('planVorschau', false);

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
  const fehler = $('planFehler');

  /* Die eben eingelesene Datei zuerst; sonst ein frueheres Programm. */
  let json = eingelesen?.json || '';
  let programmId = eingelesen ? planTitelVorschlag(eingelesen.programm) || eingelesen.datei : '';
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

  const btn = $('btnPlanSpeichern');
  btn.disabled = true;
  try {
    await planVeroeffentlichen(aktiv.id, user.uid, {
      titel: $('planTitel').value.trim() || programmId,
      json,
      fuer: $('planFuer').value,
    });
    eingelesen = null;
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
  zeige('secLeer', false);
  zeige('secGruppeNeu', true);
  $('neuName').focus();
}

function neueGruppeSchliessen() {
  zeige('secGruppeNeu', false);
  zeige('secLeer', !aktiv);
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

function detailOeffnen(eid) {
  offen = termine.find(t => t.id === eid) || null;
  if (!offen) return;

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

function formOeffnen() {
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
  $('fBezeichnung').value = '';
  setzeArtWahl(artenFuer(aktiv?.art)[0] || 'training');
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
    bezeichnung: artWahl === 'eigene' ? $('fBezeichnung').value.trim() : null,
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

  /* "Eigene" ohne Wort waere ein Training, das so tut, als sei es etwas
     anderes. Das Feld steht offen da — also danach fragen. */
  if (artWahl === 'eigene' && !entwurf.bezeichnung) {
    const feld = $('formFehler');
    feld.textContent = t('grp.f.bezeichnung', 'Wie heisst diese Art von Termin?');
    feld.hidden = false;
    $('fBezeichnung').focus();
    return;
  }

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
    platzhalter: 'ABC123',
    ja: t('grp.beitretenKurz', 'Beitreten'),
    maxlength: 32, gross: true,
  });
  if (code === null) return;
  const sauber = code.trim();
  if (!sauber) return;

  const btn = $('btnBeitreten');
  btn.disabled = true;
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
    await meldung({ titel: t('grp.f.code', 'Der Code konnte nicht erzeugt werden.') });
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

  /* Die Gruppe ist ein TAB, keine Unterseite: kein Zurueck-Pfeil. Er
     stand hier bis v.35.23.0 und am Laptop direkt neben dem
     Klappknopf der Leiste — zwei gleiche Winkel, zwei Bedeutungen.
     Die Einstellungen stehen im Konto, nicht als eigenes Zahnrad. */
  mountShell({
    variant: 'tab',
    title: t('nav.gruppe', 'Gruppe'),
    profile,
  });

  $('btnNeu')?.addEventListener('click', neueGruppe);
  $('btnEinladen')?.addEventListener('click', einladen);
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
  $('btnGruppeNeuZurueck')?.addEventListener('click', neueGruppeSchliessen);

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
  $('wocheStreifen')?.addEventListener('click', event => {
    const key = event.target.closest('[data-tag]')?.dataset.tag;
    if (!key || key === tagAktiv) return;
    tagAktiv = key;
    zeichneWoche();
  });
  $('planWahl')?.addEventListener('change', () => {
    setzePlan($('planWahl').value);
    zeichneWoche();
  });
  $('btnPlanNeu')?.addEventListener('click', planFormOeffnen);
  $('planDatei')?.addEventListener('change', event => planDateiGewaehlt(event.target.files?.[0]));
  $('planQuelle')?.addEventListener('change', () => {
    /* Wer ein frueheres Programm waehlt, will die eingelesene Datei
       nicht mehr — sonst gewaenne sie still beim Speichern. */
    if ($('planQuelle').value) {
      eingelesen = null;
      zeige('planVorschau', false);
      $('planDateiKnopf').textContent = t('grp.planDateiWaehlen', 'Excel-Datei wählen');
    }
  });
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
