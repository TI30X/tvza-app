/* ══════════════════════════════════════════════════════════════════
   Termine einer Gruppe — das Modell.

   Ein Kader hat drei Arten von Terminen, und sie verhalten sich völlig
   verschieden. Alle drei als "Termin" zu führen würde genau die
   Vermischung wiederholen, die das Gruppenmodell gerade auflöst:

     training  Zwei Stunden. Hängt an einem Plan.
     lager     Mehrere Tage am Stück. Im Raster ein Balken, nicht
               sieben einzelne Einträge.
     rennen    Das einzige mit einem NACHHER. Vorher Startzeit und
               Nummer, nachher Rang und Zeit — im selben Dokument.

   Die Farbe ist hier keine Dekoration, sondern die Information: blau
   heisst Training, grün Lager, rot Rennen. Überall dieselbe Zuordnung,
   deshalb steht sie hier und nicht in jeder Ansicht neu.

   ── Datum als Zeichenkette ────────────────────────────────────────
   von/bis sind 'JJJJ-MM-TT', die Zeit ist 'HH:MM' — nicht Firestore-
   Timestamps. Zwei Gründe: die Erinnerungen im Kalender machen es
   schon genauso, und ein Trainingslager vom 3. bis 10. Oktober ist ein
   Datum, kein Zeitpunkt. Ein Timestamp zwänge dazu, eine Uhrzeit und
   eine Zeitzone zu erfinden, die niemand gemeint hat.

   ── Reines Modul ──────────────────────────────────────────────────
   Kein Firebase, kein DOM. Das Lesen und Schreiben liegt in groups.js;
   hier steht nur, was ein Termin IST. So bleibt der interessante Teil
   — Reihenfolge, Zeiträume, was heute läuft — echt testbar.
   ══════════════════════════════════════════════════════════════════ */

export const ARTEN = Object.freeze(['training', 'lager', 'rennen']);

/* Die Disziplinen des alpinen Skirennsports, in der üblichen
   Reihenfolge von der kürzesten zur längsten Fahrt. */
export const DISZIPLINEN = Object.freeze(['SL', 'RS', 'SG', 'DH']);

/* Ein Bereich pro Art — dieselben Namen, die kit.css über
   data-bereich einfärbt. Blau, grün, rot. */
export const BEREICH_DER_ART = Object.freeze({
  training: 't-training',
  lager: 't-lager',
  rennen: 't-rennen',
});

/* ── Dieselben drei Arten, andere Wörter ───────────────────────────
   Eine Gruppe muss kein Rennkader sein. Ein Gym hat Kurse und
   Workshops, eine Familie hat Termine und Reisen — strukturell ist das
   dasselbe: etwas Kurzes, etwas Mehrtägiges, etwas mit einem Ergebnis.

   Deshalb bleiben die drei Arten in den Daten unverändert und nur die
   Beschriftung wechselt. Ein Gym-Kurs, der intern 'lager' heisst, ist
   kein Problem; ein viertes und fünftes Datenmodell dafür schon.

   Was NICHT wechselt, sind die FIS-Punkte: die gehören dem alpinen
   Skirennsport. Ein Hyrox-Wettkampf im Gym hat ein Ergebnis, aber
   keine Disziplin nach FIS-Faktor. Darum haengt der Disziplin-Teil an
   'kader' und nicht an 'rennen'. */

const WORTE_JE_GRUPPE = Object.freeze({
  kader: Object.freeze({
    training: 'Training', lager: 'Trainingslager', rennen: 'Rennen',
  }),
  organisation: Object.freeze({
    training: 'Kurs', lager: 'Workshop', rennen: 'Wettkampf',
  }),
  familie: Object.freeze({
    training: 'Termin', lager: 'Reise', rennen: 'Anlass',
  }),
});

/* Welche Arten eine Gruppe überhaupt anbietet. Eine Familie braucht
   keinen Wettkampf-Eintrag — ein Auswahlfeld mit einer Möglichkeit,
   die niemand nutzt, ist eine Möglichkeit zu viel. */
export const ARTEN_JE_GRUPPE = Object.freeze({
  kader: Object.freeze(['training', 'lager', 'rennen']),
  organisation: Object.freeze(['training', 'lager', 'rennen']),
  familie: Object.freeze(['training', 'lager']),
});

export function artenFuer(gruppenart) {
  return ARTEN_JE_GRUPPE[gruppenart] || ARTEN_JE_GRUPPE.kader;
}

/* Die Disziplin und alles, was daran hängt, gilt nur im Rennkader. */
export function kenntDisziplinen(gruppenart) {
  return gruppenart === 'kader';
}

export function artWort(art, gruppenart = 'kader') {
  const tabelle = WORTE_JE_GRUPPE[gruppenart] || WORTE_JE_GRUPPE.kader;
  const eintrag = tabelle[art];
  if (!eintrag) return '';
  return globalThis.window?.TVZAI18n?.t(`termin.art.${gruppenart}.${art}`) ?? eintrag;
}

/* ── Datum ─────────────────────────────────────────────────────────*/

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function istIsoTag(wert) {
  return typeof wert === 'string' && ISO.test(wert);
}

/** 'JJJJ-MM-TT' für ein Date, in lokaler Zeit statt UTC. */
export function isoTag(datum = new Date()) {
  const d = datum instanceof Date ? datum : new Date(datum);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${t}`;
}

/* Mittags statt Mitternacht: so kippt ein Datum nicht über die
   Zeitzonengrenze, wenn es irgendwo weiterverarbeitet wird. */
function alsDate(iso) {
  return istIsoTag(iso) ? new Date(`${iso}T12:00:00`) : null;
}

export function istMehrtaegig(termin) {
  return istIsoTag(termin?.bis) && istIsoTag(termin?.von) && termin.bis > termin.von;
}

/** Läuft dieser Termin am gegebenen Tag? Ein Lager läuft an jedem Tag dazwischen. */
export function laeuftAm(termin, tag) {
  if (!istIsoTag(termin?.von) || !istIsoTag(tag)) return false;
  const ende = istIsoTag(termin.bis) && termin.bis > termin.von ? termin.bis : termin.von;
  return tag >= termin.von && tag <= ende;
}

/* Reihenfolge: nach Tag, innerhalb eines Tages das Mehrtägige zuerst
   (es ist der Rahmen), dann nach Uhrzeit, Terminloses vor Terminiertem. */
export function sortiere(termine) {
  return (Array.isArray(termine) ? termine : [])
    .filter(t => t && istIsoTag(t.von))
    .slice()
    .sort((a, b) => {
      if (a.von !== b.von) return a.von < b.von ? -1 : 1;
      const mehr = Number(istMehrtaegig(b)) - Number(istMehrtaegig(a));
      if (mehr !== 0) return mehr;
      const za = a.zeit || '';
      const zb = b.zeit || '';
      if (za === zb) return String(a.titel || '').localeCompare(String(b.titel || ''), 'de');
      if (!za) return -1;
      if (!zb) return 1;
      return za < zb ? -1 : 1;
    });
}

/** Was ab heute noch kommt, inklusive laufender Lager. */
export function kommende(termine, heute = isoTag(), grenze = 0) {
  const offen = sortiere(termine).filter(t => {
    const ende = istIsoTag(t.bis) && t.bis > t.von ? t.bis : t.von;
    return ende >= heute;
  });
  return grenze > 0 ? offen.slice(0, grenze) : offen;
}

/* ── Beschriftung ──────────────────────────────────────────────────
   Über Intl, nicht über eine eigene Monatstabelle — CLAUDE.md ist da
   eindeutig, und sieben Sprachen von Hand gehen nicht gut. */

/* globalThis statt window: das Modul soll auch ausserhalb eines
   Browsers laufen, sonst waeren die Tests nur im Browser echt. */
function sprache() {
  return globalThis.window?.TVZAI18n?.lang
    || globalThis.document?.documentElement?.lang
    || 'de-CH';
}

export function zeitraum(termin, locale = sprache()) {
  const von = alsDate(termin?.von);
  if (!von) return '';

  const kurz = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  if (istMehrtaegig(termin)) {
    const bis = alsDate(termin.bis);
    /* Gleicher Monat: "14.–15. Dez" statt "14. Dez – 15. Dez". */
    const gleicherMonat = von.getMonth() === bis.getMonth() && von.getFullYear() === bis.getFullYear();
    return gleicherMonat
      ? `${von.getDate()}.–${kurz.format(bis)}`
      : `${kurz.format(von)} – ${kurz.format(bis)}`;
  }

  return termin.zeit ? `${kurz.format(von)}, ${termin.zeit}` : kurz.format(von);
}

/* ── Brücke zur Tageszusammenfassung ───────────────────────────────
   briefing.js erwartet { titel, start, ganztags }. Ein Lager und ein
   Termin ohne Uhrzeit sind ganztägig — sonst behauptete die
   Zusammenfassung "Heute um 00:00". */
export function alsBriefingTermine(termine, tag = isoTag()) {
  return (Array.isArray(termine) ? termine : [])
    .filter(t => laeuftAm(t, tag))
    .map(t => {
      const ganztags = istMehrtaegig(t) || !t.zeit;
      const zeit = ganztags ? '12:00' : t.zeit;
      return {
        titel: t.titel,
        start: new Date(`${tag}T${zeit}:00`),
        ganztags,
      };
    })
    .filter(t => t.titel && !Number.isNaN(t.start.getTime()));
}

/* ── Prüfung vor dem Schreiben ─────────────────────────────────────
   Dieselben Grenzen wie in firestore.rules. Sie stehen hier noch
   einmal, damit die Oberfläche gar nicht erst etwas anbietet, das die
   Regeln ablehnen würden — nicht als Ersatz dafür. */

export function pruefe(termin) {
  const fehler = [];
  if (!ARTEN.includes(termin?.art)) fehler.push('Unbekannte Terminart.');

  const titel = String(termin?.titel ?? '').trim();
  if (!titel) fehler.push('Der Termin braucht einen Titel.');
  if (titel.length > 120) fehler.push('Der Titel ist zu lang.');

  if (!istIsoTag(termin?.von)) fehler.push('Das Datum fehlt oder ist unlesbar.');
  if (termin?.bis != null && termin.bis !== '') {
    if (!istIsoTag(termin.bis)) fehler.push('Das Enddatum ist unlesbar.');
    else if (termin.bis < termin.von) fehler.push('Das Ende liegt vor dem Anfang.');
  }
  if (termin?.zeit && !/^\d{2}:\d{2}$/.test(termin.zeit)) fehler.push('Die Uhrzeit ist unlesbar.');
  if (termin?.disziplin && !DISZIPLINEN.includes(termin.disziplin)) {
    fehler.push('Unbekannte Disziplin.');
  }
  /* Eine Disziplin an einem Krafttraining wäre nur verwirrend. */
  if (termin?.disziplin && termin.art !== 'rennen') {
    fehler.push('Eine Disziplin gehört zu einem Rennen.');
  }
  return fehler;
}
