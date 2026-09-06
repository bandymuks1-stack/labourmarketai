/**
 * Profession + problem SEO content — pure, per-locale (lt / en / ru / nl / de).
 *
 * Strategy (owner 2026-06-15): LabourMarket.ai is a BROAD labour-market
 * platform. The brand title/description stay cross-sector, but the public
 * content must still explicitly NAME concrete professions, sectors and the
 * real labour-market problems people search for on Google / AI — so the
 * platform is found for those queries. Construction stays as ONE important
 * sector among many; no profession is hidden.
 *
 * Each problem follows the copy principle: name the problem → who it hurts →
 * how LabourMarket.ai structures the solution → CTA into a real flow.
 *
 * No fabricated numbers / clients / matches. PURE: no fs / net / env.
 */
import type { ActiveLocale } from "@/lib/i18n/config";
import type { SectorKey } from "@/lib/structuring/sectors";

type L = Record<ActiveLocale, string>;

export interface ProfessionEntry {
  readonly key: string;
  readonly sector: SectorKey;
  readonly label: L;
}

/**
 * Concrete professions named for search coverage. Construction trades are
 * present AND so are logistics, manufacturing, hospitality, care, cleaning,
 * agriculture, office and sales — breadth, not a single sector.
 */
export const SEO_PROFESSIONS: readonly ProfessionEntry[] = [
  { key: "construction-workers", sector: "construction", label: { en: "Construction workers", lt: "Statybininkai", ru: "Строители", nl: "Bouwvakkers", de: "Bauarbeiter" } },
  { key: "finishers", sector: "construction", label: { en: "Finishers", lt: "Apdailininkai", ru: "Отделочники", nl: "Afbouwers", de: "Ausbaufachkräfte" } },
  { key: "bricklayers", sector: "construction", label: { en: "Bricklayers", lt: "Mūrininkai", ru: "Каменщики", nl: "Metselaars", de: "Maurer" } },
  { key: "roofers", sector: "construction", label: { en: "Roofers", lt: "Stogdengiai", ru: "Кровельщики", nl: "Dakdekkers", de: "Dachdecker" } },
  { key: "concrete-workers", sector: "construction", label: { en: "Concrete workers", lt: "Betonuotojai", ru: "Бетонщики", nl: "Betonwerkers", de: "Betonbauer" } },
  { key: "electricians", sector: "construction", label: { en: "Electricians", lt: "Elektrikai", ru: "Электрики", nl: "Elektriciens", de: "Elektriker" } },
  { key: "plumbers", sector: "construction", label: { en: "Plumbers", lt: "Santechnikai", ru: "Сантехники", nl: "Loodgieters", de: "Klempner" } },
  { key: "welders", sector: "manufacturing", label: { en: "Welders", lt: "Suvirintojai", ru: "Сварщики", nl: "Lassers", de: "Schweißer" } },
  { key: "drivers", sector: "transport_logistics", label: { en: "Drivers", lt: "Vairuotojai", ru: "Водители", nl: "Chauffeurs", de: "Fahrer" } },
  { key: "warehouse-workers", sector: "transport_logistics", label: { en: "Warehouse workers", lt: "Sandėlio darbuotojai", ru: "Работники склада", nl: "Magazijnmedewerkers", de: "Lagerarbeiter" } },
  { key: "production-operators", sector: "manufacturing", label: { en: "Production operators", lt: "Gamybos operatoriai", ru: "Операторы производства", nl: "Productieoperators", de: "Produktionsmitarbeiter" } },
  { key: "mechanics", sector: "manufacturing", label: { en: "Mechanics", lt: "Mechanikai", ru: "Механики", nl: "Monteurs", de: "Mechaniker" } },
  { key: "technicians", sector: "manufacturing", label: { en: "Technicians", lt: "Technikai", ru: "Техники", nl: "Technici", de: "Techniker" } },
  { key: "cleaners", sector: "cleaning_facility", label: { en: "Cleaners", lt: "Valytojai", ru: "Уборщики", nl: "Schoonmakers", de: "Reinigungskräfte" } },
  { key: "hotel-staff", sector: "hospitality_food", label: { en: "Hotel staff", lt: "Viešbučių darbuotojai", ru: "Работники гостиниц", nl: "Hotelmedewerkers", de: "Hotelpersonal" } },
  { key: "cooks", sector: "hospitality_food", label: { en: "Cooks", lt: "Virėjai", ru: "Повара", nl: "Koks", de: "Köche" } },
  { key: "general-workers", sector: "other", label: { en: "General / helper workers", lt: "Pagalbiniai darbuotojai", ru: "Подсобные работники", nl: "Algemene / hulparbeiders", de: "Hilfsarbeiter / allgemeine Arbeitskräfte" } },
  { key: "care-workers", sector: "care_health", label: { en: "Care workers", lt: "Slaugos / priežiūros darbuotojai", ru: "Работники ухода", nl: "Zorgmedewerkers", de: "Pflegekräfte" } },
  { key: "agricultural-workers", sector: "agriculture", label: { en: "Agricultural workers", lt: "Žemės ūkio darbuotojai", ru: "Работники сельского хозяйства", nl: "Landbouwmedewerkers", de: "Landwirtschaftliche Arbeitskräfte" } },
  { key: "seasonal-workers", sector: "agriculture", label: { en: "Seasonal workers", lt: "Sezoniniai darbuotojai", ru: "Сезонные работники", nl: "Seizoensarbeiders", de: "Saisonarbeiter" } },
  { key: "admin-staff", sector: "office_admin", label: { en: "Administration staff", lt: "Administracijos darbuotojai", ru: "Административные работники", nl: "Administratief medewerkers", de: "Verwaltungsmitarbeiter" } },
  { key: "sales-service", sector: "retail_sales", label: { en: "Sales / customer service", lt: "Pardavimų / klientų aptarnavimo darbuotojai", ru: "Продажи / обслуживание клиентов", nl: "Verkoop / klantenservice", de: "Vertrieb / Kundenservice" } },
  // Window 6 (2026-09-06, gap G-D1): the rows above read as manual labour
  // only. The platform is profession-agnostic — the skills, evidence,
  // journal and matching model carry an accountant exactly as they carry a
  // scaffolder — so the professions the page NAMES must say so too.
  { key: "accountants", sector: "office_admin", label: { en: "Accountants / finance", lt: "Buhalteriai / finansai", ru: "Бухгалтеры / финансы", nl: "Accountants / financiën", de: "Buchhalter / Finanzen" } },
  { key: "lawyers", sector: "office_admin", label: { en: "Lawyers / legal", lt: "Teisininkai", ru: "Юристы", nl: "Juristen", de: "Juristen" } },
  { key: "engineers", sector: "manufacturing", label: { en: "Engineers", lt: "Inžinieriai", ru: "Инженеры", nl: "Ingenieurs", de: "Ingenieure" } },
  { key: "software-developers", sector: "it_software", label: { en: "Software developers", lt: "Programuotojai", ru: "Программисты", nl: "Softwareontwikkelaars", de: "Softwareentwickler" } },
  { key: "it-support", sector: "it_software", label: { en: "IT support / administrators", lt: "IT priežiūra / administratoriai", ru: "IT-поддержка / администраторы", nl: "IT-support / beheerders", de: "IT-Support / Administratoren" } },
  { key: "sales-managers", sector: "retail_sales", label: { en: "Sales managers", lt: "Pardavimų vadybininkai", ru: "Менеджеры по продажам", nl: "Salesmanagers", de: "Vertriebsmanager" } },
  { key: "teachers-trainers", sector: "education", label: { en: "Teachers / trainers", lt: "Mokytojai / dėstytojai", ru: "Учителя / преподаватели", nl: "Docenten / trainers", de: "Lehrer / Ausbilder" } },
  { key: "designers-consultants", sector: "other", label: { en: "Designers / consultants", lt: "Dizaineriai / konsultantai", ru: "Дизайнеры / консультанты", nl: "Ontwerpers / consultants", de: "Designer / Berater" } },
  { key: "recruiters-hr", sector: "hr_recruitment", label: { en: "HR / recruiters", lt: "Personalo specialistai", ru: "HR / рекрутеры", nl: "HR / recruiters", de: "HR / Recruiter" } },
];

export interface ActorEntry {
  readonly key: string;
  readonly label: L;
  readonly blurb: L;
}

/** The market actors beyond a single worker — also real search entities. */
export const SEO_ACTORS: readonly ActorEntry[] = [
  {
    key: "teams",
    label: { en: "Teams / brigades", lt: "Brigados / komandos", ru: "Бригады / команды", nl: "Teams / ploegen", de: "Teams / Kolonnen" },
    blurb: {
      en: "Find or present a ready team, not just one worker.",
      lt: "Rask arba pristatyk paruoštą brigadą, ne tik vieną darbuotoją.",
      ru: "Найдите или представьте готовую бригаду, а не одного работника.",
      nl: "Vind of presenteer een compleet team, niet slechts één werknemer.",
      de: "Finden oder präsentieren Sie ein einsatzbereites Team, nicht nur eine einzelne Arbeitskraft.",
    },
  },
  {
    key: "subcontractors",
    label: { en: "Subcontractors", lt: "Subrangovai", ru: "Субподрядчики", nl: "Onderaannemers", de: "Subunternehmer" },
    blurb: {
      en: "Coordinate subcontractors against a structured need.",
      lt: "Koordinuok subrangovus pagal struktūruotą poreikį.",
      ru: "Координируйте субподрядчиков под структурированную потребность.",
      nl: "Coördineer onderaannemers op basis van een gestructureerde behoefte.",
      de: "Koordinieren Sie Subunternehmer anhand eines strukturierten Bedarfs.",
    },
  },
  {
    key: "agencies",
    label: { en: "Staffing agencies", lt: "Įdarbinimo agentūros", ru: "Кадровые агентства", nl: "Uitzendbureaus", de: "Personalvermittlungen" },
    blurb: {
      en: "Manage a flow of candidates and employer needs in one place.",
      lt: "Valdyk kandidatų ir darbdavių poreikių srautą vienoje vietoje.",
      ru: "Управляйте потоком кандидатов и потребностей работодателей в одном месте.",
      nl: "Beheer een stroom van kandidaten en werkgeversbehoeften op één plek.",
      de: "Verwalten Sie den Strom von Kandidaten und Arbeitgeberbedarfen an einem Ort.",
    },
  },
  {
    key: "employers",
    label: { en: "Companies hiring workers", lt: "Įmonės, ieškančios darbuotojų", ru: "Компании, ищущие работников", nl: "Bedrijven die werknemers zoeken", de: "Unternehmen, die Arbeitskräfte suchen" },
    blurb: {
      en: "Describe a real workforce need and structure the next steps.",
      lt: "Aprašyk realų darbo jėgos poreikį ir struktūruok tolimesnius veiksmus.",
      ru: "Опишите реальную кадровую потребность и структурируйте дальнейшие шаги.",
      nl: "Beschrijf een reële personeelsbehoefte en structureer de volgende stappen.",
      de: "Beschreiben Sie einen realen Personalbedarf und strukturieren Sie die nächsten Schritte.",
    },
  },
];

export type ProblemAudience = "worker" | "employer" | "agency";

export interface ProblemEntry {
  readonly key: string;
  /** The search-style question / phrase people actually type. */
  readonly question: L;
  /** Who it hurts + why (one line). */
  readonly pain: L;
  /** How LabourMarket.ai structures the solution (one line). */
  readonly help: L;
  readonly audience: ProblemAudience;
}

/** Real labour-market problems framed as search questions. */
export const SEO_PROBLEMS: readonly ProblemEntry[] = [
  {
    key: "need-workers-fast",
    question: { en: "We need workers fast", lt: "Trūksta darbuotojų, reikia greitai", ru: "Срочно нужны работники", nl: "We hebben snel werknemers nodig", de: "Wir brauchen schnell Arbeitskräfte" },
    pain: {
      en: "Open positions stall a project when no structured pipeline exists.",
      lt: "Neužpildytos vietos stabdo projektą, kai nėra struktūruoto srauto.",
      ru: "Незаполненные позиции тормозят проект без структурированного потока.",
      nl: "Openstaande posities leggen een project stil als er geen gestructureerde pijplijn is.",
      de: "Offene Stellen bringen ein Projekt ins Stocken, wenn keine strukturierte Pipeline existiert.",
    },
    help: {
      en: "Post a structured workforce need; LabourMarket.ai helps match it to available workers and teams.",
      lt: "Pateik struktūruotą poreikį; LabourMarket.ai padeda jį sugretinti su prieinamais darbuotojais ir brigadomis.",
      ru: "Подайте структурированную потребность; LabourMarket.ai помогает сопоставить её с доступными работниками и бригадами.",
      nl: "Plaats een gestructureerde personeelsbehoefte; LabourMarket.ai helpt deze te matchen met beschikbare werknemers en teams.",
      de: "Stellen Sie einen strukturierten Personalbedarf ein; LabourMarket.ai hilft, ihn mit verfügbaren Arbeitskräften und Teams abzugleichen.",
    },
    audience: "employer",
  },
  {
    key: "need-specific-trade",
    question: { en: "We need welders / drivers / specific trades", lt: "Reikia suvirintojų / vairuotojų / konkrečių specialistų", ru: "Нужны сварщики / водители / конкретные специалисты", nl: "We hebben lassers / chauffeurs / specifieke vakmensen nodig", de: "Wir brauchen Schweißer / Fahrer / bestimmte Fachkräfte" },
    pain: {
      en: "Generic job ads rarely surface the specific skills a role needs.",
      lt: "Bendri skelbimai retai parodo konkrečius reikalingus įgūdžius.",
      ru: "Общие объявления редко показывают нужные конкретные навыки.",
      nl: "Algemene vacatures maken zelden duidelijk welke specifieke vaardigheden een functie vereist.",
      de: "Allgemeine Stellenanzeigen zeigen selten die konkreten Fähigkeiten, die eine Rolle erfordert.",
    },
    help: {
      en: "Describe the profession and skills precisely; matching works on real skills, not job titles only.",
      lt: "Tiksliai aprašyk profesiją ir įgūdžius; atitikimas remiasi realiais įgūdžiais, ne vien pareigybėmis.",
      ru: "Опишите профессию и навыки точно; подбор работает на реальных навыках, а не только на названиях должностей.",
      nl: "Beschrijf het beroep en de vaardigheden precies; matching werkt op echte vaardigheden, niet alleen op functietitels.",
      de: "Beschreiben Sie Beruf und Fähigkeiten präzise; der Abgleich basiert auf echten Fähigkeiten, nicht nur auf Berufsbezeichnungen.",
    },
    audience: "employer",
  },
  {
    key: "workers-with-accommodation",
    question: { en: "Workers with accommodation", lt: "Darbuotojai su apgyvendinimu", ru: "Работники с проживанием", nl: "Werknemers met huisvesting", de: "Arbeitskräfte mit Unterkunft" },
    pain: {
      en: "Accommodation is often the blocker for relocation and posting.",
      lt: "Apgyvendinimas dažnai yra kliūtis relokacijai ir komandiruotei.",
      ru: "Проживание часто становится барьером для релокации и командировки.",
      nl: "Huisvesting is vaak het struikelblok voor verhuizing en detachering.",
      de: "Die Unterkunft ist oft das Hindernis für Umzug und Entsendung.",
    },
    help: {
      en: "Accommodation is part of the structured need and readiness — not an afterthought.",
      lt: "Apgyvendinimas yra struktūruoto poreikio ir pasirengimo dalis — ne paskutinė mintis.",
      ru: "Проживание — часть структурированной потребности и готовности, а не запоздалая мысль.",
      nl: "Huisvesting is onderdeel van de gestructureerde behoefte en gereedheid — geen bijzaak.",
      de: "Die Unterkunft ist Teil des strukturierten Bedarfs und der Einsatzbereitschaft — kein nachträglicher Gedanke.",
    },
    audience: "employer",
  },
  {
    key: "foreign-workers",
    question: { en: "Foreign workers for a company", lt: "Užsienio darbuotojai įmonei", ru: "Иностранные работники для компании", nl: "Buitenlandse werknemers voor een bedrijf", de: "Ausländische Arbeitskräfte für ein Unternehmen" },
    pain: {
      en: "Cross-border hiring adds documents, language and logistics on top.",
      lt: "Tarptautinis įdarbinimas prideda dokumentų, kalbos ir logistikos.",
      ru: "Трансграничный наём добавляет документы, язык и логистику.",
      nl: "Grensoverschrijdend werven brengt extra documenten, taal en logistiek met zich mee.",
      de: "Grenzüberschreitende Einstellungen bringen zusätzlich Dokumente, Sprache und Logistik mit sich.",
    },
    help: {
      en: "Profiles, skills, documents and accommodation are structured so the next steps are clear.",
      lt: "Profiliai, įgūdžiai, dokumentai ir apgyvendinimas struktūruojami, kad tolimesni veiksmai būtų aiškūs.",
      ru: "Профили, навыки, документы и проживание структурированы, чтобы дальнейшие шаги были ясны.",
      nl: "Profielen, vaardigheden, documenten en huisvesting worden gestructureerd, zodat de volgende stappen duidelijk zijn.",
      de: "Profile, Fähigkeiten, Dokumente und Unterkunft werden strukturiert, damit die nächsten Schritte klar sind.",
    },
    audience: "employer",
  },
  {
    key: "verify-skills",
    question: { en: "How to verify a worker's skills", lt: "Kaip patikrinti darbuotojo įgūdžius", ru: "Как проверить навыки работника", nl: "Hoe controleer je de vaardigheden van een werknemer", de: "Wie Sie die Fähigkeiten einer Arbeitskraft überprüfen" },
    pain: {
      en: "Employers can't tell self-claimed skills from proven experience.",
      lt: "Darbdaviai negali atskirti deklaruotų įgūdžių nuo įrodytos patirties.",
      ru: "Работодатели не отличают заявленные навыки от подтверждённого опыта.",
      nl: "Werkgevers kunnen zelfverklaarde vaardigheden niet onderscheiden van bewezen ervaring.",
      de: "Arbeitgeber können selbst angegebene Fähigkeiten nicht von nachgewiesener Erfahrung unterscheiden.",
    },
    help: {
      en: "Skills are shown as verified or self-declared — never silently mixed.",
      lt: "Įgūdžiai rodomi kaip patvirtinti arba savideklaruoti — niekada tyliai nesumaišomi.",
      ru: "Навыки показаны как подтверждённые или самозаявленные — без тихого смешивания.",
      nl: "Vaardigheden worden getoond als geverifieerd of zelfverklaard — nooit stilzwijgend gemengd.",
      de: "Fähigkeiten werden als verifiziert oder selbst angegeben angezeigt — niemals stillschweigend vermischt.",
    },
    audience: "employer",
  },
  {
    key: "worker-without-cv",
    question: { en: "Worker has no CV", lt: "Darbuotojas neturi CV", ru: "У работника нет CV", nl: "Werknemer heeft geen cv", de: "Arbeitskraft hat keinen Lebenslauf" },
    pain: {
      en: "Experienced workers lose opportunities for lack of a written CV.",
      lt: "Patyrę darbuotojai praranda galimybes, nes neturi parašyto CV.",
      ru: "Опытные работники теряют возможности из-за отсутствия CV.",
      nl: "Ervaren werknemers lopen kansen mis omdat ze geen geschreven cv hebben.",
      de: "Erfahrene Arbeitskräfte verlieren Chancen, weil ein schriftlicher Lebenslauf fehlt.",
    },
    help: {
      en: "A structured intake turns real experience and skills into a usable profile and CV.",
      lt: "Struktūruota anketa paverčia realią patirtį ir įgūdžius naudingu profiliu ir CV.",
      ru: "Структурированная анкета превращает реальный опыт и навыки в готовый профиль и CV.",
      nl: "Een gestructureerde intake zet echte ervaring en vaardigheden om in een bruikbaar profiel en cv.",
      de: "Eine strukturierte Erfassung verwandelt echte Erfahrung und Fähigkeiten in ein nutzbares Profil und einen Lebenslauf.",
    },
    audience: "worker",
  },
  {
    key: "unknown-real-experience",
    question: { en: "Employer doesn't know a worker's real experience", lt: "Darbdavys nežino realios darbuotojo patirties", ru: "Работодатель не знает реального опыта работника", nl: "Werkgever kent de echte ervaring van een werknemer niet", de: "Arbeitgeber kennt die tatsächliche Erfahrung einer Arbeitskraft nicht" },
    pain: {
      en: "Hiring blind on a title leads to mismatches on site.",
      lt: "Įdarbinimas aklai pagal pareigybę veda prie neatitikimų vietoje.",
      ru: "Наём вслепую по должности ведёт к несоответствиям на месте.",
      nl: "Blind aannemen op een functietitel leidt tot mismatches op de werkplek.",
      de: "Blindes Einstellen nach Berufsbezeichnung führt zu Fehlbesetzungen vor Ort.",
    },
    help: {
      en: "Profiles surface concrete skills and work history, with verification status visible.",
      lt: "Profiliai parodo konkrečius įgūdžius ir darbo istoriją su matomu patvirtinimo statusu.",
      ru: "Профили показывают конкретные навыки и историю работы с видимым статусом проверки.",
      nl: "Profielen tonen concrete vaardigheden en werkgeschiedenis, met zichtbare verificatiestatus.",
      de: "Profile zeigen konkrete Fähigkeiten und Berufserfahrung, mit sichtbarem Verifizierungsstatus.",
    },
    audience: "employer",
  },
  {
    key: "find-team",
    question: { en: "How to find a reliable team / brigade", lt: "Kaip rasti patikimą brigadą", ru: "Как найти надёжную бригаду", nl: "Hoe vind je een betrouwbaar team / betrouwbare ploeg", de: "Wie Sie ein zuverlässiges Team / eine zuverlässige Kolonne finden" },
    pain: {
      en: "A whole team is harder to assess than a single worker.",
      lt: "Visą brigadą įvertinti sunkiau nei vieną darbuotoją.",
      ru: "Целую бригаду оценить сложнее, чем одного работника.",
      nl: "Een heel team is lastiger te beoordelen dan één werknemer.",
      de: "Ein ganzes Team ist schwerer einzuschätzen als eine einzelne Arbeitskraft.",
    },
    help: {
      en: "Teams can be represented and matched as a unit against a structured need.",
      lt: "Brigadas galima pristatyti ir sugretinti kaip vienetą pagal struktūruotą poreikį.",
      ru: "Бригады можно представить и подобрать как единицу под структурированную потребность.",
      nl: "Teams kunnen als één geheel worden gepresenteerd en gematcht met een gestructureerde behoefte.",
      de: "Teams können als Einheit dargestellt und mit einem strukturierten Bedarf abgeglichen werden.",
    },
    audience: "agency",
  },
  {
    key: "show-skills",
    question: { en: "How a worker can show what they can do", lt: "Kaip darbuotojui parodyti, ką moka", ru: "Как работнику показать, что он умеет", nl: "Hoe je als werknemer laat zien wat je kunt", de: "Wie eine Arbeitskraft zeigen kann, was sie kann" },
    pain: {
      en: "Skills stay invisible without a structured way to present them.",
      lt: "Įgūdžiai lieka nematomi be struktūruoto būdo juos pristatyti.",
      ru: "Навыки остаются невидимыми без структурированного способа их показать.",
      nl: "Vaardigheden blijven onzichtbaar zonder een gestructureerde manier om ze te presenteren.",
      de: "Fähigkeiten bleiben unsichtbar ohne eine strukturierte Möglichkeit, sie zu präsentieren.",
    },
    help: {
      en: "Build a profile with skills, experience and availability that employers can read at a glance.",
      lt: "Susikurk profilį su įgūdžiais, patirtimi ir prieinamumu, kurį darbdaviai perskaito iš karto.",
      ru: "Создайте профиль с навыками, опытом и доступностью, понятный работодателю с первого взгляда.",
      nl: "Bouw een profiel met vaardigheden, ervaring en beschikbaarheid dat werkgevers in één oogopslag kunnen lezen.",
      de: "Erstellen Sie ein Profil mit Fähigkeiten, Erfahrung und Verfügbarkeit, das Arbeitgeber auf einen Blick erfassen können.",
    },
    audience: "worker",
  },
  {
    key: "describe-need-fast",
    question: { en: "How a company can describe a workforce need fast", lt: "Kaip įmonei greitai aprašyti darbo poreikį", ru: "Как компании быстро описать кадровую потребность", nl: "Hoe een bedrijf snel een personeelsbehoefte beschrijft", de: "Wie ein Unternehmen schnell einen Personalbedarf beschreibt" },
    pain: {
      en: "Vague requests slow down everyone and produce poor matches.",
      lt: "Neaiškūs prašymai stabdo visus ir duoda prastus atitikimus.",
      ru: "Размытые запросы тормозят всех и дают плохие совпадения.",
      nl: "Vage aanvragen vertragen iedereen en leveren slechte matches op.",
      de: "Vage Anfragen bremsen alle aus und führen zu schlechten Treffern.",
    },
    help: {
      en: "A guided need form captures profession, skills, team size, location and start in minutes.",
      lt: "Vedama poreikio forma per kelias minutes surenka profesiją, įgūdžius, komandos dydį, vietą ir pradžią.",
      ru: "Управляемая форма за минуты фиксирует профессию, навыки, размер команды, локацию и старт.",
      nl: "Een begeleid behoefteformulier legt binnen minuten beroep, vaardigheden, teamgrootte, locatie en startdatum vast.",
      de: "Ein geführtes Bedarfsformular erfasst Beruf, Fähigkeiten, Teamgröße, Standort und Start in Minuten.",
    },
    audience: "employer",
  },
];

/** Resolve a localized string from an L map for an active locale. */
export function pick(map: L, locale: ActiveLocale): string {
  return map[locale];
}
