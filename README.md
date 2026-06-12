# TVZA Family App

## Aktuell
- 👀 Ski-Leseansicht für Eltern (`isParent: true`)
- 🌐 Öffentliche Projektseite: `public.html`
- Projekte können öffentlich mit oder ohne Passwort freigegeben werden
- Öffentliche Projekte werden beim Öffnen der Hauptseite automatisch synchronisiert
- TvZ-Branding im Header und Footer, TVZA als App-Name

## Einmalige Firebase-Schritte

### 1. Firestore-Regeln ERSETZEN durch:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Öffentliche Projektseite — jeder darf lesen
    match /publicProjects/{uid}/items/{id} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    // Config (timoUid) — öffentlich lesbar für public.html
    match /config/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Alles andere: nur eingeloggte Nutzer
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
→ Veröffentlichen

### 2. Deine Elternsicht aktivieren
Firestore → users → DEIN Dokument (Michel) → Feld hinzufügen:
`isParent` (boolean) = `true`

### 3. Fertig
- `config/tvza` mit Timos UID wird automatisch angelegt, sobald Timo die App öffnet
- Timo macht Projekte öffentlich per 🔒/🌐 Knopf neben jedem Projekt
- Beim Veröffentlichen kann optional ein Passwort gesetzt werden
- Öffentliche Seite: https://ti30x.github.io/tvza-app/public.html

## Push
```bash
git add .
git commit -m "update tvza public projects and design"
git push
```
