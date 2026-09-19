# -*- coding: utf-8 -*-
"""Planen mit Freunden (v.35.75.0) — die Feier und ihre Woerter.

Reihenfolge je Zeile: de, en, fr, it, pl, nl, es.
Erzeugt wird daraus assets/i18n/*.json:

    node dev/i18n-src/build.mjs

Die Terminarten tragen Schluessel der Form
termin.art.<gruppenart>.<art> (termine.js, artWort). Die drei
Sportarten stehen seit v.35.31.0 in catalog_gruppe_seite.py und
bleiben unveraendert; hier kommt nur die vierte dazu — und die gibt es
ueberhaupt nur bei Familie und Freunden.

── Wichtig ────────────────────────────────────────────────────────
Jede Uebersetzung ist EIN Literal. Der Node-Leser kennt die implizite
Verkettung von Python nicht.
"""

KEYS = {
# ── Die vierte Terminart ──────────────────────────────────────────
'termin.art.familie.feier': ('Feier', 'Celebration', 'Fête', 'Festa',
                             'Impreza', 'Feest', 'Celebración'),
# Kader und Verein bieten sie nicht an — aber ein Wort braucht sie
# trotzdem, falls eine Gruppe ihre Art einmal gewechselt hat.
'termin.art.kader.feier': ('Feier', 'Celebration', 'Fête', 'Festa',
                           'Impreza', 'Feest', 'Celebración'),
'termin.art.organisation.feier': ('Feier', 'Celebration', 'Fête', 'Festa',
                                  'Impreza', 'Feest', 'Celebración'),

# ── Was man mitbringt ─────────────────────────────────────────────
'fe.mitbringen': ('Wer bringt was mit?', 'Who brings what?',
                  'Qui apporte quoi ?', 'Chi porta cosa?',
                  'Kto co przynosi?', 'Wie brengt wat mee?',
                  '¿Quién trae qué?'),
'fe.mitbringenPh': ('Salat\nGetränke\nMusikbox', 'Salad\nDrinks\nSpeaker',
                    'Salade\nBoissons\nEnceinte', 'Insalata\nBevande\nCassa',
                    'Sałatka\nNapoje\nGłośnik', 'Salade\nDrankjes\nSpeaker',
                    'Ensalada\nBebidas\nAltavoz'),
'fe.mitbringenHinweis': ('Eine Sache pro Zeile. Jede und jeder hakt für sich ab, was sie mitbringt.',
                         'One thing per line. Everyone ticks off for themselves what they bring.',
                         'Une chose par ligne. Chacun coche pour soi ce qu’il apporte.',
                         'Una cosa per riga. Ognuno spunta per sé ciò che porta.',
                         'Jedna rzecz w wierszu. Każdy odhacza dla siebie, co przynosi.',
                         'Eén ding per regel. Iedereen vinkt voor zichzelf af wat die meebrengt.',
                         'Una cosa por línea. Cada uno marca por su cuenta lo que trae.'),
'fe.mitbringenKurz': ('Mitbringen', 'To bring', 'À apporter', 'Da portare',
                      'Do przyniesienia', 'Meebrengen', 'Para traer'),
'fe.mitbringenNeu': ('Mitbringliste anlegen', 'Create a bring list',
                     'Créer une liste à apporter', 'Crea una lista di cose da portare',
                     'Utwórz listę rzeczy', 'Meebrenglijst maken',
                     'Crear lista de cosas'),
'fe.ablauf': ('Ablauf', 'Schedule', 'Déroulement', 'Programma',
              'Przebieg', 'Verloop', 'Programa'),
'fe.ablaufNeu': ('Ablauf anlegen', 'Create a schedule', 'Créer un déroulement',
                 'Crea un programma', 'Utwórz przebieg', 'Verloop maken',
                 'Crear un programa'),
'fe.ablaufOeffnen': ('Ablauf öffnen', 'Open schedule', 'Ouvrir le déroulement',
                     'Apri il programma', 'Otwórz przebieg', 'Verloop openen',
                     'Abrir el programa'),

# ── Der Gastlink ──────────────────────────────────────────────────
'fe.gastlink': ('Link für Leute ohne Firn-Konto erstellen',
                'Create a link for people without a Firn account',
                'Créer un lien pour les personnes sans compte Firn',
                'Crea un link per chi non ha un account Firn',
                'Utwórz link dla osób bez konta Firn',
                'Link maken voor mensen zonder Firn-account',
                'Crear un enlace para quien no tenga cuenta de Firn'),
}
