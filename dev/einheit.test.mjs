/* Tests für assets/js/einheit.js.
 *
 * Reines Modul, also echte Tests. Geprüft wird vor allem, was im
 * Kraftraum weh tut: eine Einheit, die es nicht gibt; ein Satz, den
 * niemand ausgefüllt hat; ein Protokoll aus einer älteren Fassung.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  einheiten, uebungen, einheitTitel,
  eintrag, mitEintrag, hatInhalt, sauber,
  fortschritt, naechsteOffene, saetze,
} from '../assets/js/einheit.js';

/* Ein Programm in der Form, die training-parser.js liefert. */
const programm = {
  units: {
    kraft: {
      id: 'kraft',
      title: 'Kraft Beine',
      kind: 'strength',
      items: [
        { key: 'kraft-1-kniebeuge', name: 'Kniebeuge', sets: [
          { label: '1. Satz', reps: '8', weight: '60' },
          { label: '2. Satz', reps: '8', weight: '60' },
        ] },
        { key: 'kraft-2-ausfallschritt', name: 'Ausfallschritt', sets: [
          { label: '1. Satz', reps: '10' },
        ] },
        { key: 'kraft-3-wadenheben', name: 'Wadenheben', sets: [] },
      ],
    },
    notizen: { id: 'notizen', title: 'Hinweise', kind: 'notes', items: [] },
  },
};

const items = uebungen(programm, 'kraft');

test('die Einheiten kommen in brauchbarer Reihenfolge', () => {
  const liste = einheiten(programm);
  assert.deepEqual(liste.map(e => e.id), ['kraft', 'notizen']);
  assert.equal(liste[0].anzahl, 3);

  // Ein Notizblatt gehört in die Liste — ein Trainer legt dort
  // Erklärungen ab —, aber hinter das, womit man wirklich trainiert.
  assert.equal(liste[1].anzahl, 0);
});

test('eine Einheit, die es nicht gibt, ergibt keine Übungen und keinen Absturz', () => {
  assert.deepEqual(uebungen(programm, 'gibtsnicht'), []);
  assert.deepEqual(uebungen(null, 'kraft'), []);
  assert.deepEqual(uebungen({}, 'kraft'), []);
  assert.equal(einheitTitel(programm, 'gibtsnicht'), '');
  assert.deepEqual(einheiten(null), []);
  assert.deepEqual(einheiten({ units: 'kaputt' }), []);
});

test('Übungen ohne Schlüssel fallen heraus', () => {
  // Ohne Schlüssel gäbe es keinen Ort im Protokoll — so ein Eintrag
  // wäre nicht speicherbar und darf nicht angezeigt werden.
  const kaputt = { units: { x: { id: 'x', items: [{ name: 'ohne key' }, { key: 'ok', name: 'ok' }] } } };
  assert.deepEqual(uebungen(kaputt, 'x').map(i => i.key), ['ok']);
});

test('ein Eintrag ist immer vollständig, auch wenn nichts gespeichert ist', () => {
  const e = eintrag({}, 'kraft', 'kraft-1-kniebeuge');
  assert.deepEqual(e, { done: false, note: '', sets: [] });

  // Auch aus Unsinn im Protokoll wird ein brauchbarer Eintrag.
  assert.deepEqual(eintrag({ units: { kraft: { items: { a: 'nein' } } } }, 'kraft', 'a'),
    { done: false, note: '', sets: [] });
  assert.deepEqual(eintrag(null, 'kraft', 'a'), { done: false, note: '', sets: [] });
});

test('mitEintrag ändert nichts am alten Protokoll', () => {
  // Der Player speichert bei jedem Tastendruck. Würde am Objekt selbst
  // geschraubt, könnte ein noch laufender Speichervorgang einen halb
  // geänderten Zustand hochschicken.
  const a = {};
  const b = mitEintrag(a, 'kraft', 'kraft-1-kniebeuge', { done: true });

  assert.deepEqual(a, {});
  assert.equal(eintrag(b, 'kraft', 'kraft-1-kniebeuge').done, true);

  const c = mitEintrag(b, 'kraft', 'kraft-2-ausfallschritt', { note: 'zog im Knie' });
  assert.equal(eintrag(c, 'kraft', 'kraft-1-kniebeuge').done, true, 'der erste Eintrag bleibt');
  assert.equal(eintrag(c, 'kraft', 'kraft-2-ausfallschritt').note, 'zog im Knie');
  assert.equal(eintrag(b, 'kraft', 'kraft-2-ausfallschritt').note, '', 'b bleibt unberührt');
});

test('ein Feld, das nicht mitgegeben wird, bleibt stehen', () => {
  let p = mitEintrag({}, 'kraft', 'k1', { sets: [{ weight: '60', reps: '8' }] });
  p = mitEintrag(p, 'kraft', 'k1', { done: true });

  const e = eintrag(p, 'kraft', 'k1');
  assert.equal(e.done, true);
  assert.deepEqual(e.sets, [{ weight: '60', reps: '8' }], 'die Sätze dürfen nicht verschwinden');
});

test('leere Einträge werden nicht gespeichert', () => {
  // Sie entstehen beim Zeichnen: die Oberfläche legt für jeden Satz ein
  // Feld an. Ohne dieses Sieb wüchse das Protokoll mit jeder geöffneten
  // Einheit, auch wenn niemand etwas gemacht hat.
  let p = mitEintrag({}, 'kraft', 'leer', { sets: [{ weight: '', reps: '' }] });
  p = mitEintrag(p, 'kraft', 'voll', { sets: [{ weight: '60', reps: '8' }] });

  const raus = sauber(p);
  assert.deepEqual(Object.keys(raus.kraft.items), ['voll']);

  // Eine Einheit, in der gar nichts steht, verschwindet ganz.
  assert.deepEqual(sauber(mitEintrag({}, 'kraft', 'leer', { note: '' })), {});
  assert.deepEqual(sauber({}), {});
  assert.deepEqual(sauber(null), {});
});

test('ein Haken allein ist Inhalt', () => {
  const p = mitEintrag({}, 'kraft', 'k1', { done: true });
  assert.ok(hatInhalt(eintrag(p, 'kraft', 'k1')));
  assert.deepEqual(Object.keys(sauber(p).kraft.items), ['k1']);
});

test('sauber hält die Grenzen der Regeln ein', () => {
  const p = mitEintrag({}, 'kraft', 'k1', {
    note: 'x'.repeat(500),
    sets: Array.from({ length: 20 }, () => ({ weight: 'y'.repeat(50), reps: '8' })),
  });
  const e = sauber(p).kraft.items.k1;

  assert.equal(e.note.length, 200);
  assert.equal(e.sets.length, 12);
  assert.equal(e.sets[0].weight.length, 20);
});

test('der Fortschritt zählt Haken, nicht Eingaben', () => {
  let p = {};
  assert.deepEqual(fortschritt(items, p, 'kraft'),
    { erledigt: 0, gesamt: 3, fertig: false, anteil: 0 });

  // Gewichte eintragen ist noch nicht "erledigt" — man kann mitten in
  // einer Übung stehen.
  p = mitEintrag(p, 'kraft', items[0].key, { sets: [{ weight: '60', reps: '8' }] });
  assert.equal(fortschritt(items, p, 'kraft').erledigt, 0);

  p = mitEintrag(p, 'kraft', items[0].key, { done: true });
  assert.equal(fortschritt(items, p, 'kraft').erledigt, 1);
  assert.equal(fortschritt(items, p, 'kraft').anteil, 33);
});

test('eine Einheit ohne Übungen ist fertig, nicht null Prozent', () => {
  // Sonst zeigte ein Notizblatt für immer "nicht erledigt".
  const leer = fortschritt([], {}, 'notizen');
  assert.equal(leer.fertig, true);
  assert.equal(leer.anteil, 100);
});

test('naechsteOffene setzt dort an, wo man aufgehört hat', () => {
  let p = mitEintrag({}, 'kraft', items[0].key, { done: true });

  // Ab Position 0 wäre 0 erledigt, also kommt 1.
  assert.equal(naechsteOffene(items, p, 'kraft', 0), 1);

  // Ab Position 2 kommt 2 — und nicht wieder 1.
  assert.equal(naechsteOffene(items, p, 'kraft', 2), 2);

  // Ist ab dort alles erledigt, wird von vorn gesucht.
  p = mitEintrag(p, 'kraft', items[2].key, { done: true });
  assert.equal(naechsteOffene(items, p, 'kraft', 2), 1);

  // Und wenn nichts offen ist, sagt es das.
  p = mitEintrag(p, 'kraft', items[1].key, { done: true });
  assert.equal(naechsteOffene(items, p, 'kraft', 0), -1);
});

test('die Sätze zeigen Plan und Protokoll in einer Zeile', () => {
  const e = eintrag(
    mitEintrag({}, 'kraft', items[0].key, { sets: [{ weight: '65', reps: '8' }] }),
    'kraft', items[0].key);
  const reihen = saetze(items[0], e);

  assert.equal(reihen.length, 2, 'der Plan hat zwei Sätze');
  assert.equal(reihen[0].label, '1. Satz');
  assert.equal(reihen[0].zielReps, '8');
  assert.equal(reihen[0].zielWert, '60', 'der Vorgabewert kommt aus dem Plan');
  assert.equal(reihen[0].weight, '65', 'gemacht wurden 65');
  // Der zweite Satz ist geplant, aber noch nicht gemacht.
  assert.equal(reihen[1].weight, '');
  assert.equal(reihen[1].zielReps, '8');
});

test('mehr gemachte Sätze als geplante gehen nicht verloren', () => {
  // Wer einen vierten Satz dranhängt, soll ihn behalten dürfen.
  const e = eintrag(
    mitEintrag({}, 'kraft', items[1].key, {
      sets: [{ weight: '20', reps: '10' }, { weight: '20', reps: '9' }],
    }),
    'kraft', items[1].key);
  const reihen = saetze(items[1], e);

  assert.equal(reihen.length, 2);
  assert.equal(reihen[1].label, '2. Satz', 'fehlt im Plan, wird durchgezählt');
  assert.equal(reihen[1].reps, '9');
});

test('eine Übung ohne geplante Sätze zeigt keine Zeilen', () => {
  const reihen = saetze(items[2], eintrag({}, 'kraft', items[2].key));
  assert.deepEqual(reihen, []);
});
