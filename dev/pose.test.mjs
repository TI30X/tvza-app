/* Tests für assets/js/pose.js.
 *
 * Reines Modul, also echte Tests — und hier zählt vor allem, WANN
 * nicht gerechnet wird. Beim Skifahren verschwindet dauernd ein Bein:
 * Schnee staubt, das Aussenbein verdeckt das Innenbein, der Fahrer
 * dreht sich weg. Ein Winkel aus einem Punkt, den das Modell nicht
 * gesehen hat, ist keine Messung — er ist eine Zahl, die wie eine
 * aussieht, und ein Trainer stellt danach das Training um.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUNKT, MINDESTSICHT, punkt, winkel, gelenkwinkel, seitenunterschied,
  glaetten, hueftversatz, schwungwechsel, schwungdauern, befund,
} from '../assets/js/pose.js';

/* Ein Skelett bauen: 33 Punkte, alle sichtbar, dann gezielt setzen. */
function skelett(setzen = {}, sicht = 1) {
  const l = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: sicht }));
  for (const [index, p] of Object.entries(setzen)) {
    l[index] = { x: 0.5, y: 0.5, z: 0, visibility: sicht, ...p };
  }
  return l;
}

test('ein rechter Winkel ist 90 Grad', () => {
  const a = { x: 0, y: 1 };
  const b = { x: 0, y: 0 };
  const c = { x: 1, y: 0 };
  assert.equal(winkel(a, b, c), 90);
});

test('ein gestrecktes Bein ist 180 Grad', () => {
  assert.equal(winkel({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }), 180);
});

test('ein zusammengeklapptes Gelenk ist 0 Grad', () => {
  assert.equal(winkel({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }), 0);
});

test('Rundungsfehler ergeben keinen NaN', () => {
  // Bei fast gestreckten Beinen kann der Kosinus knapp über 1 landen,
  // und Math.acos gäbe dann NaN — mitten in einer sonst brauchbaren
  // Kurve.
  for (let i = 0; i < 200; i += 1) {
    const w = winkel({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: i * 1e-12, y: 2 });
    assert.ok(Number.isFinite(w), `NaN bei i=${i}`);
  }
});

test('zusammenfallende Punkte ergeben keinen Winkel', () => {
  // Passiert bei einem verdeckten Bein regelmässig: das Modell legt
  // zwei Punkte übereinander.
  assert.equal(winkel({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null);
  assert.equal(winkel({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 1 }), null);
});

test('ein fehlender Punkt ergibt null, nicht null Grad', () => {
  assert.equal(winkel(null, { x: 0, y: 0 }, { x: 1, y: 0 }), null);
  assert.equal(winkel({ x: 0, y: 0 }, null, { x: 1, y: 0 }), null);
  assert.equal(winkel({ x: 0, y: 0 }, { x: 1, y: 0 }, null), null);
});

test('ein zu unsicherer Punkt wird nicht benutzt', () => {
  // Das ist die Regel, die alles trägt: unterhalb der Schwelle rät das
  // Modell, und wir raten nicht mit.
  const gut = skelett({ [PUNKT.knieL]: { visibility: 0.9 } });
  const schlecht = skelett({ [PUNKT.knieL]: { visibility: 0.2 } });

  assert.ok(punkt(gut, PUNKT.knieL));
  assert.equal(punkt(schlecht, PUNKT.knieL), null);

  // Genau an der Schwelle wird noch gerechnet.
  assert.ok(punkt(skelett({ [PUNKT.knieL]: { visibility: MINDESTSICHT } }), PUNKT.knieL));
});

test('fehlt die Sichtbarkeit ganz, wird der Punkt genommen', () => {
  // Dann kommen die Daten aus einer Quelle, die keine liefert. Alles
  // zu verwerfen wäre schlechter als zu rechnen.
  const ohne = [{ x: 0.1, y: 0.2 }];
  assert.deepEqual(punkt(ohne, 0), { x: 0.1, y: 0.2, z: 0 });
});

test('Unsinn in den Koordinaten ergibt keinen Punkt', () => {
  assert.equal(punkt([{ x: NaN, y: 0.5, visibility: 1 }], 0), null);
  assert.equal(punkt([{ x: 0.5, y: Infinity, visibility: 1 }], 0), null);
  assert.equal(punkt([{ y: 0.5, visibility: 1 }], 0), null);
  assert.equal(punkt([], 0), null);
  assert.equal(punkt(null, 0), null);
});

test('ein verdecktes Bein nimmt nur seine eigenen Winkel mit', () => {
  // Eine Lücke an einer Stelle darf nicht die ganze Auswertung kippen.
  const l = skelett({
    [PUNKT.hueftL]:     { x: 0.4, y: 0.5 },
    [PUNKT.knieL]:      { x: 0.4, y: 0.7 },
    [PUNKT.knoechelL]:  { x: 0.4, y: 0.9 },
    [PUNKT.knieR]:      { visibility: 0.1 },   // rechtes Knie weg
  });

  const w = gelenkwinkel(l);
  assert.equal(w.links.knie, 180, 'links gestreckt');
  assert.equal(w.rechts.knie, null, 'rechts nicht messbar');
  assert.equal(w.rechts.huefte, null, 'die Hüfte braucht das Knie auch');
});

test('ohne beide Seiten gibt es keinen Seitenvergleich', () => {
  // Nicht etwa null Grad Unterschied — das wäre die Aussage
  // "gleichmässig", und die stimmt gerade nicht.
  assert.equal(seitenunterschied({ links: { knie: 120 }, rechts: { knie: null } }), null);
  assert.equal(seitenunterschied({ links: { knie: 120 }, rechts: { knie: 140 } }), 20);
  assert.equal(seitenunterschied(null), null);
});

test('Glätten überbrückt keine Lücken', () => {
  // Ein geglätteter Wert über einer Lücke wäre erfundene Bewegung.
  const reihe = [100, 110, null, 130, 140];
  const raus = glaetten(reihe, 3);

  assert.equal(raus[2], null, 'die Lücke bleibt eine Lücke');
  assert.equal(raus.length, reihe.length);
  // Das Fenster mittelt über das, was da ist.
  assert.equal(raus[1], Math.round(((100 + 110) / 2) * 10) / 10);
  assert.equal(raus[3], Math.round(((130 + 140) / 2) * 10) / 10);
});

test('Glätten nimmt dem Zittern die Spitzen', () => {
  const zittrig = [100, 120, 100, 120, 100, 120, 100];
  const ruhig = glaetten(zittrig, 5);

  const spanne = liste => Math.max(...liste) - Math.min(...liste);
  assert.ok(spanne(ruhig) < spanne(zittrig), 'muss ruhiger werden');
  assert.equal(ruhig.length, zittrig.length, 'und gleich lang bleiben');
});

test('ein Fenster von 1 lässt alles stehen', () => {
  const reihe = [1, 2, 3];
  assert.deepEqual(glaetten(reihe, 1), reihe);
  assert.deepEqual(glaetten(reihe, 0), reihe);
  assert.deepEqual(glaetten(null, 5), []);
});

test('der Hüftversatz ist ein Verhältnis, keine Länge', () => {
  // Sonst hinge er davon ab, wie nah die Kamera stand.
  const nah = skelett({
    [PUNKT.hueftL]: { x: 0.40 }, [PUNKT.hueftR]: { x: 0.60 },
    [PUNKT.knoechelL]: { x: 0.30 }, [PUNKT.knoechelR]: { x: 0.50 },
  });
  const fern = skelett({
    [PUNKT.hueftL]: { x: 0.45 }, [PUNKT.hueftR]: { x: 0.55 },
    [PUNKT.knoechelL]: { x: 0.40 }, [PUNKT.knoechelR]: { x: 0.50 },
  });

  // Beide: Hüftmitte 0.5, Knöchelmitte 0.4 bzw. 0.45 — gleicher
  // Versatz im Verhältnis zur Hüftbreite.
  assert.equal(hueftversatz(nah), 0.5);
  assert.equal(hueftversatz(fern), 0.5);
});

test('das Vorzeichen des Versatzes zeigt die Richtung', () => {
  const rechts = skelett({
    [PUNKT.hueftL]: { x: 0.5 }, [PUNKT.hueftR]: { x: 0.7 },
    [PUNKT.knoechelL]: { x: 0.3 }, [PUNKT.knoechelR]: { x: 0.5 },
  });
  assert.ok(hueftversatz(rechts) > 0);

  const links = skelett({
    [PUNKT.hueftL]: { x: 0.3 }, [PUNKT.hueftR]: { x: 0.5 },
    [PUNKT.knoechelL]: { x: 0.5 }, [PUNKT.knoechelR]: { x: 0.7 },
  });
  assert.ok(hueftversatz(links) < 0);
});

test('ohne Hüfte oder Knöchel gibt es keinen Versatz', () => {
  assert.equal(hueftversatz(skelett({ [PUNKT.hueftL]: { visibility: 0.1 } })), null);
  assert.equal(hueftversatz(skelett({ [PUNKT.knoechelR]: { visibility: 0.1 } })), null);
  // Fallen die Hüftpunkte zusammen, ist die Breite null.
  assert.equal(hueftversatz(skelett({
    [PUNKT.hueftL]: { x: 0.5 }, [PUNKT.hueftR]: { x: 0.5 },
  })), null);
});

test('Schwungwechsel sind Vorzeichenwechsel mit Ausschlag', () => {
  //           0    1    2    3     4     5     6    7    8
  const reihe = [0.4, 0.5, 0.3, -0.4, -0.5, -0.3, 0.4, 0.5, 0.4];
  const wechsel = schwungwechsel(reihe, { schwelle: 0.15, mindestAbstand: 2 });

  assert.deepEqual(wechsel, [3, 6]);
  assert.deepEqual(schwungdauern(wechsel), [3]);
});

test('Zittern um die Mitte ist kein Schwung', () => {
  // Ohne Schwelle hätte ein Stillstand fünfzig Schwünge.
  const stillstand = [0.02, -0.03, 0.01, -0.02, 0.03, -0.01, 0.02, -0.02];
  assert.deepEqual(schwungwechsel(stillstand), []);
});

test('Geflatter wird auf einen Wechsel eingedampft', () => {
  // Ein Schwung dauert bei 30 Bildern/s mindestens ein halbes Dutzend
  // Bilder; alles darunter ist Rauschen im Modell.
  const flatter = [0.5, -0.5, 0.5, -0.5, 0.5, -0.5];

  // Der ERSTE Wechsel zählt: er hat keinen Vorgänger, zu dem er zu nah
  // sein könnte, und ein Video mit genau einer Kurve soll nicht null
  // Schwünge melden. Alles danach fällt unter den Mindestabstand.
  assert.deepEqual(schwungwechsel(flatter, { mindestAbstand: 6 }), [1]);

  // Ohne Mindestabstand wäre jedes Zittern ein Schwung — fünf statt
  // einem. Das ist der Unterschied, den die Grenze macht.
  assert.equal(schwungwechsel(flatter, { mindestAbstand: 1 }).length, 5);
});

test('Lücken unterbrechen die Schwungzählung nicht', () => {
  // Wenn der Fahrer kurz hinter einem Baum verschwindet, ist die Kurve
  // trotzdem dieselbe.
  const reihe = [0.5, null, null, 0.5, -0.5, null, -0.5];
  assert.deepEqual(schwungwechsel(reihe, { mindestAbstand: 2 }), [4]);
});

test('der Befund sagt, wie viel überhaupt auswertbar war', () => {
  // Steht diese Zahl tief, sagt der Rest wenig — und das soll man
  // sehen, statt einer schönen Kurve aus drei Bildern zu glauben.
  const gutes = skelett({
    [PUNKT.hueftL]: { x: 0.45, y: 0.5 }, [PUNKT.hueftR]: { x: 0.55, y: 0.5 },
    [PUNKT.knieL]: { x: 0.45, y: 0.7 },  [PUNKT.knieR]: { x: 0.55, y: 0.7 },
    [PUNKT.knoechelL]: { x: 0.45, y: 0.9 }, [PUNKT.knoechelR]: { x: 0.55, y: 0.9 },
  });
  const blindes = skelett({}, 0.1);

  const b = befund([gutes, gutes, blindes, gutes], 30);
  assert.equal(b.bilder, 4);
  assert.equal(b.auswertbar, 3, 'ein Bild war unbrauchbar');
  assert.equal(b.tiefsteBeugungLinks, 180, 'gestreckt');
});

test('ohne Bilder gibt es keinen Befund', () => {
  assert.equal(befund([]), null);
  assert.equal(befund(null), null);
});

test('ein Befund ohne erkennbare Schwünge behauptet keine Dauer', () => {
  const still = skelett({
    [PUNKT.hueftL]: { x: 0.45 }, [PUNKT.hueftR]: { x: 0.55 },
    [PUNKT.knoechelL]: { x: 0.45 }, [PUNKT.knoechelR]: { x: 0.55 },
  });
  const b = befund([still, still, still], 30);

  assert.equal(b.schwuenge, 0);
  assert.equal(b.schwungdauerSekunden, null, 'keine Schwünge, keine Dauer');
});
