# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

TVZA is a private family web app (dashboard, calendar/reminders, Maturaarbeit
tracker, food tracker, ski tracker, watchlist, weather, DMs). It is Timo's
project; Michel builds and hosts it. The UI language is **German** — all
user-facing strings, and commit messages, are written in German.

Current version: **v.31.2.6**. Remote: `TI30x/tvza-app`, branch `main`.

## Architecture — read this before suggesting tooling

- **Static site, no build step.** Plain HTML + ES modules + CSS. There is no
  bundler, no framework, no `npm run build`. `index.html` is ~108 kB with the
  app logic in an inline `<script type="module">`. Do not propose migrating to
  React/Vite/TypeScript unless explicitly asked.
- **Hosted on GitHub Pages** (`.nojekyll` at the root). Deploy = push to `main`.
- **Firebase on the free Spark tier.** This is a hard budget constraint, not an
  oversight. **No Cloud Functions, no Firebase Extensions, no Blaze-only
  features.** `mailer/` exists to hold any server-side logic Spark can't run —
  but there is currently no VPS or other host running it, so nothing drains
  the `mail` collection today (see Commands below).
- **Shared code lives in `assets/js/`**, feature pages in `pages/`, tests and
  the style guide in `dev/` (nothing in `dev/` ships).

See `README.md` for the full Firestore data model — it is accurate and detailed;
don't duplicate it here.

## Commands

Run tests from the repo root:

```bash
cd dev
npm install                                        # first time only (jsdom)
node --experimental-vm-modules --test *.test.mjs
```

The `--experimental-vm-modules` flag is required by `html-module-syntax.test.mjs`.
`itinerary.test.mjs` is the slow one (jsdom); the other 15 files run in ~2 s and
total 73 tests. All should pass before any commit.

Firestore rules — validate against the emulator:

```bash
cd validation
firebase emulators:start --only firestore
```

Deploy the rules:

```bash
firebase deploy --only firestore:rules --project <project-id>
```

Mail worker — **not currently running anywhere.** `mailer/README.md` documents
a PM2-on-a-Hostinger-VPS setup, but no such VPS exists; invitation emails are
confirmed not being delivered. The commands below are what to run *if* a host
is provisioned, not a description of current state:

```bash
pm2 restart tvza-mailer && pm2 logs tvza-mailer
```

## Traps specific to this repo

**1. Firestore rules drift.** The rules have historically been deployed by
pasting into the Firebase Console, so the live copy and `firestore.rules` in git
drift apart. This has already caused a silent production outage — the live rules
were missing the whole `users/{uid}/maturaProgress/{progressId}` block, so
Maturaarbeit progress sync was denied for days with no error surfaced.

Never assume the deployed rules match the file. When auditing security, diff the
live rules against `git show HEAD:firestore.rules` first. Prefer
`firebase deploy --only firestore:rules` over manual pasting — using the CLI is
the actual fix for this class of bug.

**2. Version bumps are two files.** `APP_VERSION` in `assets/js/ui-fx.js` and
`const CACHE` in `sw.js` must always match. A test in
`dev/security-model.test.mjs` enforces it. Bump both on **every** change to a
shell file (`index.html`, `login.html`, anything in `assets/`) or returning
users get a stale service-worker cache.

**3. Security rules are the source of truth, not the UI.** Membership,
per-calendar-group isolation, and single-use invites are all enforced in
`firestore.rules` — e.g. `inviteIsValid` requires `!existsAfter(...)` on the
invite doc so the code is atomically consumed. `dev/security-model.test.mjs` and
`dev/rules-regression.test.mjs` assert these invariants statically. If you change
the rules, update those tests in the same commit.

**4. Guest vs. member.** A Firebase login alone is not membership. `isMember()`
requires a `users/{uid}` profile, absence of a `guestProfiles/{uid}` doc, and —
only when `config/tvza.requireEmailVerification` is true — a verified email.
Note this is deliberately **fail-open**: if `config/tvza` doesn't exist,
verification is not required. That's the intended beta default.

**5. Was ein Bereich ist.** A Bereich qualifies when all five are true. This
is the gate for every future feature, and it is what stops the app from
becoming eleven modules again.

1. **Self-contained.** It works with no other module switched on. No
   cross-module dependency.
2. **Off by default** for new accounts. The Kern is the only thing that is on.
3. **One place only.** If it has a tab it does not also appear in the Heute
   list (the old handoff's "eine Sache, ein Ort" rule — it stands, and it is
   right).
4. **Day-one test.** A brand-new empty account opens it and sees an obvious
   first action, in one tap, with no setup. If the answer is "an empty
   screen", it is not ready to be public — it is ready to be `Persönlich`.
5. **One icon plate colour** from the palette, one entry in the Bereiche
   list, one row in the desktop sidebar. Nothing gets a second surface.

**6. Seiten-Invariante.** A page file contains markup, `<link>`s, and one
`<script type="module" src="…">`. No `<style>` block, no inline module, no
`style="…"`, no hex colour, no emoji as a function symbol.

## Known open items

- `APP_CHECK_SITE_KEY` in `assets/js/app-check-config.js` is still `''`, so App
  Check is prepped but not enforced. Free on Spark; worth finishing before wider
  beta distribution.
- The login lockout in `assets/js/auth-security.js` is localStorage-only
  (5 attempts / 15 min). It is UX friction, **not** brute-force protection — it
  is trivially bypassed by clearing storage or switching browsers. Firebase's
  server-side throttling plus App Check are the real defence.
- No 2FA/MFA anywhere. SMS 2FA needs Identity Platform (paid), so this is
  deferred rather than forgotten.
- `mailer/worker.js` reads the **entire** `mail` collection every poll and
  filters in JS, because `index.html` enqueues docs with no `delivery` field to
  query on. Fine at current volume; fix by writing
  `delivery: { state: 'PENDING', attempts: 0 }` at enqueue time and querying
  with a `.limit()`.

## Conventions

- German for UI strings, comments in the rules file, and commit messages.
  Feature commits use the form `v.31.2.0: <German summary>`.
- Secrets never enter the repo: `mailer/.env` and all `*service-account*.json`
  are gitignored. The reCAPTCHA site key is public and safe to commit.
- Every behavioural change gets a test in `dev/`. That suite is the main safety
  net given there's no type checker and no build step.

## Mehrsprachigkeit (seit v.32.0.0)

Die Oberfläche gibt es in sieben Sprachen: de, en, fr, it, pl, nl, es.

- **Quelle sind die Tabellen in `dev/i18n-src/`:** `catalog.py` für Hülle,
  Navigation und Einstellungen, `catalog_pages*.py` für die Bereichsseiten.
  Alle haben dieselbe Form — Schlüssel auf ein Tupel `(de, en, fr, it, pl, nl,
  es)`. `python3 dev/i18n-src/build.py` führt sie zusammen und erzeugt
  `assets/i18n/<lang>.json`. Die JSON-Dateien werden mitversioniert — die App
  hat weiterhin keinen Build-Schritt, das Skript läuft nur, wenn jemand am
  Katalog arbeitet. Doppelte Schlüssel über zwei Tabellen brechen den Build.
- **Schlüssel ins Markup setzen:** `python3 dev/i18n-src/apply_keys.py [seite …]`
  annotiert Elemente, deren Inhalt reiner Text ist und genau einer deutschen
  Beschriftung entspricht. `<script>` und `<style>` bleiben unberührt. Jede
  Seite bekommt nur ihre eigenen Namensräume zugestanden — darum darf „Datum"
  auf der Ski-Seite `ski.datum` und im Kalender `cal.datum` sein. Danach immer
  gegenprüfen, dass wirklich nur Attribute dazugekommen sind (Tag-Folge und
  sichtbarer Text müssen identisch bleiben).
- **UI-Strings sind Schlüssel, `de.json` ist die Quelle.** Die alte Regel
  „UI-Strings sind deutsch" gilt für neue Texte nicht mehr. Kommentare und
  Commit-Messages bleiben deutsch.
- **Markup-Verträge:** `data-i18n="key"` für Text, `data-i18n-html` nur wo
  Markup im String steckt, `data-i18n-attr="aria-label:key;title:key2"` für
  Attribute, `data-i18n-vars='{"n":3}'` für Platzhalter.
- **Additiv:** `assets/js/i18n.js` übersetzt ausschliesslich Elemente mit
  `data-i18n`. Eine Seite ohne diese Attribute läuft unverändert weiter und
  zeigt ihr deutsches Markup. Deshalb kann eine halb umgestellte Seite nichts
  kaputt machen — was fehlt, bleibt deutsch.
- **Inhalte werden nicht übersetzt.** Termine, Nachrichten, Projektnamen und
  die Übungsnamen aus dem Excel-Import gehören den Nutzern und bleiben so,
  wie sie eingegeben wurden.
- **Formate über `Intl`,** nie über Strings: `TVZAI18n.format.date/time/
  number/relative/plural`. Polnisch hat drei Pluralformen — von Hand geht das
  nicht gut.
- **Persistenz:** `localStorage['tvza-lang']` trägt die Wahl auf dem Gerät,
  `users/{uid}.lang` über Geräte hinweg. Ohne eigene Wahl folgt die App
  `navigator.language`.
- **`dev/i18n.test.mjs`** prüft, dass alle sieben Dateien denselben
  Schlüsselsatz haben, dass kein `data-i18n` ins Leere zeigt und dass die
  Kataloge im Service-Worker-Vorrat stehen. Nach jeder Katalog-Änderung
  laufen lassen.

**Bekannter Zustand:** `dev/training-ui.test.mjs` hängt auf diesem Rechner
schon vor dieser Änderung — auch auf einem sauberen Klon von `HEAD`. Der Test
kommt über `TAP version 13` nicht hinaus. Das ist unabhängig von der
Mehrsprachigkeit und sollte separat angeschaut werden.
