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
import { mountShell } from '../../shell.js?v=30';
import {
  beobachteMeineGruppen, beobachteTermine, ladePlaene, ladeProtokolle, leitet, PLAN_FUER_ALLE,
  ladePrivat, EIGEN, eigenePlaene,
} from '../../groups.js';
import { wochenTage, nachDatum } from '../../wochenplan.js';
/* Training teilen (v.35.73.0) — eine eigene Datei, wie Essen in der
   Gruppe: diese Seite bleibt die Woche, das Teilen steht daneben. */
import {
  teilenInit, teilenVerdrahten, teilenZeigen, teilenSchliessen, teilenOffen,
} from './teilen.js';
/* Eigene Plaene (v.35.74.0): Training haengt nicht mehr daran, dass
   jemand einen Trainer hat. */
import { bauenInit, bauenVerdrahten, bauenOffen } from './plan-bauen.js';
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
  teilenZeigen(false);
  if (teilenOffen()) teilenSchliessen();
  $('ohneText').textContent = text;
  $('lnkGruppe').textContent = knopf;
  zeige('secOhne', true);
  zeige('secWoche', false);
  /* Auch ohne Gruppe und ohne Plan: der Weg zum eigenen Plan bleibt.
     Genau das ist der Punkt — Training haengt nicht an einer Gruppe. */
  zeige('bauenZeile', !bauenOffen());
}

/* Eine Unteransicht geht auf: alles andere tritt zurueck. */
function verbergen() {
  zeige('secWoche', false);
  zeige('secOhne', false);
  zeige('bauenZeile', false);
  teilenZeigen(false);
}

async function protokolleFuer(gid) {
  if (protokolleJe.has(gid)) return protokolleJe.get(gid);
  let werte = {};
  try { werte = nachDatum(await ladeProtokolle(gid, user.uid)); }
  catch (e) { reportClientError('training/protokolle', e); }
  protokolleJe.set(gid, werte);
  return werte;
}

/* Die privaten Notizen ("Nur für mich", users/{uid}/trainingLogs) —
   gelesen nur, wenn jemand sie ausdrücklich mitgeben will.

   Sie liegen je Tag und darin je Einheit und Übung. Für den Auszug
   werden die Übungen einer Einheit zu einem Absatz: die externe
   Trainerin braucht den Gedanken, nicht die Übungskennung. */
async function privatNotizen(tage = []) {
  const raus = {};
  for (const datum of tage) {
    let units = {};
    try { units = await ladePrivat(user.uid, datum); }
    catch (e) { reportClientError('training/privat', e); continue; }
    for (const [schluessel, einheit] of Object.entries(units || {})) {
      const texte = Object.values(einheit?.items || {})
        .map(i => String(i?.privat || '').trim())
        .filter(Boolean);
      if (!texte.length) continue;
      (raus[datum] ||= {})[schluessel] = texte.join(' · ');
    }
  }
  return raus;
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
  /* Kommt alles aus EINER Quelle, steht ihr Name darueber. Sonst
     "Aus deinen Gruppen" — und nur, wenn ein eigener Plan dabei ist,
     "Aus deinen Plaenen": sonst waere das Wort Gruppe falsch. */
  $('wocheGruppe').textContent = mitPlan.size === 1
    ? (mitPlan.has(EIGEN)
      ? t('pb.eigenerPlanKurz', 'Eigener Plan')
      : (gruppen.find(g => mitPlan.has(g.id))?.name || t('nav.gruppe', 'Gruppe')))
    : (mitPlan.has(EIGEN)
      ? t('tr.ausQuellen', 'Aus deinen Plänen')
      : t('tr.ausGruppen', 'Aus deinen Gruppen'));
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

/* Die eigenen Plaene als Quelle — mit der Kennung EIGEN, die keine
   Gruppe ist (groups.js). Dadurch stehen sie in derselben Woche, im
   selben Kalender und im selben Player wie ein Plan des Kaders, ohne
   dass einer dieser drei etwas davon wissen muss.

   Und sie verdraengen nichts: agendaTage() entscheidet je QUELLE,
   welcher Plan an einem Tag gewinnt. Kader und eigener Plan sind zwei
   Quellen — wer am Dienstag beides hat, sieht beides. */
async function eigeneQuellen() {
  let plaene = [];
  try { plaene = await eigenePlaene(user.uid); }
  catch (e) { reportClientError('training/eigene', e); return []; }
  const raus = [];
  for (const plan of plaene) {
    let programm = null;
    try { programm = JSON.parse(plan.json); }
    catch (e) { reportClientError('training/eigenLesen', e); }
    if (programm && wochenTage(programm).length) {
      raus.push({ gid: EIGEN, gruppe: t('pb.eigenerPlanKurz', 'Eigener Plan'), plan, programm });
    }
  }
  return raus;
}

async function laden(liste) {
  gruppen = liste;
  hoereAufTermine();

  const eigene = await eigeneQuellen();

  if (!gruppen.length && !eigene.length) {
    quellen = [];
    ohne({
      text: t('tr.ohneGruppe2',
        'Hier steht deine Trainingswoche. Sie kann aus einer Gruppe kommen — oder du baust sie dir selbst, ganz ohne Trainer.'),
      knopf: t('tr.zurGruppe', 'Zur Gruppe'),
    });
    return;
  }

  const gefunden = [...eigene];
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
        : t('tr.keinPlan2', 'Dein Trainer hat noch keinen Plan veröffentlicht. Du musst nicht warten: unten baust du dir selbst einen.'),
      knopf: fuehrtIrgendwo ? t('grp.planNeu', 'Plan veröffentlichen') : t('tr.zurGruppe', 'Zur Gruppe'),
    });
    return;
  }

  for (const gid of new Set(quellen.map(q => q.gid))) await protokolleFuer(gid);
  /* Steht eine Unteransicht offen, bleibt sie offen: ein neu geladener
     Plan darf niemanden aus dem Formular werfen, in dem er gerade
     tippt (Falle 18, dasselbe Muster wie auf der Gruppenseite). */
  if (bauenOffen() || teilenOffen()) return;
  zeige('secOhne', false);
  zeige('secWoche', true);
  zeige('bauenZeile', true);
  teilenZeigen(true);
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

  /* Training teilen (v.35.73.0). Der Auszug wird aus dem gebaut, was
     diese Seite ohnehin geladen hat — die privaten Notizen holt sie
     nur dann nach, wenn jemand den Haken wirklich setzt. */
  teilenInit({
    nutzer: user,
    anzeigeName: profile?.displayName || '',
    datenQuelle: () => ({ quellen, protokolle: protokolleJe }),
    privatQuelle: privatNotizen,
    zurueck: () => {
      zeige('secWoche', !!quellen.length);
      zeige('secOhne', !quellen.length);
      teilenZeigen(!!quellen.length);
    },
  });
  teilenVerdrahten();
  $('btnTeilen')?.addEventListener('click', () => verbergen());

  /* Der Plan-Bauer (v.35.74.0). Nach jeder Änderung wird die Woche neu
     geladen — sonst stünde der neue Plan erst nach einem Neuladen da. */
  bauenInit({
    nutzer: user,
    zurueck: () => { zeige('bauenZeile', true); void laden(gruppen); },
    danach: () => { void laden(gruppen); },
  });
  bauenVerdrahten();
  $('btnBauen')?.addEventListener('click', () => verbergen());

  beobachteMeineGruppen(user.uid, liste => {
    laden(liste).catch(e => reportClientError('training/laden', e));
  });
}());
