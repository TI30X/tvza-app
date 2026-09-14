/* ══════════════════════════════════════════════════════════════════
   Fragen, Eingaben und Meldungen — gestaltet statt vom Browser.

   Bis v.35.24.0 stellte die Gruppe ihre Fragen mit prompt(), confirm()
   und alert(). Das sind Fenster des Browsers: grau, mit dem Namen der
   Adresse im Kopf, auf jedem Geraet anders, und am Handy mit einer
   Tastatur, die die Frage verdeckt. Beim Anlegen einer Gruppe musste
   man sogar eine Ziffer tippen — "1 — Rennkader, 2 — Verein …" —,
   weil drei Antworten fuer confirm() zu viele sind.

   Vier Formen, alle mit einem Promise:

     await frage({ titel, text, ja, gefahr })     → true | false
     await eingabe({ titel, text, wert, … })       → String | null
     await meldung({ titel, text })               → undefined
     await waehle({ titel, optionen })            → wert | null

   Gebaut auf <dialog>: Escape schliesst, der Fokus bleibt im Dialog,
   und der Bildschirmleser weiss, dass es ein Dialog ist. Am Handy steht
   er unten, wo der Daumen ist; am Laptop in der Mitte.
   ══════════════════════════════════════════════════════════════════ */

/* Ohne i18n.js fehlte hier das Einsetzen der Platzhalter: aus
   "{grund}" wurde kein Grund, sondern das Wort {grund} selbst. */
const t = (key, fallback, vars) => window.TVZAI18n?.tOr(key, fallback, vars)
  ?? String(fallback).replace(/\{(\w+)\}/g, (ganz, name) => (vars?.[name] ?? ganz));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Ein Dialog auf einmal. Wer eine zweite Frage stellt, waehrend die
   erste offen ist, bekommt sie danach — nicht uebereinander. */
let kette = Promise.resolve();

function oeffne(bauen) {
  const lauf = kette.then(() => new Promise(fertig => {
    const d = document.createElement('dialog');
    d.className = 'frage';
    d.innerHTML = bauen();
    document.body.appendChild(d);

    let ergebnis;
    const zu = wert => {
      ergebnis = wert;
      if (typeof d.close === 'function' && d.open) d.close();
      else d.removeAttribute('open');
      d.remove();
      fertig(ergebnis);
    };

    d.addEventListener('cancel', event => { event.preventDefault(); zu(null); });
    /* Ein Klick auf den abgedunkelten Rand schliesst — nicht aber ein
       Klick in die Karte hinein, der zufaellig auf dem Rand endet. */
    d.addEventListener('click', event => { if (event.target === d) zu(null); });
    d.querySelector('[data-frage="nein"]')?.addEventListener('click', () => zu(null));
    /* waehle(): eine Karte antwortet mit ihrer Stelle in der Liste. */
    d.querySelectorAll('[data-wahl]').forEach(karte =>
      karte.addEventListener('click', () => zu(karte.dataset.wahl)));
    /* mehrere(): die Suche blendet Zeilen aus, gewählt bleibt gewählt. */
    d.querySelector('[data-mehrere-suche]')?.addEventListener('input', event => {
      const wort = event.target.value.trim().toLowerCase();
      d.querySelectorAll('[data-mehrere] label').forEach(zeile => {
        zeile.hidden = !!wort && !zeile.textContent.toLowerCase().includes(wort);
      });
    });
    d.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const haken = d.querySelectorAll('[data-mehrere] input[type="checkbox"]');
      if (haken.length) { zu([...haken].filter(h => h.checked).map(h => h.value)); return; }
      const feld = d.querySelector('input, textarea');
      zu(feld ? feld.value : true);
    });

    /* jsdom und aeltere Browser kennen showModal nicht; dort genuegt
       das open-Attribut, damit Tests und Rueckfall funktionieren. */
    if (typeof d.showModal === 'function') {
      try { d.showModal(); } catch { d.setAttribute('open', ''); }
    } else d.setAttribute('open', '');

    const fokus = d.querySelector('input, textarea') || d.querySelector('[data-frage="ja"]')
      || d.querySelector('[data-wahl][aria-checked="true"]') || d.querySelector('[data-wahl]');
    fokus?.focus();
    if (fokus && 'select' in fokus && fokus.value) fokus.select();
  }));
  kette = lauf.catch(() => {});
  return lauf;
}

function knoepfe({ ja, nein, gefahr, einzeln }) {
  return `
    <div class="frage__knoepfe">
      ${einzeln ? '' : `<button class="b b--secondary" type="button" data-frage="nein">${esc(nein)}</button>`}
      <button class="b ${gefahr ? 'b--danger' : 'b--primary'}" type="submit" data-frage="ja">${esc(ja)}</button>
    </div>`;
}

/**
 * Eine Wahl zwischen Karten — die vierte Form. Fuer "welche Gruppe":
 * ein Auswahlfeld zeigt nur Namen, eine Karte zeigt das Plaettchen, den
 * Namen und die eigene Rolle darin, und die aktive ist markiert.
 *
 * optionen: [{ wert, titel, text, kuerzel, stil, aktiv }]
 *   kuerzel  steht im Bild der Karte (zwei Buchstaben)
 *   stil     setzt --tint und --deep des Bildes (die Farbe der Gruppe)
 * Ergebnis: der wert der gewaehlten Karte, bei Abbruch null.
 */
export async function waehle({ titel, text = '', optionen = [], nein } = {}) {
  const antwort = await oeffne(() => `
    <form method="dialog" class="frage__karte">
      <h2 class="frage__titel">${esc(titel)}</h2>
      ${text ? `<p class="frage__text">${esc(text)}</p>` : ''}
      <div class="wahlkarten" role="radiogroup" aria-label="${esc(titel)}">
        ${optionen.map((o, i) => `
          <button class="wahlkarte" type="button" role="radio" data-wahl="${i}"
                  aria-checked="${o.aktiv ? 'true' : 'false'}">
            <span class="wahlkarte__bild wahlkarte__bild--kuerzel"${o.stil ? ` style="${esc(o.stil)}"` : ''}
                  aria-hidden="true">${esc(o.kuerzel || '')}</span>
            <span class="wahlkarte__titel">${esc(o.titel)}</span>
            <span class="wahlkarte__text">${esc(o.text || '')}</span>
          </button>`).join('')}
      </div>
      <div class="frage__knoepfe">
        <button class="b b--secondary" type="button" data-frage="nein">${esc(nein || t('common.abbrechen', 'Abbrechen'))}</button>
      </div>
    </form>`);
  if (typeof antwort !== 'string') return null;
  return optionen[Number(antwort)]?.wert ?? null;
}

/**
 * Mehrere auf einmal wählen — die fünfte Form (v.35.53.0), für "an wen
 * im Chat schicken". Eine Liste mit Häkchen, ab acht Einträgen mit Suche.
 *
 * optionen: [{ wert, titel, text }]
 * Ergebnis: die Werte der angehakten, bei Abbruch null. Nichts angehakt
 * ist [] — auch eine Antwort, der Aufrufer entscheidet.
 */
export async function mehrere({ titel, text = '', optionen = [], ja, nein, leer = '' } = {}) {
  const antwort = await oeffne(() => `
    <form method="dialog" class="frage__karte">
      <h2 class="frage__titel">${esc(titel)}</h2>
      ${text ? `<p class="frage__text">${esc(text)}</p>` : ''}
      ${optionen.length > 8 ? `<input class="form-input" type="search" data-mehrere-suche
          placeholder="${esc(t('common.suchen', 'Suchen'))}" aria-label="${esc(t('common.suchen', 'Suchen'))}" autocomplete="off" />` : ''}
      <div class="mehrere" data-mehrere>
        ${optionen.length ? optionen.map((o, i) => `
          <label class="mehrere__zeile">
            <input type="checkbox" value="${i}" />
            <span><span class="mehrere__name">${esc(o.titel)}</span>
              ${o.text ? `<span class="mehrere__text">${esc(o.text)}</span>` : ''}</span>
          </label>`).join('') : `<p class="frage__text">${esc(leer)}</p>`}
      </div>
      ${knoepfe({
        ja: ja || t('common.ok', 'OK'),
        nein: nein || t('common.abbrechen', 'Abbrechen'),
      })}
    </form>`);
  if (!Array.isArray(antwort)) return null;
  return antwort.map(i => optionen[Number(i)]?.wert).filter(w => w !== undefined);
}

/** Ja oder nein. Ein Abbruch (Escape, Rand, "Abbrechen") ist nein. */
export async function frage({ titel, text = '', ja, nein, gefahr = false } = {}) {
  const antwort = await oeffne(() => `
    <form method="dialog" class="frage__karte">
      <h2 class="frage__titel">${esc(titel)}</h2>
      ${text ? `<p class="frage__text">${esc(text)}</p>` : ''}
      ${knoepfe({
        ja: ja || t('common.ok', 'OK'),
        nein: nein || t('common.abbrechen', 'Abbrechen'),
        gefahr,
      })}
    </form>`);
  return antwort === true;
}

/** Ein Text. Abbruch ist null; ein leerer Text ist '' — das sind zwei
    verschiedene Antworten, und der Aufrufer soll sie trennen koennen. */
export function eingabe({
  titel, text = '', wert = '', platzhalter = '', ja, nein,
  maxlength = 120, mehrzeilig = false, gross = false,
} = {}) {
  const feld = mehrzeilig
    ? `<textarea class="form-input frage__feld" rows="3" maxlength="${Number(maxlength)}"
                 placeholder="${esc(platzhalter)}">${esc(wert)}</textarea>`
    : `<input class="form-input frage__feld${gross ? ' frage__feld--gross' : ''}" type="text"
              maxlength="${Number(maxlength)}" value="${esc(wert)}"
              placeholder="${esc(platzhalter)}" autocomplete="off" />`;
  return oeffne(() => `
    <form method="dialog" class="frage__karte">
      <h2 class="frage__titel">${esc(titel)}</h2>
      ${text ? `<p class="frage__text">${esc(text)}</p>` : ''}
      ${feld}
      ${knoepfe({
        ja: ja || t('common.ok', 'OK'),
        nein: nein || t('common.abbrechen', 'Abbrechen'),
      })}
    </form>`);
}

/** Eine Mitteilung mit einem Knopf. Fuer Fehler, die man lesen muss. */
export async function meldung({ titel, text = '' } = {}) {
  await oeffne(() => `
    <form method="dialog" class="frage__karte">
      <h2 class="frage__titel">${esc(titel)}</h2>
      ${text ? `<p class="frage__text">${esc(text)}</p>` : ''}
      ${knoepfe({ ja: t('common.ok', 'OK'), einzeln: true })}
    </form>`);
}
