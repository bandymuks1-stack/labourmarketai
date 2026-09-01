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

  "route.notFound.title": "That screen is not in this app",
  "route.notFound.body":
    "The link you followed does not lead anywhere here. It may be for the website, or it may be out of date. Nothing was sent anywhere.",
  "route.notFound.action": "Back to the app",

  "crash.title": "The app hit a fault",
  "crash.body":
    "This is a fault in the app itself, not something you did, and nothing was sent anywhere. Try again — if it keeps happening, close the app and reopen it.",

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
  "journal.logWork": "Log work",
  "journal.compose.title": "Log work",
  "journal.compose.intro":
    "Write what you did, in your own words. Your Work Journal records exactly what you write.",
  "journal.compose.date": "Date of the work",
  "journal.compose.dateHint": "Year-month-day, for example 2026-09-01",
  "journal.compose.today": "Today",
  "journal.compose.yesterday": "Yesterday",
  "journal.compose.notes": "What you did",
  "journal.compose.notesHint":
    "Your own words. Times and places belong here too.",
  "journal.compose.site": "Site or place (optional)",
  "journal.compose.context": "Work context",
  "journal.compose.contextUnnamed": "Not named",
  "journal.compose.review": "Review before saving",
  "journal.compose.previewTitle": "Check this before it is saved",
  "journal.compose.previewNothingSaved":
    "Nothing has been saved yet. This is exactly what will be recorded.",
  "journal.compose.save": "Save to my Work Journal",
  "journal.compose.edit": "Change something",
  "journal.compose.chooseContext": "Which work does this belong to?",
  "journal.compose.chooseContextBody":
    "This entry could belong to more than one of your work contexts, so nothing was prepared and nothing was saved. Choose one.",
  "journal.compose.savedTitle": "Saved to your Work Journal",
  "journal.compose.savedBody":
    "This is now a recorded entry. It is what the server stored.",
  "journal.compose.another": "Log another",
  "journal.compose.backToJournal": "Back to the journal",
  "journal.compose.checkThis": "Check this first",
  "journal.compose.invalidDate":
    "Write the date as year-month-day, for example 2026-09-01. Nothing was sent.",
  "journal.compose.notesRequired":
    "Write what you did before saving. Nothing was sent.",
  "journal.compose.draftFailedTitle": "We could not prepare this entry",
  "journal.compose.saveFailedTitle": "We could not save this entry",
  "journal.compose.staleDraft":
    "This was not saved: your journal changed after this was prepared, so the check it was based on is out of date. Review it again.",
  "journal.compose.noContext":
    "This account has no active work context, so an entry has nowhere to be recorded. Add where you work on the website first, then log work here.",
  "journal.compose.unsureSaved":
    "The connection dropped after this was sent, so we do not know whether it arrived. Open your Work Journal to check before writing it again. Trying again cannot create a duplicate.",
  "journal.compose.skillsAdded": "New skills recorded",
  "journal.compose.skillsStrengthened": "Skills with new evidence",
  "journal.compose.skillsClaims": "Capabilities noted from your words",
  "journal.compose.skillsReview": "Waiting for your review",
  "journal.compose.noCvChange":
    "Nothing new was added to your Living CV from this entry.",
  "journal.compose.skillsPartial":
    "Part of the Living CV update did not finish. The entry itself is saved.",
  "journal.compose.skillsFailed":
    "The Living CV update did not run this time. The entry itself is saved.",
  "journal.compose.reviewOnWeb":
    "What is waiting for review is confirmed on the website.",
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

  "route.notFound.title": "Tokio ekrano šioje programėlėje nėra",
  "route.notFound.body":
    "Nuoroda, kuria atėjote, čia niekur neveda. Ji gali būti skirta svetainei arba būti pasenusi. Niekas niekur nebuvo išsiųsta.",
  "route.notFound.action": "Grįžti į programėlę",

  "crash.title": "Programėlėje įvyko klaida",
  "crash.body":
    "Tai pačios programėlės klaida, ne jūsų veiksmas, ir niekas niekur nebuvo išsiųsta. Bandykite dar kartą — jei kartojasi, uždarykite programėlę ir atidarykite iš naujo.",

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
  "journal.logWork": "Įrašyti darbą",
  "journal.compose.title": "Įrašyti darbą",
  "journal.compose.intro":
    "Aprašykite savais žodžiais, ką nuveikėte. Darbo dienoraštis užfiksuos būtent tai, ką parašysite.",
  "journal.compose.date": "Darbo data",
  "journal.compose.dateHint": "Metai-mėnuo-diena, pavyzdžiui 2026-09-01",
  "journal.compose.today": "Šiandien",
  "journal.compose.yesterday": "Vakar",
  "journal.compose.notes": "Ką nuveikėte",
  "journal.compose.notesHint":
    "Savais žodžiais. Laikas ir vietos rašomi taip pat čia.",
  "journal.compose.site": "Objektas arba vieta (nebūtina)",
  "journal.compose.context": "Darbo kontekstas",
  "journal.compose.contextUnnamed": "Nenurodyta",
  "journal.compose.review": "Peržiūrėti prieš įrašant",
  "journal.compose.previewTitle": "Patikrinkite prieš įrašant",
  "journal.compose.previewNothingSaved":
    "Kol kas niekas neįrašyta. Bus užfiksuota būtent tai.",
  "journal.compose.save": "Įrašyti į darbo dienoraštį",
  "journal.compose.edit": "Pakeisti",
  "journal.compose.chooseContext": "Kuriam darbui tai priklauso?",
  "journal.compose.chooseContextBody":
    "Šis įrašas gali priklausyti daugiau nei vienam jūsų darbo kontekstui, todėl niekas neparuošta ir niekas neįrašyta. Pasirinkite vieną.",
  "journal.compose.savedTitle": "Įrašyta į darbo dienoraštį",
  "journal.compose.savedBody":
    "Tai jau užfiksuotas įrašas. Serveris išsaugojo būtent tai.",
  "journal.compose.another": "Įrašyti dar vieną",
  "journal.compose.backToJournal": "Grįžti į dienoraštį",
  "journal.compose.checkThis": "Pirmiausia patikrinkite",
  "journal.compose.invalidDate":
    "Datą rašykite metai-mėnuo-diena, pavyzdžiui 2026-09-01. Niekas nebuvo išsiųsta.",
  "journal.compose.notesRequired":
    "Prieš įrašydami aprašykite, ką nuveikėte. Niekas nebuvo išsiųsta.",
  "journal.compose.draftFailedTitle": "Nepavyko paruošti šio įrašo",
  "journal.compose.saveFailedTitle": "Nepavyko įrašyti šio įrašo",
  "journal.compose.staleDraft":
    "Neįrašyta: po paruošimo jūsų dienoraštis pasikeitė, todėl patikra nebegalioja. Peržiūrėkite dar kartą.",
  "journal.compose.noContext":
    "Ši paskyra neturi aktyvaus darbo konteksto, todėl įrašui nėra kur atsidurti. Pirmiausia svetainėje nurodykite, kur dirbate, o tada įrašykite darbą čia.",
  "journal.compose.unsureSaved":
    "Ryšys nutrūko jau išsiuntus, todėl nežinome, ar įrašas pasiekė serverį. Prieš rašydami iš naujo atsidarykite darbo dienoraštį ir patikrinkite. Bandymas dar kartą dublikato nesukurs.",
  "journal.compose.skillsAdded": "Nauji užfiksuoti įgūdžiai",
  "journal.compose.skillsStrengthened": "Įgūdžiai su naujais įrodymais",
  "journal.compose.skillsClaims": "Iš jūsų žodžių pastebėti gebėjimai",
  "journal.compose.skillsReview": "Laukia jūsų peržiūros",
  "journal.compose.noCvChange":
    "Iš šio įrašo į gyvąjį CV nieko naujo nepridėta.",
  "journal.compose.skillsPartial":
    "Dalis gyvojo CV atnaujinimo nebaigta. Pats įrašas išsaugotas.",
  "journal.compose.skillsFailed":
    "Šįkart gyvojo CV atnaujinimas nebuvo atliktas. Pats įrašas išsaugotas.",
  "journal.compose.reviewOnWeb":
    "Tai, kas laukia peržiūros, patvirtinama svetainėje.",
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

  "route.notFound.title": "Такого экрана в приложении нет",
  "route.notFound.body":
    "Ссылка, по которой вы перешли, здесь никуда не ведёт. Возможно, она предназначена для сайта или устарела. Никуда ничего не отправлено.",
  "route.notFound.action": "Вернуться в приложение",

  "crash.title": "В приложении произошёл сбой",
  "crash.body":
    "Это сбой самого приложения, а не ваша ошибка, и никуда ничего не отправлено. Попробуйте снова — если повторяется, закройте приложение и откройте заново.",

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
  "journal.logWork": "Записать работу",
  "journal.compose.title": "Записать работу",
  "journal.compose.intro":
    "Опишите своими словами, что вы сделали. Дневник работы сохранит именно то, что вы напишете.",
  "journal.compose.date": "Дата работы",
  "journal.compose.dateHint": "Год-месяц-день, например 2026-09-01",
  "journal.compose.today": "Сегодня",
  "journal.compose.yesterday": "Вчера",
  "journal.compose.notes": "Что вы сделали",
  "journal.compose.notesHint":
    "Своими словами. Время и места пишите здесь же.",
  "journal.compose.site": "Объект или место (необязательно)",
  "journal.compose.context": "Рабочий контекст",
  "journal.compose.contextUnnamed": "Не указан",
  "journal.compose.review": "Проверить перед сохранением",
  "journal.compose.previewTitle": "Проверьте это перед сохранением",
  "journal.compose.previewNothingSaved":
    "Пока ничего не сохранено. Записано будет именно это.",
  "journal.compose.save": "Сохранить в дневник работы",
  "journal.compose.edit": "Изменить",
  "journal.compose.chooseContext": "К какой работе это относится?",
  "journal.compose.chooseContextBody":
    "Эта запись может относиться более чем к одному вашему рабочему контексту, поэтому ничего не подготовлено и ничего не сохранено. Выберите один.",
  "journal.compose.savedTitle": "Сохранено в дневник работы",
  "journal.compose.savedBody":
    "Это уже сохранённая запись. Сервер сохранил именно это.",
  "journal.compose.another": "Записать ещё",
  "journal.compose.backToJournal": "Вернуться в дневник",
  "journal.compose.checkThis": "Сначала проверьте",
  "journal.compose.invalidDate":
    "Укажите дату как год-месяц-день, например 2026-09-01. Ничего не отправлено.",
  "journal.compose.notesRequired":
    "Опишите, что вы сделали, прежде чем сохранять. Ничего не отправлено.",
  "journal.compose.draftFailedTitle": "Не удалось подготовить эту запись",
  "journal.compose.saveFailedTitle": "Не удалось сохранить эту запись",
  "journal.compose.staleDraft":
    "Не сохранено: после подготовки ваш дневник изменился, и проверка устарела. Проверьте ещё раз.",
  "journal.compose.noContext":
    "У этого аккаунта нет активного рабочего контекста, поэтому записи некуда попасть. Сначала укажите на сайте, где вы работаете, затем записывайте работу здесь.",
  "journal.compose.unsureSaved":
    "Связь пропала уже после отправки, поэтому мы не знаем, дошла ли запись. Откройте дневник работы и проверьте, прежде чем писать заново. Повторная попытка не создаст дубликат.",
  "journal.compose.skillsAdded": "Новые записанные навыки",
  "journal.compose.skillsStrengthened": "Навыки с новым подтверждением",
  "journal.compose.skillsClaims": "Способности, отмеченные из ваших слов",
  "journal.compose.skillsReview": "Ждёт вашей проверки",
  "journal.compose.noCvChange":
    "Из этой записи в живое CV ничего нового не добавлено.",
  "journal.compose.skillsPartial":
    "Часть обновления живого CV не завершилась. Сама запись сохранена.",
  "journal.compose.skillsFailed":
    "Обновление живого CV в этот раз не выполнялось. Сама запись сохранена.",
  "journal.compose.reviewOnWeb":
    "То, что ждёт проверки, подтверждается на сайте.",
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

  "route.notFound.title": "Dat scherm bestaat niet in deze app",
  "route.notFound.body":
    "De link die je volgde leidt hier nergens heen. Misschien is hij voor de website bedoeld, of is hij verouderd. Er is niets verstuurd.",
  "route.notFound.action": "Terug naar de app",

  "crash.title": "De app liep vast",
  "crash.body":
    "Dit is een fout in de app zelf, niet iets wat jij deed, en er is niets verstuurd. Probeer het opnieuw — als het blijft gebeuren, sluit de app en open hem opnieuw.",

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
  "journal.logWork": "Werk vastleggen",
  "journal.compose.title": "Werk vastleggen",
  "journal.compose.intro":
    "Schrijf in je eigen woorden op wat je hebt gedaan. Je werkdagboek legt precies dat vast.",
  "journal.compose.date": "Datum van het werk",
  "journal.compose.dateHint": "Jaar-maand-dag, bijvoorbeeld 2026-09-01",
  "journal.compose.today": "Vandaag",
  "journal.compose.yesterday": "Gisteren",
  "journal.compose.notes": "Wat je hebt gedaan",
  "journal.compose.notesHint":
    "In je eigen woorden. Tijden en plaatsen horen hier ook.",
  "journal.compose.site": "Locatie of plek (optioneel)",
  "journal.compose.context": "Werkcontext",
  "journal.compose.contextUnnamed": "Niet benoemd",
  "journal.compose.review": "Controleren voor het opslaan",
  "journal.compose.previewTitle": "Controleer dit voordat het wordt opgeslagen",
  "journal.compose.previewNothingSaved":
    "Er is nog niets opgeslagen. Dit is precies wat wordt vastgelegd.",
  "journal.compose.save": "Opslaan in mijn werkdagboek",
  "journal.compose.edit": "Iets wijzigen",
  "journal.compose.chooseContext": "Bij welk werk hoort dit?",
  "journal.compose.chooseContextBody":
    "Dit item kan bij meer dan één van je werkcontexten horen, dus er is niets voorbereid en niets opgeslagen. Kies er één.",
  "journal.compose.savedTitle": "Opgeslagen in je werkdagboek",
  "journal.compose.savedBody":
    "Dit is nu een vastgelegd item. Dit is wat de server heeft opgeslagen.",
  "journal.compose.another": "Nog een vastleggen",
  "journal.compose.backToJournal": "Terug naar het dagboek",
  "journal.compose.checkThis": "Controleer dit eerst",
  "journal.compose.invalidDate":
    "Schrijf de datum als jaar-maand-dag, bijvoorbeeld 2026-09-01. Er is niets verstuurd.",
  "journal.compose.notesRequired":
    "Schrijf op wat je hebt gedaan voordat je opslaat. Er is niets verstuurd.",
  "journal.compose.draftFailedTitle": "We konden dit item niet voorbereiden",
  "journal.compose.saveFailedTitle": "We konden dit item niet opslaan",
  "journal.compose.staleDraft":
    "Niet opgeslagen: je dagboek is veranderd nadat dit was voorbereid, dus de controle is verouderd. Controleer het opnieuw.",
  "journal.compose.noContext":
    "Dit account heeft geen actieve werkcontext, dus een item kan nergens worden vastgelegd. Geef eerst op de website aan waar je werkt en leg hier daarna werk vast.",
  "journal.compose.unsureSaved":
    "De verbinding viel weg nadat dit was verstuurd, dus we weten niet of het is aangekomen. Open je werkdagboek om te controleren voordat je het opnieuw schrijft. Opnieuw proberen kan geen dubbel item maken.",
  "journal.compose.skillsAdded": "Nieuw vastgelegde vaardigheden",
  "journal.compose.skillsStrengthened": "Vaardigheden met nieuw bewijs",
  "journal.compose.skillsClaims": "Capaciteiten opgemerkt uit je woorden",
  "journal.compose.skillsReview": "Wacht op jouw beoordeling",
  "journal.compose.noCvChange":
    "Uit dit item is niets nieuws aan je Living CV toegevoegd.",
  "journal.compose.skillsPartial":
    "Een deel van de Living CV-update is niet afgerond. Het item zelf is opgeslagen.",
  "journal.compose.skillsFailed":
    "De Living CV-update is deze keer niet uitgevoerd. Het item zelf is opgeslagen.",
  "journal.compose.reviewOnWeb":
    "Wat op beoordeling wacht, bevestig je op de website.",
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

  "route.notFound.title": "Diesen Bildschirm gibt es in dieser App nicht",
  "route.notFound.body":
    "Der Link, dem du gefolgt bist, führt hier nirgendwohin. Vielleicht gehört er zur Website, vielleicht ist er veraltet. Es wurde nichts gesendet.",
  "route.notFound.action": "Zurück zur App",

  "crash.title": "Die App ist auf einen Fehler gestoßen",
  "crash.body":
    "Das ist ein Fehler in der App selbst und nicht deiner, und es wurde nichts gesendet. Versuche es erneut — wenn es weiter passiert, schließe die App und öffne sie neu.",

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
  "journal.logWork": "Arbeit erfassen",
  "journal.compose.title": "Arbeit erfassen",
  "journal.compose.intro":
    "Schreibe in deinen eigenen Worten, was du getan hast. Dein Arbeitstagebuch hält genau das fest.",
  "journal.compose.date": "Datum der Arbeit",
  "journal.compose.dateHint": "Jahr-Monat-Tag, zum Beispiel 2026-09-01",
  "journal.compose.today": "Heute",
  "journal.compose.yesterday": "Gestern",
  "journal.compose.notes": "Was du getan hast",
  "journal.compose.notesHint":
    "In deinen eigenen Worten. Zeiten und Orte gehören ebenfalls hierher.",
  "journal.compose.site": "Baustelle oder Ort (optional)",
  "journal.compose.context": "Arbeitskontext",
  "journal.compose.contextUnnamed": "Nicht benannt",
  "journal.compose.review": "Vor dem Speichern prüfen",
  "journal.compose.previewTitle": "Prüfe das, bevor es gespeichert wird",
  "journal.compose.previewNothingSaved":
    "Es wurde noch nichts gespeichert. Genau das wird erfasst.",
  "journal.compose.save": "In mein Arbeitstagebuch speichern",
  "journal.compose.edit": "Etwas ändern",
  "journal.compose.chooseContext": "Zu welcher Arbeit gehört das?",
  "journal.compose.chooseContextBody":
    "Dieser Eintrag könnte zu mehr als einem deiner Arbeitskontexte gehören, deshalb wurde nichts vorbereitet und nichts gespeichert. Wähle einen aus.",
  "journal.compose.savedTitle": "In deinem Arbeitstagebuch gespeichert",
  "journal.compose.savedBody":
    "Das ist jetzt ein erfasster Eintrag. Genau das hat der Server gespeichert.",
  "journal.compose.another": "Noch einen erfassen",
  "journal.compose.backToJournal": "Zurück zum Tagebuch",
  "journal.compose.checkThis": "Bitte zuerst prüfen",
  "journal.compose.invalidDate":
    "Schreibe das Datum als Jahr-Monat-Tag, zum Beispiel 2026-09-01. Es wurde nichts gesendet.",
  "journal.compose.notesRequired":
    "Schreibe vor dem Speichern, was du getan hast. Es wurde nichts gesendet.",
  "journal.compose.draftFailedTitle":
    "Wir konnten diesen Eintrag nicht vorbereiten",
  "journal.compose.saveFailedTitle":
    "Wir konnten diesen Eintrag nicht speichern",
  "journal.compose.staleDraft":
    "Nicht gespeichert: Dein Tagebuch hat sich geändert, nachdem dies vorbereitet wurde, deshalb ist die Prüfung veraltet. Prüfe es erneut.",
  "journal.compose.noContext":
    "Dieses Konto hat keinen aktiven Arbeitskontext, deshalb hat ein Eintrag keinen Ort. Gib zuerst auf der Website an, wo du arbeitest, und erfasse Arbeit dann hier.",
  "journal.compose.unsureSaved":
    "Die Verbindung brach ab, nachdem dies gesendet wurde, deshalb wissen wir nicht, ob es angekommen ist. Öffne dein Arbeitstagebuch und prüfe es, bevor du es erneut schreibst. Ein erneuter Versuch kann keinen doppelten Eintrag erzeugen.",
  "journal.compose.skillsAdded": "Neu erfasste Fähigkeiten",
  "journal.compose.skillsStrengthened": "Fähigkeiten mit neuem Nachweis",
  "journal.compose.skillsClaims": "Aus deinen Worten notierte Fähigkeiten",
  "journal.compose.skillsReview": "Wartet auf deine Prüfung",
  "journal.compose.noCvChange":
    "Aus diesem Eintrag wurde deinem Living CV nichts Neues hinzugefügt.",
  "journal.compose.skillsPartial":
    "Ein Teil der Living-CV-Aktualisierung wurde nicht abgeschlossen. Der Eintrag selbst ist gespeichert.",
  "journal.compose.skillsFailed":
    "Die Living-CV-Aktualisierung lief diesmal nicht. Der Eintrag selbst ist gespeichert.",
  "journal.compose.reviewOnWeb":
    "Was auf Prüfung wartet, wird auf der Website bestätigt.",
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
