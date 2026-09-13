/* ══════════════════════════════════════════════════════════════════
   Der Bereich Training — die Woche aus den Plaenen deiner Gruppen.

   Michel: "Der Bereich Training sollte gleich alle Übungen usw. aus
   der Gruppe auslesen können." Bis v.35.26.0 hatte er seinen eigenen
   Import, seinen eigenen Speicher und seinen eigenen Player — dieselbe
   Woche ein zweites Mal, und was der Athlet dort abhakte, sah sein
   Trainer nie.

   Jetzt: alle Gruppen, in denen man ist; aus jeder die Plaene, die fuer
   einen bestimmt sind; die Woche davon mit demselben Baustein wie auf
   der Gruppenseite; ein Tipp fuehrt in denselben Player. Eingelesen
   wird in der Gruppe ("Plan veroeffentlichen"), nicht hier — eine
   Sache, ein Ort.
   ══════════════════════════════════════════════════════════════════ */

import { requireAuth, getProfile, escHtml, wireOfflineBanner, reportClientError }
  from '../../firebase-config.js';
import { mountShell } from '../../shell.js?v=13';
import {
  beobachteMeineGruppen, ladePlaene, ladeProtokolle, waehleAktive, leitet, PLAN_FUER_ALLE,
} from '../../groups.js';
import { wochenTage, nachDatum } from '../../wochenplan.js';
import { wochenAnsicht } from '../woche/woche.js';

const $ = id => document.getElementById(id);
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
const zeige = (id, an) => { const el = $(id); if (el) el.hidden = !an; };

let user = null;
let eintraege = [];            // [{ gruppe, plan, programm }]
let aktiv = '';                // "gid/planId"
const protokolleJe = new Map(); // gid -> nach Datum
let woche = null;

/* Welche Plaene zaehlen: die fuer alle und die fuer mich. Die Leitung
   liest ungefiltert (sonst faellt die Abfrage) und saehe hier sonst die
   Einzelplaene jedes Athleten — das ist ihr Kader, nicht ihr Training. */
function fuerMich(plan) {
  return plan.fuer === PLAN_FUER_ALLE || plan.fuer === user.uid;
}

function ohne({ text, knopf }) {
  $('ohneText').textContent = text;
  $('lnkGruppe').textContent = knopf;
  zeige('secOhne', true);
  zeige('secWoche', false);
}

async function protokolleFuer(gid) {
  if (protokolleJe.has(gid)) return protokolleJe.get(gid);
  let werte = {};
  try { werte = nachDatum(await ladeProtokolle(gid, user.uid)); }
  catch (e) { reportClientError('training/protokolle', e); }
  protokolleJe.set(gid, werte);
  return werte;
}

async function zeigeAktiven() {
  const eintrag = eintraege.find(e => `${e.gruppe.id}/${e.plan.id}` === aktiv) || eintraege[0];
  if (!eintrag) return;
  aktiv = `${eintrag.gruppe.id}/${eintrag.plan.id}`;

  /* Erst laden, dann Name UND Woche zusammen wechseln — sonst stuende
     einen Moment lang der Name der neuen Gruppe ueber dem Plan der
     alten. */
  const protokolle = await protokolleFuer(eintrag.gruppe.id);
  $('wocheGruppe').textContent = eintrag.gruppe.name || t('nav.gruppe', 'Gruppe');
  woche.setze({
    gid: eintrag.gruppe.id,
    planId: eintrag.plan.id,
    programm: eintrag.programm,
    protokolle,
    nurFuerMich: eintrag.plan.fuer !== PLAN_FUER_ALLE,
  });
}

async function laden(gruppen) {
  if (!gruppen.length) {
    ohne({
      text: t('tr.ohneGruppe',
        'Dein Training kommt aus deiner Gruppe. Tritt ihr bei oder lege eine an — dann steht hier die Woche, die dein Trainer veröffentlicht.'),
      knopf: t('tr.zurGruppe', 'Zur Gruppe'),
    });
    return;
  }

  /* Die aktive Gruppe zuerst: dort ist man gerade, dort liegt meist
     der Plan, den man heute braucht. */
  const vorn = waehleAktive(gruppen);
  const reihe = [vorn, ...gruppen.filter(g => g.id !== vorn?.id)].filter(Boolean);

  const gefunden = [];
  for (const gruppe of reihe) {
    let plaene = [];
    try { plaene = await ladePlaene(gruppe.id, user.uid, leitet(gruppe.meineRolle)); }
    catch (e) { reportClientError('training/plaene', e); }
    for (const plan of plaene.filter(fuerMich)) {
      let programm = null;
      try { programm = JSON.parse(plan.json); }
      catch (e) { reportClientError('training/planLesen', e); }
      if (programm && wochenTage(programm).length) gefunden.push({ gruppe, plan, programm });
    }
  }
  eintraege = gefunden;

  if (!eintraege.length) {
    const fuehrtIrgendwo = reihe.some(g => leitet(g.meineRolle));
    ohne({
      text: fuehrtIrgendwo
        ? t('tr.keinPlanLeitung', 'Noch kein Plan veröffentlicht. Lies die Excel des Wochenplans in der Gruppe ein — dann steht er hier und bei deinem Kader.')
        : t('tr.keinPlan', 'Dein Trainer hat noch keinen Plan veröffentlicht. Sobald er es tut, steht die Woche hier.'),
      knopf: fuehrtIrgendwo ? t('grp.planNeu', 'Plan veröffentlichen') : t('tr.zurGruppe', 'Zur Gruppe'),
    });
    return;
  }

  /* Die Auswahl nur, wenn es etwas zu waehlen gibt. Bei Plaenen aus
     mehreren Gruppen steht die Gruppe davor. */
  const mehrere = eintraege.length > 1;
  const mehrereGruppen = new Set(eintraege.map(e => e.gruppe.id)).size > 1;
  zeige('planWahl', mehrere);
  if (mehrere) {
    $('planWahl').innerHTML = eintraege.map(e => {
      const wert = `${e.gruppe.id}/${e.plan.id}`;
      const text = mehrereGruppen ? `${e.gruppe.name} — ${e.plan.titel}` : e.plan.titel;
      return `<option value="${escHtml(wert)}">${escHtml(text)}</option>`;
    }).join('');
  }
  if (!eintraege.some(e => `${e.gruppe.id}/${e.plan.id}` === aktiv)) {
    aktiv = `${eintraege[0].gruppe.id}/${eintraege[0].plan.id}`;
  }
  if (mehrere) $('planWahl').value = aktiv;

  zeige('secOhne', false);
  zeige('secWoche', true);
  await zeigeAktiven();
}

(async function () {
  try { user = await requireAuth('../login.html'); }
  catch { return; }

  wireOfflineBanner();

  let profile = {};
  try { profile = await getProfile(user); } catch { /* Name bleibt leer */ }

  /* Training ist ein Bereich von Start — ein eigener Ort, kein Weg
     zurueck; die Leiste fuehrt ueberall hin. */
  mountShell({
    variant: 'tab',
    title: t('mod.training.name', 'Training'),
    profile,
  });

  woche = wochenAnsicht({
    streifen: $('wocheStreifen'),
    titel: $('tagTitel'),
    liste: $('listPlaene'),
    zeitraum: $('planZeitraum'),
    zurueck: 'training',
  });

  $('planWahl')?.addEventListener('change', () => {
    aktiv = $('planWahl').value;
    zeigeAktiven();
  });

  beobachteMeineGruppen(user.uid, gruppen => {
    laden(gruppen).catch(e => reportClientError('training/laden', e));
  });
}());
