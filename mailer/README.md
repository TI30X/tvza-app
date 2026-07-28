# TVZA Mail-Worker

Der Worker verarbeitet die bestehende Firestore-Sammlung `mail` und verschickt
Einladungen über SMTP. Er läuft unabhängig von Firebase Extensions, Cloud
Functions und dem Blaze-Tarif.

## Voraussetzungen

- Node.js 22 oder neuer
- SMTP-Zugang eines beliebigen Mail-Anbieters
- Firebase-Service-Account mit Zugriff auf Firestore

Den Schlüssel in der Firebase-Konsole unter **Projekteinstellungen →
Dienstkonten → Neuen privaten Schlüssel erzeugen** herunterladen. Die JSON-Datei
ausserhalb des Repositories ablegen. Sie darf nie in Git, die Website oder
Firestore gelangen.

## Umgebungsvariablen

`mailer/.env.example` nach `mailer/.env` kopieren und diese Werte einsetzen:

- `GOOGLE_APPLICATION_CREDENTIALS`: absoluter Pfad zur Service-Account-JSON
- `FIREBASE_PROJECT_ID`: Firebase-Projekt-ID
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`: SMTP-Server
- `SMTP_USER`, `SMTP_PASS`: SMTP-Anmeldung; `SMTP_USER` kann bei einem
  vertrauenswürdigen lokalen Relay leer bleiben
- `SMTP_FROM`: sichtbarer Absender, z. B. `TVZA <noreply@example.com>`
- `APP_BASE_URL`: öffentliche Basis-URL der App, inklusive allfälligem Unterpfad
- `MAIL_COLLECTION`: standardmässig `mail`
- `POLL_INTERVAL_MS`, `BATCH_SIZE`: Abfrageintervall und Stapelgrösse
- `MAX_RETRIES`: maximale Versandversuche, standardmässig 5
- `RETRY_BASE_MS`: Basis für exponentielle Wartezeit
- `LEASE_MS`: Sperrzeit eines übernommenen Auftrags

`.env`, Service-Account-Dateien und `node_modules` sind in `.gitignore`
ausgeschlossen.

## Lokal starten

Vom Projektstamm:

```powershell
cd mailer
npm install
cd ..
node mailer/worker.js
```

Der Worker übernimmt Aufträge atomar. Mehrere Instanzen können deshalb laufen,
ohne denselben Auftrag gleichzeitig zu versenden. Nach einem SMTP-Fehler wird
mit wachsender Wartezeit erneut versucht; nach `MAX_RETRIES` bleibt der Auftrag
als `FAILED` sichtbar.

## Sicherer Entwicklungstest

Der Test verwendet nur ein erfundenes Queue-Dokument und einen gemockten
SMTP-Transport. Er verbindet sich weder mit Firebase noch mit einem Mailserver:

```powershell
node --test dev/mailer-worker.test.mjs
```

## PM2 auf dem Hostinger-VPS

Repository kopieren, im Ordner `mailer` `npm install --omit=dev` ausführen,
`.env` und Service-Account ausserhalb von Git bereitstellen und dann vom
Projektstamm starten:

```bash
pm2 start mailer/ecosystem.config.cjs
pm2 save
pm2 startup
```

Den von `pm2 startup` ausgegebenen Systembefehl einmal ausführen. Status und
Protokoll:

```bash
pm2 status
pm2 logs tvza-mailer
```

Beim Aktualisieren:

```bash
pm2 restart tvza-mailer
```
