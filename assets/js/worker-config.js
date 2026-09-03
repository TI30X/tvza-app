/* Die öffentliche Adresse des Firn-Workers. Kein Geheimnis — die
   Adresse steht ohnehin in jedem Kalender-Abo, das jemand einrichtet.
   Die Geheimnisse (Service-Account, Mailversand) liegen als Secrets
   beim Worker und nie hier.

   Leer heisst: es gibt keinen Worker. Alles, was ihn braucht — das
   Kalender-Abo, später signierte Uploads und der KI-Zugang —, zeigt
   dann gar keinen Knopf an, statt einen anzubieten, der scheitert.

   Nach dem Ausrollen (siehe worker/README.md) hier eintragen, z.B.
   'https://firn-worker.<subdomain>.workers.dev'. */
export const WORKER_BASIS = '';
