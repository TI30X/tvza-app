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
}
