/* Tests für worker/firestore.js — den Teil, der ohne Netz prüfbar ist.
 *
 * Firestore gibt Werte TYPISIERT zurück: { stringValue: "x" } statt
 * "x". Wer das nicht auspackt, schreibt "[object Object]" in einen
 * Kalender — und merkt es erst, wenn jemand das Abo öffnet.
 *
 * Die HTTP- und Signaturteile darunter lassen sich ohne Ausrollen
 * nicht prüfen. Das Auspacken und die Schlüsselaufbereitung schon, und
 * genau dort sitzen die stillen Fehler.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { wert, felder, idAus, dokument, pemZuBytes } from '../worker/firestore.js';

test('jeder Werttyp wird ausgepackt, den dieses Modell benutzt', () => {
  assert.equal(wert({ stringValue: 'Kraft Beine' }), 'Kraft Beine');
  assert.equal(wert({ booleanValue: true }), true);
  assert.equal(wert({ booleanValue: false }), false);
  assert.equal(wert({ nullValue: null }), null);
  assert.equal(wert({ timestampValue: '2026-09-08T12:00:00Z' }), '2026-09-08T12:00:00Z');
});

test('Ganzzahlen kommen als Zeichenkette und werden zu Zahlen', () => {
  // Firestore-Ganzzahlen sind 64 Bit und passen nicht sicher in eine
  // JS-Zahl, darum liefert die REST-Schnittstelle sie als Text. Für
  // Ränge und Startnummern ist Number richtig.
  assert.equal(wert({ integerValue: '12' }), 12);
  assert.equal(wert({ doubleValue: 42.85 }), 42.85);
  assert.equal(typeof wert({ integerValue: '12' }), 'number');
});

test('Karten und Listen werden rekursiv ausgepackt', () => {
  const verschachtelt = {
    mapValue: {
      fields: {
        rang: { integerValue: '3' },
        sets: {
          arrayValue: {
            values: [
              { mapValue: { fields: { weight: { stringValue: '60' } } } },
              { mapValue: { fields: { weight: { stringValue: '65' } } } },
            ],
          },
        },
      },
    },
  };
  assert.deepEqual(wert(verschachtelt), {
    rang: 3,
    sets: [{ weight: '60' }, { weight: '65' }],
  });
});

test('eine leere Liste ist eine leere Liste, nicht null', () => {
  assert.deepEqual(wert({ arrayValue: {} }), []);
  assert.deepEqual(wert({ arrayValue: { values: [] } }), []);
  assert.deepEqual(wert({ mapValue: {} }), {});
});

test('unbekannte Typen ergeben null statt eines halben Objekts', () => {
  // bytesValue, referenceValue und geoPointValue kommen in diesem
  // Datenmodell nicht vor. Lieber null als etwas Erfundenes.
  assert.equal(wert({ bytesValue: 'AAAA' }), null);
  assert.equal(wert({ referenceValue: 'projects/x/…' }), null);
  assert.equal(wert(null), null);
  assert.equal(wert('nur Text'), null);
  assert.equal(wert(undefined), null);
});

test('felder packt ein ganzes Dokument aus', () => {
  assert.deepEqual(felder({
    titel: { stringValue: 'Kraft Beine' },
    von: { stringValue: '2026-09-08' },
    ganztags: { booleanValue: false },
  }), { titel: 'Kraft Beine', von: '2026-09-08', ganztags: false });

  assert.deepEqual(felder(null), {});
  assert.deepEqual(felder(undefined), {});
});

test('die Dokument-ID kommt aus dem letzten Pfadstück', () => {
  assert.equal(
    idAus('projects/tvza/databases/(default)/documents/groups/g1/events/e7'),
    'e7');
  assert.equal(idAus(''), '');
  assert.equal(idAus(null), '');
});

test('dokument setzt ID und Felder zusammen', () => {
  const doku = dokument({
    name: 'projects/x/databases/(default)/documents/groups/g1/events/e7',
    fields: { titel: { stringValue: 'Kraft Beine' }, art: { stringValue: 'training' } },
  });
  assert.deepEqual(doku, { id: 'e7', titel: 'Kraft Beine', art: 'training' });

  // Ohne name ist es kein Dokument.
  assert.equal(dokument({ fields: {} }), null);
  assert.equal(dokument(null), null);

  // Ein Dokument ohne Felder ist gültig — es hat nur eine ID.
  assert.deepEqual(dokument({ name: 'a/b/c' }), { id: 'c' });
});

test('ein Feld namens id wird nicht von der Dokument-ID verdeckt', () => {
  // Die Reihenfolge in dokument() setzt die echte ID zuerst und lässt
  // die Felder danach gewinnen. Bei ergebnisse/{eventId__uid} steht
  // aber kein 'id'-Feld drin — geprüft wird, dass es überhaupt
  // vorhersehbar ist.
  const doku = dokument({
    name: 'a/b/echte-id',
    fields: { id: { stringValue: 'feld-id' } },
  });
  assert.equal(doku.id, 'feld-id', 'das Feld gewinnt — bewusst, aber es soll auffallen');
});

test('pemZuBytes verkraftet echte und maskierte Zeilenumbrüche', () => {
  /* Der Schlüssel kommt aus der Service-Account-JSON und trägt dort
     "\n" als ZWEI Zeichen. Wer sie nicht ersetzt, bekommt von
     importKey eine unbrauchbare Fehlermeldung. */
  const inhalt = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A';   // gültiges Base64

  const mitEchten = `-----BEGIN PRIVATE KEY-----\n${inhalt}\n-----END PRIVATE KEY-----\n`;
  const mitMaskierten = `-----BEGIN PRIVATE KEY-----\\n${inhalt}\\n-----END PRIVATE KEY-----\\n`;

  const a = pemZuBytes(mitEchten);
  const b = pemZuBytes(mitMaskierten);

  assert.ok(a instanceof Uint8Array);
  assert.ok(a.length > 0);
  assert.deepEqual([...a], [...b], 'beide Schreibweisen müssen dasselbe ergeben');
});

test('ein leerer Schlüssel scheitert mit einem Satz, der etwas sagt', () => {
  // Eine fehlende Umgebungsvariable ist der wahrscheinlichste Fehler
  // beim ersten Ausrollen. "Der private Schlüssel ist leer" sagt, wo
  // man nachschauen muss; ein DOMException aus importKey nicht.
  assert.throws(() => pemZuBytes(''), /leer/);
  assert.throws(() => pemZuBytes(null), /leer/);
  assert.throws(() => pemZuBytes('-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----'), /leer/);
});
