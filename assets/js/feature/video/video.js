/* ══════════════════════════════════════════════════════════════════
   Videoanalyse — die Seite.

   Ein Clip vom Gerät, ein Skelett darüber, Gelenkwinkel darunter. Die
   Rechnung steht in assets/js/pose.js, ohne DOM und ohne Modell; hier
   ist nur, was der Browser dazutut.

   ── Was hier stimmt, und was nur heute stimmt ─────────────────────
   Videos WERDEN gespeichert — das ist der Sinn der Sache: ein Trainer
   will einen Schwung im Januar mit dem vom November vergleichen, und
   dafür muss der Clip einem Athleten und einer Einheit gehören. Das
   kommt mit Phase 4 (Worker und R2).

   Dauerhaft wahr ist etwas Genaueres, und nur das darf in der
   Oberfläche stehen: die ANALYSE läuft auf dem Gerät. Das Posenmodell
   ist ein WASM-Modul im Browser, das Video wird zur Auswertung an
   keinen Server geschickt. Das bleibt so, auch wenn die Clips später
   abgelegt werden — Ablegen und Auswerten sind zwei verschiedene
   Dinge.

   Diese Fassung kann darum schon jetzt etwas: einen Clip vom Gerät
   ansehen, Bild für Bild, mit Skelett und Winkeln. Ohne Worker, ohne
   Konto, ohne Ausrollen.

   ── Das Modell wird spät geladen ──────────────────────────────────
   MediaPipe kommt von einem CDN und wiegt ein paar Megabyte. Es wird
   erst geholt, wenn wirklich ausgewertet wird — wer nur ein Video
   ansehen will, lädt nichts nach. Und schlägt der Abruf fehl, bleibt
   die Wiedergabe: eine Analyse, die nicht geht, darf nicht die Seite
   mitnehmen.
   ══════════════════════════════════════════════════════════════════ */

import { requireAuth, escHtml, wireOfflineBanner, reportClientError }
  from '../../firebase-config.js';
import { mountShell } from '../../shell.js?v=7';
import {
  PUNKT, gelenkwinkel, seitenunterschied, hueftversatz, befund,
} from '../../pose.js';

const $ = id => document.getElementById(id);

/* Siehe einheit.js: tOr statt t() mit ??. */
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars) ?? fallback;

/* Genau die Verbindungen, die pose.js auch benutzt. Ein vollständiges
   Skelett mit Fingern und Gesicht sähe beeindruckender aus und würde
   von dem ablenken, worauf es ankommt. */
const KNOCHEN = [
  [PUNKT.schulterL, PUNKT.schulterR],
  [PUNKT.schulterL, PUNKT.hueftL], [PUNKT.schulterR, PUNKT.hueftR],
  [PUNKT.hueftL, PUNKT.hueftR],
  [PUNKT.hueftL, PUNKT.knieL], [PUNKT.knieL, PUNKT.knoechelL], [PUNKT.knoechelL, PUNKT.fussL],
  [PUNKT.hueftR, PUNKT.knieR], [PUNKT.knieR, PUNKT.knoechelR], [PUNKT.knoechelR, PUNKT.fussR],
];

const MODELL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/'
  + 'pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const TASKS = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

let detektor = null;
let laeuft = false;
let bildrate = 30;

/* ── Anzeige ───────────────────────────────────────────────────────*/

function zeige(id, an) {
  const el = $(id);
  if (el) el.hidden = !an;
}

function fehler(satz) {
  const feld = $('fehler');
  feld.textContent = satz;
  feld.hidden = false;
}

function zeichneSkelett(landmarks) {
  const video = $('video');
  const canvas = $('skelett');
  const ctx = canvas.getContext('2d');

  /* Das Canvas muss die ANGEZEIGTE Grösse haben, nicht die des Videos:
     sonst sitzt das Skelett verschoben, sobald das Bild skaliert wird. */
  const breite = video.clientWidth;
  const hoehe = video.clientHeight;
  if (canvas.width !== breite || canvas.height !== hoehe) {
    canvas.width = breite;
    canvas.height = hoehe;
  }
  ctx.clearRect(0, 0, breite, hoehe);
  if (!landmarks) return;

  /* Das Video steht mit object-fit: contain in der Bühne. Die
     Koordinaten des Modells sind auf das BILD normiert, nicht auf das
     Element — ohne diese Umrechnung liegt das Skelett auf den
     schwarzen Balken daneben. */
  const seitenVideo = (video.videoWidth || 1) / (video.videoHeight || 1);
  const seitenBox = breite / hoehe;
  const b = seitenVideo > seitenBox ? breite : hoehe * seitenVideo;
  const h = seitenVideo > seitenBox ? breite / seitenVideo : hoehe;
  const links = (breite - b) / 2;
  const oben = (hoehe - h) / 2;

  const nach = p => ({ x: links + p.x * b, y: oben + p.y * h });

  ctx.lineWidth = Math.max(2, breite / 220);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';

  for (const [a, z] of KNOCHEN) {
    const pa = landmarks[a];
    const pz = landmarks[z];
    /* Unsichere Punkte werden nicht verbunden. Eine Linie zu einem
       geratenen Knie sieht aus wie eine Messung — dieselbe Regel wie
       in pose.js, nur mit Tinte statt Zahlen. */
    if (!pa || !pz) continue;
    if ((pa.visibility ?? 1) < 0.5 || (pz.visibility ?? 1) < 0.5) continue;

    const A = nach(pa);
    const Z = nach(pz);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(Z.x, Z.y);
    ctx.stroke();
  }

  for (const index of Object.values(PUNKT)) {
    const p = landmarks[index];
    if (!p || (p.visibility ?? 1) < 0.5) continue;
    const P = nach(p);
    ctx.beginPath();
    ctx.arc(P.x, P.y, ctx.lineWidth * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function winkelZeile(name, wert, einheit = '°') {
  return `
    <div class="row" data-bereich="t-training">
      <span class="row__icon">${escHtml(name.slice(0, 1))}</span>
      <span class="row__body">
        <span class="row__title">${escHtml(name)}</span>
      </span>
      <span class="row__end">${wert == null ? '—' : escHtml(`${wert}${einheit}`)}</span>
    </div>`;
}

function zeigeWinkel(landmarks) {
  const w = gelenkwinkel(landmarks || []);
  const versatz = hueftversatz(landmarks || []);

  $('listWinkel').innerHTML = [
    winkelZeile(t('vid.knieL', 'Knie links'), w.links.knie),
    winkelZeile(t('vid.knieR', 'Knie rechts'), w.rechts.knie),
    winkelZeile(t('vid.unterschied', 'Unterschied'), seitenunterschied(w)),
    winkelZeile(t('vid.huefteL', 'Hüfte links'), w.links.huefte),
    winkelZeile(t('vid.huefteR', 'Hüfte rechts'), w.rechts.huefte),
    winkelZeile(t('vid.huftversatz', 'Hüftversatz'), versatz, ''),
  ].join('');
}

/* ── Das Modell ────────────────────────────────────────────────────*/

async function ladeDetektor() {
  if (detektor) return detektor;

  const { FilesetResolver, PoseLandmarker } = await import(TASKS);
  const dateien = await FilesetResolver.forVisionTasks(`${TASKS}/wasm`);
  detektor = await PoseLandmarker.createFromOptions(dateien, {
    baseOptions: { modelAssetPath: MODELL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  return detektor;
}

function erkenne(zeitMs) {
  if (!detektor) return null;
  const ergebnis = detektor.detectForVideo($('video'), zeitMs);
  return ergebnis?.landmarks?.[0] || null;
}

/* ── Wiedergabe ────────────────────────────────────────────────────*/

/** Einmal zeichnen, an der Stelle, wo das Video gerade steht. */
async function aktualisiere() {
  const video = $('video');
  let landmarks = null;

  if (detektor) {
    try { landmarks = erkenne(video.currentTime * 1000); }
    catch (e) { reportClientError('video/erkennen', e); }
  }

  zeichneSkelett(landmarks);
  zeigeWinkel(landmarks);

  const dauer = video.duration || 0;
  if (dauer) $('schieber').value = String(Math.round((video.currentTime / dauer) * 1000));
}

function schleife() {
  const video = $('video');
  if (video.paused || video.ended) return;
  aktualisiere();
  requestAnimationFrame(schleife);
}

/** Ein Bild vor oder zurück. Genau dafür sieht man sich einen Schwung an. */
function bildSchritt(richtung) {
  const video = $('video');
  video.pause();
  const schritt = 1 / bildrate;
  video.currentTime = Math.max(0, Math.min(video.duration || 0,
    video.currentTime + richtung * schritt));
}

/* ── Auswertung ────────────────────────────────────────────────────*/

/**
 * Den ganzen Clip abtasten.
 *
 * Bild für Bild springen und warten, bis der Browser wirklich dort
 * steht — ohne das 'seeked'-Ereignis liest der Detektor mehrfach
 * dasselbe Bild und der Befund beruht auf einem Bruchteil der Daten.
 */
async function analysiere() {
  const video = $('video');
  const knopf = $('btnAnalyse');
  const stand = $('analyseStand');

  if (laeuft) return;
  laeuft = true;
  knopf.disabled = true;
  video.pause();

  try {
    stand.hidden = false;
    stand.textContent = t('vid.modellLaedt', 'Modell wird geladen …');
    await ladeDetektor();

    const dauer = video.duration || 0;
    if (!dauer || !Number.isFinite(dauer)) throw new Error(t('vid.f.dauer', 'Die Länge des Videos ist unbekannt.'));

    const schritt = 1 / bildrate;
    const bilder = [];
    const merkeZeit = video.currentTime;

    for (let zeit = 0; zeit < dauer; zeit += schritt) {
      await new Promise(fertig => {
        video.addEventListener('seeked', fertig, { once: true });
        video.currentTime = zeit;
      });
      try { bilder.push(erkenne(zeit * 1000) || []); }
      catch { bilder.push([]); }

      if (bilder.length % 15 === 0) {
        stand.textContent = t('vid.fortschritt', '{n} % ausgewertet …',
          { n: Math.round((zeit / dauer) * 100) });
        /* Dem Browser Luft lassen, sonst friert die Seite ein und
           niemand kann abbrechen. */
        await new Promise(r => setTimeout(r, 0));
      }
    }

    video.currentTime = merkeZeit;
    zeigeBefund(befund(bilder, bildrate));
    stand.hidden = true;
  } catch (e) {
    reportClientError('video/analyse', e);
    stand.hidden = true;
    /* Der häufigste Grund ist, dass das Modell nicht geladen werden
       konnte — offline, blockiert, oder das CDN antwortet nicht. Die
       Wiedergabe funktioniert weiter. */
    fehler(t('vid.f.auswertung', 'Die Auswertung ging nicht. Das Video lässt sich trotzdem ansehen.'));
  } finally {
    laeuft = false;
    knopf.disabled = false;
  }
}

function zeigeBefund(b) {
  if (!b) return;

  const anteil = b.bilder ? Math.round((b.auswertbar / b.bilder) * 100) : 0;

  $('listBefund').innerHTML = [
    winkelZeile(t('vid.beugungL', 'Tiefste Beugung links'), b.tiefsteBeugungLinks),
    winkelZeile(t('vid.beugungR', 'Tiefste Beugung rechts'), b.tiefsteBeugungRechts),
    winkelZeile(t('vid.schwuenge', 'Schwünge'), b.schwuenge, ''),
    winkelZeile(t('vid.schwungdauer', 'Schwungdauer'), b.schwungdauerSekunden, ' s'),
    winkelZeile(t('vid.auswertbar', 'Auswertbare Bilder'), t('vid.vonN', '{a} von {b}', { a: b.auswertbar, b: b.bilder }), ''),
  ].join('');

  /* Die ehrlichste Zahl zuletzt: war nur ein Bruchteil auswertbar,
     sagt der Rest wenig, und das gehört dazugeschrieben statt in einer
     Fussnote versteckt. */
  $('befundHinweis').textContent = anteil < 60
    ? t('vid.wenigAuswertbar',
        'Nur {n} % der Bilder waren auswertbar — der Fahrer war zu oft '
        + 'verdeckt oder zu klein im Bild. Die Zahlen oben sagen entsprechend wenig.',
        { n: anteil })
    : t('vid.vielAuswertbar', '{n} % der Bilder waren auswertbar.', { n: anteil });

  zeige('secBefund', true);
}

/* ── Start ─────────────────────────────────────────────────────────*/

(async function () {
  try { await requireAuth('../login.html'); }
  catch { return; }

  wireOfflineBanner();
  mountShell({
    variant: 'bereich',
    title: t('vid.videoanalyse', 'Videoanalyse'),
    backHref: '../index.html',
    profile: {},
    onSettings: () => window.tvzaOpenSettings?.(),
  });

  const video = $('video');

  $('dateiWahl').addEventListener('change', event => {
    const datei = event.target.files?.[0];
    if (!datei) return;

    $('fehler').hidden = true;
    zeige('secBefund', false);

    /* Objekt-URL statt Data-URL: ein Video als Base64 im Speicher wäre
       bei 30 MB ein Problem, und der Browser kann aus einem Blob
       direkt streamen. */
    video.src = URL.createObjectURL(datei);
    video.addEventListener('loadedmetadata', () => {
      $('kopfMeta').textContent = `${datei.name} · ${
        Math.round(video.duration)} s · ${video.videoWidth}×${video.videoHeight}`;
      $('kopfMeta').hidden = false;
      zeige('secPlayer', true);
      aktualisiere();
    }, { once: true });
  });

  $('btnAbspielen').addEventListener('click', () => {
    if (video.paused) { video.play(); schleife(); }
    else video.pause();
    $('btnAbspielen').textContent = video.paused ? t('vid.abspielen', 'Abspielen') : t('vid.pause', 'Pause');
  });

  $('btnVorBild').addEventListener('click', () => bildSchritt(1));
  $('btnZurueckBild').addEventListener('click', () => bildSchritt(-1));
  $('btnAnalyse').addEventListener('click', analysiere);

  $('schieber').addEventListener('input', event => {
    if (!video.duration) return;
    video.pause();
    video.currentTime = (Number(event.target.value) / 1000) * video.duration;
  });

  video.addEventListener('seeked', aktualisiere);
  video.addEventListener('pause', () => { $('btnAbspielen').textContent = t('vid.abspielen', 'Abspielen'); });
  /* Das Skelett muss beim Drehen des Geräts neu gezeichnet werden,
     sonst sitzt es auf den alten Koordinaten. */
  window.addEventListener('resize', aktualisiere);
}());
