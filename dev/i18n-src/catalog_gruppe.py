# -*- coding: utf-8 -*-
"""Gruppen, Rollen und Terminarten — die Woerter aus den Phasen 1 bis 5.

Reihenfolge je Zeile: de, en, fr, it, pl, nl, es.
Erzeugt wird daraus assets/i18n/*.json:

    node dev/i18n-src/build.mjs

Warum diese Tabelle eigens existiert: dasselbe Objekt heisst in einem
Rennkader, in einem Gym und in einer Familie verschieden. Ein Kader hat
einen Haupttrainer und Athleten, ein Gym eine Leitung und Mitglieder,
eine Familie eine Verwaltung. Der Code kennt nur head/staff/mitglied —
die Woerter stehen hier, und nur hier.

Dasselbe gilt fuer die Terminarten: training/lager/rennen in den Daten,
aber Kurs/Workshop/Wettkampf im Gym und Termin/Reise/Anlass in der
Familie. Ein viertes Datenmodell dafuer waere Unsinn; eine vierte
Wortliste ist eine Zeile.
"""

KEYS = {
# ── Navigation ────────────────────────────────────────────────────
# Der dritte Tab traegt im Betrieb den NAMEN der Gruppe. Diese
# Beschriftung erscheint nur, solange keine geladen ist.
'nav.gruppe':   ('Gruppe', 'Group', 'Groupe', 'Gruppo', 'Grupa', 'Groep', 'Grupo'),
'nav.chat':     ('Chat', 'Chat', 'Discussion', 'Chat', 'Czat', 'Chat', 'Chat'),

# ── Rollen im Rennkader ───────────────────────────────────────────
'grp.kader.head':       ('Haupttrainer', 'Head coach', 'Entraîneur principal', 'Allenatore capo', 'Trener główny', 'Hoofdtrainer', 'Entrenador jefe'),
'grp.kader.staff':      ('Trainer', 'Coach', 'Entraîneur', 'Allenatore', 'Trener', 'Trainer', 'Entrenador'),
'grp.kader.mitglied':   ('Athlet', 'Athlete', 'Athlète', 'Atleta', 'Zawodnik', 'Atleet', 'Atleta'),
'grp.kader.mitglieder': ('Kader', 'Squad', 'Équipe', 'Squadra', 'Kadra', 'Selectie', 'Equipo'),

# ── Rollen in einem Verein oder Gym ───────────────────────────────
'grp.org.head':         ('Leitung', 'Manager', 'Direction', 'Direzione', 'Kierownictwo', 'Leiding', 'Dirección'),
'grp.org.staff':        ('Trainer', 'Trainer', 'Entraîneur', 'Istruttore', 'Trener', 'Trainer', 'Entrenador'),
'grp.org.mitglied':     ('Mitglied', 'Member', 'Membre', 'Membro', 'Członek', 'Lid', 'Miembro'),
'grp.org.mitglieder':   ('Mitglieder', 'Members', 'Membres', 'Membri', 'Członkowie', 'Leden', 'Miembros'),

# ── Rollen in einer Familie ───────────────────────────────────────
'grp.familie.head':       ('Verwaltet die Gruppe', 'Manages the group', 'Gère le groupe', 'Gestisce il gruppo', 'Zarządza grupą', 'Beheert de groep', 'Gestiona el grupo'),
'grp.familie.staff':      ('Verwaltung', 'Admin', 'Administration', 'Amministrazione', 'Administracja', 'Beheer', 'Administración'),
'grp.familie.mitglied':   ('Mitglied', 'Member', 'Membre', 'Membro', 'Członek', 'Lid', 'Miembro'),
'grp.familie.mitglieder': ('Mitglieder', 'Members', 'Membres', 'Membri', 'Członkowie', 'Leden', 'Miembros'),

# ── Terminarten ───────────────────────────────────────────────────
# Dieselben drei Arten in den Daten, andere Woerter je Gruppenart.
'termin.art.kader.training': ('Training', 'Training', 'Entraînement', 'Allenamento', 'Trening', 'Training', 'Entrenamiento'),
'termin.art.kader.lager':    ('Trainingslager', 'Training camp', 'Stage', 'Ritiro', 'Zgrupowanie', 'Trainingskamp', 'Concentración'),
'termin.art.kader.rennen':   ('Rennen', 'Race', 'Course', 'Gara', 'Zawody', 'Wedstrijd', 'Carrera'),

'termin.art.organisation.training': ('Kurs', 'Class', 'Cours', 'Corso', 'Zajęcia', 'Les', 'Clase'),
'termin.art.organisation.lager':    ('Workshop', 'Workshop', 'Atelier', 'Workshop', 'Warsztaty', 'Workshop', 'Taller'),
'termin.art.organisation.rennen':   ('Wettkampf', 'Competition', 'Compétition', 'Competizione', 'Zawody', 'Wedstrijd', 'Competición'),

'termin.art.familie.training': ('Termin', 'Appointment', 'Rendez-vous', 'Appuntamento', 'Termin', 'Afspraak', 'Cita'),
'termin.art.familie.lager':    ('Reise', 'Trip', 'Voyage', 'Viaggio', 'Podróż', 'Reis', 'Viaje'),
'termin.art.familie.rennen':   ('Anlass', 'Event', 'Événement', 'Evento', 'Wydarzenie', 'Evenement', 'Evento'),

# ── Tageszusammenfassung ──────────────────────────────────────────
'brief.deinTag': ('Dein Tag', 'Your day', 'Ta journée', 'La tua giornata', 'Twój dzień', 'Jouw dag', 'Tu día'),
# Am Abend heisst die Karte anders: wer um sieben draufschaut, will
# nicht mehr wissen, was heute anstand.
'brief.morgen': ('Morgen', 'Tomorrow', 'Demain', 'Domani', 'Jutro', 'Morgen', 'Mañana'),
'brief.naechste14': ('Nächste 14 Tage', 'Next 14 days', 'Les 14 prochains jours',
                    'Prossimi 14 giorni', 'Najbliższe 14 dni', 'Komende 14 dagen',
                    'Próximos 14 días'),
'brief.spaeter': ('Hinweis später', 'Remind me later', 'Plus tard',
                 'Più tardi', 'Później', 'Later', 'Más tarde'),
'brief.ausblenden': ('Ausblenden', 'Dismiss', 'Masquer', 'Nascondi',
                    'Ukryj', 'Verbergen', 'Ocultar'),
# ── Die Woche des Plans ───────────────────────────────────────────
# Der Plan ist eine Woche, kein Aktenschrank: was heute dran ist,
# steht oben, und ein Tag ohne Eintrag ist ein Ruhetag und keine
# Luecke.
'grp.heute': ('Heute', 'Today', "Aujourd'hui", 'Oggi', 'Dzisiaj', 'Vandaag', 'Hoy'),
'grp.ruhetag': ('Ruhetag — nichts geplant.', 'Rest day — nothing planned.',
               'Jour de repos — rien de prévu.', 'Giorno di riposo — niente in programma.',
               'Dzień odpoczynku — nic nie zaplanowano.', 'Rustdag — niets gepland.',
               'Día de descanso — nada planificado.'),
# Im Plan genannt, aber ohne Uebungsblatt: "evtl. Spiel (Tennis…)".
# Kein Fehler beim Import, sondern eine Ansage des Trainers.
'grp.keinBlatt': ('kein Blatt hinterlegt', 'no sheet attached', 'aucune fiche jointe',
                 'nessuna scheda allegata', 'brak arkusza', 'geen blad gekoppeld',
                 'sin ficha adjunta'),
'grp.nurFuerDich': ('nur für dich', 'just for you', 'rien que pour toi',
                   'solo per te', 'tylko dla ciebie', 'alleen voor jou', 'sólo para ti'),
# ── Eine Gruppe anlegen ──────────────────────────────────────────
# Drei Karten statt einer Ziffer in einem Browserfenster.
'grp.neuTitel': ('Neue Gruppe', 'New group', 'Nouveau groupe', 'Nuovo gruppo', 'Nowa grupa', 'Nieuwe groep', 'Nuevo grupo'),
'grp.artFrage': ('Was für eine Gruppe?', 'What kind of group?', 'Quel type de groupe ?', 'Che tipo di gruppo?',
                 'Jaka to grupa?', 'Wat voor groep?', '¿Qué tipo de grupo?'),
'grp.art.kader.titel': ('Rennkader', 'Race team', 'Équipe de course', 'Squadra agonistica',
                        'Kadra wyczynowa', 'Wedstrijdteam', 'Equipo de competición'),
'grp.art.kader.text': ('Haupttrainer, Trainer, Athleten. Wochenplan, Rennen, FIS-Punkte.',
                       'Head coach, coaches, athletes. Weekly plan, races, FIS points.',
                       'Entraîneur principal, entraîneurs, athlètes. Plan hebdomadaire, courses, points FIS.',
                       'Allenatore capo, allenatori, atleti. Piano settimanale, gare, punti FIS.',
                       'Główny trener, trenerzy, zawodnicy. Plan tygodniowy, zawody, punkty FIS.',
                       'Hoofdtrainer, trainers, atleten. Weekplan, wedstrijden, FIS-punten.',
                       'Entrenador jefe, entrenadores, atletas. Plan semanal, carreras, puntos FIS.'),
'grp.art.organisation.titel': ('Verein oder Gym', 'Club or gym', 'Club ou salle', 'Club o palestra',
                               'Klub lub siłownia', 'Vereniging of gym', 'Club o gimnasio'),
'grp.art.organisation.text': ('Leitung, Trainer, Mitglieder. Kurse, Workshops, Wettkämpfe.',
                              'Management, coaches, members. Classes, workshops, competitions.',
                              'Direction, entraîneurs, membres. Cours, ateliers, compétitions.',
                              'Direzione, allenatori, membri. Corsi, workshop, competizioni.',
                              'Zarząd, trenerzy, członkowie. Zajęcia, warsztaty, zawody.',
                              'Leiding, trainers, leden. Lessen, workshops, wedstrijden.',
                              'Dirección, entrenadores, miembros. Clases, talleres, competiciones.'),
'grp.art.familie.titel': ('Familie oder Freunde', 'Family or friends', 'Famille ou amis', 'Famiglia o amici',
                          'Rodzina lub przyjaciele', 'Familie of vrienden', 'Familia o amigos'),
'grp.art.familie.text': ('Termine, Reisen und Nachrichten für euch.',
                         'Appointments, trips and messages for you all.',
                         'Rendez-vous, voyages et messages entre vous.',
                         'Appuntamenti, viaggi e messaggi per voi.',
                         'Terminy, wyjazdy i wiadomości dla was.',
                         'Afspraken, reizen en berichten voor jullie.',
                         'Citas, viajes y mensajes para vosotros.'),
'grp.nameLabel': ('Name', 'Name', 'Nom', 'Nome', 'Nazwa', 'Naam', 'Nombre'),
'grp.namePh': ('z.B. BSV Perspektivkader', 'e.g. Ski Club Juniors', 'p. ex. Ski-club Juniors',
               'es. Sci Club Juniores', 'np. Klub Narciarski Juniorzy', 'bijv. Skiclub Junioren',
               'p. ej. Club de Esquí Juvenil'),
'grp.f.nameFehlt': ('Die Gruppe braucht einen Namen.', 'The group needs a name.', 'Le groupe a besoin d’un nom.',
                    'Il gruppo ha bisogno di un nome.', 'Grupa potrzebuje nazwy.', 'De groep heeft een naam nodig.',
                    'El grupo necesita un nombre.'),

# ── Termin: eigene Art ───────────────────────────────────────────
'grp.artEigene': ('Eigene …', 'Other …', 'Autre …', 'Altro …', 'Inne …', 'Anders …', 'Otro …'),
'grp.bezeichnung': ('Was ist es?', 'What is it?', 'De quoi s’agit-il ?', 'Di cosa si tratta?',
                    'Co to jest?', 'Wat is het?', '¿Qué es?'),
'grp.bezeichnungPh': ('z.B. Elternabend, Physio, Materialtest', 'e.g. parents’ evening, physio, gear test',
                      'p. ex. réunion des parents, physio, test de matériel',
                      'es. riunione genitori, fisioterapia, test materiale',
                      'np. zebranie rodziców, fizjoterapia, test sprzętu',
                      'bijv. ouderavond, fysio, materiaaltest',
                      'p. ej. reunión de padres, fisio, prueba de material'),
'grp.f.bezeichnung': ('Wie heisst diese Art von Termin?', 'What is this kind of event called?',
                      'Comment s’appelle ce type de rendez-vous ?', 'Come si chiama questo tipo di evento?',
                      'Jak nazywa się ten rodzaj terminu?', 'Hoe heet dit soort afspraak?',
                      '¿Cómo se llama este tipo de evento?'),

# ── Die Knöpfe der gestalteten Dialoge ──────────────────────────
# Kurz: sie stehen neben "Abbrechen" und sagen, was passiert.
'common.ok': ('OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'OK'),
'grp.entfernenKurz': ('Entfernen', 'Remove', 'Retirer', 'Rimuovi', 'Usuń', 'Verwijderen', 'Quitar'),
'grp.loeschenKurz': ('Löschen', 'Delete', 'Supprimer', 'Elimina', 'Usuń', 'Verwijderen', 'Eliminar'),
'grp.absagenKurz': ('Absagen', 'Cancel event', 'Annuler', 'Annulla evento', 'Odwołaj', 'Afzeggen', 'Cancelar'),
'grp.absageGrundPh': ('z.B. zu wenig Schnee', 'e.g. not enough snow', 'p. ex. pas assez de neige',
                      'es. poca neve', 'np. za mało śniegu', 'bijv. te weinig sneeuw', 'p. ej. poca nieve'),
'grp.uebergebenKurz': ('Übergeben', 'Hand over', 'Transmettre', 'Cedi', 'Przekaż', 'Overdragen', 'Traspasar'),
'grp.aboNeuKurz': ('Neu erzeugen', 'Create new', 'Recréer', 'Crea nuovo', 'Utwórz nowe', 'Opnieuw maken', 'Crear nuevo'),
'grp.beitretenTitel': ('Einer Gruppe beitreten', 'Join a group', 'Rejoindre un groupe', 'Unisciti a un gruppo',
                       'Dołącz do grupy', 'Lid worden van een groep', 'Unirse a un grupo'),
'grp.beitretenText': ('Den Code bekommst du von deinem Trainer oder aus der Einladung.',
                      'You get the code from your coach or from the invitation.',
                      'Tu reçois le code de ton entraîneur ou dans l’invitation.',
                      'Ricevi il codice dal tuo allenatore o dall’invito.',
                      'Kod otrzymasz od trenera lub z zaproszenia.',
                      'De code krijg je van je trainer of uit de uitnodiging.',
                      'Recibes el código de tu entrenador o en la invitación.'),
'grp.beitretenKurz': ('Beitreten', 'Join', 'Rejoindre', 'Unisciti', 'Dołącz', 'Lid worden', 'Unirse'),
}
