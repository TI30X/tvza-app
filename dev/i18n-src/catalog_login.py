# -*- coding: utf-8 -*-
"""Die Anmeldeseite — die Haustuer.

Reihenfolge je Zeile: de, en, fr, it, pl, nl, es.
Erzeugt wird daraus assets/i18n/*.json:

    node dev/i18n-src/build.mjs

Zwei Dinge, die hier anders gewichtet sind als sonst.

Erstens die Fehlermeldungen. Sie sagen absichtlich WENIG: eine
einzige Meldung fuer jeden falschen Zugang, egal ob die Adresse
unbekannt oder das Passwort falsch ist. Wer beides unterscheidet,
verraet Fremden, welche Adressen ein Konto haben. Diese Zurueckhaltung
muss in jeder Sprache erhalten bleiben — eine hilfsbereitere
Uebersetzung waere hier ein Sicherheitsfehler.

Zweitens der Name. Auf der Seite steht jetzt das Wortzeichen und
nicht mehr "TVZA": wer von der Willkommen-Seite kommt, hat gerade
Firn gesehen. TVZA bleibt der Absender, das Produkt heisst Firn — und
darum kommt in diesen Texten keiner von beiden Namen mehr vor. Ein
Produktname in einem Satz muss bei jeder Umbenennung in sieben
Sprachen nachgezogen werden.
"""

KEYS = {
# ── Ueberschriften und Beschriftungen ─────────────────────────────
'login.titel': ('Anmelden — Firn', 'Sign in — Firn', 'Connexion — Firn',
                'Accedi — Firn', 'Logowanie — Firn', 'Inloggen — Firn',
                'Iniciar sesión — Firn'),

'login.subAn': ('Willkommen zurück! Melde dich an.',
                'Welcome back. Sign in.',
                'Bon retour. Connecte-toi.',
                'Bentornato. Accedi.',
                'Witaj z powrotem. Zaloguj się.',
                'Welkom terug. Log in.',
                'Bienvenido de nuevo. Inicia sesión.'),
'login.subNeu': ('Erstelle dein Konto. Ein Einladungscode ist optional.',
                 'Create your account. An invitation code is optional.',
                 "Crée ton compte. Un code d'invitation est facultatif.",
                 'Crea il tuo account. Un codice di invito è facoltativo.',
                 'Załóż konto. Kod zaproszenia jest opcjonalny.',
                 'Maak je account aan. Een uitnodigingscode is optioneel.',
                 'Crea tu cuenta. El código de invitación es opcional.'),

'login.name': ('Dein Name', 'Your name', 'Ton nom', 'Il tuo nome',
               'Twoje imię', 'Je naam', 'Tu nombre'),
'login.namePh': ('z.B. Timo', 'e.g. Timo', 'p. ex. Timo', 'es. Timo',
                 'np. Timo', 'bijv. Timo', 'p. ej. Timo'),

'login.code': ('Einladungscode (optional)', 'Invitation code (optional)',
               "Code d'invitation (facultatif)", 'Codice di invito (facoltativo)',
               'Kod zaproszenia (opcjonalnie)', 'Uitnodigingscode (optioneel)',
               'Código de invitación (opcional)'),
'login.codePh': ('Nur für eine direkte Gruppeneinladung',
                 'Only for a direct group invitation',
                 "Uniquement pour une invitation directe à un groupe",
                 'Solo per un invito diretto a un gruppo',
                 'Tylko przy bezpośrednim zaproszeniu do grupy',
                 'Alleen voor een directe groepsuitnodiging',
                 'Solo para una invitación directa a un grupo'),
'login.codeHinweis': ('Ohne Code erhältst du ein persönliches Konto. Ein Code nimmt dich direkt in eine Gruppe auf.',
                      'Without a code you get a personal account. A code puts you straight into a group.',
                      "Sans code, tu obtiens un compte personnel. Un code te fait entrer directement dans un groupe.",
                      'Senza codice ottieni un account personale. Un codice ti inserisce direttamente in un gruppo.',
                      'Bez kodu dostajesz konto osobiste. Kod od razu dodaje cię do grupy.',
                      'Zonder code krijg je een persoonlijk account. Met een code kom je meteen in een groep.',
                      'Sin código obtienes una cuenta personal. Un código te mete directamente en un grupo.'),

'login.mail': ('E-Mail', 'Email', 'E-mail', 'E-mail',
               'E-mail', 'E-mail', 'Correo electrónico'),
'login.mailPh': ('deine@email.com', 'you@email.com', 'toi@email.com',
                 'tu@email.com', 'ty@email.com', 'jij@email.com',
                 'tu@email.com'),

'login.pass': ('Passwort', 'Password', 'Mot de passe', 'Password',
               'Hasło', 'Wachtwoord', 'Contraseña'),
'login.passPh': ('mind. 6 Zeichen', 'at least 6 characters',
                 '6 caractères minimum', 'almeno 6 caratteri',
                 'min. 6 znaków', 'min. 6 tekens', 'mín. 6 caracteres'),

# ── Knoepfe und Moduswechsel ──────────────────────────────────────
'login.anmelden': ('Anmelden', 'Sign in', 'Se connecter', 'Accedi',
                   'Zaloguj się', 'Inloggen', 'Iniciar sesión'),
'login.registrieren': ('Registrieren', 'Register', "S'inscrire", 'Registrati',
                       'Zarejestruj się', 'Registreren', 'Registrarse'),
'login.keinKonto': ('Noch kein Konto?', 'No account yet?', 'Pas encore de compte ?',
                    'Non hai ancora un account?', 'Nie masz jeszcze konta?',
                    'Nog geen account?', '¿Aún no tienes cuenta?'),
'login.schonKonto': ('Schon ein Konto?', 'Already have an account?',
                     'Déjà un compte ?', 'Hai già un account?',
                     'Masz już konto?', 'Al een account?',
                     '¿Ya tienes cuenta?'),
'login.warten': ('Bitte warten…', 'Please wait…', 'Patiente…', 'Attendi…',
                 'Chwileczkę…', 'Even wachten…', 'Un momento…'),

# ── Meldungen, die gut ausgehen ───────────────────────────────────
'login.mailBestaetigt': ('E-Mail bestätigt. Du kannst dich jetzt anmelden.',
                         'Email confirmed. You can sign in now.',
                         'E-mail confirmé. Tu peux maintenant te connecter.',
                         'E-mail confermata. Ora puoi accedere.',
                         'E-mail potwierdzony. Możesz się teraz zalogować.',
                         'E-mail bevestigd. Je kunt nu inloggen.',
                         'Correo confirmado. Ya puedes iniciar sesión.'),
'login.kontoErstellt': ('Konto erstellt. Bitte öffne jetzt den Bestätigungslink in deiner E-Mail. Erst danach kannst du dich anmelden.',
                        'Account created. Open the confirmation link in your email — only then can you sign in.',
                        "Compte créé. Ouvre le lien de confirmation dans ton e-mail : c'est seulement après que tu pourras te connecter.",
                        "Account creato. Apri il link di conferma nella tua e-mail: solo dopo potrai accedere.",
                        'Konto założone. Otwórz link potwierdzający w e-mailu — dopiero potem możesz się zalogować.',
                        'Account aangemaakt. Open de bevestigingslink in je e-mail — pas daarna kun je inloggen.',
                        'Cuenta creada. Abre el enlace de confirmación en tu correo: solo entonces podrás iniciar sesión.'),

# ── Meldungen, die schlecht ausgehen ──────────────────────────────
# login.fehler.anmelden ist absichtlich unbestimmt. Wer "unbekannte
# Adresse" von "falsches Passwort" unterscheidet, verraet Fremden,
# welche Adressen ein Konto haben. Bitte in keiner Sprache
# hilfsbereiter machen.
'login.fehler.anmelden': ('Anmeldung nicht möglich. Prüfe E-Mail und Passwort.',
                          'Sign-in failed. Check your email and password.',
                          "Connexion impossible. Vérifie ton e-mail et ton mot de passe.",
                          "Accesso non riuscito. Controlla e-mail e password.",
                          'Logowanie nieudane. Sprawdź e-mail i hasło.',
                          'Inloggen mislukt. Controleer je e-mail en wachtwoord.',
                          'No se pudo iniciar sesión. Revisa el correo y la contraseña.'),
'login.fehler.registrieren': ('Konto konnte nicht erstellt werden. Prüfe Einladung, E-Mail und Passwort.',
                              'The account could not be created. Check the invitation, email and password.',
                              "Impossible de créer le compte. Vérifie l'invitation, l'e-mail et le mot de passe.",
                              "Impossibile creare l'account. Controlla invito, e-mail e password.",
                              'Nie udało się założyć konta. Sprawdź zaproszenie, e-mail i hasło.',
                              'Het account kon niet worden aangemaakt. Controleer uitnodiging, e-mail en wachtwoord.',
                              'No se pudo crear la cuenta. Revisa la invitación, el correo y la contraseña.'),
'login.fehler.netz': ('Keine Internetverbindung. Bitte versuche es erneut.',
                      'No internet connection. Please try again.',
                      "Pas de connexion internet. Réessaie.",
                      'Nessuna connessione a internet. Riprova.',
                      'Brak połączenia z internetem. Spróbuj ponownie.',
                      'Geen internetverbinding. Probeer het opnieuw.',
                      'Sin conexión a internet. Inténtalo de nuevo.'),
'login.fehler.schwach': ('Bitte verwende ein Passwort mit mindestens 6 Zeichen.',
                         'Please use a password of at least 6 characters.',
                         'Utilise un mot de passe de 6 caractères minimum.',
                         'Usa una password di almeno 6 caratteri.',
                         'Użyj hasła o długości co najmniej 6 znaków.',
                         'Gebruik een wachtwoord van minstens 6 tekens.',
                         'Usa una contraseña de al menos 6 caracteres.'),
'login.fehler.code': ('Dieser Einladungscode passt nicht zu dieser E-Mail.',
                      'This invitation code does not match this email address.',
                      "Ce code d'invitation ne correspond pas à cette adresse e-mail.",
                      'Questo codice di invito non corrisponde a questa e-mail.',
                      'Ten kod zaproszenia nie pasuje do tego adresu e-mail.',
                      'Deze uitnodigingscode hoort niet bij dit e-mailadres.',
                      'Este código de invitación no corresponde a este correo.'),
'login.fehler.gesperrt': ('Zu viele fehlgeschlagene Versuche. Bitte warte 15 Minuten und versuche es dann erneut.',
                          'Too many failed attempts. Please wait 15 minutes and try again.',
                          "Trop de tentatives échouées. Attends 15 minutes puis réessaie.",
                          'Troppi tentativi falliti. Aspetta 15 minuti e riprova.',
                          'Zbyt wiele nieudanych prób. Odczekaj 15 minut i spróbuj ponownie.',
                          'Te veel mislukte pogingen. Wacht 15 minuten en probeer het opnieuw.',
                          'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.'),
'login.fehler.leer': ('Bitte E-Mail und Passwort eingeben.',
                      'Please enter your email and password.',
                      'Saisis ton e-mail et ton mot de passe.',
                      'Inserisci e-mail e password.',
                      'Podaj e-mail i hasło.',
                      'Vul je e-mail en wachtwoord in.',
                      'Introduce el correo y la contraseña.'),
'login.fehler.name': ('Bitte deinen Namen eingeben.', 'Please enter your name.',
                      'Saisis ton nom.', 'Inserisci il tuo nome.',
                      'Podaj swoje imię.', 'Vul je naam in.',
                      'Introduce tu nombre.'),
'login.fehler.keinProfil': ('Für dieses Konto gibt es noch kein Profil.',
                            'There is no profile for this account yet.',
                            "Il n'y a pas encore de profil pour ce compte.",
                            'Per questo account non esiste ancora un profilo.',
                            'Dla tego konta nie ma jeszcze profilu.',
                            'Voor dit account bestaat nog geen profiel.',
                            'Todavía no hay un perfil para esta cuenta.'),
'login.fehler.mailZuerst': ('Bitte bestätige zuerst deine E-Mail-Adresse.',
                            'Please confirm your email address first.',
                            "Confirme d'abord ton adresse e-mail.",
                            'Conferma prima il tuo indirizzo e-mail.',
                            'Najpierw potwierdź swój adres e-mail.',
                            'Bevestig eerst je e-mailadres.',
                            'Confirma primero tu dirección de correo.'),
'login.fehler.mailUnbestaetigt': ('Bitte bestätige zuerst deine E-Mail-Adresse. Der Bestätigungslink wurde bei der Registrierung verschickt.',
                                  'Please confirm your email address first. The confirmation link was sent when you registered.',
                                  "Confirme d'abord ton adresse e-mail. Le lien de confirmation a été envoyé lors de l'inscription.",
                                  "Conferma prima il tuo indirizzo e-mail. Il link di conferma è stato inviato al momento della registrazione.",
                                  'Najpierw potwierdź swój adres e-mail. Link potwierdzający wysłaliśmy przy rejestracji.',
                                  'Bevestig eerst je e-mailadres. De bevestigingslink is bij de registratie verstuurd.',
                                  'Confirma primero tu dirección de correo. El enlace de confirmación se envió al registrarte.'),
'login.fehler.mailErneut': ('Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir erneut einen Bestätigungslink geschickt.',
                            'Please confirm your email address first. We have sent you another confirmation link.',
                            "Confirme d'abord ton adresse e-mail. Nous t'avons renvoyé un lien de confirmation.",
                            'Conferma prima il tuo indirizzo e-mail. Ti abbiamo inviato un nuovo link di conferma.',
                            'Najpierw potwierdź swój adres e-mail. Wysłaliśmy ci kolejny link potwierdzający.',
                            'Bevestig eerst je e-mailadres. We hebben je opnieuw een bevestigingslink gestuurd.',
                            'Confirma primero tu dirección de correo. Te hemos enviado otro enlace de confirmación.'),
}
