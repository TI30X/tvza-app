/* ══════════════════════════════════════════════════════════════════
   Eine Mahlzeit erfassen — das Bedienelement.

   Bis v.35.71.0 stand das alles in pages/foodtracker.html, mitten in
   einem Inline-Modul von 700 Zeilen: die Zutatenzeilen mit ihrer
   Vervollständigung, die Nährwertrechnung, das Mengenblatt ("ganze
   Packung / halbe / 100 g") und der Barcode-Scanner. Damit gab es
   Essen genau an einem Ort — dem persönlichen Tracker.

   Für die Gruppe (Phase 1) braucht es dasselbe an einem zweiten Ort.
   Ein zweiter Rechner wäre der falsche Weg gewesen: zwei Tabellen,
   zwei Rundungen, zwei Fehler. Also ist es EIN Bedienelement, das
   sich irgendwo hineinhängen lässt, und beide Seiten benutzen es.

   Es kennt weder Firebase noch die Gruppe. Es sammelt Zutaten und
   rechnet; was damit geschieht, entscheidet, wer es montiert hat.

   ── Warum es sein Markup selbst baut ───────────────────────────────
   Die Alternative wäre, acht Element-Kennungen hereinzureichen. Dann
   müsste jede Seite dieselben acht Elemente in derselben Verschachtelung
   tragen, und wer eines umbenennt, bekommt Falle 14: ein Zugriff ins
   Leere, der das ganze Modul beendet. Ein Aufhänger genügt.
   ══════════════════════════════════════════════════════════════════ */

import { searchFoods, findFood, defaultServing, registerFoods } from '../../foods.js';
import { naehrwerte, parseMenge } from '../../essen-modell.js';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const wort = (key, rueckfall, vars) => window.TVZAI18n?.tOr(key, rueckfall, vars)
  ?? String(rueckfall).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

const ICON_WEG = '<svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const ICON_SCAN = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>';

const SCAN_LIB = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
const OFF_BASIS = 'https://world.openfoodfacts.org/api/v2/product/';

let libVersprechen = null;
function scanLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (libVersprechen) return libVersprechen;
  libVersprechen = new Promise((ja, nein) => {
    const s = document.createElement('script');
    s.src = SCAN_LIB;
    s.onload = ja;
    s.onerror = nein;
    document.head.appendChild(s);
  });
  return libVersprechen;
}

/* Open Food Facts: der Barcode wird zu einem Produkt. Kein Schlüssel,
   kein Konto, keine Kosten — darum steht es hier und nicht im Worker. */
export async function barcodeSuchen(code, holen = fetch) {
  const felder = 'product_name,product_name_de,generic_name_de,generic_name,brands,quantity,serving_size,nutriments';
  try {
    const antwort = await holen(`${OFF_BASIS}${encodeURIComponent(code)}.json?fields=${felder}`);
    const j = await antwort.json();
    if (!j || j.status !== 1 || !j.product) return null;
    const p = j.product;
    const n = p.nutriments || {};
    const zahl = v => (v == null || v === '' || Number.isNaN(+v)) ? null : +v;
    const name = String(p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || '').trim();
    const marke = String(p.brands || '').split(',')[0].trim();
    if (!name) return { name: '', marke, kcal: null };
    let kcal = zahl(n['energy-kcal_100g']);
    if (kcal == null && zahl(n.energy_100g) != null) kcal = Math.round(zahl(n.energy_100g) / 4.184);
    return {
      name, marke,
      bekannt: findFood(name) || null,
      kcal,
      protein: zahl(n.proteins_100g) || 0,
      carbs: zahl(n.carbohydrates_100g) || 0,
      fat: zahl(n.fat_100g) || 0,
      fibre: zahl(n.fiber_100g) || 0,
      packung: parseMenge(p.quantity),
      portion: parseMenge(p.serving_size),
    };
  } catch { return null; }
}

/**
 * Hängt die Erfassung in `host`.
 *
 * @param {HTMLElement} host
 * @param {object}  o
 * @param {boolean} [o.scannen]      Barcode-Knopf zeigen
 * @param {Function}[o.onAendern]    nach jeder Änderung
 * @param {Function}[o.onVorschlag]  (name, {barcode, marke}) — nicht gefunden
 * @param {Function}[o.holen]        fetch, für Tests
 */
export function erfassungMontieren(host, {
  scannen = true,
  onAendern = () => {},
  onVorschlag = null,
  onFertig = null,
  holen = (...a) => fetch(...a),
} = {}) {
  if (!host) throw new Error('erfassung: kein Aufhänger');

  host.classList.add('erfassung');
  host.innerHTML = `
    <div class="erfassung__zeilen" data-zeilen></div>
    <div class="erfassung__knoepfe">
      ${scannen ? `<button class="b b--primary erfassung__scan" type="button" data-scan>${ICON_SCAN}<span>${esc(wort('fd.scannen', 'Scannen'))}</span></button>` : ''}
      <button class="b b--secondary" type="button" data-neu><span class="ui-plus" aria-hidden="true"></span><span>${esc(wort('fd.zutat', 'Zutat'))}</span></button>
    </div>
    <div class="erfassung__nutri" data-nutri hidden></div>`;

  const zeilen = host.querySelector('[data-zeilen]');
  const nutriBox = host.querySelector('[data-nutri]');
  let lauf = 0;
  let zerstoert = false;

  /* ── Eine Zutatenzeile ──────────────────────────────────────────*/
  function zeileAnlegen(name = '', g = '') {
    const id = ++lauf;
    const zeile = document.createElement('div');
    zeile.className = 'erfassung__zeile';
    zeile.dataset.zeile = String(id);
    zeile.innerHTML = `
      <div class="erfassung__feld">
        <input class="form-input" type="text" data-name autocomplete="off"
               placeholder="${esc(wort('fd.zutatPh', 'z.B. Haferflocken'))}"
               aria-label="${esc(wort('fd.zutat', 'Zutat'))}" value="${esc(name)}" />
        <div class="erfassung__vorschlaege" data-liste hidden></div>
      </div>
      <input class="form-input erfassung__gramm" type="number" min="1" max="5000" data-gramm
             placeholder="g" aria-label="${esc(wort('fd.gramm', 'Gramm'))}" value="${esc(g)}" />
      <button class="b b--danger erfassung__weg" type="button" data-weg
              aria-label="${esc(wort('fd.zutatWeg', 'Zutat entfernen'))}">${ICON_WEG}</button>`;
    zeilen.appendChild(zeile);
    return zeile;
  }

  /* Ein Zuhörer für alle Zeilen statt einer je Zeile: wer zwanzig
     Zutaten einträgt, hängt sonst sechzig Zuhörer an die Seite. */
  zeilen.addEventListener('input', event => {
    if (event.target.matches('[data-name]')) vorschlaegeZeigen(event.target);
    else if (event.target.matches('[data-gramm]')) rechnen();
  });
  zeilen.addEventListener('click', event => {
    const weg = event.target.closest('[data-weg]');
    if (weg) {
      weg.closest('[data-zeile]')?.remove();
      if (!zeilen.children.length) zeileAnlegen();
      rechnen();
      return;
    }
    const treffer = event.target.closest('[data-waehle]');
    if (treffer) { uebernehmen(treffer); return; }
    const melde = event.target.closest('[data-melde]');
    if (melde && onVorschlag) {
      melde.closest('[data-zeile]').querySelector('[data-liste]').hidden = true;
      onVorschlag(melde.dataset.melde, {});
    }
  });
  /* mousedown, nicht click: der Verlust des Fokus schliesst die Liste,
     und click käme danach. Am Finger tut touchstart dasselbe. */
  zeilen.addEventListener('mousedown', event => {
    const treffer = event.target.closest('[data-waehle]');
    if (treffer) event.preventDefault();
  });
  zeilen.addEventListener('focusout', event => {
    const feld = event.target.closest('[data-name]');
    if (!feld) return;
    setTimeout(() => { if (!zerstoert) feld.closest('[data-zeile]')?.querySelector('[data-liste]')?.setAttribute('hidden', ''); }, 150);
  });

  function vorschlaegeZeigen(feld) {
    const zeile = feld.closest('[data-zeile]');
    const liste = zeile.querySelector('[data-liste]');
    const frage = feld.value.trim();
    if (!frage) { liste.hidden = true; rechnen(); return; }
    const treffer = searchFoods(feld.value);
    let html = treffer.map(f => `
      <button class="erfassung__vorschlag" type="button" data-waehle="${esc(f.name)}">
        <span>${esc(f.name)}</span><small>${Math.round(f.kcal)} kcal/100 g</small>
      </button>`).join('');
    if (frage.length >= 2 && onVorschlag) {
      html += `<button class="erfassung__vorschlag erfassung__vorschlag--neu" type="button" data-melde="${esc(frage)}">
        <span>${esc(wort('fd.vorschlagen', 'Lebensmittel vorschlagen'))}</span><small>${esc(wort('fd.nichtInListe', 'nicht in der Liste'))}</small>
      </button>`;
    }
    liste.innerHTML = html;
    liste.hidden = !html;
    rechnen();
  }

  function uebernehmen(knopf) {
    const zeile = knopf.closest('[data-zeile]');
    const name = knopf.dataset.waehle;
    zeile.querySelector('[data-name]').value = name;
    zeile.querySelector('[data-liste]').hidden = true;
    const gramm = zeile.querySelector('[data-gramm]');
    const food = findFood(name);
    /* Ein Tipp genügt: die übliche Portion steht schon da. */
    if (food && !gramm.value) gramm.value = defaultServing(food).grams;
    gramm.focus();
    rechnen();
  }

  /* ── Lesen und rechnen ──────────────────────────────────────────*/
  function zutaten() {
    const raus = [];
    for (const zeile of zeilen.querySelectorAll('[data-zeile]')) {
      const name = zeile.querySelector('[data-name]').value.trim();
      const g = parseFloat(zeile.querySelector('[data-gramm]').value) || 0;
      if (name && g > 0) raus.push({ name, g });
    }
    return raus;
  }

  const summe = () => naehrwerte(zutaten(), findFood);

  function rechnen() {
    const liste = zutaten();
    if (!liste.length) { nutriBox.hidden = true; onAendern(); return; }
    const s = summe();
    nutriBox.hidden = false;
    nutriBox.innerHTML = `
      <strong class="erfassung__kcal">${Math.round(s.kcal)} kcal</strong>
      <span class="erfassung__makro">${esc(wort('fd.protein', 'Protein'))} ${s.protein.toFixed(1)} g</span>
      <span class="erfassung__makro">${esc(wort('fd.kh', 'KH'))} ${s.carbs.toFixed(1)} g</span>
      <span class="erfassung__makro">${esc(wort('fd.fett', 'Fett'))} ${s.fat.toFixed(1)} g</span>
      <span class="erfassung__makro">${esc(wort('fd.ballast', 'Ballaststoffe'))} ${s.fibre.toFixed(1)} g</span>
      ${s.unbekannt.length ? `<span class="erfassung__offen">${esc(wort('fd.unbekannt', 'Ohne Nährwerte: {liste}', { liste: s.unbekannt.join(', ') }))}</span>` : ''}`;
    onAendern();
  }

  /* ── Eine Zutat von aussen einsetzen ────────────────────────────*/
  function einsetzen(name, g) {
    let ziel = null;
    for (const zeile of zeilen.querySelectorAll('[data-zeile]')) {
      if (!ziel && !zeile.querySelector('[data-name]').value.trim()) ziel = zeile;
    }
    if (!ziel) ziel = zeileAnlegen();
    ziel.querySelector('[data-name]').value = name;
    ziel.querySelector('[data-gramm]').value = Math.round(g);
    rechnen();
  }

  /* ── Das Mengenblatt ────────────────────────────────────────────
     Nach einem Scan steht die Frage an, die man mit dem Daumen
     beantworten will: ganze Packung, halbe, eine Portion, 100 g. */
  let blatt = null;
  function mengeFragen(food, { packung = null, portion = null, marke = '', danach = null } = {}) {
    blattWeg();
    const p = defaultServing(food);
    const portionG = portion || p.grams;
    const knoepfe = [];
    if (packung) {
      knoepfe.push({ wort: wort('fd.ganzePackung', 'Ganze Packung'), sub: `${Math.round(packung)} g`, g: packung });
      knoepfe.push({ wort: wort('fd.halbePackung', 'Halbe Packung'), sub: `${Math.round(packung / 2)} g`, g: packung / 2 });
    }
    knoepfe.push({
      wort: p.label === '100 g' ? wort('fd.einePortion', '1 Portion') : p.label,
      sub: `${Math.round(portionG)} g · ${Math.round(food.kcal * portionG / 100)} kcal`,
      g: portionG,
    });
    if (Math.abs(portionG - 100) > 1) knoepfe.push({ wort: '100 g', sub: `${Math.round(food.kcal)} kcal`, g: 100 });

    blatt = document.createElement('div');
    blatt.className = 'erfassung-blatt';
    blatt.innerHTML = `
      <div class="erfassung-blatt__karte" role="dialog" aria-modal="true" aria-label="${esc(wort('fd.wieViel', 'Wie viel?'))}">
        <p class="erfassung-blatt__titel">${esc(food.name)}</p>
        <p class="erfassung-blatt__sub">${esc(marke ? `${marke} · ` : '')}${Math.round(food.kcal)} kcal / 100 g</p>
        <div class="erfassung-blatt__wahl">
          ${knoepfe.map((k, i) => `<button class="b ${i === 0 ? 'b--primary' : 'b--secondary'} b--block erfassung-blatt__knopf" type="button" data-menge="${k.g}">
            <span>${esc(k.wort)}</span><small>${esc(k.sub)}</small></button>`).join('')}
        </div>
        <div class="form-group">
          <label class="form-label" for="erfassungMenge">${esc(wort('fd.eigeneMenge', 'Eigene Menge (g)'))}</label>
          <div class="erfassung-blatt__eigen">
            <input class="form-input" id="erfassungMenge" type="number" min="1" max="5000" placeholder="g" />
            <button class="b b--primary" type="button" data-eigen>${esc(wort('fd.hinzufuegen', 'Hinzufügen'))}</button>
          </div>
        </div>
        <button class="b b--secondary b--block" type="button" data-blatt-zu>${esc(wort('common.abbrechen', 'Abbrechen'))}</button>
      </div>`;
    document.body.appendChild(blatt);

    const nehmen = g => {
      if (!(g > 0)) return;
      registerFoods(food);
      einsetzen(food.name, g);
      blattWeg();
      danach?.();
    };
    blatt.addEventListener('click', event => {
      const menge = event.target.closest('[data-menge]');
      if (menge) { nehmen(parseFloat(menge.dataset.menge)); return; }
      if (event.target.closest('[data-eigen]')) { nehmen(parseFloat(blatt.querySelector('#erfassungMenge').value)); return; }
      if (event.target.closest('[data-blatt-zu]') || event.target === blatt) { blattWeg(); danach?.(); }
    });
  }
  function blattWeg() { blatt?.remove(); blatt = null; }

  /* ── Der Scanner ────────────────────────────────────────────────*/
  let scanner = null;
  let scanFlaeche = null;
  let letzterCode = '';

  function scanStand(text) {
    const el = scanFlaeche?.querySelector('[data-stand]');
    if (el) el.textContent = text;
  }

  async function kameraStarten() {
    try { await scanLib(); }
    catch { scanStand(wort('fd.scanWeg', 'Der Scanner liess sich nicht laden — Code von Hand eingeben.')); return; }
    const formate = window.Html5QrcodeSupportedFormats ? [
      window.Html5QrcodeSupportedFormats.EAN_13, window.Html5QrcodeSupportedFormats.EAN_8,
      window.Html5QrcodeSupportedFormats.UPC_A, window.Html5QrcodeSupportedFormats.UPC_E,
      window.Html5QrcodeSupportedFormats.CODE_128,
    ] : undefined;
    try {
      scanner = new window.Html5Qrcode('erfassungLeser', { formatsToSupport: formate, verbose: false });
      scanStand(wort('fd.scanHalten', 'Halte den Barcode in den Rahmen.'));
      await scanner.start({ facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 160 } },
        code => void gescannt(code), () => {});
    } catch {
      scanStand(wort('fd.scanKeineKamera', 'Kein Kamerazugriff — Code bitte von Hand eingeben.'));
    }
  }

  async function kameraStoppen() {
    if (!scanner) return;
    try { await scanner.stop(); scanner.clear(); } catch { /* schon zu */ }
    scanner = null;
  }

  function scannerOeffnen() {
    if (scanFlaeche) return;
    scanFlaeche = document.createElement('div');
    scanFlaeche.className = 'erfassung-scan';
    scanFlaeche.innerHTML = `
      <div class="erfassung-scan__karte" role="dialog" aria-modal="true" aria-label="${esc(wort('fd.barcode', 'Barcode scannen'))}">
        <p class="erfassung-scan__titel">${esc(wort('fd.barcode', 'Barcode scannen'))}</p>
        <div class="erfassung-scan__leser" id="erfassungLeser"></div>
        <p class="erfassung-scan__stand" data-stand>${esc(wort('fd.kamera', 'Kamera wird gestartet…'))}</p>
        <div class="erfassung-scan__bisher" data-bisher hidden></div>
        ${onFertig ? `<button class="b b--primary b--block" type="button" data-fertig hidden>${esc(wort('fd.dasWars', 'Das war\'s — speichern'))}</button>` : ''}
        <div class="form-group">
          <label class="form-label" for="erfassungCode">${esc(wort('fd.codeHand', 'Oder Code von Hand eingeben'))}</label>
          <div class="erfassung-blatt__eigen">
            <input class="form-input" id="erfassungCode" type="text" inputmode="numeric" autocomplete="off" />
            <button class="b b--primary" type="button" data-code>OK</button>
          </div>
        </div>
        <button class="b b--secondary b--block" type="button" data-scan-zu>${esc(wort('a11y.schliessen', 'Schliessen'))}</button>
      </div>`;
    document.body.appendChild(scanFlaeche);
    scanFlaeche.addEventListener('click', event => {
      if (event.target.closest('[data-fertig]')) {
        void scannerSchliessen().then(() => onFertig?.());
        return;
      }
      if (event.target.closest('[data-code]')) {
        const feld = scanFlaeche.querySelector('#erfassungCode');
        const code = feld.value.trim();
        feld.value = '';
        if (code) void gescannt(code);
        return;
      }
      if (event.target.closest('[data-scan-zu]') || event.target === scanFlaeche) void scannerSchliessen();
    });
    bisherZeigen();
    void kameraStarten();
  }

  function bisherZeigen() {
    const el = scanFlaeche?.querySelector('[data-bisher]');
    if (!el) return;
    const liste = zutaten();
    el.hidden = !liste.length;
    const fertig = scanFlaeche?.querySelector('[data-fertig]');
    if (fertig) fertig.hidden = !liste.length;
    if (!liste.length) return;
    const s = summe();
    el.innerHTML = liste.map(z => `<span class="erfassung-scan__zeile"><span>${esc(z.name)}</span><small>${Math.round(z.g)} g</small></span>`).join('')
      + `<span class="erfassung-scan__zeile erfassung-scan__zeile--summe"><span>${esc(wort('fd.artikelN', '{n} Artikel', { n: liste.length }))}</span><small>${Math.round(s.kcal)} kcal</small></span>`;
  }

  async function scannerSchliessen() {
    await kameraStoppen();
    scanFlaeche?.remove();
    scanFlaeche = null;
  }

  async function gescannt(code) {
    if (code === letzterCode) return;          // Doppelscans ignorieren
    letzterCode = code;
    setTimeout(() => { letzterCode = ''; }, 2500);
    await kameraStoppen();
    scanStand(wort('fd.scanSuche', 'Produkt wird gesucht…'));
    const produkt = await barcodeSuchen(code, holen);
    const weiter = () => { if (scanFlaeche) { bisherZeigen(); void kameraStarten(); } };
    await scannerSchliessen();
    if (!produkt) { onVorschlag?.('', { barcode: code }); return; }
    const opt = { packung: produkt.packung, portion: produkt.portion, marke: produkt.marke, danach: () => { scannerOeffnen(); weiter(); } };
    if (produkt.bekannt) mengeFragen(produkt.bekannt, opt);
    else if (produkt.kcal != null) {
      mengeFragen({
        name: produkt.name, kcal: produkt.kcal, protein: produkt.protein,
        carbs: produkt.carbs, fat: produkt.fat, fibre: produkt.fibre, micros: [],
      }, opt);
    } else onVorschlag?.(produkt.name, { barcode: code, marke: produkt.marke });
  }

  host.querySelector('[data-neu]')?.addEventListener('click', () => {
    zeileAnlegen().querySelector('[data-name]').focus();
  });
  host.querySelector('[data-scan]')?.addEventListener('click', scannerOeffnen);

  zeileAnlegen();

  return {
    zutaten,
    summe,
    leeren() { zeilen.innerHTML = ''; zeileAnlegen(); nutriBox.hidden = true; onAendern(); },
    setzen(liste) {
      zeilen.innerHTML = '';
      for (const z of liste || []) zeileAnlegen(z.name, z.g ?? z.grams ?? '');
      if (!zeilen.children.length) zeileAnlegen();
      rechnen();
    },
    einsetzen,
    mengeFragen,
    fokus() { zeilen.querySelector('[data-name]')?.focus(); },
    zerstoeren() {
      zerstoert = true;
      blattWeg();
      void scannerSchliessen();
      host.innerHTML = '';
    },
  };
}
