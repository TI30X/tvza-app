# -*- coding: utf-8 -*-
"""Die Willkommen-Seite — der erste Text, den jemand von Firn liest.

Reihenfolge je Zeile: de, en, fr, it, pl, nl, es.
Erzeugt wird daraus assets/i18n/*.json:

    node dev/i18n-src/build.mjs

Drei Dinge sind hier anders als in den anderen Tabellen.

Erstens: das ist WERBETEXT, kein Beschriftungstext. Er wird nicht Wort
fuer Wort uebersetzt, sondern so, dass er in der Sprache stimmt.

Zweitens: wk.hero.titel traegt Markup (<em> um das betonte Wort) und
haengt darum an data-i18n-html. Das betonte Wort ist in jeder Sprache
ein anderes, es muss also mituebersetzt werden und nicht bloss an
derselben Stelle stehen.

Drittens (v.35.70.0): die Seite sagt nur noch, was die App WIRKLICH
kann, und sie sagt es fuer alle Gruppen, nicht fuer den Rennsport.
Michel: "Es fehlt vor allem eine verstaendliche Erklaerung: Was ist
Firn, fuer wen ist es gedacht und was mache ich nach der
Registrierung?" Weg sind darum: die Videoanalyse und die FIS-Punkte
(beides gibt es, beides ist aber nicht das, wofuer sich jemand hier
anmeldet), "kein Konto beim Anbieter" (fuer Firn braucht es genau
eines) und "Was in der Beta entsteht, bleibt" (ein Versprechen ueber
Datenbestand und kuenftige Tarife, das niemand halten kann).

Was hier NICHT steht: ein Preis. Firn ist in der Testphase, und eine
Zahl, die spaeter eine andere ist, muesste in sieben Sprachen
zurueckgenommen werden.
"""

KEYS = {
# ── Kopf und Wege ─────────────────────────────────────────────────
'wk.titel': ('Firn — Termine, Pläne und Nachrichten für Gruppen',
             'Firn — dates, plans and messages for groups',
             'Firn — dates, plans et messages pour les groupes',
             'Firn — date, programmi e messaggi per i gruppi',
             'Firn — terminy, plany i wiadomości dla grup',
             'Firn — data, plannen en berichten voor groepen',
             'Firn — fechas, planes y mensajes para grupos'),

'wk.anmelden': ('Anmelden', 'Sign in', 'Se connecter', 'Accedi',
                'Zaloguj się', 'Inloggen', 'Iniciar sesión'),

'wk.kontoErstellen': ('Konto erstellen', 'Create account', 'Créer un compte',
                      'Crea un account', 'Załóż konto', 'Account aanmaken',
                      'Crear cuenta'),

# ── Aufmacher ─────────────────────────────────────────────────────
# Das <em> gehoert um das Wort, auf das es ankommt — und das ist in
# jeder Sprache ein anderes.
'wk.hero.titel': ('Gemeinsam planen. Den <em>Überblick</em> behalten.',
                  'Plan together. Keep the <em>overview</em>.',
                  "Planifier ensemble. Garder la <em>vue d'ensemble</em>.",
                  'Pianificare insieme. Mantenere la <em>visione</em>.',
                  'Planujcie razem. Miejcie <em>przegląd</em>.',
                  'Samen plannen. Het <em>overzicht</em> houden.',
                  'Planificar juntos. Mantener la <em>visión</em>.'),

'wk.hero.text': ('Firn bringt Termine, Trainingspläne und Nachrichten an einen Ort. Für Sportgruppen, Vereine, Familien und Freundeskreise — damit alle wissen, was ansteht und wo sie die wichtigen Informationen finden.',
                 'Firn brings dates, training plans and messages into one place. For sports groups, clubs, families and circles of friends — so everyone knows what is coming up and where to find what matters.',
                 "Firn réunit les dates, les plans d'entraînement et les messages au même endroit. Pour les groupes sportifs, les clubs, les familles et les cercles d'amis — pour que chacun sache ce qui arrive et où trouver l'essentiel.",
                 'Firn riunisce date, programmi di allenamento e messaggi in un unico posto. Per gruppi sportivi, club, famiglie e gruppi di amici — così tutti sanno cosa arriva e dove trovare le informazioni importanti.',
                 'Firn zbiera terminy, plany treningowe i wiadomości w jednym miejscu. Dla grup sportowych, klubów, rodzin i grup przyjaciół — żeby wszyscy wiedzieli, co przed nimi i gdzie znaleźć to, co ważne.',
                 'Firn brengt data, trainingsplannen en berichten op één plek samen. Voor sportgroepen, clubs, gezinnen en vriendenkringen — zodat iedereen weet wat eraan komt en waar de belangrijke informatie staat.',
                 'Firn reúne fechas, planes de entrenamiento y mensajes en un mismo lugar. Para grupos deportivos, clubes, familias y grupos de amigos — para que todos sepan qué viene y dónde encontrar lo importante.'),

'wk.hero.code': ('Ein Einladungscode ist optional. Du kannst eine eigene Gruppe erstellen oder einer bestehenden Gruppe beitreten.',
                 'An invitation code is optional. You can create your own group or join an existing one.',
                 "Un code d'invitation est facultatif. Tu peux créer ton propre groupe ou rejoindre un groupe existant.",
                 'Il codice di invito è facoltativo. Puoi creare un tuo gruppo o entrare in uno esistente.',
                 'Kod zaproszenia jest opcjonalny. Możesz założyć własną grupę albo dołączyć do istniejącej.',
                 'Een uitnodigingscode is optioneel. Je kunt een eigen groep maken of aan een bestaande groep deelnemen.',
                 'El código de invitación es opcional. Puedes crear tu propio grupo o unirte a uno existente.'),

'wk.bild': ('Ein verschneiter Berg mit einer Spur',
            'A snow-covered mountain with a track',
            'Une montagne enneigée avec une trace',
            'Una montagna innevata con una traccia',
            'Ośnieżona góra ze śladem',
            'Een besneeuwde berg met een spoor',
            'Una montaña nevada con una huella'),

# ── Was ihr organisieren koennt ───────────────────────────────────
'wk.was.titel': ('Was ihr mit Firn organisieren könnt',
                 'What you can organise with Firn',
                 'Ce que vous pouvez organiser avec Firn',
                 'Che cosa potete organizzare con Firn',
                 'Co zorganizujecie w Firn',
                 'Wat je met Firn kunt organiseren',
                 'Qué podéis organizar con Firn'),

'wk.k1.titel': ('Gemeinsame Termine', 'Shared dates', 'Des dates communes',
                'Date condivise', 'Wspólne terminy', 'Gedeelde data',
                'Fechas compartidas'),

'wk.k1.text': ('Plant Trainings, Treffen, Ausflüge und andere Aktivitäten in einem gemeinsamen Kalender. Ergänzt Treffpunkte, wichtige Hinweise und Unterlagen direkt beim Termin.',
               'Plan training sessions, meetings, outings and other activities in a shared calendar. Add meeting points, important notes and documents right at the event.',
               "Planifiez entraînements, réunions, sorties et autres activités dans un calendrier commun. Ajoutez lieux de rendez-vous, informations importantes et documents directement à la date.",
               'Pianificate allenamenti, incontri, gite e altre attività in un calendario condiviso. Aggiungete punti di ritrovo, indicazioni importanti e documenti direttamente sulla data.',
               'Planujcie treningi, spotkania, wycieczki i inne aktywności we wspólnym kalendarzu. Dodawajcie miejsca zbiórki, ważne uwagi i dokumenty wprost przy terminie.',
               'Plan trainingen, bijeenkomsten, uitstapjes en andere activiteiten in een gedeelde agenda. Voeg verzamelpunten, belangrijke aanwijzingen en documenten direct bij de datum toe.',
               'Planificad entrenamientos, reuniones, salidas y otras actividades en un calendario común. Añadid puntos de encuentro, avisos importantes y documentos junto a la fecha.'),

'wk.k2.titel': ('Trainingspläne und Fortschritt', 'Training plans and progress',
                "Plans d'entraînement et progression", 'Programmi e progressi',
                'Plany treningowe i postępy', 'Trainingsplannen en voortgang',
                'Planes de entrenamiento y progreso'),

'wk.k2.text': ('Teilt Trainingspläne mit eurer Gruppe oder einzelnen Athletinnen und Athleten. Haltet absolvierte Übungen, Wiederholungen, Gewichte und Notizen beim jeweiligen Training fest.',
               'Share training plans with your group or with individual athletes. Record completed exercises, repetitions, weights and notes right at each session.',
               "Partagez des plans d'entraînement avec votre groupe ou avec certains athlètes. Notez les exercices faits, les répétitions, les charges et les remarques à même la séance.",
               'Condividete i programmi con il gruppo o con singoli atleti. Annotate esercizi svolti, ripetizioni, carichi e note direttamente nella seduta.',
               'Udostępniajcie plany treningowe grupie albo pojedynczym zawodnikom. Zapisujcie wykonane ćwiczenia, powtórzenia, ciężary i notatki przy danym treningu.',
               'Deel trainingsplannen met je groep of met losse atleten. Leg gedane oefeningen, herhalingen, gewichten en notities vast bij de training zelf.',
               'Compartid planes de entrenamiento con el grupo o con atletas concretos. Anotad ejercicios hechos, repeticiones, pesos y notas en la propia sesión.'),

'wk.k3.titel': ('Nachrichten an einem Ort', 'Messages in one place',
                'Les messages au même endroit', 'Messaggi in un unico posto',
                'Wiadomości w jednym miejscu', 'Berichten op één plek',
                'Mensajes en un solo lugar'),

'wk.k3.text': ('Besprecht Organisatorisches im Gruppenchat oder schreibt einzelnen Personen direkt. So bleibt die Unterhaltung mit den Menschen verbunden, mit denen ihr etwas plant.',
               'Discuss the organisational side in the group chat, or write to individual people directly. That keeps the conversation with the people you are planning with.',
               "Réglez l'organisation dans le chat de groupe ou écrivez directement à une personne. La conversation reste ainsi liée à ceux avec qui vous planifiez.",
               'Discutete l’organizzazione nella chat di gruppo o scrivete direttamente a una persona. Così la conversazione resta con le persone con cui state pianificando.',
               'Ustalajcie sprawy organizacyjne na czacie grupowym albo piszcie do konkretnych osób. Rozmowa zostaje przy tych, z którymi planujecie.',
               'Bespreek het organisatorische in de groepschat of schrijf mensen rechtstreeks. Zo blijft het gesprek bij de mensen met wie je plant.',
               'Tratad la organización en el chat de grupo o escribid a personas concretas. Así la conversación queda junto a quienes planifican con vosotros.'),

'wk.k4.titel': ('Unterstützung durch den Assistenten', 'Support from the assistant',
                "L'aide de l'assistant", "Il supporto dell'assistente",
                'Wsparcie asystenta', 'Hulp van de assistent',
                'Ayuda del asistente'),

'wk.k4.text': ('Wo freigeschaltet, hilft euch der KI-Assistent, Informationen zu finden und Vorschläge für eure Planung zu entwickeln. Prüft seine Antworten: Auch ein Assistent kann sich irren.',
               'Where enabled, the AI assistant helps you find information and work out suggestions for your planning. Check its answers: an assistant can be wrong too.',
               "Là où il est activé, l'assistant IA vous aide à trouver des informations et à préparer des propositions pour votre planification. Vérifiez ses réponses : un assistant peut se tromper.",
               'Dove è attivato, l’assistente IA vi aiuta a trovare informazioni e a preparare proposte per la pianificazione. Controllate le sue risposte: anche un assistente può sbagliare.',
               'Tam, gdzie jest włączony, asystent AI pomaga znaleźć informacje i przygotować propozycje do planowania. Sprawdzajcie jego odpowiedzi: asystent też może się mylić.',
               'Waar vrijgeschakeld helpt de AI-assistent je informatie te vinden en voorstellen voor je planning uit te werken. Controleer zijn antwoorden: ook een assistent kan zich vergissen.',
               'Donde esté habilitado, el asistente de IA os ayuda a encontrar información y a preparar propuestas para vuestra planificación. Revisad sus respuestas: un asistente también puede equivocarse.'),

# ── Fuer welche Gruppen ───────────────────────────────────────────
'wk.gruppen.titel': ('Eine App für unterschiedliche Gruppen',
                     'One app for different kinds of groups',
                     'Une application pour des groupes très différents',
                     'Un’app per gruppi diversi',
                     'Jedna aplikacja dla różnych grup',
                     'Eén app voor verschillende groepen',
                     'Una app para grupos distintos'),

'wk.g1.titel': ('Sport und Training', 'Sport and training', 'Sport et entraînement',
                'Sport e allenamento', 'Sport i trening', 'Sport en training',
                'Deporte y entrenamiento'),
'wk.g1.text': ('Organisiert gemeinsame Einheiten, verteilt Trainingspläne und behaltet Termine und Fortschritte im Blick.',
               'Organise sessions together, hand out training plans and keep an eye on dates and progress.',
               "Organisez les séances, distribuez les plans d'entraînement et gardez un œil sur les dates et la progression.",
               'Organizzate le sedute, distribuite i programmi e tenete d’occhio date e progressi.',
               'Organizujcie wspólne jednostki, rozdzielajcie plany i miejcie oko na terminy oraz postępy.',
               'Organiseer gezamenlijke trainingen, deel trainingsplannen uit en houd data en voortgang in de gaten.',
               'Organizad sesiones conjuntas, repartid planes de entrenamiento y seguid fechas y progresos.'),

'wk.g2.titel': ('Vereine und Teams', 'Clubs and teams', 'Clubs et équipes',
                'Club e squadre', 'Kluby i zespoły', 'Clubs en teams',
                'Clubes y equipos'),
'wk.g2.text': ('Koordiniert Aktivitäten, teilt Informationen und bringt eure Mitglieder auf denselben Stand.',
               'Coordinate activities, share information and bring your members up to the same level of knowledge.',
               'Coordonnez les activités, partagez les informations et mettez vos membres au même niveau.',
               'Coordinate le attività, condividete le informazioni e portate i membri allo stesso punto.',
               'Koordynujcie działania, dzielcie się informacjami i utrzymujcie członków na tym samym poziomie wiedzy.',
               'Coördineer activiteiten, deel informatie en breng je leden op hetzelfde punt.',
               'Coordinad actividades, compartid información y poned a vuestros miembros al día.'),

'wk.g3.titel': ('Familie und Freunde', 'Family and friends', 'Famille et amis',
                'Famiglia e amici', 'Rodzina i przyjaciele', 'Familie en vrienden',
                'Familia y amigos'),
'wk.g3.text': ('Plant gemeinsame Unternehmungen, stimmt Termine ab und haltet Absprachen zusammen.',
               'Plan things you do together, agree on dates and keep your arrangements in one place.',
               'Planifiez vos sorties, accordez vos dates et gardez vos arrangements au même endroit.',
               'Pianificate le uscite, mettete d’accordo le date e tenete insieme gli accordi.',
               'Planujcie wspólne wyjścia, ustalajcie terminy i trzymajcie ustalenia w jednym miejscu.',
               'Plan gezamenlijke uitjes, stem data af en houd afspraken bij elkaar.',
               'Planificad salidas juntos, acordad fechas y mantened los acuerdos en un sitio.'),

# ── So beginnt ihr ────────────────────────────────────────────────
'wk.start.titel': ('So beginnt ihr', 'How you start', 'Pour commencer',
                   'Come si comincia', 'Jak zacząć', 'Zo beginnen jullie',
                   'Cómo empezáis'),

'wk.s1.titel': ('Konto erstellen', 'Create an account', 'Créer un compte',
                'Creare un account', 'Załóż konto', 'Account aanmaken',
                'Crear una cuenta'),
'wk.s1.text': ('Registriere dich mit deinem Namen und deiner E-Mail-Adresse.',
               'Sign up with your name and your email address.',
               'Inscris-toi avec ton nom et ton adresse e-mail.',
               'Registrati con il tuo nome e il tuo indirizzo e-mail.',
               'Zarejestruj się, podając imię i adres e-mail.',
               'Meld je aan met je naam en je e-mailadres.',
               'Regístrate con tu nombre y tu dirección de correo.'),

'wk.s2.titel': ('Gruppe erstellen oder beitreten', 'Create or join a group',
                'Créer un groupe ou en rejoindre un', 'Creare un gruppo o entrarci',
                'Załóż grupę albo dołącz', 'Groep maken of deelnemen',
                'Crear un grupo o unirte'),
'wk.s2.text': ('Starte eine eigene Gruppe oder verwende eine Einladung, die du erhalten hast.',
               'Start your own group or use an invitation you have received.',
               'Lance ton propre groupe ou utilise une invitation que tu as reçue.',
               'Avvia un gruppo tuo oppure usa un invito che hai ricevuto.',
               'Załóż własną grupę albo użyj otrzymanego zaproszenia.',
               'Start een eigen groep of gebruik een uitnodiging die je hebt gekregen.',
               'Crea tu propio grupo o usa una invitación que hayas recibido.'),

'wk.s3.titel': ('Gemeinsam loslegen', 'Get going together', 'Se lancer ensemble',
                'Partire insieme', 'Ruszajcie razem', 'Samen beginnen',
                'Empezad juntos'),
'wk.s3.text': ('Lade weitere Personen ein und ergänzt eure ersten Termine, Pläne oder Nachrichten.',
               'Invite more people and add your first dates, plans or messages.',
               "Invite d'autres personnes et ajoutez vos premières dates, vos plans ou vos messages.",
               'Invita altre persone e aggiungete le prime date, i programmi o i messaggi.',
               'Zaproś kolejne osoby i dodajcie pierwsze terminy, plany albo wiadomości.',
               'Nodig meer mensen uit en voeg jullie eerste data, plannen of berichten toe.',
               'Invita a más personas y añadid vuestras primeras fechas, planes o mensajes.'),

# ── Haeufige Fragen ───────────────────────────────────────────────
'wk.faq.titel': ('Häufige Fragen', 'Common questions', 'Questions fréquentes',
                 'Domande frequenti', 'Częste pytania', 'Veelgestelde vragen',
                 'Preguntas frecuentes'),

'wk.f1.frage': ('Brauche ich eine Einladung?', 'Do I need an invitation?',
                "Ai-je besoin d'une invitation ?", 'Serve un invito?',
                'Czy potrzebuję zaproszenia?', 'Heb ik een uitnodiging nodig?',
                '¿Necesito una invitación?'),
'wk.f1.antwort': ('Nein. Du kannst zunächst ein persönliches Konto erstellen und später einer Gruppe beitreten oder selbst eine Gruppe gründen.',
                  'No. You can create a personal account first and join a group later, or start a group yourself.',
                  "Non. Tu peux d'abord créer un compte personnel, puis rejoindre un groupe plus tard ou en fonder un toi-même.",
                  'No. Puoi prima creare un account personale e poi entrare in un gruppo o fondarne uno tu.',
                  'Nie. Możesz najpierw założyć konto osobiste, a później dołączyć do grupy albo założyć własną.',
                  'Nee. Je kunt eerst een persoonlijk account maken en later aan een groep deelnemen of zelf een groep oprichten.',
                  'No. Puedes crear primero una cuenta personal y más tarde unirte a un grupo o fundar uno.'),

'wk.f2.frage': ('Kann ich mehrere Gruppen nutzen?', 'Can I use several groups?',
                'Puis-je utiliser plusieurs groupes ?', 'Posso usare più gruppi?',
                'Czy mogę korzystać z kilku grup?', 'Kan ik meerdere groepen gebruiken?',
                '¿Puedo usar varios grupos?'),
'wk.f2.antwort': ('Ja. Du kannst beispielsweise eine Sportgruppe und einen Freundeskreis mit demselben Konto organisieren.',
                  'Yes. You can run a sports group and a circle of friends from the same account, for example.',
                  "Oui. Tu peux par exemple gérer un groupe sportif et un cercle d'amis avec le même compte.",
                  'Sì. Puoi per esempio gestire un gruppo sportivo e un gruppo di amici con lo stesso account.',
                  'Tak. Możesz na przykład prowadzić grupę sportową i grono przyjaciół na tym samym koncie.',
                  'Ja. Je kunt bijvoorbeeld een sportgroep en een vriendenkring met hetzelfde account regelen.',
                  'Sí. Puedes llevar, por ejemplo, un grupo deportivo y un grupo de amigos con la misma cuenta.'),

'wk.f3.frage': ('Muss ich eine App herunterladen?', 'Do I have to download an app?',
                'Dois-je télécharger une application ?', 'Devo scaricare un’app?',
                'Czy muszę pobierać aplikację?', 'Moet ik een app downloaden?',
                '¿Tengo que descargar una app?'),
'wk.f3.antwort': ('Firn funktioniert im Browser auf Smartphone, Tablet und Computer. Auf unterstützten Geräten kannst du die Web-App auch zum Startbildschirm hinzufügen.',
                  'Firn works in the browser on phones, tablets and computers. On supported devices you can also add the web app to your home screen.',
                  "Firn fonctionne dans le navigateur sur smartphone, tablette et ordinateur. Sur les appareils compatibles, tu peux aussi ajouter l'application web à l'écran d'accueil.",
                  'Firn funziona nel browser su smartphone, tablet e computer. Sui dispositivi compatibili puoi aggiungere la web app alla schermata iniziale.',
                  'Firn działa w przeglądarce na telefonie, tablecie i komputerze. Na obsługiwanych urządzeniach możesz dodać aplikację do ekranu głównego.',
                  'Firn werkt in de browser op telefoon, tablet en computer. Op ondersteunde apparaten kun je de web-app aan je beginscherm toevoegen.',
                  'Firn funciona en el navegador en móvil, tableta y ordenador. En dispositivos compatibles puedes añadir la web app a la pantalla de inicio.'),

'wk.f4.frage': ('Welche Funktionen stehen mir zur Verfügung?',
                'Which features are available to me?',
                'Quelles fonctions sont à ma disposition ?',
                'Quali funzioni ho a disposizione?',
                'Jakie funkcje są dla mnie dostępne?',
                'Welke functies heb ik?',
                '¿Qué funciones tengo disponibles?'),
'wk.f4.antwort': ('Das hängt von deiner Gruppe, deiner Rolle und den freigeschalteten Funktionen ab. Die Gruppenleitung verwaltet gemeinsame Einstellungen und Berechtigungen.',
                  'That depends on your group, your role and which features are enabled. The group lead manages shared settings and permissions.',
                  'Cela dépend de ton groupe, de ton rôle et des fonctions activées. La direction du groupe gère les réglages communs et les autorisations.',
                  'Dipende dal gruppo, dal tuo ruolo e dalle funzioni attivate. La direzione del gruppo gestisce impostazioni comuni e permessi.',
                  'To zależy od grupy, twojej roli i włączonych funkcji. Kierownictwo grupy zarządza wspólnymi ustawieniami i uprawnieniami.',
                  'Dat hangt af van je groep, je rol en de vrijgeschakelde functies. De groepsleiding beheert gedeelde instellingen en rechten.',
                  'Depende de tu grupo, de tu rol y de las funciones habilitadas. La dirección del grupo gestiona los ajustes comunes y los permisos.'),

# ── Testphase ─────────────────────────────────────────────────────
'wk.beta.titel': ('Firn wird weiterentwickelt', 'Firn is still being built',
                  'Firn continue à évoluer', 'Firn è in evoluzione',
                  'Firn jest rozwijany', 'Firn wordt verder ontwikkeld',
                  'Firn sigue en desarrollo'),

'wk.beta.text': ('Firn befindet sich in der Testphase. Wir verbessern Funktionen und Bedienung laufend. Dabei können Fehler, Unterbrechungen oder Änderungen auftreten. Bewahre wichtige Unterlagen deshalb zusätzlich ausserhalb von Firn auf.',
                 'Firn is in a test phase. We keep improving features and handling, and that brings errors, interruptions and changes with it. Keep important documents somewhere outside Firn as well.',
                 "Firn est en phase de test. Nous améliorons les fonctions et l'utilisation en continu, ce qui peut entraîner des erreurs, des interruptions ou des changements. Conserve donc les documents importants aussi en dehors de Firn.",
                 'Firn è in fase di test. Miglioriamo funzioni e utilizzo di continuo, e questo può portare errori, interruzioni o cambiamenti. Conserva i documenti importanti anche fuori da Firn.',
                 'Firn jest w fazie testów. Stale poprawiamy funkcje i obsługę, a to może oznaczać błędy, przerwy albo zmiany. Ważne dokumenty przechowuj także poza Firn.',
                 'Firn zit in een testfase. We verbeteren functies en bediening doorlopend; daarbij kunnen fouten, onderbrekingen of wijzigingen optreden. Bewaar belangrijke documenten daarom ook buiten Firn.',
                 'Firn está en fase de pruebas. Mejoramos funciones y manejo continuamente, y eso puede traer errores, interrupciones o cambios. Guarda los documentos importantes también fuera de Firn.'),

'wk.beta.preis': ('Falls später kostenpflichtige Angebote hinzukommen, informieren wir vorher über Preis und Umfang. Kosten entstehen erst, wenn du ein entsprechendes Angebot ausdrücklich annimmst.',
                  'If paid offers are added later, we will say what they cost and what they include beforehand. Nothing costs anything until you expressly accept such an offer.',
                  "Si des offres payantes s'ajoutent plus tard, nous en indiquerons le prix et le contenu à l'avance. Aucun frais n'apparaît tant que tu n'as pas expressément accepté une telle offre.",
                  'Se in futuro arriveranno offerte a pagamento, comunicheremo prima prezzo e contenuto. Nessun costo sorge finché non accetti espressamente una simile offerta.',
                  'Jeśli później pojawią się płatne oferty, wcześniej podamy cenę i zakres. Koszty powstają dopiero wtedy, gdy wyraźnie przyjmiesz taką ofertę.',
                  'Komen er later betaalde aanbiedingen bij, dan melden we vooraf prijs en omvang. Er ontstaan pas kosten als je zo’n aanbod uitdrukkelijk aanvaardt.',
                  'Si más adelante se añaden ofertas de pago, indicaremos antes el precio y el alcance. No hay costes hasta que aceptes expresamente una oferta así.'),

# ── Schluss ───────────────────────────────────────────────────────
'wk.schluss.titel': ('Bereit für eure erste Gruppe?', 'Ready for your first group?',
                     'Prêts pour votre premier groupe ?', 'Pronti per il primo gruppo?',
                     'Gotowi na pierwszą grupę?', 'Klaar voor jullie eerste groep?',
                     '¿Listos para vuestro primer grupo?'),
'wk.schluss.text': ('Erstelle dein Konto und bring eure nächsten Termine und Absprachen zusammen.',
                    'Create your account and bring your next dates and arrangements together.',
                    'Crée ton compte et rassemble vos prochaines dates et vos accords.',
                    'Crea il tuo account e metti insieme le prossime date e gli accordi.',
                    'Załóż konto i zbierz w jednym miejscu najbliższe terminy i ustalenia.',
                    'Maak je account aan en breng jullie volgende data en afspraken samen.',
                    'Crea tu cuenta y reúne vuestras próximas fechas y acuerdos.'),

# ── Fuss ──────────────────────────────────────────────────────────
'wk.fuss': ('— ein Projekt von TVZA', '— a project by TVZA',
            '— un projet de TVZA', '— un progetto di TVZA',
            '— projekt TVZA', '— een project van TVZA',
            '— un proyecto de TVZA'),
}
