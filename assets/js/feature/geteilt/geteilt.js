/* ══════════════════════════════════════════════════════════════════
   Was die externe Trainerin sieht.

   Ein Auszug, gelesen über den Code aus der Adresse (?t=). Kein Konto,
   keine Anmeldung, keine Leiste — und kein Weg in die App. Was hier
   gezeichnet wird, steht vollständig im Dokument; diese Datei fragt
   nichts weiter nach.

   Alles, was aus dem Dokument kommt, wird als Text gesetzt
   (textContent) und nicht als Markup. Der Auszug ist zwar von der
   Athletin selbst geschrieben, aber er geht durch ihr Gerät — und
   fremder Text gehört nie in innerHTML.
   ══════════════════════════════════════════════════════════════════ */

import { auszugHolen } from '../../training-freigaben.js';
import { abgelaufen, standAlter } from '../../training-teilen.js';

const $ = id => document.getElementById(id);
const t = (key, rueckfall, vars) => window.TVZAI18n?.tOr(key, rueckfall, vars)
  ?? String(rueckfall).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

const el = (tag, klasse, text) => {
  const n = document.createElement(tag);
  if (klasse) n.className = klasse;
  if (text !== undefined) n.textContent = String(text ?? '');
  return n;
};

const lesbar = iso => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(window.TVZAI18n?.lang || 'de-CH',
      { weekday: 'long', day: 'numeric', month: 'long' });
  } catch { return iso; }
};

function leer() {
  $('tgLaden').hidden = true;
  $('tgLeer').hidden = false;
}

function satzZeile(satz, werte) {
  const zeile = el('p', 'tg-satz');
  zeile.append(el('span', 'tg-satz__nr', satz.label || ''));

  const plan = [satz.repsPlan, satz.gewichtPlan].filter(Boolean).join(' × ');
  zeile.append(el('span', 'tg-satz__plan', plan));

  if (werte) {
    const gemacht = [satz.reps, satz.gewicht, satz.dauer, satz.strecke].filter(Boolean).join(' · ');
    const wert = el('span', 'tg-satz__wert', gemacht);
    if (satz.ok) wert.classList.add('ist-ok');
    zeile.append(wert);
  }
  return zeile;
}

function uebungKarte(uebung, umfang) {
  const karte = el('div', 'tg-uebung');
  const kopf = el('p', 'tg-uebung__kopf');
  kopf.append(el('span', 'tg-uebung__name', uebung.name || ''));
  if (umfang.fortschritt && uebung.erledigt) {
    kopf.append(el('span', 'tg-uebung__ok', t('tg.erledigt', 'erledigt')));
  }
  karte.append(kopf);

  if (uebung.anweisung) karte.append(el('p', 'tg-uebung__text', uebung.anweisung));
  if (uebung.pause) karte.append(el('p', 'tg-uebung__text', t('tg.pause', 'Pause: {wert}', { wert: uebung.pause })));

  /* Ein Videolink wird nur zum Link, wenn er wirklich http(s) ist —
     dieselbe Prüfung wie im Player (videoUrl). */
  if (typeof uebung.video === 'string' && /^https?:\/\//i.test(uebung.video)) {
    const a = el('a', 'tg-uebung__video', t('tg.video', 'Video ansehen'));
    a.href = uebung.video;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
    karte.append(a);
  }

  for (const satz of uebung.saetze || []) karte.append(satzZeile(satz, umfang.werte));
  if (umfang.notizen && uebung.notiz) {
    karte.append(el('p', 'tg-uebung__notiz', t('tg.notiz', 'Notiz: {text}', { text: uebung.notiz })));
  }
  return karte;
}

function einheitKarte(einheit, umfang) {
  const karte = el('section', 'tg-einheit');
  const kopf = el('p', 'tg-einheit__kopf');
  kopf.append(el('span', 'tg-einheit__titel', einheit.titel || ''));
  const wann = [einheit.slot, einheit.zeit].filter(Boolean).join(' · ');
  if (wann) kopf.append(el('span', 'tg-einheit__wann', wann));
  if (umfang.fortschritt && einheit.fortschritt) {
    kopf.append(el('span', 'tg-einheit__stand',
      t('tg.vonN', '{a}/{b} Übungen', { a: einheit.fortschritt.erledigt, b: einheit.fortschritt.gesamt })));
  }
  karte.append(kopf);

  if (einheit.privatNotiz) karte.append(el('p', 'tg-einheit__notiz', einheit.privatNotiz));
  for (const uebung of einheit.uebungen || []) karte.append(uebungKarte(uebung, umfang));
  return karte;
}

function zeichne(freigabe) {
  const daten = freigabe.daten || {};
  const umfang = daten.umfang || {};
  $('tgLaden').hidden = true;
  $('tgAuszug').hidden = false;

  $('tgName').textContent = daten.name
    ? t('tg.trainingVon', 'Training von {name}', { name: daten.name })
    : t('tg.training', 'Training');

  const teile = [];
  if (freigabe.label) teile.push(t('tg.fuer', 'Geteilt mit {wer}', { wer: freigabe.label }));
  if (daten.von && daten.bis) teile.push(`${lesbar(daten.von)} – ${lesbar(daten.bis)}`);
  $('tgMeta').textContent = teile.join(' · ');

  /* Ein Auszug ist ein Stand, kein Fenster. Das muss dastehen —
     sonst hält die Trainerin ihn für "jetzt". */
  const stunden = standAlter(freigabe.stand);
  $('tgStand').textContent = stunden === null
    ? t('tg.standUnbekannt', 'Stand unbekannt.')
    : stunden < 1
      ? t('tg.standFrisch', 'Stand: gerade eben. Der Auszug wird aufgefrischt, wenn die Athletin die App öffnet.')
      : t('tg.standStunden', 'Stand: vor {n} Stunden. Der Auszug wird aufgefrischt, wenn die Athletin die App öffnet.', { n: stunden });

  const tage = $('tgTage');
  tage.textContent = '';
  const liste = Array.isArray(daten.tage) ? daten.tage : [];
  if (!liste.length) {
    tage.append(el('p', 'tg__text', t('tg.nichts', 'In diesem Zeitraum steht nichts im Plan.')));
    return;
  }
  for (const tag of liste) {
    const block = el('div', 'tg-tag');
    block.append(el('h2', 'tg-tag__kopf', lesbar(tag.datum)));
    for (const einheit of tag.einheiten || []) block.append(einheitKarte(einheit, umfang));
    tage.append(block);
  }
}

(async function () {
  const code = new URLSearchParams(location.search).get('t') || '';
  if (!code) { leer(); return; }
  const freigabe = await auszugHolen(code);
  /* Die Regel lehnt einen abgelaufenen Link ohnehin ab; die zweite
     Prüfung hier ist für den Fall, dass die Antwort aus dem Speicher
     des Geräts kommt. */
  if (!freigabe || abgelaufen(freigabe)) { leer(); return; }
  zeichne(freigabe);
}());
