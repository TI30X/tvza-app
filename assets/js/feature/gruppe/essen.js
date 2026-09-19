/* ══════════════════════════════════════════════════════════════════
   Essen im Kader — die beiden Ansichten auf der Gruppenseite.

   Michel: ein Kader will wissen, ob seine Athleten genug essen. Die
   Athletin will das nicht in einem zweiten Programm eintragen, und sie
   will auch nicht, dass ihr privater Food Tracker plötzlich einem
   Verein gehört. Beides geht — mit zwei getrennten Orten und einer
   ausdrücklichen Zusage dazwischen.

     Erfassen   jede und jeder für sich, mit demselben Bedienelement
                wie im Food Tracker (feature/essen/erfassung.js)
     Übersicht  die Leitung, nur lesend, über einen Zeitraum

   Was die Leitung NICHT sieht: Gewicht, Ziel, Richtwert, und die
   Einträge von jemandem, der nicht teilt. Und: ein gewöhnliches
   Mitglied sieht hier nur sich selbst — die Übersicht gibt es für
   Kopf und Trainer, und zwar nicht nur im Knopf, sondern in der Regel.

   Diese Datei zeichnet. Was erlaubt ist, entscheidet essen-modell.js,
   und durchgesetzt wird es in firestore.rules.
   ══════════════════════════════════════════════════════════════════ */

import { escHtml, reportClientError } from '../../firebase-config.js';
import { leitet } from '../../groups.js';
import { findFood } from '../../foods.js';
import { frage, meldung } from '../../dialog.js';
import { erfassungMontieren } from '../essen/erfassung.js';
import {
  MAHLZEITEN, mahlzeitNachUhr, naehrwerte, summe, zeitraumTage,
  dashboardZeilen, STATUS, sehendePersonen, mussFragen, essenAn,
  MAHLZEITEN_MAX, TAGE_MAX,
} from '../../essen-modell.js';
import {
  freigabeSetzen, ladeFreigabe, ladeFreigaben, beobachteZeitraum,
  ladeTag, tagSchreiben, tagLoeschen, verlaufLoeschen, lebensmittelVorschlagen,
} from '../../essen.js';

const $ = id => document.getElementById(id);
const t = (key, rueckfall, vars) => window.TVZAI18n?.tOr(key, rueckfall, vars)
  ?? String(rueckfall).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

const pad = n => String(n).padStart(2, '0');
const heute = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const verschoben = (iso, tage) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const lesbar = iso => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(window.TVZAI18n?.lang || 'de-CH',
      { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return iso; }
};
const mahlzeitWort = key => {
  const m = MAHLZEITEN.find(x => x.key === key) || MAHLZEITEN[3];
  return t(m.i18n, m.de);
};

/* ── Zustand ───────────────────────────────────────────────────────*/
let user = null;
let gruppe = null;
let mitglieder = [];
let zurueckRuf = () => {};

let erfassung = null;
let tag = heute();
/* undefined = noch nicht geladen, null = es gibt keine Freigabe.
   Beides in EINEM Wert waere derselbe Fehler wie "nichts synchronisiert"
   gegen "nicht trainiert" (Falle 27): die Zusage stuende nie da, weil
   die Ansicht ewig auf etwas wartet, das schon geantwortet hat. */
let freigabe;
let tagesDaten = null;        // null = lädt
let tagFehler = false;
let bearbeitet = null;        // id der Mahlzeit, die im Formular steht

let teamVon = '';
let teamBis = '';
let teamAbo = null;
let teamFuer = '';
let teamTage = null;          // null = lädt
let teamFehler = false;
let teamFreigaben = null;
let teamOffen = new Set();

export function essenInit({ zurueck }) {
  zurueckRuf = zurueck || (() => {});
}

/** Aus zeichne(): wer sind wir, in welcher Gruppe, mit wem. */
export function essenSetzen(nutzer, aktiveGruppe, liste) {
  const gewechselt = gruppe?.id !== aktiveGruppe?.id;
  user = nutzer;
  gruppe = aktiveGruppe;
  mitglieder = liste || [];
  if (gewechselt) {
    freigabe = undefined;
    tagesDaten = null;
    teamAbo?.();
    teamAbo = null;
    teamFuer = '';
    teamTage = null;
    teamOffen = new Set();
  }
  const an = essenAn(gruppe);
  const zeile = $('grpEssenZeile');
  if (zeile) zeile.hidden = !an || !gruppe;
  const teamKnopf = $('btnEssenTeam');
  if (teamKnopf) teamKnopf.hidden = !an || !leitet(gruppe?.meineRolle);
}

/* ══ Erfassen ═════════════════════════════════════════════════════*/

export function essenOffen() { return $('secEssen')?.hidden === false; }
export function essenTeamOffen() { return $('secEssenTeam')?.hidden === false; }

export async function essenOeffnen() {
  if (!gruppe || !essenAn(gruppe)) return;
  tag = heute();
  bearbeitet = null;
  $('secEssen').hidden = false;
  $('essenGruppe').textContent = t('essen.inGruppe', 'Essen · {name}', { name: gruppe.name });
  aufbauen();
  zeichneErfassen();
  window.scrollTo?.(0, 0);
  freigabe = await ladeFreigabe(gruppe.id, user.uid);
  zeichneErfassen();
  void tagLaden();
}

export function essenSchliessen() {
  $('secEssen').hidden = true;
  erfassung?.zerstoeren();
  erfassung = null;
}

/* Das Bedienelement einmal je Öffnen — es hängt seine Zuhörer an
   Elemente, die es selbst gebaut hat, und verschwindet mit ihnen. */
function aufbauen() {
  if (erfassung) return;
  const host = $('essenErfassung');
  if (!host) return;
  erfassung = erfassungMontieren(host, {
    onVorschlag: (name, extra) => void vorschlagen(name, extra),
  });
  const wahl = $('essenMahlzeit');
  if (wahl && !wahl.options.length) {
    for (const m of MAHLZEITEN) {
      const opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = t(m.i18n, m.de);
      wahl.appendChild(opt);
    }
  }
  if (wahl) wahl.value = mahlzeitNachUhr(new Date().getHours());
}

async function vorschlagen(name, extra) {
  const vorschlag = String(name || '').trim();
  if (!vorschlag) return;
  try {
    await lebensmittelVorschlagen({
      name: vorschlag, barcode: extra?.barcode || '', marke: extra?.marke || '',
      uid: user.uid, email: user.email || '',
    });
    await meldung({ titel: t('fd.danke', 'Danke!'), text: t('fd.vorschlagOk', 'Dein Vorschlag ist unterwegs. Sobald er freigegeben ist, steht er allen zur Verfügung.') });
  } catch (e) {
    reportClientError('essen/vorschlag', e);
    await meldung({ titel: t('essen.fehler', 'Das hat nicht geklappt'), text: t('fd.vorschlagWeg', 'Der Vorschlag liess sich nicht senden.') });
  }
}

/** Welcher Tag steht gerade im Formular — für die zwei Pfeile. */
export const essenTagJetzt = () => tag;

export function essenTagSetzen(neu) {
  tag = neu;
  bearbeitet = null;
  erfassung?.leeren();
  void tagLaden();
}

async function tagLaden() {
  if (!gruppe) return;
  const gid = gruppe.id;
  const welcher = tag;
  tagesDaten = null;
  tagFehler = false;
  zeichneErfassen();
  try {
    const daten = await ladeTag(gid, user.uid, welcher);
    if (gruppe?.id !== gid || tag !== welcher) return;
    tagesDaten = daten?.mahlzeiten || [];
  } catch (e) {
    reportClientError('essen/tag-laden', e);
    if (gruppe?.id !== gid || tag !== welcher) return;
    tagFehler = true;
    tagesDaten = [];
  }
  zeichneErfassen();
}

function teiltMit() { return freigabe?.an === true && !mussFragen(freigabe); }

function zeichneErfassen() {
  if (!$('secEssen') || $('secEssen').hidden) return;
  $('essenDatum').textContent = tag === heute() ? t('home.heute', 'Heute') : lesbar(tag);
  $('essenVor').disabled = false;
  $('essenNach').disabled = tag >= heute();

  const laedt = freigabe === undefined;
  $('essenZusage').hidden = laedt || teiltMit();
  $('essenTeiltKarte').hidden = !teiltMit();
  $('essenForm').hidden = !teiltMit();
  $('essenLade').hidden = !laedt;

  if (!laedt && !teiltMit()) zeichneZusage();
  if (teiltMit()) zeichneTeilt();
  zeichneTagesliste();
}

/* Die Zusage. Sie nennt Namen — nicht "die Leitung", sondern die
   Menschen, die es sehen. Wer einwilligt, ohne zu wissen wem, hat
   nicht eingewilligt. */
function zeichneZusage() {
  const namen = sehendePersonen(mitglieder);
  const wer = namen.length
    ? namen.map(escHtml).join(', ')
    : escHtml(t('essen.keineLeitung', 'zurzeit niemand — die Gruppe hat keine Leitung'));
  $('essenZusageWer').innerHTML = wer;
  $('essenZusageText').textContent = t('essen.zusageText',
    'Was du hier erfasst, sehen die Trainerinnen und Trainer dieser Gruppe — Mahlzeiten, Lebensmittel, Mengen und Kalorien. Andere Mitglieder sehen nichts. Dein persönlicher Food Tracker bleibt getrennt und wird nicht geteilt. Du kannst jederzeit aufhören und das Geteilte löschen.');
}

function zeichneTeilt() {
  const namen = sehendePersonen(mitglieder);
  $('essenTeiltText').textContent = namen.length
    ? t('essen.teiltMit', 'Geteilt mit: {namen}', { namen: namen.join(', ') })
    : t('essen.teiltLeitung', 'Wird mit der Leitung dieser Gruppe geteilt.');
}

export async function essenZusagen() {
  if (!gruppe) return;
  try {
    await freigabeSetzen(gruppe.id, user.uid, true);
    freigabe = await ladeFreigabe(gruppe.id, user.uid);
  } catch (e) {
    reportClientError('essen/zusage', e);
    await meldung({ titel: t('essen.fehler', 'Das hat nicht geklappt'), text: t('essen.zusageWeg', 'Die Freigabe liess sich nicht speichern.') });
  }
  zeichneErfassen();
  void tagLaden();
}

/* Aufhören ist zweierlei, und beides wird gefragt: künftig nichts
   mehr — und das Bisherige weg. */
export async function essenAufhoeren() {
  if (!gruppe) return;
  const ja = await frage({
    titel: t('essen.aufhoerenTitel', 'Nicht mehr teilen?'),
    text: t('essen.aufhoerenText', 'Neue Einträge werden nicht mehr mit der Leitung geteilt. Was du bisher erfasst hast, bleibt vorerst sichtbar — du kannst es gleich danach löschen.'),
    ja: t('essen.aufhoeren', 'Nicht mehr teilen'),
  });
  if (!ja) return;
  try {
    await freigabeSetzen(gruppe.id, user.uid, false);
    freigabe = await ladeFreigabe(gruppe.id, user.uid);
  } catch (e) {
    reportClientError('essen/aufhoeren', e);
    await meldung({ titel: t('essen.fehler', 'Das hat nicht geklappt'), text: t('essen.zusageWeg', 'Die Freigabe liess sich nicht speichern.') });
    return;
  }
  zeichneErfassen();

  const weg = await frage({
    titel: t('essen.verlaufTitel', 'Bisher Geteiltes löschen?'),
    text: t('essen.verlaufText', 'Alles, was du in dieser Gruppe erfasst hast, wird gelöscht. Das lässt sich nicht rückgängig machen.'),
    ja: t('essen.verlaufJa', 'Alles löschen'),
    gefahr: true,
  });
  if (weg) await essenVerlaufLoeschen();
}

export async function essenVerlaufLoeschen() {
  if (!gruppe) return;
  try {
    const anzahl = await verlaufLoeschen(gruppe.id, user.uid);
    tagesDaten = [];
    zeichneErfassen();
    await meldung({
      titel: t('essen.verlaufWeg', 'Gelöscht'),
      text: t('essen.verlaufWegText', '{n} Tage wurden aus dieser Gruppe entfernt.', { n: anzahl }),
    });
  } catch (e) {
    reportClientError('essen/verlauf', e);
    await meldung({ titel: t('essen.fehler', 'Das hat nicht geklappt'), text: t('essen.verlaufFehler', 'Der Verlauf liess sich nicht löschen.') });
  }
}

function zeichneTagesliste() {
  const liste = $('essenTagListe');
  if (!liste) return;
  const summeFeld = $('essenTagSumme');

  if (!teiltMit()) { liste.innerHTML = ''; summeFeld.hidden = true; return; }
  if (tagesDaten === null) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('common.laden', 'Lädt …'))}</p>`;
    summeFeld.hidden = true;
    return;
  }
  if (tagFehler) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('essen.tagFehler', 'Der Tag liess sich gerade nicht laden.'))}</p>`;
    summeFeld.hidden = true;
    return;
  }
  if (!tagesDaten.length) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('essen.tagLeer', 'An diesem Tag ist noch nichts erfasst.'))}</p>`;
    summeFeld.hidden = true;
    return;
  }

  const s = summe(tagesDaten);
  summeFeld.hidden = false;
  summeFeld.textContent = t('essen.tagSumme', '{kcal} kcal · P {p} g · KH {kh} g · F {f} g', {
    kcal: Math.round(s.kcal), p: Math.round(s.protein), kh: Math.round(s.carbs), f: Math.round(s.fat),
  });

  const rang = m => MAHLZEITEN.findIndex(x => x.key === m.mahlzeit);
  liste.innerHTML = [...tagesDaten].sort((a, b) => rang(a) - rang(b)).map(m => `
    <div class="essen-zeile" data-mahlzeit="${escHtml(m.id)}">
      <div class="essen-zeile__text">
        <span class="essen-zeile__titel">${escHtml(mahlzeitWort(m.mahlzeit))}</span>
        <span class="essen-zeile__sub">${escHtml(m.zutaten.map(z => `${z.name} ${Math.round(z.g)} g`).join(', '))}</span>
        <span class="essen-zeile__werte">${Math.round(m.kcal)} kcal · P ${Math.round(m.protein)} · KH ${Math.round(m.carbs)} · F ${Math.round(m.fat)}</span>
      </div>
      <div class="essen-zeile__knoepfe">
        <button class="b b--secondary" type="button" data-essen-bearbeiten="${escHtml(m.id)}">${escHtml(t('common.bearbeiten', 'Bearbeiten'))}</button>
        <button class="b b--danger" type="button" data-essen-weg="${escHtml(m.id)}">${escHtml(t('common.loeschen', 'Löschen'))}</button>
      </div>
    </div>`).join('');
}

/** Eine Mahlzeit speichern — neu oder geändert. */
export async function essenSpeichern() {
  if (!gruppe || !teiltMit() || !erfassung) return;
  const zutaten = erfassung.zutaten();
  const fehlerFeld = $('essenFehler');
  const zeige = text => { fehlerFeld.hidden = !text; fehlerFeld.textContent = text || ''; };
  if (!zutaten.length) {
    zeige(t('essen.keineZutat', 'Trag mindestens eine Zutat mit Gewicht ein.'));
    return;
  }
  const werte = naehrwerte(zutaten, findFood);
  const neue = {
    id: bearbeitet || `m${Date.now().toString(36)}`,
    mahlzeit: $('essenMahlzeit').value,
    zutaten,
    kcal: werte.kcal, protein: werte.protein, carbs: werte.carbs, fat: werte.fat, fibre: werte.fibre,
  };
  const bisher = tagesDaten || [];
  const naechste = bearbeitet
    ? bisher.map(m => (m.id === bearbeitet ? neue : m))
    : [...bisher, neue];
  if (naechste.length > MAHLZEITEN_MAX) {
    zeige(t('essen.zuViele', 'Mehr als {n} Mahlzeiten an einem Tag gehen nicht.', { n: MAHLZEITEN_MAX }));
    return;
  }
  zeige('');
  const knopf = $('btnEssenSpeichern');
  if (knopf) knopf.disabled = true;
  try {
    const daten = await tagSchreiben(gruppe.id, user.uid, tag, naechste, findFood);
    tagesDaten = daten.mahlzeiten;
    bearbeitet = null;
    erfassung.leeren();
    $('btnEssenSpeichern').textContent = t('essen.speichern', 'Mahlzeit speichern');
    $('btnEssenAbbrechen').hidden = true;
  } catch (e) {
    reportClientError('essen/speichern', e);
    zeige(t('essen.speichernWeg', 'Das Speichern hat nicht geklappt — versuch es gleich nochmal.'));
  }
  if (knopf) knopf.disabled = false;
  zeichneTagesliste();
}

export function essenBearbeiten(id) {
  const m = (tagesDaten || []).find(x => x.id === id);
  if (!m || !erfassung) return;
  bearbeitet = id;
  $('essenMahlzeit').value = m.mahlzeit;
  erfassung.setzen(m.zutaten);
  $('btnEssenSpeichern').textContent = t('essen.aendern', 'Änderung speichern');
  $('btnEssenAbbrechen').hidden = false;
  $('essenForm').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export function essenAbbrechen() {
  bearbeitet = null;
  erfassung?.leeren();
  $('btnEssenSpeichern').textContent = t('essen.speichern', 'Mahlzeit speichern');
  $('btnEssenAbbrechen').hidden = true;
  $('essenFehler').hidden = true;
}

export async function essenMahlzeitLoeschen(id) {
  if (!gruppe) return;
  const ja = await frage({
    titel: t('essen.mahlzeitWegTitel', 'Mahlzeit löschen?'),
    text: t('essen.mahlzeitWegText', 'Der Eintrag wird auch für die Leitung entfernt.'),
    ja: t('common.loeschen', 'Löschen'),
    gefahr: true,
  });
  if (!ja) return;
  const rest = (tagesDaten || []).filter(m => m.id !== id);
  try {
    if (rest.length) {
      const daten = await tagSchreiben(gruppe.id, user.uid, tag, rest, findFood);
      tagesDaten = daten.mahlzeiten;
    } else {
      await tagLoeschen(gruppe.id, user.uid, tag);
      tagesDaten = [];
    }
    if (bearbeitet === id) essenAbbrechen();
  } catch (e) {
    reportClientError('essen/mahlzeit-weg', e);
    await meldung({ titel: t('essen.fehler', 'Das hat nicht geklappt'), text: t('essen.speichernWeg', 'Das Speichern hat nicht geklappt — versuch es gleich nochmal.') });
  }
  zeichneTagesliste();
}

/* ══ Die Übersicht der Leitung ════════════════════════════════════*/

export async function essenTeamOeffnen() {
  if (!gruppe || !leitet(gruppe.meineRolle) || !essenAn(gruppe)) return;
  if (!teamVon) { teamBis = heute(); teamVon = verschoben(teamBis, -6); }
  $('secEssenTeam').hidden = false;
  $('essenTeamTitel').textContent = t('essen.teamVon', 'Essen · {name}', { name: gruppe.name });
  $('essenVon').value = teamVon;
  $('essenBis').value = teamBis;
  window.scrollTo?.(0, 0);
  teamHoeren();
  teamFreigaben = await ladeFreigaben(gruppe.id);
  zeichneTeam();
}

export function essenTeamSchliessen() {
  teamAbo?.();
  teamAbo = null;
  teamFuer = '';
  $('secEssenTeam').hidden = true;
}

export function essenZeitraumSetzen(von, bis) {
  if (!von || !bis || von > bis) return;
  /* Mehr als TAGE_MAX ist keine Übersicht mehr, sondern ein Export —
     und Firestore läse dafür jedes Dokument des Kaders. */
  if (zeitraumTage(von, bis).length >= TAGE_MAX) bis = verschoben(von, TAGE_MAX - 1);
  teamVon = von;
  teamBis = bis;
  $('essenVon').value = teamVon;
  $('essenBis').value = teamBis;
  teamHoeren();
}

function teamHoeren() {
  if (!gruppe) return;
  const schluessel = `${gruppe.id}|${teamVon}|${teamBis}`;
  if (teamFuer === schluessel) { zeichneTeam(); return; }
  teamAbo?.();
  teamFuer = schluessel;
  teamTage = null;
  teamFehler = false;
  zeichneTeam();
  const gid = gruppe.id;
  teamAbo = beobachteZeitraum(gid, teamVon, teamBis, liste => {
    if (teamFuer !== `${gid}|${teamVon}|${teamBis}`) return;
    teamTage = liste;
    teamFehler = false;
    zeichneTeam();
  }, e => {
    reportClientError('gruppe/essen-team', e);
    teamFehler = true;
    zeichneTeam();
  });
}

export function essenTeamUmschalten(uid) {
  if (teamOffen.has(uid)) teamOffen.delete(uid); else teamOffen.add(uid);
  zeichneTeam();
}

function zeichneTeam() {
  const liste = $('essenTeamListe');
  if (!liste || $('secEssenTeam')?.hidden !== false) return;
  const hinweis = $('essenTeamHinweis');

  if (teamFehler) {
    hinweis.hidden = false;
    hinweis.textContent = navigator.onLine === false
      ? t('essen.teamOffline', 'Offline — du siehst, was zuletzt geladen wurde.')
      : t('essen.teamFehler', 'Die Übersicht liess sich gerade nicht laden.');
  } else if (navigator.onLine === false) {
    hinweis.hidden = false;
    hinweis.textContent = t('essen.teamOffline', 'Offline — du siehst, was zuletzt geladen wurde.');
  } else {
    hinweis.hidden = true;
  }

  if (teamTage === null) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('common.laden', 'Lädt …'))}</p>`;
    return;
  }

  /* Ohne Freigabenliste wüsste die Ansicht nicht, wer "teilt nicht" ist
     und wer nur nichts erfasst hat — zwei Dinge, die nicht dasselbe
     sagen. Dann lieber ehrlich sein. */
  const freigaben = teamFreigaben || {};
  const zeilen = dashboardZeilen({
    mitglieder: mitglieder.map(m => ({ uid: m.uid, name: m.name, rolle: m.rolle })),
    freigaben, tage: teamTage, von: teamVon, bis: teamBis,
  });

  if (!zeilen.length) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('essen.teamNiemand', 'In dieser Gruppe ist noch niemand.'))}</p>`;
    return;
  }
  if (zeilen.every(z => z.status === STATUS.nichtGeteilt)) {
    liste.innerHTML = `<p class="empty-hint">${escHtml(t('essen.teamKeinerTeilt', 'Noch teilt niemand sein Essen. Wer möchte, schaltet es selbst frei — fragen kannst du im Chat.'))}</p>`
      + zeilen.map(zeileHtml).join('');
    return;
  }
  liste.innerHTML = zeilen.map(zeileHtml).join('');
}

const STATUS_WORT = {
  [STATUS.geteilt]: () => t('essen.statusGeteilt', 'Erfasst'),
  [STATUS.leer]: () => t('essen.statusLeer', 'Kein Eintrag'),
  [STATUS.nichtGeteilt]: () => t('essen.statusNicht', 'Teilt nicht'),
};

function zeileHtml(z) {
  const offen = teamOffen.has(z.uid);
  const kann = z.status === STATUS.geteilt;
  return `
    <div class="essen-athlet ist-${escHtml(z.status)}">
      <button class="essen-athlet__kopf" type="button" ${kann ? `data-essen-auf="${escHtml(z.uid)}"` : 'disabled'}
              aria-expanded="${offen ? 'true' : 'false'}">
        <span class="essen-athlet__name">${escHtml(z.name)}</span>
        <span class="essen-athlet__stand">${escHtml(STATUS_WORT[z.status]())}</span>
        ${kann ? `<span class="essen-athlet__werte">${Math.round(z.kcal)} kcal · ${z.tage.length} ${escHtml(z.tage.length === 1 ? t('essen.tag', 'Tag') : t('essen.tage', 'Tage'))}</span>` : ''}
      </button>
      ${offen && kann ? `<div class="essen-athlet__tage">${z.tage.map(tagHtml).join('')}</div>` : ''}
    </div>`;
}

function tagHtml(tagDaten) {
  const s = summe(tagDaten.mahlzeiten || []);
  const rang = m => MAHLZEITEN.findIndex(x => x.key === m.mahlzeit);
  return `
    <div class="essen-tag">
      <p class="essen-tag__kopf">
        <span>${escHtml(lesbar(tagDaten.datum))}</span>
        <small>${Math.round(s.kcal)} kcal · P ${Math.round(s.protein)} · KH ${Math.round(s.carbs)} · F ${Math.round(s.fat)}</small>
      </p>
      ${[...(tagDaten.mahlzeiten || [])].sort((a, b) => rang(a) - rang(b)).map(m => `
        <p class="essen-tag__mahlzeit">
          <span class="essen-tag__wort">${escHtml(mahlzeitWort(m.mahlzeit))}</span>
          <span class="essen-tag__zutaten">${escHtml((m.zutaten || []).map(z => `${z.name} ${Math.round(z.g)} g`).join(', '))}</span>
          <small>${Math.round(m.kcal)} kcal</small>
        </p>`).join('')}
    </div>`;
}

/* Für Tests und den Gruppenwechsel: alles loslassen. */
export function essenLoslassen() {
  teamAbo?.();
  teamAbo = null;
  teamFuer = '';
  erfassung?.zerstoeren();
  erfassung = null;
}
