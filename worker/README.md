# Der Firn-Worker

Alles, was eine statische Seite auf GitHub Pages nicht kann: eine
Kopfzeile setzen, ohne Anmeldung lesen, auf einen Zeitplan reagieren.

## Was heute darin läuft

`GET /ics/<gruppe>?t=<token>` — der Kalender einer Gruppe als
iCalendar. **Das ist der eigentliche Grund für den Worker.** Eltern
abonnieren die Adresse in Apple Calendar, ohne ein Konto bei Firn zu
haben: kein Einladungsmail, kein Passwort, keine Installation. So führt
ein Verein eine App tatsächlich ein.

`GET /health` — sagt, ob der Worker steht und ob er den Service-Account
sieht. Beim ersten Ausrollen ist genau das die Frage.

## Ausrollen

Ein Cloudflare-Konto genügt, kostenlos und ohne Karte. Der freie Tarif
gibt 100 000 Anfragen pro Tag — ein Kalender-Abo fragt ein- bis
zweimal pro Stunde nach.

### 1. Service-Account-Schlüssel holen

Firebase-Konsole → **Projekteinstellungen → Dienstkonten → Neuen
privaten Schlüssel erzeugen**. Die JSON-Datei ausserhalb des
Repositories ablegen. Sie darf nie in Git, nie in die Website und nie
in Firestore — dieselbe Regel wie für `mailer/.env`.

### 2. Als Secret hinterlegen

```
cd worker
npx wrangler login
npx wrangler secret put SERVICE_ACCOUNT
```

Beim Prompt den **gesamten Inhalt der JSON-Datei** einfügen. Ein
Secret steht nicht in `wrangler.toml` und ist danach auch über die
Cloudflare-Oberfläche nicht mehr lesbar.

### 3. Ausrollen

```
npx wrangler deploy
```

Wrangler nennt am Ende die Adresse, etwa
`https://firn-worker.<subdomain>.workers.dev`.

### 4. Der App die Adresse sagen

Sie in `assets/js/worker-config.js` eintragen:

```js
export const WORKER_BASIS = 'https://firn-worker.<subdomain>.workers.dev';
```

Solange die Zeile leer ist, zeigt die Gruppenseite den Knopf
"Kalender-Abo erzeugen" gar nicht an — ein Knopf, der zuverlässig
scheitert, ist schlechter als keiner.

### 5. Prüfen

```
curl https://firn-worker.<subdomain>.workers.dev/health
```

Erwartet: `ok · projekt=tvza-11d44 · konto=vorhanden`. Steht dort
`konto=FEHLT`, ist Schritt 2 nicht durchgekommen.

## Warum die Mail-Warteschlange NICHT hier läuft

Das war der ursprüngliche Plan, und er geht nicht auf:

**Cloudflare Workers können kein SMTP.** Es gibt keine TCP-Sockets,
nur HTTP. Der vorhandene `mailer/` benutzt `nodemailer` über SMTP und
`firebase-admin` — beides läuft auf Workers nicht. Das ist keine
Kleinigkeit, die man nachträgt, sondern eine Entscheidung mit zwei
Wegen:

**A — HTTP-Mailversand im Worker.** Anbieter wie Resend, Postmark oder
Brevo verschicken über eine HTTP-Schnittstelle statt SMTP. Dann läuft
alles in einem Worker mit einem Cron-Trigger, und es gibt genau ein
Stück Infrastruktur. Kostet: ein zweites Konto, und die meisten
verlangen eine verifizierte Absenderdomain, bevor sie an Fremde
ausliefern.

**B — den bestehenden Node-Worker irgendwo hinstellen.** `mailer/`
funktioniert, wie es ist; ihm fehlt nur ein Host, der TCP erlaubt.
Fly.io, Railway oder ein Raspberry Pi im Keller genügen. Kostet: ein
zweites Stück Infrastruktur, das man im Auge behalten muss — und genau
daran ist es schon einmal gescheitert, siehe unten.

Meine Empfehlung ist **A**, weil das jetzige Problem nicht der
Mailversand ist, sondern dass niemand merkt, wenn er stillsteht. Ein
Cron-Trigger in Cloudflare läuft, ohne dass man daran denkt; ein VPS
läuft, bis er nicht mehr läuft.

**Wichtig:** Die Einladungsmails kommen derzeit nicht an. Die Sammlung
`mail` füllt sich, und nichts leert sie — es gibt keinen Host für
`mailer/`. Bei einem Produkt, dessen Wachstum am Einladen hängt, ist
das der teuerste offene Punkt.

## Was danach hierher gehört

- **Signierte Uploads nach R2** für die Videoanalyse (Phase 5). Der
  Browser bekommt eine kurzlebige Adresse und lädt direkt hoch, ohne
  dass die Datei durch den Worker geht.
- **Der KI-Zugang** (Phase 7). Der Schlüssel des Modells darf nicht in
  den Browser; der Worker steht dazwischen und schickt nur die Fakten,
  nie die Rohdaten.
- **Der FIS-Abruf.** Die Punktelisten liegen öffentlich, aber ohne
  CORS-Kopfzeile — aus dem Browser scheitert der Abruf, aus dem Worker
  nicht.

## Tests

Die reinen Teile laufen in der normalen Suite mit:

```
cd dev
node --experimental-vm-modules --test ics.test.mjs worker-firestore.test.mjs
```

Geprüft wird, was ohne Ausrollen prüfbar ist und was still bricht: das
Falten langer Zeilen nach Oktetten, das ausschliessende `DTEND` (ein
Lager wäre sonst immer einen Tag zu kurz), und das Auspacken der
typisierten Firestore-Werte. Die HTTP- und Signaturteile brauchen
`wrangler dev`.
