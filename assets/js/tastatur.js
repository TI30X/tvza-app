/* ══════════════════════════════════════════════════════════════════
   Die Bildschirmtastatur (v.35.69.0).

   Michel, mit einem Bild aus Samsung Internet: "auf dem Handy
   verschwindet die Textbox, wenn man die Tastatur ausfährt." v.35.62.0
   hat das für den Chat im Rahmen des Routers gelöst — aber nur dort:

   - `watchKeyboard` stand in `nav.js`, und Gruppe, Training, Einheit und
     Video laden nav.js nicht. Auf diesen Seiten gab es kein `kb-open`,
     und damit rechnete `syncShellBounds` die Tastatur nie mit.
   - Was unten klebt (das Blatt des Assistenten, ein Dialog, das
     Eingabefeld des Chats), richtete sich allein nach der Unterkante, die
     der Router setzt — wo der nicht läuft, blieb es hinter der Tastatur.

   Jetzt misst jede Seite selbst: `--tastatur` ist die Höhe, die die
   Tastatur dem Layout wegnimmt (0, wo der Browser die Seite selbst
   verkleinert — `interactive-widget=resizes-content`), `--vv-hoehe` die
   Höhe des sichtbaren Ausschnitts. Beide stehen an `<html>` und werden
   zurückgesetzt, sobald die Tastatur wieder zu ist.
   ══════════════════════════════════════════════════════════════════ */

/** Ein Feld, in das man schreibt — dann und nur dann ist die Tastatur da. */
export function schreibfeld(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName === 'INPUT') {
    return !/^(button|submit|reset|checkbox|radio|file|range|color|image)$/i
      .test(el.type || 'text');
  }
  /* Der Fokus liegt in einem Rahmen des Routers (Chat, Kalender): für die
     Seite oben ist dann der Rahmen das aktive Element (v.35.62.0). */
  if (el.tagName === 'IFRAME') {
    try { return schreibfeld(el.contentDocument?.activeElement); } catch { return false; }
  }
  return false;
}

/**
 * Misst die Tastatur und schreibt sie an <html>; setzt `kb-open` am body
 * und meldet es nach oben, wenn die Seite in einem Rahmen läuft.
 * Mehrfach aufgerufen passiert nichts — jede Seite hat einen Beobachter.
 */
export function tastaturBeobachten(win = globalThis.window) {
  if (!win || win.__firnTastatur) return;
  win.__firnTastatur = true;
  const doc = win.document;
  const vv = win.visualViewport;

  const sync = () => {
    const offen = schreibfeld(doc.activeElement);
    /* Beim Zoomen ist der Ausschnitt ebenfalls kleiner — das ist keine
       Tastatur. Gemessen wird nur, während wirklich geschrieben wird. */
    const ueber = vv && offen && vv.scale <= 1.01
      ? Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop))
      : 0;
    doc.documentElement.style.setProperty('--tastatur', `${ueber}px`);
    doc.documentElement.style.setProperty('--vv-hoehe', `${Math.round(vv?.height || win.innerHeight)}px`);
    doc.body?.classList.toggle('kb-open', offen);
    if (win.parent !== win) {
      try { win.parent.document.body.classList.toggle('kb-open', offen); } catch { /* fremdes Dokument */ }
    }
  };

  doc.addEventListener('focusin', sync);
  /* Kurz warten: beim Wechsel zwischen zwei Feldern liegt der Fokus einen
     Moment nirgends, das darf die Leiste nicht aufblitzen lassen. */
  doc.addEventListener('focusout', () => win.setTimeout(sync, 80));
  vv?.addEventListener('resize', sync, { passive: true });
  vv?.addEventListener('scroll', sync, { passive: true });
  win.addEventListener('resize', sync, { passive: true });
  /* Nach dem Schliessen der Tastatur steht alles wieder, wo es war. */
  win.addEventListener('pagehide', () => {
    doc.documentElement.style.removeProperty('--tastatur');
    doc.body?.classList.remove('kb-open');
  });
  sync();
  return sync;
}
