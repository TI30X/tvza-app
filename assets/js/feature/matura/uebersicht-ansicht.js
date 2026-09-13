/* ══════════════════════════════════════════════════════════════════
   Die Maturaarbeit — Übersicht. Zeichnen, Abhaken, Seitenleiste.

   Bis v.35.33.0 stand dieser Code als klassisches Inline-Skript in
   pages/maturaarbeit.html, mit onclick im erzeugten Markup und einem
   eigenen Stilblock. Seit v.35.34.0 hält die Seite die Seiten-Invariante
   (CLAUDE.md, Falle 4): Markup, Links, ein Modul. Der Code ist derselbe —
   verschoben, nicht neu geschrieben —, nur die Handler sind jetzt
   Datenattribute mit EINEM Zuhörer je Ereignis, und das Zurücksetzen
   fragt mit frage() statt mit confirm().

   Kein Firebase hier: das Anmelden und der Abgleich stehen in
   uebersicht.js. So laeuft diese Datei in den Tests mit dem echten
   i18n.js, aber ohne Netz.
   ══════════════════════════════════════════════════════════════════ */

import { frage } from '../../dialog.js';

export function starteUebersicht() {
  const DEADLINE = new Date('2026-08-17');
  const TODAY = new Date(); TODAY.setHours(0,0,0,0);

  // ── SPRACHE ──────────────────────────────────────────────────────────────────
  // Der Rahmen kommt aus dem Katalog; die Daten darunter (Phasen, Meilensteine,
  // Checklisten) sind Timos Inhalt und bleiben deutsch. tOr statt t(): der
  // Katalog kommt asynchron, und bis dahin soll Deutsch dastehen, nicht der
  // Schluessel.
  function T(key, deutsch, vars){
    const i18n = window.TVZAI18n;
    if (i18n) return i18n.tOr(key, deutsch, vars);
    return String(deutsch).replace(/\{(\w+)\}/g, (ganz, name) => vars && vars[name] !== undefined ? vars[name] : ganz);
  }
  /* Tage mit Pluralform: Polnisch hat drei, Deutsch zwei. */
  function TP(key, n, eins, mehr){
    const i18n = window.TVZAI18n;
    if (i18n && i18n.t(key + '.other') !== key + '.other') return i18n.format.plural(key, n);
    return (n === 1 ? eins : mehr).replace('{n}', n);
  }
  /* Das Datum in der Sprache, die WIRKLICH dasteht. format.date folgt der
     gewaehlten Sprache; fehlt deren Katalog (offline, erster Start), bleibt
     der Satz deutsch — und hiesse sonst "Abgabe war am 17 August 2026". */
  function abgabeDatum(){
    const i18n = window.TVZAI18n;
    try {
      if (i18n && i18n.activeLang === i18n.lang) return i18n.format.date(DEADLINE, { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
    } catch(e){}
    return '17. August 2026';
  }

  // ── PHASENDATEN ──────────────────────────────────────────────────────────────
  // Die aktive Phase wird aus dem heutigen Datum berechnet.
  const phases = [
    {
      id:'p1', cls:'p1', num:'Phase 1', title:'Grundlagen & Konzept',
      kw:'KW 50/2025 – KW 7/2026', dates:'8. Dez. 2025 – 8. Feb. 2026', weeks:9,
      phaseEnd: new Date('2026-02-08'),
      desc:'Thema fixiert, Fragestellung und Hypothesen formuliert, Konzept v4 fertig, Zeitplan erstellt, 1. Besprechung mit Herrn Diriwächter geführt.',
      holidays:['Weihnachtsferien (22.12.–4.1.): Literaturrecherche','Neujahr (1.1.) & Heilige Drei Könige (6.1.)'],
      holidayTypes:['tip','feiertag'],
      milestones:[
        {id:'ml_vereinbarung', title:'Vereinbarung unterzeichnet & abgegeben', sub:'1. Dezember 2025', date:'01.12.2025', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was war das?</div><div class="pmd-text">Das offizielle Formular der KSA, mit dem du und DiD das Thema, die Betreuung und den Rahmen der Maturaarbeit bestätigt habt. Bereits erledigt.</div></div>`},
        {id:'ml_thema', title:'Thema definitiv fixiert', sub:'KW 50 · 8.–14. Dez. 2025 · Intel, AMD & TSMC 2015–2026', date:'KW 50', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Dein Thema</div><div class="pmd-text"><strong>«Intels Verlust der technologischen Führungsposition»</strong> – eine betriebswirtschaftliche Analyse anhand von Investitionen, Forschungsausgaben und Marktperformance im Vergleich zu AMD und TSMC, 2015–2026.</div></div>`},
        {id:'ml_hypothesen', title:'Fragestellung & 3 Hypothesen formuliert', sub:'Klar im Konzept v4 dokumentiert', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Deine Fragestellung</div><div class="pmd-text">«Inwiefern lässt sich Intels Verlust an Wettbewerbsfähigkeit zwischen 2015 und 2026 durch steigende Investitionen bei gleichzeitig schwächerer Markt- und Ertragsentwicklung erklären?»</div></div><div class="pmd-block"><div class="pmd-label">Deine 3 Hypothesen</div><div class="pmd-text"><ul><li><strong>H1:</strong> Trotz hoher Investitionen verlor Intel Wettbewerbsfähigkeit, weil technologische Verzögerungen die Wirkung schwächten.</li><li><strong>H2:</strong> Der Rückstand lässt sich stärker durch Fertigungsprobleme als durch Produktdesign-Schwäche erklären.</li><li><strong>H3:</strong> AMD und TSMC zeigen eine stärkere Umwandlung von Investitionen in Markt- und Ertragswachstum.</li></ul></div></div><div class="pmd-tip">Wichtig: Hypothesen müssen VOR der Analyse aufgestellt worden sein – das ist hier der Fall ✓</div>`},
        {id:'ml_zeitplan', title:'Arbeits- und Zeitplan erstellt', sub:'Im Arbeitsjournal (Teams)', defaultDone:true},
        {id:'ml_b1', title:'1. Besprechung mit Herrn Diriwächter', sub:'Thema, Fragestellung, Hypothesen, Zeitplan besprochen', date:'erledigt', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was wurde besprochen?</div><div class="pmd-text">Erstes Treffen zur Eingrenzung des Themas, Formulierung von Fragestellung und Hypothesen sowie grobe Zeitplanung. Hast du ein Protokoll dazu im Arbeitsjournal?</div></div>`},
      ]
    },
    {
      id:'p2', cls:'p2', num:'Phase 2', title:'Literatur & Methodik',
      kw:'KW 7 – KW 16/2026', dates:'9. Feb. – 12. Apr. 2026', weeks:9,
      phaseEnd: new Date('2026-04-12'),
      desc:'Konzept v4 als Disposition genutzt, Annual Reports aller drei Unternehmen gesammelt, Methoden-Protokoll erstellt, Kapitel-4-Skelett aufgebaut, Daten in Excel v6 strukturiert.',
      holidays:['Sportferien (9.–22.2.): Intensivphase Literatur & Methode','Karfreitag (3.4.) & Osterferien starten (4.4.)'],
      holidayTypes:['tip','feiertag'],
      milestones:[
        {id:'ml_vorstudie', title:'Vorstudie: Konzept v4 als Disposition fertig', sub:'KW 7 · 9.–15. Feb. 2026', date:'KW 7', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was ist eine Disposition?</div><div class="pmd-text">Die Disposition ist ein detaillierter Plan der Arbeit: Thema, Fragestellung, Hypothesen, geplante Methode und Struktur der Kapitel. Dein Konzept v4 erfüllt diese Funktion vollständig.</div></div>`},
        {id:'ml_erstlit', title:'Datenquellen gesichert', sub:'Annual Reports Intel (2016–2025), AMD (2016–2025), TSMC (2016–2024)', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was sind Annual Reports?</div><div class="pmd-text">Jahresberichte, die börsenkotierte Unternehmen jedes Jahr veröffentlichen müssen. Sie enthalten alle Finanzkennzahlen: Umsatz, Gewinn, Margen, R&D-Ausgaben, CapEx. Das ist deine Primärquelle – direkt vom Unternehmen, keine Zeitung dazwischen.</div></div><div class="pmd-block"><div class="pmd-label">Alle Daten vorhanden?</div><div class="pmd-text"><ul><li>Intel: 2016–2025 ✓</li><li>AMD: 2016–2025 ✓</li><li>TSMC: 2016–2024 ✓ (2016 separates Problem dokumentiert)</li></ul></div></div>`},
        {id:'ml_methode', title:'Methodik festgelegt', sub:'Methoden-Protokoll.docx: Kennzahlen, Indexierung, Währung', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was steht im Methoden-Protokoll?</div><div class="pmd-text">Alle methodischen Entscheide mit Begründung, z.B.: <ul><li><strong>Verhältniskennzahlen</strong> statt absolute Zahlen → kürzt den Grössenunterschied heraus</li><li><strong>Indexreihen</strong> mit Basisjahr 2015 = 100 → Wachstumsdynamik direkt vergleichbar</li><li><strong>TWD → USD</strong>: TSMC-Daten auf USD umgerechnet für einheitlichen Vergleich</li></ul></div></div>`},
        {id:'ml_kapitel4', title:'Kapitel-4-Skelett erstellt', sub:'Methoden_Skelett_Kapitel4.docx – Gerüst für Methoden-Kapitel', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was ist das?</div><div class="pmd-text">Ein vorgefertigtes Gerüst (Lückentext) für das Methoden-Kapitel. Es übernimmt die Konzept-Vorgaben und zeigt genau was du noch selbst ergänzen musst (rot markiert). Nutze es als Basis wenn du das Kapitel schreibst.</div></div>`},
        {id:'ml_daten_excel', title:'Daten in Excel strukturiert', sub:'Intel_AMD_TSMC_Daten_Vorlage_v6.xlsx', defaultDone:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was enthält die Excel-Datei?</div><div class="pmd-text">Alle Kennzahlen der drei Unternehmen, aufbereitet für die Analyse: Bruttomarge, operative Marge, R&D-Quote, CapEx-Quote, Indexreihen Umsatz/Aktienkurs. Diese Datei ist die Grundlage für deine Regressionsanalyse.</div></div>`},
        {id:'ml_zwischenbilanz', title:'Formale Zwischenbilanz bei DiD', sub:'KW 16 · 13.–19. Apr. 2026 – als Besprechung noch offen', date:'KW 16', overdue:true,
          details:`<div class="pmd-block"><div class="pmd-label">Was sollte das sein?</div><div class="pmd-text">Ein Treffen mit DiD zur Halbzeit: Literatur analysiert? Feldforschung abgeschlossen? Erste Analyse gezeigt? Das wäre die 2. Besprechung gewesen. Noch nicht gemacht → bald nachholen!</div></div><div class="pmd-tip">Jetzt Termin 2 bei DiD ausmachen – zeige ihm den aktuellen Stand der Daten und Methodik.</div>`},
      ]
    },
    {
      id:'p3', cls:'p3', num:'Phase 3', title:'Analyse & Ergebnisse',
      kw:'KW 16 – KW 25/2026', dates:'13. Apr. – 14. Jun. 2026', weeks:9,
      phaseEnd: new Date('2026-06-14'),
      desc:'Jetzt in diesen ~4 verbleibenden Wochen (bis KW 25, 15. Jun.) die Regressionsanalyse abschliessen, Ergebnisse interpretieren und Hypothesen überprüfen.',
      holidays:['Auffahrt + Brücke (14.–17. Mai): kurze Intensivphase','Pfingstmontag (25. Mai): 1 freier Tag','Fronleichnam (4. Jun.)'],
      holidayTypes:['tip','feiertag','feiertag'],
      milestones:[
        {id:'ml_regression', title:'Regressionsanalyse durchgeführt', sub:'Outputs erstellt & Koeffizienten interpretiert',
          details:`<div class="pmd-block"><div class="pmd-label">Was ist eine Regressionsanalyse?</div><div class="pmd-text">Eine statistische Methode, die zeigt ob und wie stark zwei Variablen zusammenhängen. In deiner Arbeit z.B.: <em>Hängt Intels operative Marge mit seinen R&D-Ausgaben zusammen?</em></div></div><div class="pmd-block"><div class="pmd-label">Wie führst du sie durch?</div><div class="pmd-text">In Excel: <strong>Daten → Datenanalyse → Regression.</strong><ul><li><strong>y (abhängige Variable)</strong> = das was du erklären willst, z.B. operative Marge</li><li><strong>x (unabhängige Variable)</strong> = der Einflussfaktor, z.B. R&D-Quote oder CapEx-Quote</li><li>Für jedes Unternehmen (Intel, AMD, TSMC) separat durchführen → dann vergleichen</li></ul></div></div><div class="pmd-block"><div class="pmd-label">Was ist der Output (Ergebnistabelle)?</div><div class="pmd-text">Excel gibt eine Tabelle aus mit:<ul><li><strong>Koeffizient (β)</strong>: Zeigt Stärke und Richtung des Zusammenhangs</li><li><strong>p-Wert</strong>: Ist der Zusammenhang statistisch signifikant? (p &lt; 0.05 = ja)</li><li><strong>R²</strong>: Wie viel Prozent der Variation in y wird durch x erklärt? (z.B. R² = 0.65 = 65%)</li><li><strong>Standardfehler</strong>: Wie präzise ist die Schätzung?</li></ul></div></div><div class="pmd-block"><div class="pmd-label">Was bedeutet der Koeffizient konkret?</div><div class="pmd-text">Beispiel: β = 0.8 für «R&D-Quote → operative Marge» bedeutet: <em>«Steigt die R&D-Quote um 1 Prozentpunkt, steigt die operative Marge um 0.8 Prozentpunkte.»</em><br><br>β = −1.2 würde bedeuten: <em>«Steigt die R&D-Quote um 1 Punkt, sinkt die Marge um 1.2 Punkte»</em> – inverser Zusammenhang.</div></div><div class="pmd-tip">Tipp: Du musst die Regression nicht mathematisch erklären. Bei den Lesenden einer wissenschaftlichen Arbeit kann das Wissen darüber vorausgesetzt werden. Erkläre nur was der Koeffizient in deinem konkreten Fall bedeutet.</div>`},
        {id:'ml_ergebnisse', title:'Ergebnisse interpretiert', sub:'Hypothesen 1–3 verifiziert oder falsifiziert?',
          details:`<div class="pmd-block"><div class="pmd-label">Was tust du hier?</div><div class="pmd-text">Du schaust dir die Regressionsergebnisse der drei Unternehmen an und prüfst, was sie im Zusammenhang mit deinen Hypothesen bedeuten.</div></div><div class="pmd-block"><div class="pmd-label">Fragen die du beantworten musst</div><div class="pmd-text"><ul><li>Ist der Koeffizient <strong>positiv oder negativ</strong>? (Richtung des Zusammenhangs)</li><li>Ist er <strong>signifikant</strong>? (p &lt; 0.05) – sonst kein verlässlicher Zusammenhang</li><li>Wie hoch ist <strong>R²</strong>? – Je höher, desto besser erklärt das Modell</li><li>Unterscheidet sich das <strong>Ergebnis zwischen Intel, AMD und TSMC</strong>?</li></ul></div></div><div class="pmd-block"><div class="pmd-label">Bezug zu deinen Hypothesen</div><div class="pmd-text"><ul><li><strong>H1:</strong> Zeigt β für Intel einen schwachen oder negativen Zusammenhang zwischen Investitionen und Ertrag?</li><li><strong>H2:</strong> Deutet die CapEx-Analyse eher auf ein Fertigungsproblem hin als die R&D-Analyse?</li><li><strong>H3:</strong> Sind β und R² bei AMD/TSMC höher als bei Intel?</li></ul></div></div><div class="pmd-tip">Wichtig: Hier nur beschreiben, was die Zahlen zeigen. Die Wertung («Intel hat versagt weil…») kommt erst im Fazit.</div>`},
        {id:'ml_b2', title:'2. Besprechung mit DiD vereinbaren', sub:'Analyse & Ergebnisse zeigen – jetzt Termin ausmachen!',
          details:`<div class="pmd-block"><div class="pmd-label">Was mitbringen?</div><div class="pmd-text"><ul><li>Aktuellen Stand der Regressionsanalyse (auch wenn noch nicht fertig)</li><li>Excel-Datei v6 mit Kennzahlen</li><li>Offene Fragen stichwortartig per Mail vorab schicken</li><li>Protokoll der 1. Besprechung (falls noch nicht gemacht)</li></ul></div></div><div class="pmd-tip">Kombiniere Besprechung 2 mit der überfälligen Zwischenbilanz. Zeige DiD was du bisher erarbeitet hast.</div>`},
        {id:'ml_feedback_kw25', title:'Feedback-Meilenstein KW 25', sub:'KW 25 · 15.–21. Jun. 2026', date:'KW 25',
          details:`<div class="pmd-block"><div class="pmd-label">Was sollte bis KW 25 stehen?</div><div class="pmd-text">Erste Resultate sind interpretiert, der Bezug zu den Hypothesen ist klar und die Vorbereitung auf die mündliche Präsentation hat begonnen. DiD gibt in dieser Runde Feedback zu Ergebnissen und Methodik.</div></div>`},
      ]
    },
    {
      id:'p4', cls:'p4', num:'Phase 4', title:'Schreiben & Finalisieren',
      kw:'KW 25 – KW 34/2026', dates:'15. Jun. – 17. Aug. 2026', weeks:9,
      phaseEnd: new Date('2026-08-17'),
      desc:'In diesen ~8 Wochen (davon ~6 Wochen Sommerferien!) den vollständigen Text schreiben, überarbeiten und abgeben. Jeden Tag etwas schreiben.',
      holidays:['Sommerferien (4.7.–16.8.): Hauptschreibzeit – täglich schreiben','Nationalfeiertag (1.8.): kurze Pause','Maria Himmelfahrt (15.8.): vorletzter Tag vor Abgabe'],
      holidayTypes:['tip','feiertag','feiertag'],
      milestones:[
        {id:'ml_entwurf', title:'Vollständiger Textentwurf aller Kapitel', sub:'Abstract, Einleitung, Hauptteil, Schluss – alles vorhanden',
          details:`<div class="pmd-block"><div class="pmd-label">Reihenfolge die sich empfiehlt</div><div class="pmd-text"><ul><li>Zuerst: <strong>Methode & Daten</strong> (Kapitel-Skelett als Basis)</li><li>Dann: <strong>Analyse & Resultate</strong> (Regressionsoutputs einbauen)</li><li>Dann: <strong>Literatur</strong> (Forschungsstand)</li><li>Dann: <strong>Einleitung & Schluss/Fazit</strong></li><li>Zuletzt: <strong>Abstract, Vorwort, Inhaltsverzeichnis</strong></li></ul></div></div><div class="pmd-tip">Schreibe nie erst alle Kapitel fertig und dann das Fazit – das Fazit schreibst du am besten wenn der Rest steht.</div>`},
        {id:'ml_b3', title:'3. Besprechung mit DiD', sub:'Letztes inhaltliches Feedback vor der Abgabe',
          details:`<div class="pmd-block"><div class="pmd-label">Was mitbringen?</div><div class="pmd-text">Ersten vollständigen Entwurf oder zumindest die fertigen Hauptkapitel. DiD gibt Feedback zu Inhalt, Struktur und Argumentation.</div></div>`},
        {id:'ml_ueberarbeitung', title:'Überarbeitung, Sprache & Quellen geprüft', sub:'APA, KISS, Formatierung, Grafiken, Quellenverzeichnis',
          details:`<div class="pmd-block"><div class="pmd-label">Was prüfst du?</div><div class="pmd-text"><ul><li><strong>Sprache:</strong> Füllwörter raus, Passiv, keine Bildersprache, kurze Sätze</li><li><strong>Quellen:</strong> Alle Aussagen belegt? APA korrekt? Literaturverzeichnis vollständig?</li><li><strong>Grafiken:</strong> Selbst erstellt? Korrekt beschriftet? Nie am Kapitelanfang?</li><li><strong>Format:</strong> Blocksatz, Zeilenabstand 1.5, max. 3 Gliederungsebenen</li><li><strong>Rohdaten im Anhang?</strong></li></ul></div></div>`},
        {id:'ml_b4', title:'4. Besprechung mit DiD', sub:'Letzte Rückfragen vor Abgabe',
          details:`<div class="pmd-block"><div class="pmd-label">Worum geht es?</div><div class="pmd-text">Letzte offene Fragen klären, z.B. zu Zitierform, Formatierung oder ob ein bestimmter Abschnitt verständlich ist. Kein grosses Feedback mehr – das ist ein kurzer Abschluss-Check.</div></div>`},
        {id:'ml_abgabe', title:'Abgabe: 17. August 2026', sub:'PDF + Plagiatversion + Arbeitsjournal + Abstract per Mail', date:'17.08.2026',
          details:`<div class="pmd-block"><div class="pmd-label">Was einreichen?</div><div class="pmd-text"><ul><li>Schriftliche Arbeit als <strong>PDF</strong></li><li><strong>Plagiatprüfungsversion</strong> (siehe KSA_2026_Leitfaden_Plagiate_KI.pdf)</li><li><strong>Arbeitsjournal</strong> (PDF)</li><li><strong>Abstract</strong> als separates Dokument</li></ul>Alles in einer Mail an DiD am selben Tag.</div></div><div class="pmd-tip">Betreff der Mail: «Maturaarbeit [Dein Name] – Abgabe 17.08.2026»</div>`},
      ]
    },
    {
      id:'p5', cls:'p5', num:'Phase 5', title:'Präsentation & Abschluss',
      kw:'KW 38 – KW 44/2026', dates:'14. Sep. – 1. Nov. 2026', weeks:6,
      phaseEnd: new Date('2026-11-01'),
      desc:'Mündliche Präsentation (KW 38) und abschliessendes Beurteilungsgespräch (KW 44). Herbstferien zur Erholung.',
      holidays:['Herbstferien (ca. Okt. 2026): Erholung nach der Arbeit'],
      holidayTypes:['ferien'],
      milestones:[
        {id:'ml_praesentation', title:'Mündliche Präsentation', sub:'KW 38 · 14.–20. Sep. 2026', date:'KW 38',
          details:`<div class="pmd-block"><div class="pmd-label">Bewertung (25 Punkte total)</div><div class="pmd-text"><ul><li><strong>5P</strong> – Bezug zum Thema, Kerngedanke, Struktur</li><li><strong>15P</strong> – Sprache, Umgang mit Fragen, Gestik, Mimik ← grösster Block!</li><li><strong>5P</strong> – Visualisierung (Folien)</li></ul></div></div><div class="pmd-tip">Die 15 Punkte für Auftreten sind mehr als jede andere Einzelkategorie. Übe die Präsentation laut und bereite Antworten auf kritische Fragen vor.</div>`},
        {id:'ml_abschluss', title:'Abschlussgespräch mit DiD', sub:'KW 44 · 26. Okt.–1. Nov. 2026', date:'KW 44',
          details:`<div class="pmd-block"><div class="pmd-label">Was passiert hier?</div><div class="pmd-text">DiD bespricht mit dir die Bewertung von Arbeit, Arbeitsjournal und Präsentation. Du erhältst dein finales Feedback und die Note.</div></div>`},
      ]
    }
  ];

  const checklists = {
    journal:[
      {id:'j1',text:'Arbeits- und Zeitplan erstellt',tag:'pflicht',defaultDone:true,
        desc:'Phasen 1–5 mit Zeitraum, Meilensteinen und Datum – im Teams-Kanal für DiD sichtbar.'},
      {id:'j2',text:'Konzept v4 im Journal dokumentiert',tag:'pflicht',defaultDone:true,
        desc:'Konzept v4 im Journal referenziert: Hauptziele, Hypothesen und allfällige Abweichungen festgehalten.'},
      {id:'j3',text:'Ziele der Maturaarbeit definiert',tag:'inhalt',defaultDone:true,
        desc:'Übergeordnetes Ziel und ein Teilziel pro Hypothese – direkt aus Fragestellung abgeleitet.'},
      {id:'j4',text:'Vorgehen beschrieben',tag:'inhalt',defaultDone:true,
        desc:'Methodik kurz erklärt: Kennzahlenvergleich 3 Unternehmen, Indexierung, Regressionsanalyse. Begründung warum sinnvoll.'},
      {id:'j5',text:'Lust & Frust laufend dokumentiert',tag:'inhalt',
        desc:'Regelmässige Einträge: was läuft gut, was ist schwierig, wie wurden Probleme gelöst. DiD bewertet dies.'},
      {id:'j6',text:'Methodische Entscheide eingetragen',tag:'inhalt',defaultDone:true,
        desc:'Alle Entscheide mit Begründung: TWD→USD, Indexierung, Verhältniskennzahlen. Datenquellen dokumentiert (woher die Annual Reports).'},
      {id:'j7',text:'Protokoll zur 1. Besprechung ausformuliert',tag:'pflicht',
        desc:'Stichwörter während der Sitzung → danach vollständig ausformulieren und im Teams-Kanal hochladen.'},
      {id:'j8',text:'Erkenntnisse aus zwei KSA-Maturaarbeiten festgehalten',tag:'pflicht',
        desc:'Zwei frühere DiD-Arbeiten gelesen. Erkenntnisse zu Aufbau, APA-Zitierung, Sprachstil und Grafiknutzung schriftlich ins Journal.'},
    ],
    verbindlich:[
      {id:'v1',text:'Am «Roten Faden» teilgenommen',tag:'pflicht',
        desc:'Schulinterne Pflichtveranstaltung zum Schreibprozess. Termin in der Schule erfragen falls unklar.'},
      {id:'v2',text:'Zwei frühere KSA-Maturaarbeiten studiert',tag:'pflicht',
        desc:'Von DiD betreute Arbeiten: Fokus auf Inhaltsverzeichnis-Aufbau, APA-Zitierung und Grafik-Einbettung. Mind. 3 Erkenntnisse ins Journal.'},
      {id:'v3',text:'Hypothesen VOR der Analyse aufgestellt',tag:'pflicht',defaultDone:true,
        desc:'Alle drei Hypothesen wurden vor der Datenanalyse formuliert und aus der Literatur begründet. ✓'},
      {id:'v4',text:'Fragestellung in einem klaren Satz formuliert',tag:'inhalt',defaultDone:true,
        desc:'Steht als einziger, hervorgehobener Satz in der Einleitung (kursiv oder Einzug). Aus Konzept v4 übernommen. ✓'},
      {id:'v5',text:'Fragen vor jeder Besprechung vorab per Mail an DiD',tag:'pflicht',
        desc:'Stichwortartige Fragen vor jedem Termin mailen, damit DiD sich vorbereiten kann und die Zeit effizient genutzt wird.'},
    ],
    aufbau:[
      {id:'a1',text:'Abstract geschrieben',tag:'inhalt',
        desc:'Ca. 150–200 Wörter: Thema, Fragestellung, Methode, wichtigstes Ergebnis. Separat einreichen – zuletzt schreiben.'},
      {id:'a2',text:'Inhaltsverzeichnis erstellt',tag:'format',
        desc:'Automatisch aus Überschriften generieren. Alle Kapitel mit Seitenzahlen, max. 3 Gliederungsebenen (1.1.1 – nicht tiefer).'},
      {id:'a3',text:'Vorwort verfasst',tag:'inhalt',
        desc:'Persönlich gehalten («ich» erlaubt): Motivation, Überraschungen, Danksagung an DiD.'},
      {id:'a4',text:'Einleitung: Fragestellung & Hypothesen',tag:'inhalt',
        desc:'Thema einführen, mit Fragestellung und drei Hypothesen enden. Beide hervorgehoben (kursiv/Einzug) – Hypothesen müssen aus der Einleitung logisch folgen.'},
      {id:'a5',text:'Hauptteil – Methode geschrieben',tag:'inhalt',
        desc:'Exakt beschreiben: welche Kennzahlen (Margen, R&D, CapEx, Indexreihen), wie die drei Unternehmen vergleichbar gemacht werden, warum diese Methode. Kapitel-4-Skelett als Gerüst nutzen.'},
      {id:'a6',text:'Hauptteil – Daten: Herkunft & Einschränkungen',tag:'inhalt',
        desc:'Datenquellen benennen (Annual Reports, Zeitraum), was gemessen wird, welche Einschränkungen bestehen (z.B. TSMC 2016 fehlt).'},
      {id:'a7',text:'Hauptteil – Literatur: Forschungsstand',tag:'inhalt',
        desc:'Mind. 5 wissenschaftliche Quellen auswerten, nicht nur beschreiben – einordnen: stützen oder widersprechen sie deinen Hypothesen?'},
      {id:'a8',text:'Hauptteil – Analyse: Regressionsoutputs besprochen',tag:'inhalt',
        desc:'Alle Ergebnisse in Tabellen/Grafiken zeigen. Koeffizienten erklären («Ein Anstieg der R&D-Quote um 1% ist verbunden mit…»). Reihenfolge: erst Text, dann Grafik.'},
      {id:'a9',text:'Hauptteil – Resultate: Erkenntnisse beschrieben',tag:'inhalt',
        desc:'Nur beschreiben was die Analyse zeigt, keine Wertung. Bezug zu den drei Hypothesen herstellen. Bewertung kommt erst im Fazit.'},
      {id:'a10',text:'Schluss: Fazit geschrieben',tag:'inhalt',
        desc:'Fragestellung direkt beantworten, jede Hypothese bestätigen oder widerlegen. Hier sind Wertungen und eigene Einschätzung erlaubt. Einschränkungen offen erwähnen.'},
      {id:'a11',text:'Schluss: Weitere Forschungsmöglichkeiten',tag:'inhalt',
        desc:'Was könnte eine Folgestudie untersuchen? Demonstriert wissenschaftliches Denken über die eigene Arbeit hinaus.'},
      {id:'a12',text:'Rohdaten und vollständige Outputs im Anhang',tag:'format',
        desc:'Excel-Datei v6, vollständige Regressionsoutputs und Ergänzungsmaterialien in den Anhang. Im Hauptteil an den richtigen Stellen auf den Anhang verweisen.'},
    ],
    quellen:[
      {id:'q1',text:'Alle Aussagen mit Quellen belegt',tag:'pflicht',
        desc:'Jede fremde Aussage braucht eine Quellenangabe. Ausnahmen: eigene Analyseergebnisse und Wertungen im Fazit.'},
      {id:'q2',text:'APA-Standard korrekt angewendet',tag:'pflicht',
        desc:'Im Text: (Autor, Jahr, S. XX). Im Literaturverzeichnis: Autor, A.A. (Jahr). Titel. Verlag. APA-Zitierregeln.pdf im Ordner beachten.'},
      {id:'q3',text:'Keine Online-Ratgeber als Quellen',tag:'pflicht',
        desc:'Wikipedia, Blogs, Newsseiten sind nicht erlaubt. Nur Primärquellen (Annual Reports) und wissenschaftliche Literatur (Fachzeitschriften, Bücher).'},
      {id:'q4',text:'Originalquellen verwendet',tag:'inhalt',
        desc:'Wenn ein Artikel eine Zahl zitiert, die Originalquelle suchen (z.B. Annual Report) und diese direkt zitieren. Zeigt wissenschaftliche Sorgfalt.'},
      {id:'q5',text:'Mind. 5–8 wissenschaftliche Quellen recherchiert',tag:'inhalt',
        desc:'Themen: Halbleiterindustrie, Intel, Wettbewerbsfähigkeit, Innovationsmanagement, IDM vs. Fabless. Quellen auf ScienceDirect, Econstor oder Econbiz suchen.'},
      {id:'q6',text:'KISS-Prinzip: Sprache präzise und sachlich',tag:'format',
        desc:'Keine Füllwörter (sehr, enorm → genaue Zahlen), keine Bildersprache, Passiv verwenden («wurde untersucht» statt «ich habe untersucht»).'},
      {id:'q7',text:'Kurze Sätze, Wortwiederholungen sind OK',tag:'format',
        desc:'Lange Schachtelsätze vermeiden. Synonyme können ungenau sein – Wortwiederholungen sind in Fachtexten ausdrücklich erlaubt.'},
      {id:'q8',text:'Formatierung: Blocksatz, Zeilenabstand 1.5',tag:'format',
        desc:'Blocksatz (nicht Flattersatz), Zeilenabstand 1.5, Schriftgrösse 11–12pt, Seitenränder mind. 2.5 cm, Seitenzahlen vorhanden.'},
      {id:'q9',text:'Gliederungstiefe max. 3 Ebenen',tag:'format',
        desc:'Kapitel 1 → 1.1 → 1.1.1. Nicht tiefer. Wenn eine 4. Ebene nötig scheint, Struktur überdenken.'},
      {id:'q10',text:'Abbildungen selbst erstellt und korrekt beschriftet',tag:'format',
        desc:'Grafiken selbst erstellen (einheitliches Design). Unter jeder Abbildung: «Abbildung 1: Eigene Darstellung, nach Meier (2010, S. 23)».'},
      {id:'q11',text:'Grafiken nie am Kapitelanfang',tag:'format',
        desc:'Reihenfolge immer: (1) beschreibender Text, (2) Grafik/Tabelle, (3) Besprechung der wichtigsten Zahlen. Eine Grafik am Kapitelanfang ohne Einleitung ist nicht erlaubt.'},
    ],
    abgabe:[
      {id:'ab1',text:'Schriftliche Arbeit als PDF fertiggestellt',tag:'abgabe',
        desc:'Vor dem Export: alle Grafiken sichtbar, Inhaltsverzeichnis mit korrekten Seitenzahlen, keine leeren Seiten, Anhang vollständig. PDF nach Export noch einmal durchscrollen.'},
      {id:'ab2',text:'Plagiatprüfungsversion erstellt',tag:'abgabe',
        desc:'Spezielle Version gemäss KSA_2026_Leitfaden_Plagiate_KI.pdf (liegt in deinem Ordner).'},
      {id:'ab3',text:'Abstract als separates Dokument',tag:'abgabe',
        desc:'Finalisierter Abstract (max. 200 Wörter) zusätzlich als eigene Datei – nicht nur in der Arbeit eingebettet.'},
      {id:'ab4',text:'Arbeitsjournal finalisiert',tag:'abgabe',
        desc:'Vollständig: alle 4 Besprechungsprotokolle, Zeitplan, Reflexionen, Erkenntnisse aus KSA-Musterarbeiten, abschliessende Reflexion. Als PDF exportieren.'},
      {id:'ab5',text:'Alles per Mail an Herrn Diriwächter',tag:'abgabe',
        desc:'17.8.2026: Alle vier Dokumente (Arbeit, Plagiatversion, Abstract, Journal) in einer Mail. Betreff: «Maturaarbeit Timothy [Nachname] – Abgabe 17.08.2026».'},
      {id:'ab6',text:'Mündliche Präsentation vorbereitet',tag:'abgabe',
        desc:'KW 38 – 25P total, davon 15P für Sprache/Auftreten/Fragen (grösster Block!). Folien mit Kernaussagen, laut üben, kritische DiD-Fragen vorbereiten.'},
    ]
  };

  const categoryIcons={
    meilensteine:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v16H3zM7 3v4M17 3v4M3 9h18"/></svg>',
    besprechungen:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 11a4 4 0 100-8 4 4 0 000 8z"/></svg>',
    journal:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    verbindlich:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    aufbau:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM8 7h8M8 11h8"/></svg>',
    quellen:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18M5 5v14h14V5M8 9h8M8 13h8"/></svg>',
    abgabe:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  };
  const categories=[
    {id:'meilensteine',key:'ma.kat.meilensteine',name:'Meilensteine',ids:()=>phases.flatMap(p=>p.milestones.map(m=>m.id))},
    {id:'besprechungen',key:'mt.besprechungen',name:'Besprechungen',ids:()=>['meeting_1','meeting_2','meeting_3','meeting_4']},
    {id:'journal',key:'ma.journal',name:'Arbeitsjournal',ids:()=>checklists.journal.map(i=>i.id)},
    {id:'verbindlich',key:'ma.verbindlich',name:'Verbindlichkeiten',ids:()=>checklists.verbindlich.map(i=>i.id)},
    {id:'aufbau',key:'ma.kat.aufbau',name:'Schriftl. Arbeit',ids:()=>checklists.aufbau.map(i=>i.id)},
    {id:'quellen',key:'ma.kat.quellen',name:'Quellen & Format',ids:()=>checklists.quellen.map(i=>i.id)},
    {id:'abgabe',key:'ma.abgabe',name:'Abgabe',ids:()=>checklists.abgabe.map(i=>i.id)},
  ];

  // ── STATE ────────────────────────────────────────────────────────────────────
  let MATURA_STORAGE_KEY='matura_v3';
  function loadState(){
    try{
      const raw=localStorage.getItem(MATURA_STORAGE_KEY);
      if(raw) return JSON.parse(raw);
      // First run: apply defaults based on work already done
      const s={};
      phases.forEach(p=>p.milestones.forEach(m=>{ if(m.defaultDone) s[m.id]=true; }));
      Object.values(checklists).forEach(arr=>arr.forEach(i=>{
        if(i.defaultDone) s[i.id]=true;
      }));
      s['meeting_1']=true;
      return s;
    }catch(e){return{};}
  }
  let cloudStateWriter=null;
  function storeLocalState(){
    try{ localStorage.setItem(MATURA_STORAGE_KEY,JSON.stringify(state)); }
    catch(e){ console.warn('[matura-storage] save-failed'); }
  }
  function saveState(changedKey=null, options={}){
    storeLocalState();
    if(cloudStateWriter) void cloudStateWriter(state,changedKey,options);
  }
  let state=loadState();
  const currentPhase=phases.find(p=>p.phaseEnd>=TODAY) || phases[phases.length-1];
  const openPhases=new Set([currentPhase.id]);
  const openMilestoneDetails=new Set();
  function toggleMilestoneDetails(id,e){ e.stopPropagation(); if(openMilestoneDetails.has(id))openMilestoneDetails.delete(id);else openMilestoneDetails.add(id); renderPhases(); }

  // ── HEADER ───────────────────────────────────────────────────────────────────
  function renderDeadline(){
    const diff=Math.ceil((DEADLINE-TODAY)/86400000);
    const el=document.getElementById('days-el');
    const label=document.getElementById('deadline-label');
    el.textContent=Math.max(0,diff);
    el.className='matura-metric__value days '+(diff<60?'urgent':diff<150?'warn':'ok');
    const datum=abgabeDatum();
    label.textContent=diff<0?T('ma.abgabeWar','Abgabe war am {datum}',{datum})
      :diff===0?T('ma.abgabeHeute','Abgabe heute · {datum}',{datum})
      :T('ma.tageBis','Tage · {datum}',{datum});
  }
  function renderCatOverview(){
    document.getElementById('cat-overview').innerHTML=categories.map(cat=>{
      const ids=cat.ids(); const total=ids.length;
      const done=ids.filter(id=>state[id]).length;
      const pct=total?Math.round(done/total*100):0;
      return`<div class="cat-pill"><div class="cp-icon">${categoryIcons[cat.id]}</div><div class="cp-info"><div class="cp-name">${T(cat.key,cat.name)}</div><div class="cp-count">${done}/${total}</div><div class="cp-bar"><div class="cp-fill" style="width:${pct}%"></div></div></div></div>`;
    }).join('');
  }
  function renderGlobalProg(){
    const allIds=categories.flatMap(c=>c.ids());
    const total=allIds.length; const done=allIds.filter(id=>state[id]).length;
    const pct=total?Math.round(done/total*100):0;
    document.getElementById('gp-fill').style.width=pct+'%';
    document.getElementById('gp-pct').textContent=pct+' %';
    document.getElementById('progress-summary').textContent=T('ma.punkteErledigt','{done} von {total} Punkten erledigt',{done,total});
    document.querySelector('.matura-progress-track')?.setAttribute('aria-valuenow',String(pct));
    // Persist a compact summary so the dashboard tile reflects this module's Gesamtfortschritt.
    try {
      /* Nicht bei 0 abschneiden: nach der Abgabe ist die Zahl negativ,
         und Start sagt dann "Abgabe vorbei" statt "Abgabe heute". */
      const days = Math.ceil((DEADLINE - TODAY) / 86400000);
      localStorage.setItem('matura_v3_summary', JSON.stringify({ pct, done, total, deadline:'2026-08-17', days, ts:Date.now() }));
    } catch(e){}
  }

  // ── PHASES ───────────────────────────────────────────────────────────────────
  function renderPhases(){
    document.getElementById('phases-container').innerHTML=phases.map(p=>{
      const isOpen=openPhases.has(p.id);
      const isCurrent=p.id===currentPhase.id;
      const isPast=p.phaseEnd<TODAY && !isCurrent;
      const mDone=p.milestones.filter(m=>state[m.id]).length;
      const mTotal=p.milestones.length;
      const nr=T('ma.phaseNr','Phase {n}',{n:p.id.slice(1)});
      const phaseLabel=isCurrent?`${nr} · ${T('ma.aktuell','Aktuell')}`:isPast?`${nr} · ${T('ma.vorbei','Vorbei')}`:nr;

      const phaseClass=[p.cls, isCurrent?'current-phase':'', isPast?'done-phase':''].filter(Boolean).join(' ');

      const nextOpen=p.milestones.find(m=>!state[m.id]);
      const hereBanner=isCurrent?`<div class="here-banner">
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1116 0zM12 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
        <span>${T('ma.duBistHier','Du bist hier')} · ${p.title} · ${nextOpen?T('ma.naechster','Nächster offener Schritt: {titel}',{titel:nextOpen.title}):T('ma.alleErledigt','Alle Meilensteine dieser Phase sind erledigt.')}</span>
      </div>`:'';

      const holidayTags=p.holidays.map((h,i)=>{
        const t=p.holidayTypes[i];
        return`<span class="htag ${t}">${h}</span>`;
      }).join('');

      const milestoneHTML=p.milestones.map(m=>{
        const done=!!state[m.id];
        const isOverdue=m.overdue && !done;
        const detailsOpen=openMilestoneDetails.has(m.id);
        return`
          <div class="pm-item${isOverdue?' overdue-item':''}">
            <button type="button" class="pm-dot${done?' done':isOverdue?' overdue':''}" data-ms="${m.id}" aria-pressed="${done}" aria-label="${done?T('ma.alsOffen','Als offen markieren'):T('ma.alsErledigt','Als erledigt markieren')}"></button>
            <div class="pm-text">
              <div class="pm-title-row">
                <span class="pm-title" data-ms="${m.id}">${m.title}</span>
                ${m.details?`<button type="button" class="pm-info-btn${detailsOpen?' open':''}" data-ms-details="${m.id}" aria-expanded="${detailsOpen}">${T('ma.details','Details')}</button>`:''}
                ${isOverdue?`<span class="overdue-tag">${T('ma.ueberfaellig','Überfällig')}</span>`:m.date?`<div class="pm-date-tag">${m.date}</div>`:''}
              </div>
              ${m.sub?`<div class="pm-sub">${m.sub}</div>`:''}
              ${detailsOpen&&m.details?`<div class="pm-details">${m.details}</div>`:''}
            </div>
          </div>`;
      }).join('');

      return`
        <div class="phase ${phaseClass}" id="phase-${p.id}">
          <button type="button" class="phase-header" data-phase="${p.id}" aria-expanded="${isOpen}">
            <span class="phase-stripe"></span>
            <span class="ph-body">
              <span class="ph-top"><span class="ph-num">${phaseLabel}</span><span class="ph-title">${p.title}</span></span>
              <span class="ph-dates">${p.kw} · ${p.dates} · ${T('ma.wochen','ca. {n} Wochen',{n:p.weeks})} · ${T('ma.meilensteineZahl','{done}/{total} Meilensteine',{done:mDone,total:mTotal})}</span>
              <span class="ph-desc">${p.desc}</span>
            </span>
            <span class="phase-toggle" aria-hidden="true"><svg class="ic${isOpen?' is-open':''}" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>
          </button>
          <div class="phase-body${isOpen?' open':''}">
            ${hereBanner}
            <div class="holiday-tags">${holidayTags}</div>
            <div class="phase-milestones">${milestoneHTML}</div>
          </div>
        </div>`;
    }).join('');
  }
  function togglePhase(id){ if(openPhases.has(id))openPhases.delete(id);else openPhases.add(id); renderPhases(); }
  function toggleMilestone(id){ state[id]=!state[id]; saveState(id); renderPhases(); renderCatOverview(); renderGlobalProg(); renderSidebar(); }

  // ── MEETINGS ─────────────────────────────────────────────────────────────────
  function renderMeetings(){
    const labels=[
      T('ma.gespraech.1','Thema & Konzept'),T('ma.gespraech.2','Analyse & Daten'),
      T('ma.gespraech.3','Rohtext Feedback'),T('ma.gespraech.4','Abschluss-Check'),
    ];
    document.getElementById('meetings-row').innerHTML=[1,2,3,4].map(n=>{
      const key=`meeting_${n}`; const done=!!state[key];
      return`<button type="button" class="meeting-card ${done?'done':''}" data-meeting="${key}" aria-pressed="${done}">
        <span class="mc-status-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${done?'<path d="M5 12l4 4L19 6"/>':'<circle cx="12" cy="12" r="8"/>'}</svg></span>
        <span class="mc-num">${T('ma.gespraechNr','Gespräch {n}',{n})}</span><span class="mc-label">${labels[n-1]}</span>
      </button>`;
    }).join('');
    const count=[1,2,3,4].filter(n=>state[`meeting_${n}`]).length;
    const warning=document.getElementById('meetings-warn');
    warning.innerHTML=count<4?`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.8L2.5 18a2 2 0 001.75 3h15.5a2 2 0 001.75-3L13.7 3.8a2 2 0 00-3.4 0z"/></svg><span><strong>${T('ma.gespraecheErledigt','{n} von 4 Gesprächen erledigt.',{n:count})}</strong> ${4-count===1?T('ma.einesOffen','Ein Gespräch ist noch offen; Fragen jeweils vorher per Mail schicken.'):T('ma.mehrereOffen','Die nächsten Gespräche sind noch offen; Fragen jeweils vorher per Mail schicken.')}</span>`:'';
  }
  function toggleMeeting(key){ state[key]=!state[key]; saveState(key); renderMeetings(); renderCatOverview(); renderGlobalProg(); renderSidebar(); }

  // ── CHECKLISTS ───────────────────────────────────────────────────────────────
  const tagLabels={
    pflicht:()=>T('ma.tag.pflicht','Pflicht'), inhalt:()=>T('ma.tag.inhalt','Inhalt'),
    format:()=>T('ma.tag.format','Format'),    abgabe:()=>T('ma.abgabe','Abgabe'),
  };

  function renderChecklist(key,clId,spId,slId){
    const items=checklists[key];
    document.getElementById(clId).innerHTML=items.map(item=>{
      const done=!!state[item.id];
      const tagHTML=item.tag?`<span class="ch-tag tag-${item.tag}">${tagLabels[item.tag]()}</span>`:'';
      return`
        <div class="check-item${done?' checked':''}" role="checkbox" tabindex="0" aria-checked="${done}" data-check="${item.id}" data-liste="${key}">
          <div class="custom-check"></div>
          <div class="ch-body">
            <div class="ch-main">${item.text}</div>
            ${item.desc?`<div class="ch-desc">${item.desc}</div>`:''}
          </div>
          ${tagHTML}
        </div>`;
    }).join('');
    updateSectionBar(key,spId,slId);
  }

  function toggleCheck(id,key,clId,spId,slId){
    state[id]=!state[id];
    saveState(id);
    renderChecklist(key,clId,spId,slId);
    renderCatOverview(); renderGlobalProg(); renderSidebar();
  }

  function updateSectionBar(key,spId,slId){
    const items=checklists[key];
    const done=items.filter(i=>state[i.id]).length; const total=items.length;
    document.getElementById(spId).style.width=(total?done/total*100:0)+'%';
    document.getElementById(slId).textContent=done+'/'+total;
  }

  // ── SIDEBAR ──────────────────────────────────────────────────────────────────
  // Items with due dates – used to populate the sidebar
  const watchItems = [
    // ÜBERFÄLLIG
    { id:'ml_zwischenbilanz', label:'Formale Zwischenbilanz bei DiD', sub:'KW 16 · Apr. 2026 – bereits vorbei', due:new Date('2026-04-19'), cat:'milestone' },
    { id:'meeting_2',         label:'2. Besprechung vereinbaren',     sub:'Sollte bald stattfinden',           due:new Date('2026-04-19'), cat:'meeting'   },
    // DRINGEND (nächste 8 Wochen)
    { id:'ml_regression',     label:'Regressionsanalyse abschliessen', sub:'Vor KW 25 (15. Jun.) fertig sein', due:new Date('2026-06-14'), cat:'work'      },
    { id:'ml_ergebnisse',     label:'Ergebnisse interpretieren',       sub:'Hypothesen 1–3 prüfen',            due:new Date('2026-06-14'), cat:'work'      },
    { id:'ml_feedback_kw25',  label:'Feedback-Meilenstein KW 25',      sub:'15.–21. Jun. 2026',                due:new Date('2026-06-21'), cat:'milestone' },
    { id:'meeting_3',         label:'3. Besprechung vereinbaren',      sub:'Analyse & erste Ergebnisse zeigen', due:new Date('2026-06-30'), cat:'meeting'  },
    // SOMMER / ABGABE
    { id:'ml_entwurf',        label:'Vollständiger Textentwurf fertig', sub:'Ziel: Ende Juli (Sommerferien)',   due:new Date('2026-07-31'), cat:'work'      },
    { id:'meeting_4',         label:'4. Besprechung vor Abgabe',        sub:'Letztes Feedback von DiD',         due:new Date('2026-08-07'), cat:'meeting'  },
    { id:'ml_abgabe',         label:'Abgabe: 17. August 2026',          sub:'PDF + Plagiat + Journal + Abstract', due:new Date('2026-08-17'), cat:'abgabe' },
    // JOURNAL-PFLICHTEN
    { id:'j7',  label:'Protokoll Besprechung 1 ausformulieren', sub:'Im Arbeitsjournal (Teams)',         due:new Date('2026-05-31'), cat:'journal' },
    { id:'j8',  label:'Zwei KSA-Maturaarbeiten studieren',      sub:'Erkenntnisse ins Journal schreiben', due:new Date('2026-06-14'), cat:'journal' },
    // VERBINDLICHKEITEN
    { id:'v1',  label:'Am «Roten Faden» teilnehmen',            sub:'Schulveranstaltung',                 due:new Date('2026-06-30'), cat:'pflicht' },
    { id:'v2',  label:'Zwei frühere KSA-Arbeiten studiert',     sub:'Formal: Zitierung, Layout, Aufbau',  due:new Date('2026-06-14'), cat:'pflicht' },
  ];

  function renderSidebar() {
    const now = TODAY;
    const in8weeks = new Date(now); in8weeks.setDate(now.getDate() + 56);

    const overdue  = watchItems.filter(w => !state[w.id] && w.due < now);
    const urgent   = watchItems.filter(w => !state[w.id] && w.due >= now && w.due <= in8weeks);
    const meetings = [1,2,3,4].map(n => !!state[`meeting_${n}`]);
    const mDone    = meetings.filter(Boolean).length;
    const nextMeeting = meetings.findIndex(done => !done) + 1;
    const allClear = overdue.length === 0 && urgent.length === 0;

    function sbItem(w, color) {
      const daysLeft = Math.ceil((w.due - now) / 86400000);
      const timeStr  = daysLeft < 0
        ? TP('ma.sb.tageUeberfaellig', Math.abs(daysLeft), '{n} Tag überfällig', '{n} Tage überfällig')
        : daysLeft === 0 ? T('ma.sb.heuteFaellig','heute fällig')
        : TP('ma.sb.inTagen', daysLeft, 'in {n} Tag', 'in {n} Tagen');
      return `<div class="sb-item ${color}">
        <div class="sb-dot ${color}"></div>
        <div class="sb-text">${w.label}<span class="sb-sub">${w.sub} · ${timeStr}</span></div>
      </div>`;
    }

    let html = '';

    // All clear banner
    if (allClear) {
      html += `<div class="sb-card">
        <div class="sb-title green">${T('ma.sb.imPlan','Alles im Plan')}</div>
        <div class="sb-empty">${T('ma.sb.imPlanSub','Keine überfälligen oder dringenden Aufgaben.')}</div>
      </div>`;
    }

    // Überfällig
    if (overdue.length > 0) {
      html += `<div class="sb-card">
        <div class="sb-title red">${T('ma.sb.ueberfaellig','Überfällig ({n})',{n:overdue.length})}</div>
        ${overdue.slice(0,4).map(w => sbItem(w, 'red')).join('')}
        ${overdue.length>4?`<div class="sb-more">${T('ma.sb.weitere','+ {n} weitere im Zeitplan',{n:overdue.length-4})}</div>`:''}
      </div>`;
    }

    // Dringend
    if (urgent.length > 0) {
      html += `<div class="sb-card">
        <div class="sb-title orange">${T('ma.sb.dringend','Dringend · nächste 8 Wochen ({n})',{n:urgent.length})}</div>
        ${urgent.slice(0,4).map(w => sbItem(w, 'orange')).join('')}
        ${urgent.length>4?`<div class="sb-more">${T('ma.sb.weitere','+ {n} weitere im Zeitplan',{n:urgent.length-4})}</div>`:''}
      </div>`;
    }

    // Besprechungen mini-status
    html += `<div class="sb-card">
      <div class="sb-title blue">${T('ma.sb.besprechungen','Besprechungen {n}/4',{n:mDone})}</div>
      <div class="sb-meet-row">
        ${meetings.map(d => `<div class="sb-meet-pip ${d?'done':''}"></div>`).join('')}
      </div>
      <div class="sb-meet-label">${mDone === 4 ? T('ma.sb.alle','Alle 4 erledigt') : T('ma.sb.ausstehend','Noch {n} ausstehend',{n:4-mDone})}</div>
      ${nextMeeting > 0 ? `<div class="sb-item orange sb-item--abstand">
        <div class="sb-dot orange"></div>
        <div class="sb-text">${T('ma.sb.ausmachen','Besprechung {n} bei {wer} ausmachen',{n:nextMeeting,wer:'DiD'})}<span class="sb-sub">${T('ma.sb.vorab','Fragen vorab per Mail schicken')}</span></div>
      </div>` : ''}
    </div>`;

    // Abgabe countdown
    const daysToDeadline = Math.ceil((DEADLINE - now) / 86400000);
    const dlColor = daysToDeadline < 60 ? 'red' : daysToDeadline < 120 ? 'orange' : 'blue';
    const deadlineDistance = daysToDeadline < 0
      ? TP('ma.sb.seitVorbei', Math.abs(daysToDeadline), 'seit {n} Tag vorbei', 'seit {n} Tagen vorbei')
      : daysToDeadline === 0 ? T('ma.sb.heute','heute')
      : TP('ma.sb.nochTage', daysToDeadline, 'noch {n} Tag', 'noch {n} Tage');
    html += `<div class="sb-card">
      <div class="sb-title ${dlColor}">${T('ma.abgabe','Abgabe')}</div>
      <div class="sb-item ${dlColor}">
        <div class="sb-dot ${dlColor}"></div>
        <div class="sb-text">${abgabeDatum()}<span class="sb-sub">${deadlineDistance} · PDF + Plagiat + Journal</span></div>
      </div>
    </div>`;

    document.getElementById('sidebar').innerHTML = html;
  }

  // ── RESET ────────────────────────────────────────────────────────────────────
  async function resetAll(){
    if(await frage({
      titel:T('ma.zuruecksetzenFrage','Wirklich den gesamten Fortschritt zurücksetzen?'),
      ja:T('mt.zuruecksetzen','Fortschritt zurücksetzen'), nein:T('common.abbrechen','Abbrechen'), gefahr:true,
    })){
      state={};
      openMilestoneDetails.clear();
      saveState(null,{reset:true});
      init();
    }
  }

  // ── INIT ─────────────────────────────────────────────────────────────────────
  function init(){
    renderDeadline(); renderPhases(); renderMeetings();
    renderChecklist('journal','cl-journal','sp-journal','sl-journal');
    renderChecklist('verbindlich','cl-verbindlich','sp-verbindlich','sl-verbindlich');
    renderChecklist('aufbau','cl-aufbau','sp-aufbau','sl-aufbau');
    renderChecklist('quellen','cl-quellen','sp-quellen','sl-quellen');
    renderChecklist('abgabe','cl-abgabe','sp-abgabe','sl-abgabe');
    renderCatOverview(); renderGlobalProg(); renderSidebar();
  }
  init();
  // Der Katalog kommt asynchron, und die Sprache laesst sich umschalten: beide
  // Male zeichnet der Code seine eigenen Beschriftungen neu. init() liest nur
  // den Zustand, es speichert nichts.
  if(window.TVZAI18n) window.TVZAI18n.ready.then(init, ()=>{});
  window.addEventListener('tvza-lang-change', init);
  const bridge={
    storageKey:()=>MATURA_STORAGE_KEY,
    useUser:uid=>{
      const nextKey=`matura_v3_${uid}`;
      try{
        const legacyOwnerKey='matura_v3_owner';
        const legacyOwner=localStorage.getItem(legacyOwnerKey);
        if(!localStorage.getItem(nextKey) && (!legacyOwner || legacyOwner===uid)){
          const legacy=localStorage.getItem('matura_v3');
          if(legacy) localStorage.setItem(nextKey,legacy);
          localStorage.setItem(legacyOwnerKey,uid);
        }
      }catch(e){ console.warn('[matura-storage] migration-failed'); }
      MATURA_STORAGE_KEY=nextKey;
      state=loadState();
      init();
    },
    allowedKeys:[...new Set(categories.flatMap(category=>category.ids()))],
    getState:()=>({...state}),
    applyState:next=>{
      state=next && typeof next==='object' && !Array.isArray(next)?{...next}:{};
      storeLocalState();
      init();
    },
    connect:writer=>{ cloudStateWriter=writer; },
  };

  /* Ein Zuhörer für die ganze Seite statt onclick im Markup: im Modul
     sind die Funktionen nicht global, und die Seite trägt keinen Code. */
  document.addEventListener('click', event => {
    const ziel = event.target.closest?.('[data-ms-details],[data-ms],[data-phase],[data-meeting],[data-check]');
    if (!ziel) return;
    const d = ziel.dataset;
    if (d.msDetails) { toggleMilestoneDetails(d.msDetails, event); return; }
    if (d.ms) { toggleMilestone(d.ms); return; }
    if (d.phase) { togglePhase(d.phase); return; }
    if (d.meeting) { toggleMeeting(d.meeting); return; }
    if (d.check) toggleCheck(d.check, d.liste, 'cl-' + d.liste, 'sp-' + d.liste, 'sl-' + d.liste);
  });
  /* Die Checklisten sind role="checkbox" auf einem div: Enter und
     Leertaste schalten wie ein Klick. */
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const ziel = event.target.closest?.('[data-check]');
    if (!ziel) return;
    event.preventDefault();
    const l = ziel.dataset.liste;
    toggleCheck(ziel.dataset.check, l, 'cl-' + l, 'sp-' + l, 'sl-' + l);
  });
  document.querySelector('.matura-reset')?.addEventListener('click', resetAll);

  return { bridge, TP };
}
