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
'grp.ortPh': ('z.B. Malbun', 'e.g. Malbun', 'p. ex. Malbun',
              'ad es. Malbun', 'np. Malbun', 'bijv. Malbun', 'p. ej. Malbun'),

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
'grp.einladen': ('Leute einladen', 'Invite people', 'Inviter des personnes', 'Invita persone',
                 'Zaproś osoby', 'Mensen uitnodigen', 'Invitar a personas'),
'grp.abo': ('Kalender-Abo erzeugen', 'Create a calendar subscription',
            'Créer un abonnement calendrier', 'Crea un abbonamento calendario',
            'Utwórz subskrypcję kalendarza', 'Agenda-abonnement maken',
            'Crear una suscripción de calendario'),

# v.35.65.0 — Für wen, Fortschritt der Athleten, Vorlagen
'grp.empfaengerFrage': ('Wer bekommt den Plan?', 'Who gets the plan?', 'Qui reçoit le plan ?', 'Chi riceve il piano?', 'Kto dostaje plan?', 'Wie krijgt het plan?', '¿Quién recibe el plan?'),
'grp.empfaengerKeine': ('Keine', 'None', 'Aucun', 'Nessuno', 'Nikt', 'Geen', 'Ninguno'),
'grp.empfaengerAlle': ('Alle auswählen', 'Select all', 'Tout sélectionner', 'Seleziona tutti', 'Zaznacz wszystkich', 'Alles selecteren', 'Seleccionar todos'),
'grp.gehtAnAlle': ('Geht an die ganze Gruppe — jetzt {n}, und alle, die später beitreten. Jede Person hat ihren eigenen Fortschritt.', 'Goes to the whole group — {n} now, and everyone who joins later. Each person has their own progress.', 'Va à tout le groupe — {n} actuellement, et tous ceux qui rejoindront plus tard. Chacun a sa propre progression.', 'Va a tutto il gruppo — ora {n}, e a chi si unirà in seguito. Ognuno ha i propri progressi.', 'Trafia do całej grupy — teraz {n} oraz do wszystkich, którzy dołączą później. Każdy ma własne postępy.', 'Gaat naar de hele groep — nu {n}, en iedereen die later lid wordt. Iedereen heeft een eigen voortgang.', 'Va a todo el grupo — ahora {n}, y a quien se una más tarde. Cada persona tiene su propio progreso.'),
'grp.gehtAnMehrere': ('Geht an {namen} — jede Person bekommt den Plan als ihren eigenen. Wer später beitritt, bekommt ihn nicht.', 'Goes to {namen} — each person gets the plan as their own. People who join later do not get it.', 'Va à {namen} — chacun reçoit le plan comme le sien. Ceux qui rejoignent plus tard ne le reçoivent pas.', 'Va a {namen} — ognuno riceve il piano come proprio. Chi si unisce dopo non lo riceve.', 'Trafia do: {namen} — każdy dostaje plan jako własny. Kto dołączy później, go nie dostanie.', 'Gaat naar {namen} — iedereen krijgt het plan als eigen plan. Wie later lid wordt, krijgt het niet.', 'Va a {namen} — cada persona recibe el plan como propio. Quien se una más tarde no lo recibe.'),
'grp.gehtAnNiemand': ('Noch niemand angehakt.', 'Nobody selected yet.', 'Personne n’est encore coché.', 'Nessuno selezionato.', 'Nikt jeszcze nie jest zaznaczony.', 'Nog niemand aangevinkt.', 'Aún no hay nadie marcado.'),
'grp.gehtAnEine': ('Geht an {name}.', 'Goes to {name}.', 'Va à {name}.', 'Va a {name}.', 'Trafia do: {name}.', 'Gaat naar {name}.', 'Va a {name}.'),
'grp.veroeffentlichenN': ('An {n} Personen veröffentlichen', 'Publish to {n} people', 'Publier pour {n} personnes', 'Pubblica per {n} persone', 'Opublikuj dla {n} osób', 'Publiceren voor {n} personen', 'Publicar para {n} personas'),
'grp.f.planTeilPersonen': ('{fertig} von {n} veröffentlicht. Nicht für: {namen}. „Veröffentlichen“ versucht nur diese noch einmal. {grund}', '{fertig} of {n} published. Not for: {namen}. “Publish” retries only these. {grund}', '{fertig} sur {n} publiés. Pas pour : {namen}. « Publier » ne réessaie que ceux-ci. {grund}', '{fertig} di {n} pubblicati. Non per: {namen}. «Pubblica» riprova solo questi. {grund}', 'Opublikowano {fertig} z {n}. Nie dla: {namen}. „Opublikuj” ponowi tylko te. {grund}', '{fertig} van {n} gepubliceerd. Niet voor: {namen}. ‘Publiceren’ probeert alleen deze opnieuw. {grund}', '{fertig} de {n} publicados. No para: {namen}. «Publicar» vuelve a intentar solo estos. {grund}'),
'grp.vorlageFehlerTitel': ('Vorlage nicht gespeichert', 'Template not saved', 'Modèle non enregistré', 'Modello non salvato', 'Szablon nie został zapisany', 'Sjabloon niet opgeslagen', 'Plantilla no guardada'),
'grp.vorlageFehler': ('Der Plan ist veröffentlicht, aber die Vorlage liess sich nicht speichern.', 'The plan is published, but the template could not be saved.', 'Le plan est publié, mais le modèle n’a pas pu être enregistré.', 'Il piano è pubblicato, ma il modello non è stato salvato.', 'Plan został opublikowany, ale szablonu nie udało się zapisać.', 'Het plan is gepubliceerd, maar het sjabloon kon niet worden opgeslagen.', 'El plan está publicado, pero la plantilla no se pudo guardar.'),
'grp.fs.fertig': ('Abgeschlossen', 'Completed', 'Terminé', 'Completato', 'Ukończone', 'Afgerond', 'Completado'),
'grp.fs.begonnen': ('Begonnen', 'Started', 'Commencé', 'Iniziato', 'Rozpoczęte', 'Begonnen', 'Empezado'),
'grp.fs.offen': ('Nichts synchronisiert', 'Nothing synced', 'Rien de synchronisé', 'Nulla sincronizzato', 'Nic nie zsynchronizowano', 'Niets gesynchroniseerd', 'Nada sincronizado'),
'grp.fs.unbekannt': ('Unbekannt', 'Unknown', 'Inconnu', 'Sconosciuto', 'Nieznane', 'Onbekend', 'Desconocido'),
'grp.fs.laedt': ('Lädt …', 'Loading …', 'Chargement …', 'Caricamento …', 'Ładowanie …', 'Laden …', 'Cargando …'),
'grp.fs.fehler': ('Die Einträge liessen sich nicht laden. Was hier fehlt, ist unbekannt — nicht untrainiert.', 'The entries could not be loaded. What is missing here is unknown — not untrained.', 'Les saisies n’ont pas pu être chargées. Ce qui manque est inconnu — pas « non entraîné ».', 'Le voci non sono state caricate. Ciò che manca è sconosciuto — non «non allenato».', 'Nie udało się wczytać wpisów. To, czego brakuje, jest nieznane — nie „nietrenowane”.', 'De invoer kon niet worden geladen. Wat hier ontbreekt, is onbekend — niet ‘niet getraind’.', 'No se pudieron cargar las entradas. Lo que falta es desconocido, no «sin entrenar».'),
'grp.fs.keinPlan': ('An diesem Tag steht für niemanden eine Einheit im Plan.', 'Nobody has a session planned on this day.', 'Aucune séance n’est prévue ce jour-là.', 'In questo giorno nessuno ha una sessione in programma.', 'Tego dnia nikt nie ma zaplanowanej jednostki.', 'Op deze dag staat voor niemand een sessie gepland.', 'Este día nadie tiene una sesión en el plan.'),
'grp.fs.uebungen': ('{n}/{gesamt} Übungen', '{n}/{gesamt} exercises', '{n}/{gesamt} exercices', '{n}/{gesamt} esercizi', '{n}/{gesamt} ćwiczeń', '{n}/{gesamt} oefeningen', '{n}/{gesamt} ejercicios'),
'grp.fs.saetze': ('{n}/{gesamt} Sätze', '{n}/{gesamt} sets', '{n}/{gesamt} séries', '{n}/{gesamt} serie', '{n}/{gesamt} serii', '{n}/{gesamt} sets', '{n}/{gesamt} series'),
'grp.fs.stand': ('synchronisiert {zeit}', 'synced {zeit}', 'synchronisé à {zeit}', 'sincronizzato alle {zeit}', 'zsynchronizowano {zeit}', 'gesynchroniseerd {zeit}', 'sincronizado a las {zeit}'),
'einl.chatTitel': ('Im Chat senden', 'Send in chat', 'Envoyer dans le chat', 'Invia nella chat', 'Wyślij na czacie', 'In de chat sturen', 'Enviar por chat'),
'grp.fortschrittAthleten': ('Fortschritt der Athleten', 'Athletes’ progress', 'Progression des athlètes', 'Progressi degli atleti', 'Postępy zawodników', 'Voortgang van de atleten', 'Progreso de los atletas'),
'grp.tagDavor': ('Tag davor', 'Previous day', 'Jour précédent', 'Giorno precedente', 'Poprzedni dzień', 'Vorige dag', 'Día anterior'),
'grp.tagDanach': ('Tag danach', 'Next day', 'Jour suivant', 'Giorno successivo', 'Następny dzień', 'Volgende dag', 'Día siguiente'),
'grp.fortschrittHinweis': ('Was ein Athlet offline eingetragen hat, erscheint erst, wenn sein Gerät wieder Netz hat — „nichts synchronisiert“ heisst nicht „nicht trainiert“. Private Notizen sieht nur der Athlet.', 'What an athlete entered offline only appears once their device is back online — “nothing synced” does not mean “not trained”. Only the athlete sees private notes.', 'Ce qu’un athlète a saisi hors ligne n’apparaît qu’au retour du réseau — « rien de synchronisé » ne veut pas dire « pas entraîné ». Seul l’athlète voit ses notes privées.', 'Ciò che un atleta ha inserito offline appare solo quando il suo dispositivo torna in rete — «nulla sincronizzato» non significa «non allenato». Le note private le vede solo l’atleta.', 'To, co zawodnik wpisał offline, pojawi się dopiero, gdy jego urządzenie znów będzie w sieci — „nic nie zsynchronizowano” nie znaczy „nie trenował”. Prywatne notatki widzi tylko zawodnik.', 'Wat een atleet offline heeft ingevoerd, verschijnt pas als zijn apparaat weer netwerk heeft — ‘niets gesynchroniseerd’ betekent niet ‘niet getraind’. Privénotities ziet alleen de atleet.', 'Lo que un atleta registró sin conexión aparece cuando su dispositivo vuelva a tener red — «nada sincronizado» no significa «sin entrenar». Las notas privadas solo las ve el atleta.'),
'grp.planAusVorlage': ('Oder aus einer Vorlage', 'Or from a template', 'Ou à partir d’un modèle', 'Oppure da un modello', 'Lub z szablonu', 'Of vanuit een sjabloon', 'O desde una plantilla'),
'grp.planVorlageWoche': ('Woche ab (Montag)', 'Week starting (Monday)', 'Semaine du (lundi)', 'Settimana dal (lunedì)', 'Tydzień od (poniedziałek)', 'Week vanaf (maandag)', 'Semana desde (lunes)'),
'grp.planAlsVorlage': ('Auch als Vorlage speichern', 'Also save as a template', 'Enregistrer aussi comme modèle', 'Salva anche come modello', 'Zapisz także jako szablon', 'Ook als sjabloon opslaan', 'Guardar también como plantilla'),

# v.35.68.0 — Reihenfolge der Gruppen, Farben der Arten
'grp.artFarbenText': ('Eigene Farben für Trainings, Lager oder Rennen im Kalender — sonst gilt die Farbe der Gruppe.', 'Own colours for trainings, camps or races in the calendar — otherwise the group colour applies.', 'Couleurs propres pour entraînements, camps ou courses dans le calendrier — sinon la couleur du groupe s’applique.', 'Colori propri per allenamenti, campi o gare nel calendario — altrimenti vale il colore del gruppo.', 'Własne kolory treningów, obozów lub zawodów w kalendarzu — inaczej obowiązuje kolor grupy.', 'Eigen kleuren voor trainingen, kampen of wedstrijden in de agenda — anders geldt de kleur van de groep.', 'Colores propios para entrenamientos, campamentos o carreras en el calendario; si no, vale el color del grupo.'),
'grp.wieGruppe': ('Wie die Gruppe', 'Same as the group', 'Comme le groupe', 'Come il gruppo', 'Jak grupa', 'Zoals de groep', 'Como el grupo'),
'set.gruppenFolge': ('Ziehen oder mit den Pfeilen ordnen — so stehen sie überall, auch auf deinen anderen Geräten.', 'Drag or use the arrows to reorder — they appear in this order everywhere, on your other devices too.', 'Fais glisser ou utilise les flèches pour ordonner — l’ordre vaut partout, aussi sur tes autres appareils.', 'Trascina o usa le frecce per ordinare — l’ordine vale ovunque, anche sugli altri dispositivi.', 'Przeciągnij lub użyj strzałek — kolejność obowiązuje wszędzie, także na innych urządzeniach.', 'Sleep of gebruik de pijlen om te ordenen — zo staan ze overal, ook op je andere apparaten.', 'Arrastra o usa las flechas para ordenar: el orden vale en todas partes, también en tus otros dispositivos.'),
'set.ziehen': ('{name} ziehen', 'Drag {name}', 'Faire glisser {name}', 'Trascina {name}', 'Przeciągnij: {name}', '{name} slepen', 'Arrastrar {name}'),
'set.ziehenTitel': ('Ziehen, um die Reihenfolge zu ändern', 'Drag to change the order', 'Faire glisser pour changer l’ordre', 'Trascina per cambiare l’ordine', 'Przeciągnij, aby zmienić kolejność', 'Sleep om de volgorde te wijzigen', 'Arrastra para cambiar el orden'),
'set.hoch': ('{name} nach oben', 'Move {name} up', 'Monter {name}', 'Sposta {name} su', 'Przesuń w górę: {name}', '{name} omhoog', 'Subir {name}'),
'set.runter': ('{name} nach unten', 'Move {name} down', 'Descendre {name}', 'Sposta {name} giù', 'Przesuń w dół: {name}', '{name} omlaag', 'Bajar {name}'),
'set.folgeNurHier': ('Auf diesem Gerät gespeichert — auf deinen anderen Geräten noch nicht.', 'Saved on this device — not yet on your other devices.', 'Enregistré sur cet appareil — pas encore sur tes autres appareils.', 'Salvato su questo dispositivo — non ancora sugli altri.', 'Zapisano na tym urządzeniu — na innych jeszcze nie.', 'Op dit apparaat opgeslagen — op je andere apparaten nog niet.', 'Guardado en este dispositivo; en tus otros dispositivos aún no.'),
}
