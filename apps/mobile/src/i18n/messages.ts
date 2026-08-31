import type { ActiveLocale } from "@labourmarket/client-core";

/**
 * The mobile client's own message catalogue.
 *
 * Small on purpose. The web app's `messages/*.json` catalogues are large,
 * route-shaped and loaded by `next-intl`; a phone shell needs a few dozen
 * strings, and copying thousands of keys across would be a maintenance
 * liability with no reader. When a screen here starts showing product content,
 * that content arrives already translated from the canonical domain — the
 * request carries `Accept-Language`, and the server owns the wording.
 *
 * PARITY IS ENFORCED BY THE COMPILER. `MessageKey` is derived from the English
 * catalogue and every other locale is typed `Record<MessageKey, string>`, so a
 * missing translation is a typecheck failure, not a string that quietly falls
 * back to English on someone's phone.
 *
 * The five locales here are exactly the ACTIVE set (doctrine §2.4 / the web
 * app's `activeLocales`). The other six exist in the platform's catalogues but
 * are not offered to anyone yet, on any client.
 */

const en = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Today",
  "nav.journal": "Work journal",
  "nav.profile": "Profile",
  "nav.settings": "Settings",

  "auth.checking": "Checking your session…",
  "auth.signIn.title": "Sign in",
  "auth.signIn.email": "Email",
  "auth.signIn.password": "Password",
  "auth.signIn.submit": "Sign in",
  "auth.signIn.toRegister": "Create an account",
  "auth.register.title": "Create an account",
  "auth.register.submit": "Create account",
  "auth.register.toSignIn": "I already have an account",
  "auth.error.rejected": "That email and password did not match.",
  "auth.error.unreachable":
    "We could not reach the server, so we do not know whether those details are right. Check your connection and try again.",
  "auth.error.confirmationRequired":
    "Your account was created. Confirm the link in your email, then sign in.",
  "auth.error.notConfigured":
    "This build has no server configuration, so it cannot sign anyone in.",
  "auth.signOut": "Sign out",

  "session.unavailable.title": "We could not check your session",
  "session.unavailable.body":
    "This is not the same as being signed out — your phone's secure storage did not answer. Try again.",
  "session.unavailable.retry": "Try again",

  "config.problem.title": "This build is not configured",
  "config.problem.body":
    "The app cannot start until these values are set. No data has been sent anywhere.",

  "context.title": "You are working as",
  "context.unavailable.title": "We cannot list your contexts yet",
  "context.unavailable.body":
    "The app can sign you in, but it cannot yet read which organizations you belong to. Nothing is missing from your account — this client simply cannot ask yet.",
  "context.mode.worker": "Myself",
  "context.mode.company": "Company",
  "context.mode.agency": "Agency",
  "context.mode.customer": "Customer",

  "language.title": "Language",
  "language.preview": "Preview translation",

  "domain.loading": "Asking the server…",
  "domain.retry": "Try again",
  "domain.failedTitle": "We could not load this",
  "domain.unavailable.notConnectedYet": "Not connected yet",
  "domain.unavailable.signInAgain": "Please sign in again.",
  "domain.unavailable.offline": "No connection. Nothing was sent.",
  "domain.unavailable.unexpectedAnswer":
    "The server answered with something this app did not understand.",
  "domain.refused.no_credentials": "Please sign in again.",
  "domain.refused.invalid_token": "Your session has ended. Please sign in again.",
  "domain.refused.no_profile": "This account has no profile yet.",
  "domain.refused.not_authorized":
    "The server declined this request for this account.",
  "domain.refused.rate_limited":
    "The server asked this app to slow down. Try again in a moment.",
  "domain.refused.capability": "The server declined this request.",
  "domain.refused.identity_unavailable":
    "We could not confirm who you are. This is not a refusal — try again.",

  "today.signedInAs": "Signed in as",
  "today.recentWork": "Recent work",
  "journal.empty": "No Work Journal entries recorded yet.",
  "profile.skillsTitle": "Living CV skills",
  "profile.skillsEmpty": "No skills recorded yet.",
  "profile.noWorkerProfile": "This account has no worker profile yet.",
  "profile.skillVerified": "Verified",
  "profile.skillUnverified": "Unverified",
} as const;

export type MessageKey = keyof typeof en;

type Catalogue = Record<MessageKey, string>;

const lt: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Šiandien",
  "nav.journal": "Darbo dienoraštis",
  "nav.profile": "Profilis",
  "nav.settings": "Nustatymai",

  "auth.checking": "Tikriname jūsų seansą…",
  "auth.signIn.title": "Prisijungti",
  "auth.signIn.email": "El. paštas",
  "auth.signIn.password": "Slaptažodis",
  "auth.signIn.submit": "Prisijungti",
  "auth.signIn.toRegister": "Sukurti paskyrą",
  "auth.register.title": "Sukurti paskyrą",
  "auth.register.submit": "Sukurti paskyrą",
  "auth.register.toSignIn": "Jau turiu paskyrą",
  "auth.error.rejected": "Toks el. paštas ir slaptažodis nesutampa.",
  "auth.error.unreachable":
    "Nepavyko pasiekti serverio, todėl nežinome, ar duomenys teisingi. Patikrinkite ryšį ir bandykite dar kartą.",
  "auth.error.confirmationRequired":
    "Paskyra sukurta. Patvirtinkite nuorodą el. laiške ir tada prisijunkite.",
  "auth.error.notConfigured":
    "Ši versija neturi serverio konfigūracijos, todėl prijungti negali.",
  "auth.signOut": "Atsijungti",

  "session.unavailable.title": "Nepavyko patikrinti jūsų seanso",
  "session.unavailable.body":
    "Tai nereiškia, kad esate atsijungę — telefono saugykla neatsakė. Bandykite dar kartą.",
  "session.unavailable.retry": "Bandyti dar kartą",

  "config.problem.title": "Ši versija nesukonfigūruota",
  "config.problem.body":
    "Programa negali pasileisti, kol nenustatytos šios reikšmės. Jokie duomenys niekur nebuvo išsiųsti.",

  "context.title": "Dirbate kaip",
  "context.unavailable.title": "Kol kas negalime parodyti jūsų kontekstų",
  "context.unavailable.body":
    "Programa gali jus prijungti, bet dar negali nuskaityti, kurioms organizacijoms priklausote. Jūsų paskyroje nieko netrūksta — tiesiog ši programa dar negali to paklausti.",
  "context.mode.worker": "Aš pats",
  "context.mode.company": "Įmonė",
  "context.mode.agency": "Agentūra",
  "context.mode.customer": "Užsakovas",

  "language.title": "Kalba",
  "language.preview": "Peržiūros vertimas",

  "domain.loading": "Klausiame serverio…",
  "domain.retry": "Bandyti dar kartą",
  "domain.failedTitle": "Nepavyko įkelti",
  "domain.unavailable.notConnectedYet": "Dar neprijungta",
  "domain.unavailable.signInAgain": "Prisijunkite iš naujo.",
  "domain.unavailable.offline": "Nėra ryšio. Niekas nebuvo išsiųsta.",
  "domain.unavailable.unexpectedAnswer":
    "Serveris atsakė tuo, ko ši programa nesuprato.",
  "domain.refused.no_credentials": "Prisijunkite iš naujo.",
  "domain.refused.invalid_token": "Jūsų seansas baigėsi. Prisijunkite iš naujo.",
  "domain.refused.no_profile": "Ši paskyra dar neturi profilio.",
  "domain.refused.not_authorized":
    "Serveris atmetė šią užklausą šiai paskyrai.",
  "domain.refused.rate_limited":
    "Serveris paprašė programos sulėtėti. Bandykite po akimirkos.",
  "domain.refused.capability": "Serveris atmetė šią užklausą.",
  "domain.refused.identity_unavailable":
    "Nepavyko patvirtinti, kas esate. Tai nėra atsisakymas — bandykite dar kartą.",

  "today.signedInAs": "Prisijungta kaip",
  "today.recentWork": "Naujausi darbai",
  "journal.empty": "Darbo dienoraštyje dar nėra įrašų.",
  "profile.skillsTitle": "Gyvojo CV įgūdžiai",
  "profile.skillsEmpty": "Įgūdžių dar neužfiksuota.",
  "profile.noWorkerProfile": "Ši paskyra dar neturi darbuotojo profilio.",
  "profile.skillVerified": "Patvirtinta",
  "profile.skillUnverified": "Nepatvirtinta",
};

const ru: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Сегодня",
  "nav.journal": "Дневник работы",
  "nav.profile": "Профиль",
  "nav.settings": "Настройки",

  "auth.checking": "Проверяем вашу сессию…",
  "auth.signIn.title": "Вход",
  "auth.signIn.email": "Электронная почта",
  "auth.signIn.password": "Пароль",
  "auth.signIn.submit": "Войти",
  "auth.signIn.toRegister": "Создать аккаунт",
  "auth.register.title": "Создать аккаунт",
  "auth.register.submit": "Создать аккаунт",
  "auth.register.toSignIn": "У меня уже есть аккаунт",
  "auth.error.rejected": "Такая почта и пароль не совпадают.",
  "auth.error.unreachable":
    "Не удалось связаться с сервером, поэтому мы не знаем, верны ли данные. Проверьте соединение и попробуйте снова.",
  "auth.error.confirmationRequired":
    "Аккаунт создан. Подтвердите ссылку в письме, затем войдите.",
  "auth.error.notConfigured":
    "В этой сборке нет настроек сервера, поэтому вход невозможен.",
  "auth.signOut": "Выйти",

  "session.unavailable.title": "Не удалось проверить вашу сессию",
  "session.unavailable.body":
    "Это не значит, что вы вышли, — защищённое хранилище телефона не ответило. Попробуйте снова.",
  "session.unavailable.retry": "Попробовать снова",

  "config.problem.title": "Эта сборка не настроена",
  "config.problem.body":
    "Приложение не запустится, пока не заданы эти значения. Никакие данные никуда не отправлялись.",

  "context.title": "Вы работаете как",
  "context.unavailable.title": "Пока мы не можем показать ваши контексты",
  "context.unavailable.body":
    "Приложение может вас авторизовать, но пока не может прочитать, к каким организациям вы относитесь. В вашем аккаунте ничего не пропало — это приложение просто ещё не может об этом спросить.",
  "context.mode.worker": "Я сам",
  "context.mode.company": "Компания",
  "context.mode.agency": "Агентство",
  "context.mode.customer": "Заказчик",

  "language.title": "Язык",
  "language.preview": "Предварительный перевод",

  "domain.loading": "Спрашиваем сервер…",
  "domain.retry": "Попробовать снова",
  "domain.failedTitle": "Не удалось загрузить",
  "domain.unavailable.notConnectedYet": "Пока не подключено",
  "domain.unavailable.signInAgain": "Войдите снова.",
  "domain.unavailable.offline": "Нет соединения. Ничего не отправлено.",
  "domain.unavailable.unexpectedAnswer":
    "Сервер ответил тем, чего это приложение не поняло.",
  "domain.refused.no_credentials": "Войдите снова.",
  "domain.refused.invalid_token": "Ваша сессия закончилась. Войдите снова.",
  "domain.refused.no_profile": "У этого аккаунта пока нет профиля.",
  "domain.refused.not_authorized":
    "Сервер отклонил этот запрос для этого аккаунта.",
  "domain.refused.rate_limited":
    "Сервер попросил приложение замедлиться. Попробуйте чуть позже.",
  "domain.refused.capability": "Сервер отклонил этот запрос.",
  "domain.refused.identity_unavailable":
    "Не удалось подтвердить, кто вы. Это не отказ — попробуйте снова.",

  "today.signedInAs": "Вы вошли как",
  "today.recentWork": "Недавняя работа",
  "journal.empty": "В дневнике работы пока нет записей.",
  "profile.skillsTitle": "Навыки живого CV",
  "profile.skillsEmpty": "Навыки пока не записаны.",
  "profile.noWorkerProfile": "У этого аккаунта пока нет профиля работника.",
  "profile.skillVerified": "Подтверждено",
  "profile.skillUnverified": "Не подтверждено",
};

const nl: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Vandaag",
  "nav.journal": "Werkdagboek",
  "nav.profile": "Profiel",
  "nav.settings": "Instellingen",

  "auth.checking": "We controleren je sessie…",
  "auth.signIn.title": "Inloggen",
  "auth.signIn.email": "E-mailadres",
  "auth.signIn.password": "Wachtwoord",
  "auth.signIn.submit": "Inloggen",
  "auth.signIn.toRegister": "Account aanmaken",
  "auth.register.title": "Account aanmaken",
  "auth.register.submit": "Account aanmaken",
  "auth.register.toSignIn": "Ik heb al een account",
  "auth.error.rejected": "Dit e-mailadres en wachtwoord komen niet overeen.",
  "auth.error.unreachable":
    "We konden de server niet bereiken, dus we weten niet of deze gegevens kloppen. Controleer je verbinding en probeer het opnieuw.",
  "auth.error.confirmationRequired":
    "Je account is aangemaakt. Bevestig de link in je e-mail en log daarna in.",
  "auth.error.notConfigured":
    "Deze versie heeft geen serverconfiguratie en kan daarom niemand inloggen.",
  "auth.signOut": "Uitloggen",

  "session.unavailable.title": "We konden je sessie niet controleren",
  "session.unavailable.body":
    "Dit betekent niet dat je bent uitgelogd — de beveiligde opslag van je telefoon gaf geen antwoord. Probeer het opnieuw.",
  "session.unavailable.retry": "Opnieuw proberen",

  "config.problem.title": "Deze versie is niet geconfigureerd",
  "config.problem.body":
    "De app kan niet starten totdat deze waarden zijn ingesteld. Er zijn geen gegevens verstuurd.",

  "context.title": "Je werkt als",
  "context.unavailable.title": "We kunnen je contexten nog niet tonen",
  "context.unavailable.body":
    "De app kan je inloggen, maar kan nog niet lezen bij welke organisaties je hoort. Er ontbreekt niets in je account — deze client kan het alleen nog niet opvragen.",
  "context.mode.worker": "Mijzelf",
  "context.mode.company": "Bedrijf",
  "context.mode.agency": "Bureau",
  "context.mode.customer": "Opdrachtgever",

  "language.title": "Taal",
  "language.preview": "Voorlopige vertaling",

  "domain.loading": "We vragen het aan de server…",
  "domain.retry": "Opnieuw proberen",
  "domain.failedTitle": "Dit kon niet worden geladen",
  "domain.unavailable.notConnectedYet": "Nog niet verbonden",
  "domain.unavailable.signInAgain": "Log opnieuw in.",
  "domain.unavailable.offline": "Geen verbinding. Er is niets verstuurd.",
  "domain.unavailable.unexpectedAnswer":
    "De server gaf een antwoord dat deze app niet begreep.",
  "domain.refused.no_credentials": "Log opnieuw in.",
  "domain.refused.invalid_token": "Je sessie is verlopen. Log opnieuw in.",
  "domain.refused.no_profile": "Dit account heeft nog geen profiel.",
  "domain.refused.not_authorized":
    "De server weigerde dit verzoek voor dit account.",
  "domain.refused.rate_limited":
    "De server vroeg deze app om te vertragen. Probeer het zo opnieuw.",
  "domain.refused.capability": "De server weigerde dit verzoek.",
  "domain.refused.identity_unavailable":
    "We konden niet bevestigen wie je bent. Dit is geen weigering — probeer het opnieuw.",

  "today.signedInAs": "Ingelogd als",
  "today.recentWork": "Recent werk",
  "journal.empty": "Nog geen werkdagboek-items vastgelegd.",
  "profile.skillsTitle": "Living CV-vaardigheden",
  "profile.skillsEmpty": "Nog geen vaardigheden vastgelegd.",
  "profile.noWorkerProfile": "Dit account heeft nog geen werkersprofiel.",
  "profile.skillVerified": "Geverifieerd",
  "profile.skillUnverified": "Niet geverifieerd",
};

const de: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Heute",
  "nav.journal": "Arbeitstagebuch",
  "nav.profile": "Profil",
  "nav.settings": "Einstellungen",

  "auth.checking": "Wir prüfen deine Sitzung…",
  "auth.signIn.title": "Anmelden",
  "auth.signIn.email": "E-Mail",
  "auth.signIn.password": "Passwort",
  "auth.signIn.submit": "Anmelden",
  "auth.signIn.toRegister": "Konto erstellen",
  "auth.register.title": "Konto erstellen",
  "auth.register.submit": "Konto erstellen",
  "auth.register.toSignIn": "Ich habe bereits ein Konto",
  "auth.error.rejected": "Diese E-Mail und dieses Passwort passen nicht zusammen.",
  "auth.error.unreachable":
    "Wir konnten den Server nicht erreichen und wissen daher nicht, ob die Angaben stimmen. Prüfe deine Verbindung und versuche es erneut.",
  "auth.error.confirmationRequired":
    "Dein Konto wurde erstellt. Bestätige den Link in deiner E-Mail und melde dich dann an.",
  "auth.error.notConfigured":
    "Diese Version hat keine Serverkonfiguration und kann daher niemanden anmelden.",
  "auth.signOut": "Abmelden",

  "session.unavailable.title": "Wir konnten deine Sitzung nicht prüfen",
  "session.unavailable.body":
    "Das heißt nicht, dass du abgemeldet bist — der sichere Speicher deines Telefons hat nicht geantwortet. Versuche es erneut.",
  "session.unavailable.retry": "Erneut versuchen",

  "config.problem.title": "Diese Version ist nicht konfiguriert",
  "config.problem.body":
    "Die App kann erst starten, wenn diese Werte gesetzt sind. Es wurden keine Daten gesendet.",

  "context.title": "Du arbeitest als",
  "context.unavailable.title": "Wir können deine Kontexte noch nicht anzeigen",
  "context.unavailable.body":
    "Die App kann dich anmelden, aber noch nicht lesen, zu welchen Organisationen du gehörst. In deinem Konto fehlt nichts — dieser Client kann nur noch nicht danach fragen.",
  "context.mode.worker": "Ich selbst",
  "context.mode.company": "Unternehmen",
  "context.mode.agency": "Agentur",
  "context.mode.customer": "Auftraggeber",

  "language.title": "Sprache",
  "language.preview": "Vorläufige Übersetzung",

  "domain.loading": "Wir fragen den Server…",
  "domain.retry": "Erneut versuchen",
  "domain.failedTitle": "Konnte nicht geladen werden",
  "domain.unavailable.notConnectedYet": "Noch nicht verbunden",
  "domain.unavailable.signInAgain": "Bitte melde dich erneut an.",
  "domain.unavailable.offline": "Keine Verbindung. Es wurde nichts gesendet.",
  "domain.unavailable.unexpectedAnswer":
    "Der Server hat mit etwas geantwortet, das diese App nicht verstanden hat.",
  "domain.refused.no_credentials": "Bitte melde dich erneut an.",
  "domain.refused.invalid_token":
    "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
  "domain.refused.no_profile": "Dieses Konto hat noch kein Profil.",
  "domain.refused.not_authorized":
    "Der Server hat diese Anfrage für dieses Konto abgelehnt.",
  "domain.refused.rate_limited":
    "Der Server hat diese App gebeten, langsamer zu machen. Versuche es gleich erneut.",
  "domain.refused.capability": "Der Server hat diese Anfrage abgelehnt.",
  "domain.refused.identity_unavailable":
    "Wir konnten nicht bestätigen, wer du bist. Das ist keine Ablehnung — versuche es erneut.",

  "today.signedInAs": "Angemeldet als",
  "today.recentWork": "Aktuelle Arbeit",
  "journal.empty": "Noch keine Einträge im Arbeitstagebuch.",
  "profile.skillsTitle": "Living-CV-Fähigkeiten",
  "profile.skillsEmpty": "Noch keine Fähigkeiten erfasst.",
  "profile.noWorkerProfile": "Dieses Konto hat noch kein Arbeiterprofil.",
  "profile.skillVerified": "Bestätigt",
  "profile.skillUnverified": "Unbestätigt",
};

export const MESSAGES: Record<ActiveLocale, Catalogue> = { en, lt, ru, nl, de };

export const LANGUAGE_NAMES: Record<ActiveLocale, string> = {
  // Each language named in itself — a person looking for their own language
  // recognises it faster than a translated label.
  lt: "Lietuvių",
  en: "English",
  ru: "Русский",
  nl: "Nederlands",
  de: "Deutsch",
};
