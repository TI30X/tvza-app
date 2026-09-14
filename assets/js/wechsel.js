/* Der Wechsel zwischen Firn und TVZA (v.35.40.0).

   Firn und TVZA leben in einer App, sind aber zwei Softwares. Wer von
   Start in die Maturaarbeit tippt, wechselt die Software — und soll es
   sehen: oben in der Leiste wird der Firn-Berg zum T, "Firn" blendet zu
   "TVZA". Zurück genau umgekehrt.

   ── Warum das eine Verwandlung sein kann ───────────────────────────
   Die beiden Symbole sind Geschwister (tvza.svg erzählt es): dasselbe
   64er Raster, dieselbe Form von 17 bis 47, das Alpenglühen oben. Die
   glühende Spitze des Bergs zieht sich zum Balken des T auseinander,
   die zwei Schneebänder schieben sich zum Stamm zusammen. Jeder Teil ist
   ein Viereck, und jedes Viereck hat in beiden Symbolen vier Ecken — die
   Spitze des Bergs ist ein Viereck mit zwei Ecken am selben Punkt. So
   wird nur zwischen Ecken gerechnet; das läuft in jedem Browser, auch
   wo CSS keinen Pfad animieren kann (Safari).

   ── Nur an der Grenze ──────────────────────────────────────────────
   Zwischen Kalender und Gruppe passiert nichts. Eine Animation bei
   jedem Tipp nutzt sich ab; diese sagt nur eines: du bist jetzt in der
   anderen Software.

   ── Wer entscheidet ────────────────────────────────────────────────
   Die Seite sagt, wozu sie gehört: <body data-marke="TVZA">. Ohne das
   Attribut ist sie Firn. tvza-teil.test.mjs hält das Attribut mit
   TVZA_BEREICHE gleich. Der Router meldet nach jedem Wechsel die Seite
   im Rahmen (softwareZeigen), die Leiste setzt beim Bauen den Anfang.

   Am Handy gibt es keinen Kopf der Leiste. Dort erscheint das Zeichen
   kurz oben in der Mitte und verwandelt sich da. Wer weniger Bewegung
   eingestellt hat, bekommt den Endstand ohne Verwandlung.

   ── Deutlicher (v.35.51.0) ─────────────────────────────────────────
   Michel: "die Animation sollte viel deutlicher sein". 450 ms oben in
   der Leiste las sich wie ein Flackern. Jetzt gleitet oben eine Karte
   herein, am Handy UND am Laptop, das Zeichen verwandelt sich darin
   (700 ms), die Karte wechselt die Farbe mit, und das Zeichen in der
   Leiste pulsiert dazu. Eine erste Fassung stand gross in der Bildmitte
   über abgedunkelter Seite — zu aufdringlich (Michel). Nur an der
   Grenze, wie vorher; wer weniger Bewegung will, sieht den Endstand. */

export const FIRN = 'firn', TVZA = 'tvza';
export const DAUER = 700;

/* Halbe Breite des Firn-Bergs (M32 17 L51 46 L13 46) auf Höhe y. */
const hw = y => 19 * (y - 17) / 29;
const trapez = (y1, y2) => [[32 - hw(y1), y1], [32 + hw(y1), y1], [32 + hw(y2), y2], [32 - hw(y2), y2]];

/* Je drei Vierecke, Ecken im Uhrzeigersinn ab oben links. Die Zahlen
   stehen in firn.svg und tvza.svg; wechsel.test.mjs rechnet nach, dass
   beide Enden genau die Symbole sind. Der Stamm des T ist in der Mitte
   geteilt — jedes Schneeband wird eine Hälfte. */
export const FORMEN = Object.freeze({
  firn: {
    glut:  [[32, 17], [32, 17], [32 + hw(28), 28], [32 - hw(28), 28]],
    band1: trapez(30.5, 37),
    band2: trapez(39.5, 46),
  },
  tvza: {
    glut:  [[16, 17], [48, 17], [48, 27], [16, 27]],
    band1: [[26.5, 29.5], [37.5, 29.5], [37.5, 38.25], [26.5, 38.25]],
    band2: [[26.5, 38.25], [37.5, 38.25], [37.5, 47], [26.5, 47]],
  },
});
const TEILE = ['glut', 'band1', 'band2'];
const GRUND = { firn: ['#0C2138', '#1256B0'], tvza: ['#1A1A2E', '#0F3460'] };

/** Die Form bei t (0 = Firn, 1 = TVZA). */
export function form(t) {
  const raus = {};
  for (const k of TEILE) {
    raus[k] = FORMEN.firn[k].map(([x, y], i) => {
      const [x2, y2] = FORMEN.tvza[k][i];
      return [x + (x2 - x) * t, y + (y2 - y) * t];
    });
  }
  return raus;
}

const zahl = z => String(Math.round(z * 1000) / 1000);

/** Setzt ein Zeichen auf t. */
export function stelle(svg, t) {
  const f = form(t);
  for (const k of TEILE) {
    svg.querySelector(`[data-teil="${k}"]`).setAttribute('points', f[k].map(p => p.map(zahl).join(',')).join(' '));
  }
  svg.querySelector('[data-teil="grund"]').setAttribute('opacity', zahl(t));
  svg.setAttribute('data-t', zahl(t));
}

let zaehler = 0;
/** Ein Zeichen als SVG im Dokument — nicht als <img>, damit es sich bewegen kann. */
export function zeichen(software = FIRN, doc = document) {
  const ns = 'http://www.w3.org/2000/svg';
  const n = ++zaehler;
  const el = (name, attrs = {}) => {
    const e = doc.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const svg = el('svg', { viewBox: '0 0 64 64', width: 28, height: 28, 'aria-hidden': 'true', 'data-software-zeichen': '' });
  const defs = el('defs');
  for (const [name, [a, b]] of Object.entries(GRUND)) {
    const verlauf = el('linearGradient', { id: `wechsel-${name}-${n}`, x1: 0, y1: 0, x2: 1, y2: 1 });
    verlauf.append(el('stop', { offset: 0, 'stop-color': a }), el('stop', { offset: 1, 'stop-color': b }));
    defs.append(verlauf);
  }
  svg.append(
    defs,
    el('rect', { width: 64, height: 64, rx: 14, fill: `url(#wechsel-firn-${n})` }),
    /* Das TVZA-Navy liegt darüber und blendet mit t ein. */
    el('rect', { width: 64, height: 64, rx: 14, fill: `url(#wechsel-tvza-${n})`, 'data-teil': 'grund' }),
    el('polygon', { fill: '#F6A183', 'data-teil': 'glut' }),
    el('polygon', { fill: '#FFFFFF', 'data-teil': 'band1' }),
    el('polygon', { fill: '#FFFFFF', 'data-teil': 'band2' }),
  );
  stelle(svg, software === TVZA ? 1 : 0);
  return svg;
}

/** Die beiden Wortzeichen übereinander; CSS zeigt das von data-software. */
export function wort(doc = document) {
  const span = doc.createElement('span');
  span.className = 'software-wort';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<span class="firn firn--hell">Fir<b>n</b></span><span class="tvza">TVZA</span>';
  return span;
}

/* ── Eine Marke je Person (v.35.52.0) ──────────────────────────────
   Von v.35.48.0 bis v.35.51.0 wechselte die Marke mit der SEITE: Start,
   Kalender und Chat waren für den TVZA-Kreis "TVZA" (das Zuhause), die
   Gruppe Firn — oben links stand mal das eine, mal das andere. Michel:
   "die Application heisst Firn — und jetzt zeigen wir TVZA oben links",
   dann: "für Familie TVZA, für alle anderen Firn. TVZA ist wirklich nur
   für Familie und Freunde."

   Darum hängt die Marke jetzt an der PERSON, nicht an der Seite: wer im
   TVZA-Kreis ist, sieht überall TVZA (Leiste, Tab, Titel, Versionszeile),
   alle anderen überall Firn. Kein Umschalten zwischen Seiten. Bis das
   Profil da ist, gilt, was dieses Gerät zuletzt wusste — sonst blitzte
   bei Freunden und Familie erst Firn auf. softwareZeigen() bleibt für
   den Fall, dass sich die Marke ändert (jemand kommt in den Kreis). */

const MARKE = 'firn.marke';
let marke = null;

/** Die Marke der angemeldeten Person: TVZA im Kreis, sonst Firn. */
export function markeSetzen(imKreis) {
  marke = imKreis ? TVZA : FIRN;
  try { globalThis.localStorage?.setItem(MARKE, marke); } catch { /* ohne Speicher eben ohne Erinnerung */ }
  return marke;
}
export function aktuelleMarke() {
  if (marke) return marke;
  try { return globalThis.localStorage?.getItem(MARKE) === TVZA ? TVZA : FIRN; } catch { return FIRN; }
}
/** Nur für Tests: vergisst die Marke. */
export function _markeVergessen() { marke = null; }

export const tvzaSymbol = href => String(href || '').replace(/firn\.svg(\?|$)/, 'tvza.svg$1');
export const tvzaTitel = titel => String(titel || '').replace(/Firn$/, 'TVZA');

/**
 * Macht eine Seite zur TVZA-Seite, wenn die Person im Kreis ist: Marke,
 * Tab-Symbol, Titel und Versionszeile. Der Titel verliert dabei sein
 * data-i18n — sonst setzte der Katalog, der später kommt, "Firn" zurück
 * (Falle 5). Für alle anderen bleibt die Seite, wie sie ist.
 */
export function seiteMarkieren(doc = document) {
  if (aktuelleMarke() !== TVZA || !doc?.body) return false;
  doc.body.dataset.marke = 'TVZA';
  const link = doc.querySelector('link[rel="icon"]');
  if (link) link.setAttribute('href', tvzaSymbol(link.getAttribute('href')));
  const titel = doc.querySelector('title');
  if (titel && /Firn$/.test(doc.title)) {
    titel.removeAttribute('data-i18n');
    doc.title = tvzaTitel(doc.title);
  }
  const version = doc.querySelector('.fx-version');
  if (version) version.textContent = version.textContent.replace(/^Firn/, 'TVZA');
  return true;
}

/** Zu welcher Software ein Dokument gehört — die Seite sagt es selbst. */
export function softwareVon(doc) {
  return doc?.body?.dataset?.marke === 'TVZA' ? TVZA : FIRN;
}

const glatt = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const laeufe = new WeakMap();

/** Bewegt ein Zeichen von seinem Stand nach Firn oder TVZA. */
export function bewege(svg, nach, dauer = DAUER) {
  const von = Number(svg.getAttribute('data-t') || 0);
  const ziel = nach === TVZA ? 1 : 0;
  const win = svg.ownerDocument.defaultView;
  if (laeufe.has(svg)) win.cancelAnimationFrame(laeufe.get(svg));
  return new Promise(fertig => {
    let start = null;
    const schritt = jetzt => {
      if (start === null) start = jetzt;
      const k = Math.min(1, (jetzt - start) / dauer);
      stelle(svg, von + (ziel - von) * glatt(k));
      if (k < 1) laeufe.set(svg, win.requestAnimationFrame(schritt));
      else { laeufe.delete(svg); fertig(); }
    };
    laeufe.set(svg, win.requestAnimationFrame(schritt));
  });
}

const passt = (win, frage) => !!win.matchMedia?.(frage).matches;
const warte = ms => new Promise(r => setTimeout(r, ms));

/* Die Karte oben: sie erscheint in der alten Software, verwandelt sich,
   bleibt kurz stehen und geht. Durchklickbar — die Seite darunter ist
   schon da. */
async function hinweis(doc, von, nach, ruhig) {
  doc.querySelector('.wechsel-hinweis')?.remove();
  const box = doc.createElement('div');
  box.className = 'wechsel-hinweis';
  box.setAttribute('aria-hidden', 'true');
  box.dataset.software = von;
  const karte = doc.createElement('div');
  karte.className = 'wechsel-hinweis__karte';
  const svg = zeichen(von, doc);
  karte.append(svg, wort(doc));
  box.append(karte);
  doc.body.append(box);
  const win = doc.defaultView;
  win.requestAnimationFrame(() => box.classList.add('is-da'));
  await warte(220);
  box.dataset.software = nach;
  if (ruhig) stelle(svg, nach === TVZA ? 1 : 0);
  else await bewege(svg, nach);
  await warte(500);
  box.classList.remove('is-da');
  await warte(320);
  box.remove();
}

/* Das Zeichen in der Leiste pulsiert, solange es sich verwandelt. */
function puls(nav, win) {
  nav.classList.remove('is-wechsel');
  void nav.offsetWidth;
  nav.classList.add('is-wechsel');
  win.setTimeout(() => nav.classList.remove('is-wechsel'), DAUER + 200);
}

let aktuell = null;

/* Über eine Seitengrenze hinweg. Die Gruppe (und Einheit, Video) lädt
   der Router nicht in seinen Rahmen, sondern als neue Seite — dort
   beginnt dieses Modul von vorn und wüsste nicht, dass man eben noch in
   TVZA war. Für den TVZA-Kreis ist aber genau das der Wechsel: vom
   Zuhause in die Gruppe (v.35.48.0). Darum merkt sich die Sitzung, in
   welcher Software man zuletzt war. Eine Seite im Rahmen des Routers
   merkt nichts und zeigt nichts — das tut die Seite oben. */
const MERKER = 'firn.software';
const gerahmt = win => !!win && win.parent !== win;
function zuletzt(win) {
  if (gerahmt(win)) return null;
  try { return win.sessionStorage.getItem(MERKER); } catch { return null; }
}
function merken(win, software) {
  if (gerahmt(win)) return;
  try { win.sessionStorage.setItem(MERKER, software); } catch { /* ohne Speicher eben ohne Übergang */ }
}

/**
 * Zeigt, in welcher Software man ist. Beim ersten Aufruf (die Leiste
 * wird gebaut) ohne Bewegung — ausser man kommt gerade von einer Seite
 * der anderen Software. Danach nur, wenn sich die Software ändert.
 * Gibt zurück, ob sich etwas geändert hat.
 */
export function softwareZeigen(ziel, { sanft = true, doc = document } = {}) {
  const win = doc.defaultView;
  const erstes = aktuell === null;
  if (aktuell === ziel) return false;
  const vorher = erstes ? zuletzt(win) : null;
  const quer = erstes && (vorher === FIRN || vorher === TVZA) && vorher !== ziel;
  const von = aktuell || (quer ? vorher : null) || FIRN;
  aktuell = ziel;
  merken(win, ziel);

  const ruhig = (erstes && !quer) || !sanft || passt(win, '(prefers-reduced-motion: reduce)');
  for (const nav of doc.querySelectorAll('.nav')) {
    const zeichenListe = nav.querySelectorAll('[data-software-zeichen]');
    if (ruhig) {
      nav.dataset.software = ziel;
      zeichenListe.forEach(svg => stelle(svg, ziel === TVZA ? 1 : 0));
    } else if (quer) {
      /* Die neue Seite beginnt, wo die alte aufgehört hat, und
         verwandelt sich dann — Zeichen und Wort. */
      nav.dataset.software = von;
      zeichenListe.forEach(svg => { stelle(svg, von === TVZA ? 1 : 0); bewege(svg, ziel); });
      win.requestAnimationFrame(() => { nav.dataset.software = ziel; });
      puls(nav, win);
    } else {
      nav.dataset.software = ziel;
      zeichenListe.forEach(svg => bewege(svg, ziel));
      puls(nav, win);
    }
  }
  /* Oben in der Mitte, am Handy und am Laptop (bis v.35.50.0 nur am
     Handy und klein). */
  if ((!erstes || quer) && sanft) hinweis(doc, von, ziel, ruhig);
  return true;
}

/** Nur für Tests: vergisst den Stand. */
export function _zuruecksetzen() { aktuell = null; }
