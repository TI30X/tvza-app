/* Die öffentliche Adresse des Firn-Workers. Kein Geheimnis — die
   Adresse steht ohnehin in jedem Kalender-Abo, das jemand einrichtet.
   Die Geheimnisse (Service-Account, Gemini-Schlüssel) liegen als Secrets
   beim Worker und nie hier.

   Leer heisst: es gibt keinen Worker. Alles, was ihn braucht — das
   Kalender-Abo, später signierte Uploads und der KI-Zugang —, zeigt
   dann gar keinen Knopf an, statt einen anzubieten, der scheitert.

   Ausgerollt am 15.09.2026 (v.35.57.0) — zuerst nur für den Assistenten:
   der Gemini-Schlüssel (als Secret) und der KV-Speicher KI sind gesetzt, der Service-Account
   (SERVICE_ACCOUNT) noch nicht. Siehe worker/README.md. */
export const WORKER_BASIS = 'https://firn-worker.tvza-app.workers.dev';

/* Das Kalender-Abo braucht ZUSÄTZLICH den Service-Account im Worker
   (er liest die Termine einer Gruppe ohne Anmeldung). Ohne ihn antwortet
   /ics mit einem Fehler — darum eigener Schalter, sonst stünde mit der
   Adresse oben ein Knopf "Kalender-Abo erzeugen" da, der zuverlässig
   scheitert. Auf true, sobald /health "konto=vorhanden" meldet. */
export const KALENDER_ABO = false;
