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
- 🔐 **Familien-Einladungen:** Neue Familienkonten brauchen einen 128-Bit-Code, den der Admin
  unter ⚙️ Einstellungen → „Admin · Familien-Einladungen" für eine bestimmte E-Mail erstellt.
  Ein Firebase-Login allein erhält keinen Zugriff auf Familiendaten.
- 🗓️ **Kalender & Erinnerungen:** Vertraute Ansichten für Tag, 3 Tage, Arbeitswoche, Woche,
  Monat und Terminübersicht/Agenda. Nutzer wählen Google- oder Outlook-Darstellung, können
  mehreren Gruppen gleichzeitig angehören und deren Kalender einzeln ein-/ausblenden.
  Die Outlook-Darstellung ergänzt einen Mini-Monatsnavigator mit direkter Wochenwahl.
  Farben gelten pro Kalender (inkl. Grün und Gelb), nicht mehr pro Einzeltermin; Gruppenleitungen
  können Namen, Farbe, Mitglieder, Verwaltungsrollen und Einladungslinks verwalten.
  Kalenderzahlen, Wochentage und Termine sind auch in der kompakten Ansicht bewusst gross
  und kontrastreich; Aktionsknöpfe verwenden einheitlich ausgerichtete Symbole.
  Hochgeladene HTML-Pläne werden nach Datum/Uhrzeit in der Terminübersicht aufgeteilt; die
  Originalseite bleibt zusätzlich öffnbar. Dazu kommen persönliche Erinnerungen und
  ICS-Import/-Export für Google Calendar, Outlook/Exchange, Apple und Samsung Calendar.

## Datenmodell (Firestore)
- `users/{uid}` — Profil inkl. `modules` (welche Module aktiv sind), `isTimo`, `isParent`.
- `projects/{uid}/items/{id}` — eigene Projekte (privat + öffentlich-Flag).
- `publicProjects/{ownerUid__projectId}` — **flacher**, von allen lesbarer Feed.
  Felder: `ownerUid, ownerName, emoji, name, url, updatedAt`.
  Öffentlich bedeutet absichtlich öffentlich; geheime URLs oder Passwörter gehören nicht hierhin.
- `memberInvites/{code}` — Admin-erstellte Familien-Einladungen: `email, createdBy, createdAt`.
- `shares/{ownerUid__targetUid__module}` — serverseitig prüfbare Freigaben:
  `ownerUid, ownerName, module, targetUid, targetEmail, role` (`view`/`edit`).
- `skitracker/{uid}/…`, `foodlog/{uid}/…`, `families`/`trips`/`activities` — wie bisher.
- `users/{uid}/reminders/{id}` — persönliche Erinnerungen; nur der jeweilige Nutzer darf sie
  lesen oder verändern.
- `calendarDays/{id}` — persönliche oder importierte Termine; Zugriff wird über `ownerUid`
  auf den Besitzer begrenzt.
- `families/{id}` — **Kalendergruppe.** Felder: `name, headUid, managers[], members[],
  pendingRequests[], inviteToken, calendarColor`. Nur wer in `members` steht, darf das
  Dokument lesen — dort stehen Mitgliederliste und Einladungstoken.
- `familyDirectory/{familyId}` — enthält **ausschliesslich** `name`. Damit kann man eine
  Gruppe über ihren Namen finden und eine Beitrittsanfrage stellen, ohne die Gruppe selbst
  lesen zu dürfen.
- `trips/{id}`, `activities/{id}`, `attachments/{id}` — Gruppendaten. Der Zugriff hängt an
  der Mitgliedschaft in `families/{trip.familyId}`, nicht am blossen Familien-Login.
  Ein Anhang gehört entweder zu einer Reise oder zu einem eigenen `calendarDays`-Eintrag.
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

## Kalender-Synchronisation
- Der eingebaute ICS-Abgleich überträgt Termine und Erinnerungen ohne externe Zugangsdaten.
- Automatische Google- und Microsoft-Synchronisation benötigt je eine registrierte OAuth-Web-App.
- Apple-CalDAV benötigt einen geschützten Serverdienst; Apple-Passwörter dürfen niemals in
  Firestore oder im Browser gespeichert werden.
- Der Samsung-Gerätekalender ist nur aus einer nativen Android-App direkt erreichbar. In der
  Web-App bleibt ICS der sichere gemeinsame Weg.

## Einmalige Firebase-Schritte

### 1. Firestore-Regeln ERSETZEN durch den Inhalt von [`firestore.rules`](firestore.rules):
Kopiere die komplette Datei `firestore.rules` (im Repo-Stamm) in die Firebase-Konsole
(Firestore → Regeln) und klicke **Veröffentlichen**.

> **Wichtig:** Die alte globale Regel
> `match /{document=**} { allow read, write … }` wurde entfernt und durch
> **explizite Regeln pro Sammlung** ersetzt. Mitgliedschaft braucht ein `users/{uid}`-Profil,
> neue Profile brauchen einen Admin-Einladungscode, Admin-Felder sind geschützt und
> Tracker-Freigaben werden serverseitig als `view` oder `edit` geprüft.
>
> Falls künftig eine **neue** Sammlung dazukommt, muss sie in `firestore.rules`
> ergänzt werden — sonst wird der Zugriff standardmässig verweigert.
>
> **Seit v.31.1.0:** Kalendergruppen sind gegeneinander abgeschottet. Ein Familien-Login
> allein reicht nicht mehr, um fremde Gruppen, Reisen, Aktivitäten oder Anhänge zu lesen
> oder zu verändern — dafür zählt nur noch die Mitgliedschaft in `families/{id}.members`.
> Nach dem Veröffentlichen einmal „Einladungslink" pro Gruppe öffnen: kurze Alt-Tokens
> werden dabei durch 16-stellige Zufallstokens ersetzt (alte Links verfallen).

### 2. Neue Familienmitglieder einladen
1. Admin öffnet ⚙️ Einstellungen → „Admin · Familien-Einladungen".
2. E-Mail eintragen, Einladung erstellen und den kopierten Code privat senden.
3. Die eingeladene Person wählt auf `login.html` „Registrieren" und verwendet exakt
   diese E-Mail plus Code.

Bestehende Nutzer brauchen nichts zu tun. Neue Nutzer starten mit Kalender, Watchlist,
Food, Wetter und Nachrichten; weitere Module schaltet der Admin frei.

### 3. Timos Skis weiterhin für Eltern sichtbar
Zwei Wege:
- **Neu (empfohlen):** Timo öffnet ⚙️ Einstellungen → „Modul teilen" → Ski Tracker →
  E-Mail des Elternteils → „Nur ansehen" oder „Bearbeiten" → Teilen.
- **Legacy:** Steht bei einem Nutzer `isParent: true`, erscheint Timos Ski-Leseansicht
  weiterhin automatisch unter „Mit mir geteilt" (sobald `config/tvza` Timos UID kennt).

### 4. Fertig
- `config/tvza` mit Timos UID wird automatisch angelegt, sobald Timo die App öffnet.
- Projekte öffentlich machen: 🔒/🌐 Knopf neben jedem Projekt. Alles im öffentlichen Feed
  ist ohne Anmeldung zugänglich.
- Öffentliche Seite: https://ti30x.github.io/tvza-app/public.html

## Push
```bash
git add .
git commit -m "Module-Auswahl, globaler Projekt-Feed, Teilen mit Rechten, Passwort-Fix, neue Startseiten-Logik"
git push
```
