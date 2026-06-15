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

## Einmalige Firebase-Schritte

### 1. Firestore-Regeln ERSETZEN durch:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Gemeinsamer öffentlicher Projekt-Feed (flach) — jeder darf lesen,
    // nur der Eigentümer schreibt seine eigenen Einträge.
    match /publicProjects/{docId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.ownerUid;
      allow update: if request.auth != null
        && request.auth.uid == resource.data.ownerUid;
      allow delete: if request.auth != null
        && request.auth.uid == resource.data.ownerUid;
    }

    // Config (timoUid) — öffentlich lesbar für public.html
    match /config/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Freigaben (Module teilen) — nur angemeldete Nutzer
    match /shares/{id} {
      allow read, write: if request.auth != null;
    }

    // Alles andere: nur angemeldete Nutzer (Familien-Vertrauensmodell)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
→ Veröffentlichen

> Hinweis zum Sicherheitsmodell: Wie bisher dürfen alle **angemeldeten** Nutzer
> grundsätzlich lesen/schreiben (kleine Familien-App). Die feinen Rechte beim Teilen
> (ansehen vs. bearbeiten) werden in der App durchgesetzt. Für strengere serverseitige
> Trennung müssten die `match /{document=**}`-Regeln pro Sammlung verschärft werden.

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
