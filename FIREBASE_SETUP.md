# Firebase-Schritte für v.31.2.0

Diese Schritte verändern den Live-Dienst und können deshalb nicht allein durch
einen GitHub-Push erledigt werden.

## 1. Firestore-Regeln veröffentlichen

In der Firebase-Konsole unter **Firestore Database → Regeln** den vollständigen
Inhalt von `firestore.rules` einsetzen und veröffentlichen. Ohne diesen Schritt
greifen der Verifizierungs-Umschalter, einmalige Einladungen und persönliche
Kalender im Live-Projekt noch nicht.

Das Veröffentlichen ist weiterhin manuell offen, bis die Google-Anmeldung in der
Firebase-Konsole abgeschlossen ist.

## 2. E-Mail-Verifizierung für die Beta

Im Dokument `config/tvza` das boolesche Feld
`requireEmailVerification` anlegen:

- `false` (Beta-Standard): Ein neues Konto kann die App sofort benutzen.
- `true`: Client und Firestore-Regeln blockieren unbestätigte Konten.

Die Regeln lesen dafür bei geschützten Zugriffen `config/tvza` zusätzlich.
Wiederholte Zugriffe auf dasselbe Dokument innerhalb einer Regelauswertung
können von Firestore zwischengespeichert werden, dennoch ist dieser Config-Read
bei Regelnutzung und Kontingent zu berücksichtigen.

Die App versendet nach der Registrierung in beiden Fällen weiterhin die native
Firebase-Verifizierungs-Mail. Unter **Authentication → Templates** Absender,
Sprache und Weiterleitungsdomain prüfen.

`sendEmailVerification()` aus Firebase Authentication funktioniert im
kostenlosen Spark-Tarif. Dafür braucht es weder Blaze noch Cloud Functions.

## 3. Einladungs-E-Mails ohne Blaze

Der Browser schreibt weiterhin streng geprüfte Template-Aufträge in `mail`.
Der eigenständige Worker in `mailer/` liest diese Aufträge mit dem Firebase
Admin SDK und sendet sie über frei wählbares SMTP. SMTP-Passwort und
Service-Account gelangen nie in Browser-Code oder Firestore.

Es werden weder die Trigger-Email-Erweiterung noch Cloud Functions installiert.
Eine Blaze-Umstellung ist für diesen Ablauf nicht nötig. Die Einrichtung und
der spätere PM2-Betrieb auf dem Hostinger-VPS stehen in `mailer/README.md`.

Nach dem lokalen Mock-Test eine Einladung an eine eigene Adresse erstellen und
im Dokument `mail/member-invite-…` prüfen:

- Erfolg: `delivery.state = "SUCCESS"` und `delivery.sentAt`
- Fehler: `delivery.state = "ERROR"`, `delivery.error`, `delivery.attempts`
- Nach der letzten Wiederholung: `delivery.state = "FAILED"`

## 4. App Check

1. In **App Check** die Web-App mit reCAPTCHA Enterprise registrieren.
2. Den öffentlichen Site-Key in
   `assets/js/app-check-config.js` als `APP_CHECK_SITE_KEY` einsetzen.
3. Zuerst Metriken beobachten.
4. Danach Enforcement für **Authentication** und **Cloud Firestore** aktivieren.

App Check erschwert automatisierte Angriffe auf Firebase-Endpunkte. Zusätzlich
gibt es im Client eine Sperre nach fünf Fehlern in zehn Minuten; die
serverseitige Firebase-Auth-Drosselung bleibt die eigentliche nicht umgehbare
Schutzschicht.

Echte SMS-2FA ist nicht aktiviert. Sie erfordert Identity Platform und
verursacht SMS-Kosten; das sollte separat bestätigt werden.
