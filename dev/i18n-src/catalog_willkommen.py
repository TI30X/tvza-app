# -*- coding: utf-8 -*-
"""Die Willkommen-Seite — der erste Text, den jemand von Firn liest.

Reihenfolge je Zeile: de, en, fr, it, pl, nl, es.
Erzeugt wird daraus assets/i18n/*.json:

    node dev/i18n-src/build.mjs

Zwei Dinge sind hier anders als in den anderen Tabellen.

Erstens: das ist WERBETEXT, kein Beschriftungstext. Er wird nicht Wort
fuer Wort uebersetzt, sondern so, dass er in der Sprache stimmt. "Kader"
heisst auf Niederlaendisch "selectie" und auf Franzoesisch schlicht
"equipe" — eine woertliche Uebersetzung klaenge in beiden falsch.

Zweitens: wk.hero.titel traegt Markup (<em> um das betonte Wort) und
haengt darum an data-i18n-html. Das betonte Wort ist in jeder Sprache
ein anderes, es muss also mituebersetzt werden und nicht bloss an
derselben Stelle stehen.

Was hier NICHT steht: ein Preis. Firn ist in geschlossener Beta, und
eine Zahl, die spaeter eine andere ist, muesste in sieben Sprachen
zurueckgenommen werden.
"""

KEYS = {
# ── Kopf und Wege ─────────────────────────────────────────────────
'wk.titel': ('Firn — Training für Kader und Vereine',
             'Firn — training for squads and clubs',
             "Firn — l'entraînement pour équipes et clubs",
             'Firn — allenamento per squadre e club',
             'Firn — trening dla kadr i klubów',
             'Firn — training voor selecties en clubs',
             'Firn — entrenamiento para equipos y clubes'),

'wk.anmelden': ('Anmelden', 'Sign in', 'Se connecter', 'Accedi',
                'Zaloguj się', 'Inloggen', 'Iniciar sesión'),

'wk.kontoErstellen': ('Konto erstellen', 'Create account', 'Créer un compte',
                      'Crea un account', 'Załóż konto', 'Account aanmaken',
                      'Crear cuenta'),

'wk.wasKostet': ('Was das kostet', 'What it costs', 'Ce que ça coûte',
                 'Quanto costa', 'Ile to kosztuje', 'Wat het kost',
                 'Cuánto cuesta'),

# ── Aufmacher ─────────────────────────────────────────────────────
# Das <em> gehoert um das Wort, auf das es ankommt — und das ist in
# jeder Sprache ein anderes.
'wk.hero.titel': ('Führe dein Kader an <em>einem</em> Ort.',
                  'Lead your squad from <em>one</em> place.',
                  "Dirige ton équipe depuis <em>un seul</em> endroit.",
                  'Guida la tua squadra da <em>un solo</em> posto.',
                  'Prowadź swoją kadrę w <em>jednym</em> miejscu.',
                  'Leid je selectie vanaf <em>één</em> plek.',
                  'Dirige tu equipo desde <em>un solo</em> lugar.'),

'wk.hero.text': ('Pläne, Termine, Videoanalyse und Rennergebnisse — statt in vier Gruppenchats, zwei Tabellen und einem Ordner mit PDFs.',
                 'Plans, dates, video analysis and race results — instead of four group chats, two spreadsheets and a folder full of PDFs.',
                 "Plans, dates, analyse vidéo et résultats de course — au lieu de quatre groupes de discussion, deux tableurs et un dossier de PDF.",
                 'Programmi, date, analisi video e risultati di gara — invece di quattro chat di gruppo, due fogli di calcolo e una cartella di PDF.',
                 'Plany, terminy, analiza wideo i wyniki zawodów — zamiast czterech czatów grupowych, dwóch arkuszy i folderu z PDF-ami.',
                 'Plannen, data, video-analyse en wedstrijduitslagen — in plaats van vier groepschats, twee spreadsheets en een map vol PDF-bestanden.',
                 'Planes, fechas, análisis de vídeo y resultados de carrera — en lugar de cuatro chats de grupo, dos hojas de cálculo y una carpeta con PDF.'),

'wk.bild': ('Ein Hang mit einer Slalomspur',
            'A slope with a slalom line',
            'Une pente avec une trace de slalom',
            'Un pendio con una traccia di slalom',
            'Stok ze śladem slalomu',
            'Een helling met een slalomspoor',
            'Una pendiente con una traza de eslalon'),

# ── Nicht nur Rennkader ───────────────────────────────────────────
'wk.fuer.titel': ('Nicht nur für Rennkader',
                  'Not just for race squads',
                  "Pas seulement pour les équipes de course",
                  'Non solo per squadre agonistiche',
                  'Nie tylko dla kadr wyścigowych',
                  'Niet alleen voor wedstrijdselecties',
                  'No solo para equipos de competición'),

'wk.fuer.text': ('Dieselbe Gruppe funktioniert als Kader, als Verein, als Gym oder als Familie. Was sich ändert, sind die Wörter: wo der Kader einen Haupttrainer und Athleten hat, hat das Gym eine Leitung und Mitglieder, und aus dem Trainingslager wird ein Workshop. Der Aufbau bleibt derselbe.',
                 'The same group works as a squad, a club, a gym or a family. What changes are the words: where the squad has a head coach and athletes, the gym has a manager and members, and the training camp becomes a workshop. The structure stays the same.',
                 "Le même groupe fonctionne comme équipe, club, salle de sport ou famille. Ce qui change, ce sont les mots : là où l'équipe a un entraîneur principal et des athlètes, la salle a une direction et des membres, et le stage devient un atelier. La structure reste la même.",
                 'Lo stesso gruppo funziona come squadra, club, palestra o famiglia. A cambiare sono le parole: dove la squadra ha un allenatore capo e atleti, la palestra ha una direzione e membri, e il ritiro diventa un workshop. La struttura resta la stessa.',
                 'Ta sama grupa działa jako kadra, klub, siłownia albo rodzina. Zmieniają się tylko słowa: tam gdzie kadra ma trenera głównego i zawodników, siłownia ma kierownictwo i członków, a zgrupowanie staje się warsztatami. Struktura pozostaje ta sama.',
                 'Dezelfde groep werkt als selectie, club, sportschool of gezin. Wat verandert zijn de woorden: waar de selectie een hoofdtrainer en atleten heeft, heeft de sportschool een leiding en leden, en het trainingskamp wordt een workshop. De opbouw blijft dezelfde.',
                 'El mismo grupo funciona como equipo, club, gimnasio o familia. Lo que cambia son las palabras: donde el equipo tiene un entrenador jefe y atletas, el gimnasio tiene una dirección y miembros, y la concentración se convierte en un taller. La estructura sigue siendo la misma.'),

'wk.pille.kader': ('Rennkader', 'Race squad', 'Équipe de course',
                   'Squadra agonistica', 'Kadra wyścigowa',
                   'Wedstrijdselectie', 'Equipo de competición'),
'wk.pille.verein': ('Skiclub', 'Ski club', 'Club de ski', 'Sci club',
                    'Klub narciarski', 'Skiclub', 'Club de esquí'),
'wk.pille.gym': ('Gym', 'Gym', 'Salle de sport', 'Palestra',
                 'Siłownia', 'Sportschool', 'Gimnasio'),
'wk.pille.familie': ('Familie', 'Family', 'Famille', 'Famiglia',
                     'Rodzina', 'Gezin', 'Familia'),

# ── Die vier Karten ───────────────────────────────────────────────
'wk.k1.titel': ('Pläne, die ankommen', 'Plans that arrive',
                'Des plans qui arrivent', 'Programmi che arrivano',
                'Plany, które docierają', 'Plannen die aankomen',
                'Planes que llegan'),

'wk.k1.text': ('Ein Programm für die ganze Gruppe oder eines für einen einzelnen Athleten. Mehrere Trainer arbeiten nebeneinander, ohne sich gegenseitig zu überschreiben.',
               'One programme for the whole group, or one for a single athlete. Several coaches work side by side without overwriting each other.',
               "Un programme pour tout le groupe ou un programme pour un seul athlète. Plusieurs entraîneurs travaillent côte à côte sans s'écraser mutuellement.",
               "Un programma per tutto il gruppo o uno per un singolo atleta. Più allenatori lavorano fianco a fianco senza sovrascriversi a vicenda.",
               'Jeden program dla całej grupy albo dla pojedynczego zawodnika. Kilku trenerów pracuje obok siebie, nie nadpisując się nawzajem.',
               'Eén programma voor de hele groep of één voor een enkele atleet. Meerdere trainers werken naast elkaar zonder elkaar te overschrijven.',
               'Un programa para todo el grupo o uno para un solo atleta. Varios entrenadores trabajan en paralelo sin sobrescribirse.'),

'wk.k2.titel': ('Termine mit Ausschreibung', 'Events, announcement included',
                'Des dates, invitation comprise', 'Date, con il bando allegato',
                'Terminy z komunikatem', 'Data, met uitnodiging',
                'Fechas, con la convocatoria'),

'wk.k2.text': ('Trainings, Trainingslager und Rennen. Die Ausschreibung hängt als PDF am Termin und lässt sich nachträglich ersetzen. Fällt etwas aus, wird es abgesagt und nicht gelöscht — sonst steht am Samstag jemand am Lift.',
               'Training sessions, camps and races. The announcement hangs on the event as a PDF and can be replaced later. If something is off, it is cancelled and not deleted — otherwise someone is standing at the lift on Saturday.',
               "Entraînements, stages et courses. L'invitation est jointe à la date en PDF et peut être remplacée plus tard. Si quelque chose tombe à l'eau, on l'annule au lieu de le supprimer — sinon quelqu'un attend au télésiège samedi.",
               "Allenamenti, ritiri e gare. Il bando è allegato alla data in PDF e può essere sostituito in seguito. Se qualcosa salta, viene annullato e non cancellato — altrimenti sabato qualcuno aspetta all'impianto.",
               'Treningi, zgrupowania i zawody. Komunikat wisi przy terminie jako PDF i można go później wymienić. Jeśli coś przepada, jest odwołane, a nie usunięte — inaczej ktoś w sobotę stoi przy wyciągu.',
               'Trainingen, kampen en wedstrijden. De uitnodiging hangt als pdf aan de datum en kan later worden vervangen. Valt er iets uit, dan wordt het afgezegd en niet verwijderd — anders staat er zaterdag iemand bij de lift.',
               'Entrenamientos, concentraciones y carreras. La convocatoria va en PDF junto a la fecha y se puede sustituir después. Si algo se cae, se anula y no se borra — si no, el sábado alguien se planta en el telesilla.'),

'wk.k3.titel': ('Videoanalyse im Browser', 'Video analysis in the browser',
                'Analyse vidéo dans le navigateur', 'Analisi video nel browser',
                'Analiza wideo w przeglądarce', 'Video-analyse in de browser',
                'Análisis de vídeo en el navegador'),

# Der Satz muss in JEDER Sprache dasselbe versprechen: die AUSWERTUNG
# laeuft im Browser. Das Video selbst wird sehr wohl gespeichert.
'wk.k3.text': ('Skelett über die Fahrt, Gelenkwinkel, Schwungwechsel. Die Auswertung läuft im Browser — das Video wird zur Analyse an keinen Server geschickt.',
               'A skeleton over the run, joint angles, turn transitions. The analysis runs in the browser — the video is not sent to any server for it.',
               "Un squelette sur la descente, les angles articulaires, les changements de virage. L'analyse tourne dans le navigateur — la vidéo n'est envoyée à aucun serveur pour cela.",
               "Uno scheletro sulla discesa, angoli articolari, cambi di curva. L'analisi gira nel browser — il video non viene inviato ad alcun server per questo.",
               'Szkielet na przejeździe, kąty w stawach, zmiany skrętu. Analiza działa w przeglądarce — wideo nie jest w tym celu wysyłane na żaden serwer.',
               'Een skelet over de afdaling, gewrichtshoeken, bochtwissels. De analyse draait in de browser — de video gaat daarvoor naar geen enkele server.',
               'Un esqueleto sobre la bajada, ángulos articulares, cambios de viraje. El análisis se ejecuta en el navegador — el vídeo no se envía a ningún servidor para ello.'),

'wk.k4.titel': ('FIS-Punkte, ausgerechnet', 'FIS points, calculated',
                'Points FIS, calculés', 'Punti FIS, calcolati',
                'Punkty FIS, wyliczone', 'FIS-punten, uitgerekend',
                'Puntos FIS, calculados'),

'wk.k4.text': ('Rennzeiten im Profil des Athleten, daraus der Punktestand nach der FIS-Formel. Ohne Penalty wird nichts geraten, sondern nichts angezeigt.',
               'Race times in the athlete profile, and from them the standing by the FIS formula. Without a penalty nothing is guessed — nothing is shown.',
               "Les temps de course dans le profil de l'athlète, et le total selon la formule FIS. Sans penalty, rien n'est deviné : rien n'est affiché.",
               "I tempi di gara nel profilo dell'atleta e da lì il punteggio secondo la formula FIS. Senza penalty non si indovina nulla: non si mostra nulla.",
               'Czasy przejazdów w profilu zawodnika, a z nich wynik według wzoru FIS. Bez penalty nic nie jest zgadywane — nic nie jest pokazywane.',
               'Wedstrijdtijden in het profiel van de atleet, en daaruit de stand volgens de FIS-formule. Zonder penalty wordt niets geraden — er wordt niets getoond.',
               'Los tiempos de carrera en el perfil del atleta y, a partir de ahí, la puntuación según la fórmula FIS. Sin penalty no se adivina nada: no se muestra nada.'),

# ── Der dunkle Streifen ───────────────────────────────────────────
'wk.nichts.titel': ('Was dein Kader nicht tun muss',
                    'What your squad does not have to do',
                    "Ce que ton équipe n'a pas à faire",
                    'Quello che la tua squadra non deve fare',
                    'Czego twoja kadra nie musi robić',
                    'Wat je selectie niet hoeft te doen',
                    'Lo que tu equipo no tiene que hacer'),

'wk.nichts.text': ('Athleten brauchen keine Einrichtung. Sie bekommen einen Code, treten bei und sehen ihren Plan. Kein Abo, kein Konto beim Anbieter, keine App aus einem Store.',
                   'Athletes need no setup. They get a code, join and see their plan. No subscription, no account with the provider, no app from a store.',
                   "Les athlètes n'ont rien à configurer. Ils reçoivent un code, rejoignent le groupe et voient leur plan. Pas d'abonnement, pas de compte chez le fournisseur, pas d'application à installer.",
                   'Gli atleti non devono configurare nulla. Ricevono un codice, entrano e vedono il loro programma. Nessun abbonamento, nessun account presso il fornitore, nessuna app da uno store.',
                   'Zawodnicy niczego nie konfigurują. Dostają kod, dołączają i widzą swój plan. Bez abonamentu, bez konta u dostawcy, bez aplikacji ze sklepu.',
                   'Atleten hoeven niets in te stellen. Ze krijgen een code, sluiten zich aan en zien hun plan. Geen abonnement, geen account bij de aanbieder, geen app uit een store.',
                   'Los atletas no tienen que configurar nada. Reciben un código, se unen y ven su plan. Sin suscripción, sin cuenta con el proveedor, sin app de una tienda.'),

# ── Beta ──────────────────────────────────────────────────────────
'wk.beta.titel': ('Firn ist in geschlossener Beta', 'Firn is in closed beta',
                  'Firn est en bêta fermée', 'Firn è in beta chiusa',
                  'Firn jest w zamkniętej becie', 'Firn is in gesloten bèta',
                  'Firn está en beta cerrada'),

'wk.beta.text': ('Es gibt noch keinen Preis, weil es noch nichts zu kaufen gibt. Wer jetzt dabei sein will, erstellt ein Konto und bekommt den Zugang von Hand freigeschaltet.',
                 'There is no price yet, because there is nothing to buy yet. If you want in now, create an account and access is unlocked by hand.',
                 "Il n'y a pas encore de prix, parce qu'il n'y a encore rien à acheter. Pour en être dès maintenant, crée un compte : l'accès est activé à la main.",
                 "Non c'è ancora un prezzo, perché non c'è ancora nulla da comprare. Chi vuole esserci ora crea un account e l'accesso viene sbloccato a mano.",
                 'Nie ma jeszcze ceny, bo nie ma jeszcze czego kupić. Kto chce być teraz, zakłada konto, a dostęp jest odblokowywany ręcznie.',
                 'Er is nog geen prijs, want er valt nog niets te kopen. Wie er nu bij wil zijn, maakt een account aan en krijgt de toegang met de hand vrijgeschakeld.',
                 'Todavía no hay precio, porque todavía no hay nada que comprar. Quien quiera estar ahora crea una cuenta y el acceso se habilita a mano.'),

'wk.beta.p1t': ('Der Kader zahlt, nicht der Athlet.',
                'The squad pays, not the athlete.',
                "C'est l'équipe qui paie, pas l'athlète.",
                "Paga la squadra, non l'atleta.",
                'Płaci kadra, nie zawodnik.',
                'De selectie betaalt, niet de atleet.',
                'Paga el equipo, no el atleta.'),
'wk.beta.p1': ('Ein Abo je Gruppe, die Mitglieder kommen kostenlos dazu.',
               'One subscription per group; members join at no cost.',
               "Un abonnement par groupe, les membres s'ajoutent gratuitement.",
               'Un abbonamento per gruppo, i membri si aggiungono gratis.',
               'Jeden abonament na grupę, członkowie dołączają za darmo.',
               'Eén abonnement per groep, leden komen er gratis bij.',
               'Una suscripción por grupo; los miembros se suman gratis.'),

'wk.beta.p2t': ('Was in der Beta entsteht, bleibt.',
                'What you build in the beta stays.',
                'Ce qui se crée en bêta reste.',
                'Quello che nasce nella beta resta.',
                'To, co powstanie w becie, zostaje.',
                'Wat in de bèta ontstaat, blijft.',
                'Lo que se cree en la beta se queda.'),
'wk.beta.p2': ('Deine Gruppe, deine Pläne und deine Termine wandern nicht in einen anderen Tarif.',
               'Your group, your plans and your dates do not move into another tier.',
               "Ton groupe, tes plans et tes dates ne partent pas dans une autre formule.",
               'Il tuo gruppo, i tuoi programmi e le tue date non finiscono in un altro piano.',
               'Twoja grupa, twoje plany i terminy nie wędrują do innego pakietu.',
               'Je groep, je plannen en je data verhuizen niet naar een ander pakket.',
               'Tu grupo, tus planes y tus fechas no se mudan a otro plan.'),

'wk.beta.p3t': ('Kein Preis auf dieser Seite, bis er stimmt.',
                'No price on this page until it is right.',
                "Pas de prix sur cette page tant qu'il n'est pas juste.",
                'Nessun prezzo su questa pagina finché non è quello giusto.',
                'Żadnej ceny na tej stronie, dopóki nie będzie właściwa.',
                'Geen prijs op deze pagina tot hij klopt.',
                'Ningún precio en esta página hasta que sea el correcto.'),
'wk.beta.p3': ('Eine Zahl, die später eine andere ist, hilft niemandem.',
               'A number that turns into a different one later helps nobody.',
               "Un chiffre qui en devient un autre plus tard n'aide personne.",
               'Un numero che poi ne diventa un altro non aiuta nessuno.',
               'Liczba, która później jest inna, nikomu nie pomaga.',
               'Een getal dat later een ander getal is, helpt niemand.',
               'Una cifra que después es otra no ayuda a nadie.'),

# ── Fuss ──────────────────────────────────────────────────────────
'wk.fuss': ('— ein Projekt von TVZA', '— a project by TVZA',
            '— un projet de TVZA', '— un progetto di TVZA',
            '— projekt TVZA', '— een project van TVZA',
            '— un proyecto de TVZA'),
}
