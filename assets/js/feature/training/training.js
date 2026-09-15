/* ══════════════════════════════════════════════════════════════════
   Der Bereich Training — die Woche aus den Plaenen deiner Gruppen.

   Michel: "Der Bereich Training sollte gleich alle Übungen usw. aus
   der Gruppe auslesen können." Bis v.35.26.0 hatte er seinen eigenen
   Import, seinen eigenen Speicher und seinen eigenen Player — dieselbe
   Woche ein zweites Mal, und was der Athlet dort abhakte, sah sein
   Trainer nie.

   Jetzt: alle Gruppen, in denen man ist; aus jeder die Plaene, die fuer
   einen bestimmt sind, und ihre Termine; die Woche davon mit demselben
   Baustein wie auf der Gruppenseite; ein Tipp auf eine Einheit fuehrt
   in denselben Player, ein Tipp auf einen Termin in die Gruppe. Seit
   v.35.42.0 ist die Woche ein Kalender zum Blaettern und sammelt die
   Plaene ALLER Gruppen — bis dahin waehlte man einen Plan aus einer
   Liste. Eingelesen wird in der Gruppe ("Plan veroeffentlichen"), nicht
   hier — eine Sache, ein Ort.
   ══════════════════════════════════════════════════════════════════ */

import { requireAuth, getProfile, wireOfflineBanner, reportClientError }
  from '../../firebase-config.js';
import { mountShell } from '../../shell.js?v=27';
import {
  beobachteMeineGruppen, beobachteTermine, ladePlaene, ladeProtokolle, leitet, PLAN_FUER_ALLE,
} from '../../groups.js';
import { wochenTage, nachDatum } from '../../wochenplan.js';
import { agendaAnsicht } from '../woche/woche.js';

const $ = id => document.getElementById(id);
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));
const zeige = (id, an) => { const el = $(id); if (el) el.hidden = !an; };

let user = null;
let gruppen = [];
let quellen = [];               // [{ gid, gruppe, plan, programm }]
const protokolleJe = new Map(); // gid -> nach Datum
const termineJe = new Map();    // gid -> Termine
const abos = new Map();         // gid -> Abmeldung von beobachteTermine
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

/* Ein Termin gehoert in seine Gruppe: dort sind Zusage, Anhaenge und
   Absage. Der Router fuehrt hin, wenn die Seite in seinem Rahmen steht. */
function terminOeffnen(termin) {
  const ziel = `./gruppe.html?g=${encodeURIComponent(termin.gid)}&termin=${encodeURIComponent(termin.id)}`;
  if (window.tvzaNavigate?.(new URL(ziel, location.href).href)) return;
  location.href = ziel;
}

function zeichne() {
  if (!woche || !quellen.length) return;
  const termine = gruppen.flatMap(g => (termineJe.get(g.id) || [])
    .map(x => ({ ...x, gid: g.id, gruppe: g.name, gruppenart: g.art })));
  const mitPlan = new Set(quellen.map(q => q.gid));
  $('wocheGruppe').textContent = mitPlan.size === 1 && gruppen.length === 1
    ? (gruppen[0].name || t('nav.gruppe', 'Gruppe'))
    : t('tr.ausGruppen', 'Aus deinen Gruppen');
  woche.setze({
    quellen,
    termine,
    protokolleJe,
    darfTermine: false,
    schluessel: gruppen.map(g => g.id).join('|'),
  });
}

/* Die Termine jeder Gruppe live — und nur so lange man in ihr ist.
   Ohne das Abmelden liefen nach einem Austritt die Zuhoerer weiter. */
function hoereAufTermine() {
  const jetzt = new Set(gruppen.map(g => g.id));
  for (const [gid, ab] of abos) {
    if (!jetzt.has(gid)) { ab?.(); abos.delete(gid); termineJe.delete(gid); }
  }
  for (const g of gruppen) {
    if (abos.has(g.id)) continue;
    abos.set(g.id, beobachteTermine(g.id, liste => {
      termineJe.set(g.id, liste);
      zeichne();
    }));
  }
}

async function laden(liste) {
  gruppen = liste;
  hoereAufTermine();

  if (!gruppen.length) {
    quellen = [];
    ohne({
      text: t('tr.ohneGruppe',
        'Dein Training kommt aus deiner Gruppe. Tritt ihr bei oder lege eine an — dann steht hier die Woche, die dein Trainer veröffentlicht.'),
      knopf: t('tr.zurGruppe', 'Zur Gruppe'),
    });
    return;
  }

  const gefunden = [];
  for (const gruppe of gruppen) {
    let plaene = [];
    try { plaene = await ladePlaene(gruppe.id, user.uid, leitet(gruppe.meineRolle)); }
    catch (e) { reportClientError('training/plaene', e); }
    for (const plan of plaene.filter(fuerMich)) {
      let programm = null;
      try { programm = JSON.parse(plan.json); }
      catch (e) { reportClientError('training/planLesen', e); }
      if (programm && wochenTage(programm).length) {
        gefunden.push({ gid: gruppe.id, gruppe: gruppe.name, plan, programm });
      }
    }
  }
  quellen = gefunden;

  if (!quellen.length) {
    const fuehrtIrgendwo = gruppen.some(g => leitet(g.meineRolle));
    ohne({
      text: fuehrtIrgendwo
        ? t('tr.keinPlanLeitung', 'Noch kein Plan veröffentlicht. Lies die Excel des Wochenplans in der Gruppe ein — dann steht er hier und bei deinem Kader.')
        : t('tr.keinPlan', 'Dein Trainer hat noch keinen Plan veröffentlicht. Sobald er es tut, steht die Woche hier.'),
      knopf: fuehrtIrgendwo ? t('grp.planNeu', 'Plan veröffentlichen') : t('tr.zurGruppe', 'Zur Gruppe'),
    });
    return;
  }

  for (const gid of new Set(quellen.map(q => q.gid))) await protokolleFuer(gid);
  zeige('secOhne', false);
  zeige('secWoche', true);
  zeichne();
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

  woche = agendaAnsicht({
    el: $('agenda'),
    zurueck: 'training',
    beiTermin: terminOeffnen,
  });

  beobachteMeineGruppen(user.uid, liste => {
    laden(liste).catch(e => reportClientError('training/laden', e));
  });
}());
