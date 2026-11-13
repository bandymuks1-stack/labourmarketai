/**
 * LANDING V3 — PREVIEW COPY (prototype branch `evidence/landing-v3-preview`).
 *
 * NOT the message catalogs yet: the six active languages are here so the
 * owner can look at the page before the final PR. In that PR these lines move
 * into `messages/*.json` and this file is deleted. Polite address in every
 * language (owner, 2026-11-13): lt "jūs", ru «вы», pl "Państwo" / impersonal,
 * de "Sie", nl "u".
 */
export type LandingV3Copy = {
  lead: string;
  moreChoices: string;
  or: string;
  need: {
    title: string;
    body: string;
    free: string;
  };
  market: {
    title: string;
    /** {adverts} {employers} {date} */
    line: string;
    source: string;
    link: string;
    none: string;
  };
  how: {
    title: string;
    points: readonly { title: string; body: string }[];
    links: { workers: string; companies: string; data: string };
  };
};

const en: LandingV3Copy = {
  lead: "For every profession and sector. Signing up and posting a need are free.",
  moreChoices: "More choices",
  or: "or say what you need",
  need: {
    title: "Submit a need",
    body: "Tell us what you need: workers, a business service or a single project. A person reads every request and replies.",
    free: "Free · no sign-up needed",
  },
  market: {
    title: "The job market right now",
    line: "{adverts} active external job adverts, naming {employers} employers.",
    source: "These adverts are collected from external public job sources. They are not clients registered on LabourMarket.ai. Updated {date}.",
    link: "Search the adverts",
    none: "Market figures are not available at the moment.",
  },
  how: {
    title: "How it works",
    points: [
      { title: "Agree", body: "Find work or people and agree in one conversation." },
      { title: "Record", body: "Work done is written into a work journal as it happens." },
      { title: "Confirm", body: "A manager confirms it; confirmed work becomes proof of skill in your CV." },
      { title: "Stay in control", body: "The assistant suggests, a person decides. You choose who sees your records." },
    ],
    links: { workers: "For workers", companies: "For companies", data: "Your data and who can see it" },
  },
};

const lt: LandingV3Copy = {
  lead: "Visoms profesijoms ir sektoriams. Registracija ir poreikio paskelbimas nemokami.",
  moreChoices: "Daugiau pasirinkimų",
  or: "arba pasakykite, ko reikia",
  need: {
    title: "Pateikti poreikį",
    body: "Parašykite, ko reikia: darbuotojų, verslo paslaugos ar vieno projekto. Kiekvieną užklausą perskaito žmogus ir atsako.",
    free: "Nemokamai · registruotis nereikia",
  },
  market: {
    title: "Darbo rinka šiuo metu",
    line: "{adverts} aktyvių išorinių darbo skelbimų, kuriuose nurodyta {employers} darbdavių.",
    source: "Šie skelbimai surinkti iš išorinių viešų darbo skelbimų šaltinių. Tai nėra LabourMarket.ai užsiregistravę klientai. Atnaujinta {date}.",
    link: "Ieškoti skelbimų",
    none: "Rinkos skaičiai šiuo metu nepasiekiami.",
  },
  how: {
    title: "Kaip tai veikia",
    points: [
      { title: "Susitarkite", body: "Raskite darbą ar žmones ir susitarkite viename pokalbyje." },
      { title: "Užrašykite", body: "Atliktas darbas įrašomas į darbo žurnalą tada, kai vyksta." },
      { title: "Patvirtinkite", body: "Vadovas patvirtina; patvirtintas darbas tampa įgūdžių įrodymu jūsų CV." },
      { title: "Valdykite patys", body: "Asistentas pasiūlo, sprendžia žmogus. Jūs renkatės, kas mato jūsų įrašus." },
    ],
    links: { workers: "Darbuotojams", companies: "Įmonėms", data: "Jūsų duomenys ir kas juos mato" },
  },
};

const ru: LandingV3Copy = {
  lead: "Для всех профессий и отраслей. Регистрация и размещение потребности бесплатны.",
  moreChoices: "Другие варианты",
  or: "или скажите, что вам нужно",
  need: {
    title: "Отправить запрос",
    body: "Напишите, что вам нужно: работники, бизнес-услуга или отдельный проект. Каждый запрос читает человек и отвечает на него.",
    free: "Бесплатно · регистрация не нужна",
  },
  market: {
    title: "Рынок труда сейчас",
    line: "{adverts} активных внешних объявлений о работе, в них указано {employers} работодателей.",
    source: "Эти объявления собраны из внешних открытых источников вакансий. Это не клиенты, зарегистрированные на LabourMarket.ai. Обновлено {date}.",
    link: "Искать объявления",
    none: "Данные о рынке сейчас недоступны.",
  },
  how: {
    title: "Как это работает",
    points: [
      { title: "Договоритесь", body: "Найдите работу или людей и договоритесь в одном разговоре." },
      { title: "Запишите", body: "Выполненная работа записывается в рабочий журнал по ходу дела." },
      { title: "Подтвердите", body: "Руководитель подтверждает; подтверждённая работа становится доказательством навыков в вашем резюме." },
      { title: "Управляйте сами", body: "Ассистент предлагает, решает человек. Вы выбираете, кто видит ваши записи." },
    ],
    links: { workers: "Работникам", companies: "Компаниям", data: "Ваши данные и кто их видит" },
  },
};

const pl: LandingV3Copy = {
  lead: "Dla wszystkich zawodów i branż. Rejestracja i zgłoszenie zapotrzebowania są bezpłatne.",
  moreChoices: "Więcej możliwości",
  or: "lub proszę napisać, czego Państwo potrzebują",
  need: {
    title: "Zgłoś zapotrzebowanie",
    body: "Proszę napisać, czego Państwo potrzebują: pracowników, usługi dla firmy lub pojedynczego projektu. Każde zgłoszenie czyta człowiek i na nie odpowiada.",
    free: "Bezpłatnie · bez rejestracji",
  },
  market: {
    title: "Rynek pracy teraz",
    line: "{adverts} aktywnych zewnętrznych ogłoszeń o pracę, w których wskazano {employers} pracodawców.",
    source: "Ogłoszenia pochodzą z zewnętrznych publicznych źródeł ofert pracy. Nie są to klienci zarejestrowani w LabourMarket.ai. Aktualizacja: {date}.",
    link: "Szukaj ogłoszeń",
    none: "Dane o rynku są w tej chwili niedostępne.",
  },
  how: {
    title: "Jak to działa",
    points: [
      { title: "Uzgodnienie", body: "Można znaleźć pracę lub ludzi i uzgodnić wszystko w jednej rozmowie." },
      { title: "Zapis", body: "Wykonana praca jest zapisywana w dzienniku pracy na bieżąco." },
      { title: "Potwierdzenie", body: "Przełożony potwierdza; potwierdzona praca staje się dowodem umiejętności w Państwa CV." },
      { title: "Kontrola", body: "Asystent proponuje, decyduje człowiek. To Państwo wybierają, kto widzi Państwa wpisy." },
    ],
    links: { workers: "Dla pracowników", companies: "Dla firm", data: "Państwa dane i kto je widzi" },
  },
};

const de: LandingV3Copy = {
  lead: "Für alle Berufe und Branchen. Registrierung und das Einstellen eines Bedarfs sind kostenlos.",
  moreChoices: "Weitere Möglichkeiten",
  or: "oder sagen Sie, was Sie brauchen",
  need: {
    title: "Bedarf einreichen",
    body: "Schreiben Sie, was Sie brauchen: Arbeitskräfte, eine Dienstleistung für Ihr Unternehmen oder ein einzelnes Projekt. Jede Anfrage wird von einem Menschen gelesen und beantwortet.",
    free: "Kostenlos · ohne Registrierung",
  },
  market: {
    title: "Der Arbeitsmarkt jetzt",
    line: "{adverts} aktive externe Stellenanzeigen, in denen {employers} Arbeitgeber genannt sind.",
    source: "Diese Anzeigen stammen aus externen öffentlichen Stellenquellen. Es sind keine bei LabourMarket.ai registrierten Kunden. Aktualisiert am {date}.",
    link: "Anzeigen durchsuchen",
    none: "Marktzahlen sind derzeit nicht verfügbar.",
  },
  how: {
    title: "So funktioniert es",
    points: [
      { title: "Vereinbaren", body: "Finden Sie Arbeit oder Menschen und vereinbaren Sie alles in einem Gespräch." },
      { title: "Festhalten", body: "Erledigte Arbeit wird laufend im Arbeitsjournal festgehalten." },
      { title: "Bestätigen", body: "Eine Führungskraft bestätigt sie; bestätigte Arbeit wird zum Kompetenznachweis in Ihrem Lebenslauf." },
      { title: "Selbst bestimmen", body: "Der Assistent schlägt vor, ein Mensch entscheidet. Sie bestimmen, wer Ihre Einträge sieht." },
    ],
    links: { workers: "Für Arbeitnehmer", companies: "Für Unternehmen", data: "Ihre Daten und wer sie sehen kann" },
  },
};

const nl: LandingV3Copy = {
  lead: "Voor alle beroepen en sectoren. Registreren en een behoefte plaatsen zijn gratis.",
  moreChoices: "Meer keuzes",
  or: "of zeg wat u nodig heeft",
  need: {
    title: "Behoefte indienen",
    body: "Schrijf wat u nodig heeft: medewerkers, een zakelijke dienst of één project. Elke aanvraag wordt door een mens gelezen en beantwoord.",
    free: "Gratis · registreren niet nodig",
  },
  market: {
    title: "De arbeidsmarkt nu",
    line: "{adverts} actieve externe vacatures, waarin {employers} werkgevers worden genoemd.",
    source: "Deze vacatures zijn verzameld uit externe openbare vacaturebronnen. Het zijn geen klanten die bij LabourMarket.ai zijn geregistreerd. Bijgewerkt op {date}.",
    link: "Vacatures zoeken",
    none: "Marktcijfers zijn op dit moment niet beschikbaar.",
  },
  how: {
    title: "Zo werkt het",
    points: [
      { title: "Afspreken", body: "Vind werk of mensen en spreek alles af in één gesprek." },
      { title: "Vastleggen", body: "Verricht werk wordt direct vastgelegd in een werkjournaal." },
      { title: "Bevestigen", body: "Een leidinggevende bevestigt het; bevestigd werk wordt bewijs van vaardigheid in uw cv." },
      { title: "Zelf bepalen", body: "De assistent stelt voor, een mens beslist. U bepaalt wie uw gegevens ziet." },
    ],
    links: { workers: "Voor werknemers", companies: "Voor bedrijven", data: "Uw gegevens en wie ze kan zien" },
  },
};

const BY_LOCALE: Record<string, LandingV3Copy> = { en, lt, ru, pl, de, nl };

export function landingV3Copy(locale: string): LandingV3Copy {
  return BY_LOCALE[locale] ?? en;
}
