# TVZA Family App

## Aktuell
- 🏠 **Start:** Wer angemeldet ist, landet sofort im Dashboard. Neue/abgemeldete Besucher
  sehen zuerst die öffentliche Seite (`public.html`), Login erst danach.
- 🧩 **Module selbst wählen:** Jeder Nutzer aktiviert über ⚙️ Einstellungen seine eigenen
  Module (Ski, Food, Familienreisen, Öffentliche Projekte).
- 🌐 **Gemeinsamer Projekt-Feed:** Alle als öffentlich markierten Projekte ALLER Nutzer
  erscheinen bei allen und auf der öffentlichen Seite (flache Sammlung `publicProjects`).
- 🤝 **Teilen mit Rechten:** Module (Ski, Food) können per E-Mail geteilt werden —
  wahlweise „Nur ansehen" oder „Bearbeiten" (⚙️ Einstellungen → Modul teilen).
  Geteilte Module erscheinen beim Empfänger unter „Mit mir geteilt".
- 🔑 **Passwort-Dialog:** Eigener Dialog statt `prompt()` (Autokorrektur/Großschreibung aus) —
  getippte Passwörter funktionieren jetzt zuverlässig auch auf Mobil.

## Datenmodell (Firestore)
- `users/{uid}` — Profil inkl. `modules` (welche Module aktiv sind), `isTimo`, `isParent`.
- `projects/{uid}/items/{id}` — eigene Projekte (privat + öffentlich-Flag).
- `publicProjects/{ownerUid__projectId}` — **flacher**, von allen lesbarer Feed.
  Felder: `ownerUid, ownerName, emoji, name, url, publicPassword, updatedAt`.
- `shares/{id}` — Freigaben: `ownerUid, ownerName, module, targetEmail, role` (`view`/`edit`).
- `skitracker/{uid}/…`, `foodlog/{uid}/…`, `families`/`trips`/`activities` — wie bisher.
- `customFoods/{id}` — vom Admin freigegebene Lebensmittel (`name, kcal, protein, carbs, fat, fibre, micros`).
  Werden im Food Tracker beim Start geladen und stehen dann allen in Suche & Scan zur Verfügung.
- `foodRequests/{id}` — Vorschläge von Nutzern für fehlende Lebensmittel
  (`name, note, barcode, brand, kcal…, requestedByEmail, status, createdAt`).
  Admin gibt sie in ⚙️ Einstellungen → „Admin · Food-Anfragen" frei (→ `customFoods`) oder lehnt ab.
  Beides löscht die Anfrage.
- `dms/{convId}` — **Direktnachrichten (privat, nur die zwei Teilnehmer).** `convId = "<uidA>__<uidB>"`
  (sortiert). Felder: `participants[2], participantNames{uid:name}, lastMessage, lastAt, lastSender,
  unread{uid:count}`. Nachrichten unter `dms/{convId}/messages/{id}`: `text, sender, createdAt`.
  Privatsphäre wird **serverseitig** über die Firestore-Regeln erzwungen (siehe unten).

## Food Tracker — Scannen & Portionen
- 📷 **Barcode/QR scannen:** „Scannen" im Erfassungsformular öffnet die Kamera
  (html5-qrcode via CDN). Der Code wird bei **Open Food Facts** nachgeschlagen;
  erkannte Produkte werden direkt mit Nährwerten geloggt. Alternativ Code von Hand eingeben.
- 🍽️ **1-Tipp-Menge:** Nach dem Scan (oder beim Auswählen) fragt die App grob „wie viel?"
  mit grossen Buttons — je nach Produkt **Ganze/Halbe Packung**, **1 Portion** (z.B. Poulet 120 g,
  Reis/Pasta 200 g, Glas 200 ml) oder **100 g**. Eigene Menge bleibt jederzeit möglich.
- ➕ **Nicht gefunden?** In der Zutatensuche erscheint „… vorschlagen"; der Vorschlag
  landet als `foodRequest` im Admin-Panel.

## Einmalige Firebase-Schritte

### 1. Firestore-Regeln ERSETZEN durch den Inhalt von [`firestore.rules`](firestore.rules):
Kopiere die komplette Datei `firestore.rules` (im Repo-Stamm) in die Firebase-Konsole
(Firestore → Regeln) und klicke **Veröffentlichen**.

> **Wichtig (Privatsphäre der Nachrichten):** Die alte globale Regel
> `match /{document=**} { allow read, write … }` wurde entfernt und durch
> **explizite Regeln pro Sammlung** ersetzt. Das ist nötig, weil Firestore Zugriff
> gewährt, sobald *irgendeine* Regel passt — eine Catch-all-Regel würde die strikte
> `dms`-Regel aushebeln und Nachrichten für alle lesbar machen. Alle bisherigen
> Sammlungen bleiben für angemeldete Nutzer offen (Familien-Vertrauensmodell);
> nur `dms/{convId}` (+ `messages`) ist auf die zwei Teilnehmer beschränkt.
>
> Falls künftig eine **neue** Sammlung dazukommt, muss sie in `firestore.rules`
> ergänzt werden — sonst wird der Zugriff standardmässig verweigert.

### 2. Module für bestehende Nutzer
Neue Nutzer bekommen automatisch alle Module. Bestehende Konten ohne `modules`-Feld
sehen ebenfalls alle Module (Standard) und können in ⚙️ Einstellungen abwählen.

### 3. Timos Skis weiterhin für Eltern sichtbar
Zwei Wege:
- **Neu (empfohlen):** Timo öffnet ⚙️ Einstellungen → „Modul teilen" → Ski Tracker →
  E-Mail des Elternteils → „Nur ansehen" oder „Bearbeiten" → Teilen.
- **Legacy:** Steht bei einem Nutzer `isParent: true`, erscheint Timos Ski-Leseansicht
  weiterhin automatisch unter „Mit mir geteilt" (sobald `config/tvza` Timos UID kennt).

### 4. Fertig
- `config/tvza` mit Timos UID wird automatisch angelegt, sobald Timo die App öffnet.
- Projekte öffentlich machen: 🔒/🌐 Knopf neben jedem Projekt, optional mit Passwort.
- Öffentliche Seite: https://ti30x.github.io/tvza-app/public.html

## Push
```bash
git add .
git commit -m "Module-Auswahl, globaler Projekt-Feed, Teilen mit Rechten, Passwort-Fix, neue Startseiten-Logik"
git push
```
