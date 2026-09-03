# -*- coding: utf-8 -*-
"""Die Gruppenseite — Beschriftungen im Markup.

Reihenfolge je Zeile: de, en, fr, it, pl, nl, es.
Erzeugt wird daraus assets/i18n/*.json:

    node dev/i18n-src/build.mjs

Abgegrenzt gegen catalog_gruppe.py: DORT stehen die Woerter, die sich
mit der Gruppenart aendern (Haupttrainer / Leitung / Verwaltung, und
Trainingslager / Workshop / Reise). HIER stehen die festen
Beschriftungen der Seite, die in jeder Gruppenart gleich heissen.

Was hier bewusst FEHLT, sind die Elemente, die das Modul zur Laufzeit
selbst beschriftet: die Auswahl der Terminart (#fArt), der Knopf zum
Absagen, die Titel der Detailansichten und die Rollenknoepfe. Wer
denen einen Schluessel gaebe, liesse Katalog und Code um dasselbe
Element kaempfen — und der Katalog gewinnt zuletzt, weil er
asynchron kommt.
"""

KEYS = {
'grp.seitentitel': ('Gruppe — Firn', 'Group — Firn', 'Groupe — Firn',
                    'Gruppo — Firn', 'Grupa — Firn', 'Groep — Firn',
                    'Grupo — Firn'),

# ── Der leere Zustand ─────────────────────────────────────────────
'grp.leerText': ('Eine Gruppe ist der Ort, an dem ihr Termine, Pläne und Nachrichten teilt — als Familie oder als Kader.',
                 'A group is where you share dates, plans and messages — as a family or as a squad.',
                 "Un groupe, c'est là où vous partagez dates, plans et messages — en famille ou en équipe.",
                 'Un gruppo è il posto dove condividete date, programmi e messaggi — come famiglia o come squadra.',
                 'Grupa to miejsce, w którym dzielicie się terminami, planami i wiadomościami — jako rodzina albo jako kadra.',
                 'Een groep is waar jullie data, plannen en berichten delen — als gezin of als selectie.',
                 'Un grupo es donde compartís fechas, planes y mensajes — en familia o como equipo.'),
'grp.neu': ('Gruppe erstellen', 'Create group', 'Créer un groupe',
            'Crea un gruppo', 'Utwórz grupę', 'Groep aanmaken', 'Crear grupo'),
'grp.beitreten': ('Mit einem Code beitreten', 'Join with a code',
                  'Rejoindre avec un code', 'Entra con un codice',
                  'Dołącz kodem', 'Deelnemen met een code',
                  'Unirse con un código'),

# ── Umschalter ────────────────────────────────────────────────────
'grp.aktive': ('Aktive Gruppe', 'Active group', 'Groupe actif',
               'Gruppo attivo', 'Aktywna grupa', 'Actieve groep',
               'Grupo activo'),
'grp.wechseln': ('Gruppe wechseln', 'Switch group', 'Changer de groupe',
                 'Cambia gruppo', 'Zmień grupę', 'Groep wisselen',
                 'Cambiar de grupo'),

# ── Termine ───────────────────────────────────────────────────────
'grp.termine': ('Termine', 'Dates', 'Dates', 'Date', 'Terminy', 'Data', 'Fechas'),
'grp.terminNeu': ('Termin hinzufügen', 'Add a date', 'Ajouter une date',
                  'Aggiungi una data', 'Dodaj termin', 'Datum toevoegen',
                  'Añadir fecha'),
'grp.terminTitel': ('Neuer Termin', 'New date', 'Nouvelle date',
                    'Nuova data', 'Nowy termin', 'Nieuwe datum',
                    'Nueva fecha'),
'grp.terminLoeschen': ('Termin löschen', 'Delete date', 'Supprimer la date',
                       'Elimina la data', 'Usuń termin', 'Datum verwijderen',
                       'Eliminar fecha'),

'grp.art': ('Art', 'Kind', 'Type', 'Tipo', 'Rodzaj', 'Soort', 'Tipo'),
'grp.titel': ('Titel', 'Title', 'Titre', 'Titolo', 'Tytuł', 'Titel', 'Título'),
'grp.titelPh': ('z.B. Kraft Beine', 'e.g. leg strength', 'p. ex. force jambes',
                'es. forza gambe', 'np. siła nóg', 'bijv. beenkracht',
                'p. ej. fuerza de piernas'),
'grp.von': ('Von', 'From', 'Du', 'Dal', 'Od', 'Van', 'Desde'),
'grp.bis': ('Bis', 'To', 'Au', 'Al', 'Do', 'Tot', 'Hasta'),
'grp.zeit': ('Uhrzeit', 'Time', 'Heure', 'Ora', 'Godzina', 'Tijd', 'Hora'),
'grp.ort': ('Ort', 'Place', 'Lieu', 'Luogo', 'Miejsce', 'Plaats', 'Lugar'),
'grp.ortPh': ('kann leer bleiben', 'can stay empty', 'peut rester vide',
              'può restare vuoto', 'może zostać puste', 'mag leeg blijven',
              'puede quedar vacío'),

# ── Disziplinen ───────────────────────────────────────────────────
# Die Kuerzel im value bleiben (SL/RS/SG/DH) — nur die Woerter wandern.
'grp.disziplin': ('Disziplin', 'Discipline', 'Discipline', 'Disciplina',
                  'Konkurencja', 'Discipline', 'Disciplina'),
'disziplin.SL': ('Slalom', 'Slalom', 'Slalom', 'Slalom', 'Slalom', 'Slalom', 'Eslalon'),
'disziplin.RS': ('Riesenslalom', 'Giant slalom', 'Slalom géant',
                 'Slalom gigante', 'Slalom gigant', 'Reuzenslalom',
                 'Eslalon gigante'),
'disziplin.SG': ('Super-G', 'Super-G', 'Super-G', 'Super-G', 'Supergigant',
                 'Super-G', 'Súper-G'),
'disziplin.DH': ('Abfahrt', 'Downhill', 'Descente', 'Discesa libera',
                 'Zjazd', 'Afdaling', 'Descenso'),

# ── Plaene ────────────────────────────────────────────────────────
'grp.plan': ('Plan', 'Plan', 'Plan', 'Programma', 'Plan', 'Plan', 'Plan'),
'grp.planNeu': ('Plan veröffentlichen', 'Publish a plan', 'Publier un plan',
                'Pubblica un programma', 'Opublikuj plan', 'Plan publiceren',
                'Publicar un plan'),
'grp.planQuelle': ('Aus deinen Programmen', 'From your programmes',
                   'Depuis tes programmes', 'Dai tuoi programmi',
                   'Z twoich programów', 'Uit je programma’s',
                   'De tus programas'),
'grp.planTitelPh': ('z.B. Woche 31 — Kraft', 'e.g. week 31 — strength',
                    'p. ex. semaine 31 — force', 'es. settimana 31 — forza',
                    'np. tydzień 31 — siła', 'bijv. week 31 — kracht',
                    'p. ej. semana 31 — fuerza'),
'grp.planFuer': ('Für wen', 'For whom', 'Pour qui', 'Per chi',
                 'Dla kogo', 'Voor wie', 'Para quién'),
'grp.veroeffentlichen': ('Veröffentlichen', 'Publish', 'Publier',
                         'Pubblica', 'Opublikuj', 'Publiceren', 'Publicar'),

# ── Zusage ────────────────────────────────────────────────────────
'grp.deineAntwort': ('Deine Antwort', 'Your answer', 'Ta réponse',
                     'La tua risposta', 'Twoja odpowiedź', 'Jouw antwoord',
                     'Tu respuesta'),
'grp.ja': ('Ja', 'Yes', 'Oui', 'Sì', 'Tak', 'Ja', 'Sí'),
'grp.vielleicht': ('Vielleicht', 'Maybe', 'Peut-être', 'Forse',
                   'Może', 'Misschien', 'Quizá'),
'grp.nein': ('Nein', 'No', 'Non', 'No', 'Nie', 'Nee', 'No'),

# ── Unterlagen ────────────────────────────────────────────────────
'grp.unterlagen': ('Unterlagen', 'Documents', 'Documents', 'Documenti',
                   'Dokumenty', 'Documenten', 'Documentos'),
'grp.anhangNeu': ('Ausschreibung anhängen', 'Attach the announcement',
                  "Joindre l'invitation", 'Allega il bando',
                  'Dołącz komunikat', 'Uitnodiging toevoegen',
                  'Adjuntar la convocatoria'),

# ── Athletenprofil ────────────────────────────────────────────────
'grp.fisPunkte': ('FIS-Punkte', 'FIS points', 'Points FIS', 'Punti FIS',
                  'Punkty FIS', 'FIS-punten', 'Puntos FIS'),
'grp.rennenMarke': ('Rennen', 'Races', 'Courses', 'Gare', 'Zawody',
                    'Wedstrijden', 'Carreras'),
'grp.rennenFeld': ('Rennen', 'Race', 'Course', 'Gara', 'Zawody',
                   'Wedstrijd', 'Carrera'),
'grp.ergebnisNeu': ('Ergebnis erfassen', 'Record a result',
                    'Saisir un résultat', 'Registra un risultato',
                    'Zapisz wynik', 'Uitslag vastleggen',
                    'Registrar un resultado'),
'grp.rang': ('Rang', 'Rank', 'Rang', 'Posizione', 'Miejsce', 'Plaats', 'Puesto'),
'grp.deineZeit': ('Deine Zeit', 'Your time', 'Ton temps', 'Il tuo tempo',
                  'Twój czas', 'Jouw tijd', 'Tu tiempo'),
'grp.siegerzeit': ('Siegerzeit', 'Winning time', 'Temps du vainqueur',
                   'Tempo del vincitore', 'Czas zwycięzcy', 'Winnende tijd',
                   'Tiempo del ganador'),
'grp.zuschlag': ('Zuschlag', 'Penalty', 'Penalty', 'Penalty',
                 'Penalty', 'Penalty', 'Penalty'),
'grp.fallsBekannt': ('falls bekannt', 'if known', 'si connu', 'se noto',
                     'jeśli znany', 'indien bekend', 'si se conoce'),

# ── Rolle und Verwaltung ──────────────────────────────────────────
'grp.rolle': ('Rolle', 'Role', 'Rôle', 'Ruolo', 'Rola', 'Rol', 'Rol'),
'grp.uebergeben': ('Leitung übergeben', 'Hand over the lead',
                   'Transmettre la direction', 'Cedi la guida',
                   'Przekaż prowadzenie', 'Leiding overdragen',
                   'Ceder la dirección'),
'grp.entfernen': ('Aus der Gruppe entfernen', 'Remove from the group',
                  'Retirer du groupe', 'Rimuovi dal gruppo',
                  'Usuń z grupy', 'Uit de groep verwijderen',
                  'Quitar del grupo'),

# ── Aktionen ──────────────────────────────────────────────────────
'grp.einladen': ('Einladungscode erzeugen', 'Create an invitation code',
                 "Générer un code d'invitation", 'Genera un codice di invito',
                 'Wygeneruj kod zaproszenia', 'Uitnodigingscode maken',
                 'Generar un código de invitación'),
'grp.abo': ('Kalender-Abo erzeugen', 'Create a calendar subscription',
            'Créer un abonnement calendrier', 'Crea un abbonamento calendario',
            'Utwórz subskrypcję kalendarza', 'Agenda-abonnement maken',
            'Crear una suscripción de calendario'),
}
