/**
 * Profession + problem SEO content — pure, per-locale (lt / en / ru).
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
  { key: "construction-workers", sector: "construction", label: { en: "Construction workers", lt: "Statybininkai", ru: "Строители" } },
  { key: "finishers", sector: "construction", label: { en: "Finishers", lt: "Apdailininkai", ru: "Отделочники" } },
  { key: "bricklayers", sector: "construction", label: { en: "Bricklayers", lt: "Mūrininkai", ru: "Каменщики" } },
  { key: "roofers", sector: "construction", label: { en: "Roofers", lt: "Stogdengiai", ru: "Кровельщики" } },
  { key: "concrete-workers", sector: "construction", label: { en: "Concrete workers", lt: "Betonuotojai", ru: "Бетонщики" } },
  { key: "electricians", sector: "construction", label: { en: "Electricians", lt: "Elektrikai", ru: "Электрики" } },
  { key: "plumbers", sector: "construction", label: { en: "Plumbers", lt: "Santechnikai", ru: "Сантехники" } },
  { key: "welders", sector: "manufacturing", label: { en: "Welders", lt: "Suvirintojai", ru: "Сварщики" } },
  { key: "drivers", sector: "transport_logistics", label: { en: "Drivers", lt: "Vairuotojai", ru: "Водители" } },
  { key: "warehouse-workers", sector: "transport_logistics", label: { en: "Warehouse workers", lt: "Sandėlio darbuotojai", ru: "Работники склада" } },
  { key: "production-operators", sector: "manufacturing", label: { en: "Production operators", lt: "Gamybos operatoriai", ru: "Операторы производства" } },
  { key: "mechanics", sector: "manufacturing", label: { en: "Mechanics", lt: "Mechanikai", ru: "Механики" } },
  { key: "technicians", sector: "manufacturing", label: { en: "Technicians", lt: "Technikai", ru: "Техники" } },
  { key: "cleaners", sector: "cleaning_facility", label: { en: "Cleaners", lt: "Valytojai", ru: "Уборщики" } },
  { key: "hotel-staff", sector: "hospitality_food", label: { en: "Hotel staff", lt: "Viešbučių darbuotojai", ru: "Работники гостиниц" } },
  { key: "cooks", sector: "hospitality_food", label: { en: "Cooks", lt: "Virėjai", ru: "Повара" } },
  { key: "general-workers", sector: "other", label: { en: "General / helper workers", lt: "Pagalbiniai darbuotojai", ru: "Подсобные работники" } },
  { key: "care-workers", sector: "care_health", label: { en: "Care workers", lt: "Slaugos / priežiūros darbuotojai", ru: "Работники ухода" } },
  { key: "agricultural-workers", sector: "agriculture", label: { en: "Agricultural workers", lt: "Žemės ūkio darbuotojai", ru: "Работники сельского хозяйства" } },
  { key: "seasonal-workers", sector: "agriculture", label: { en: "Seasonal workers", lt: "Sezoniniai darbuotojai", ru: "Сезонные работники" } },
  { key: "admin-staff", sector: "office_admin", label: { en: "Administration staff", lt: "Administracijos darbuotojai", ru: "Административные работники" } },
  { key: "sales-service", sector: "retail_sales", label: { en: "Sales / customer service", lt: "Pardavimų / klientų aptarnavimo darbuotojai", ru: "Продажи / обслуживание клиентов" } },
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
    label: { en: "Teams / brigades", lt: "Brigados / komandos", ru: "Бригады / команды" },
    blurb: {
      en: "Find or present a ready team, not just one worker.",
      lt: "Rask arba pristatyk paruoštą brigadą, ne tik vieną darbuotoją.",
      ru: "Найдите или представьте готовую бригаду, а не одного работника.",
    },
  },
  {
    key: "subcontractors",
    label: { en: "Subcontractors", lt: "Subrangovai", ru: "Субподрядчики" },
    blurb: {
      en: "Coordinate subcontractors against a structured need.",
      lt: "Koordinuok subrangovus pagal struktūruotą poreikį.",
      ru: "Координируйте субподрядчиков под структурированную потребность.",
    },
  },
  {
    key: "agencies",
    label: { en: "Staffing agencies", lt: "Įdarbinimo agentūros", ru: "Кадровые агентства" },
    blurb: {
      en: "Manage a flow of candidates and employer needs in one place.",
      lt: "Valdyk kandidatų ir darbdavių poreikių srautą vienoje vietoje.",
      ru: "Управляйте потоком кандидатов и потребностей работодателей в одном месте.",
    },
  },
  {
    key: "employers",
    label: { en: "Companies hiring workers", lt: "Įmonės, ieškančios darbuotojų", ru: "Компании, ищущие работников" },
    blurb: {
      en: "Describe a real workforce need and structure the next steps.",
      lt: "Aprašyk realų darbo jėgos poreikį ir struktūruok tolimesnius veiksmus.",
      ru: "Опишите реальную кадровую потребность и структурируйте дальнейшие шаги.",
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
    question: { en: "We need workers fast", lt: "Trūksta darbuotojų, reikia greitai", ru: "Срочно нужны работники" },
    pain: {
      en: "Open positions stall a project when no structured pipeline exists.",
      lt: "Neužpildytos vietos stabdo projektą, kai nėra struktūruoto srauto.",
      ru: "Незаполненные позиции тормозят проект без структурированного потока.",
    },
    help: {
      en: "Post a structured workforce need; LabourMarket.ai helps match it to available workers and teams.",
      lt: "Pateik struktūruotą poreikį; LabourMarket.ai padeda jį sugretinti su prieinamais darbuotojais ir brigadomis.",
      ru: "Подайте структурированную потребность; LabourMarket.ai помогает сопоставить её с доступными работниками и бригадами.",
    },
    audience: "employer",
  },
  {
    key: "need-specific-trade",
    question: { en: "We need welders / drivers / specific trades", lt: "Reikia suvirintojų / vairuotojų / konkrečių specialistų", ru: "Нужны сварщики / водители / конкретные специалисты" },
    pain: {
      en: "Generic job ads rarely surface the specific skills a role needs.",
      lt: "Bendri skelbimai retai parodo konkrečius reikalingus įgūdžius.",
      ru: "Общие объявления редко показывают нужные конкретные навыки.",
    },
    help: {
      en: "Describe the profession and skills precisely; matching works on real skills, not job titles only.",
      lt: "Tiksliai aprašyk profesiją ir įgūdžius; atitikimas remiasi realiais įgūdžiais, ne vien pareigybėmis.",
      ru: "Опишите профессию и навыки точно; подбор работает на реальных навыках, а не только на названиях должностей.",
    },
    audience: "employer",
  },
  {
    key: "workers-with-accommodation",
    question: { en: "Workers with accommodation", lt: "Darbuotojai su apgyvendinimu", ru: "Работники с проживанием" },
    pain: {
      en: "Accommodation is often the blocker for relocation and posting.",
      lt: "Apgyvendinimas dažnai yra kliūtis relokacijai ir komandiruotei.",
      ru: "Проживание часто становится барьером для релокации и командировки.",
    },
    help: {
      en: "Accommodation is part of the structured need and readiness — not an afterthought.",
      lt: "Apgyvendinimas yra struktūruoto poreikio ir pasirengimo dalis — ne paskutinė mintis.",
      ru: "Проживание — часть структурированной потребности и готовности, а не запоздалая мысль.",
    },
    audience: "employer",
  },
  {
    key: "foreign-workers",
    question: { en: "Foreign workers for a company", lt: "Užsienio darbuotojai įmonei", ru: "Иностранные работники для компании" },
    pain: {
      en: "Cross-border hiring adds documents, language and logistics on top.",
      lt: "Tarptautinis įdarbinimas prideda dokumentų, kalbos ir logistikos.",
      ru: "Трансграничный наём добавляет документы, язык и логистику.",
    },
    help: {
      en: "Profiles, skills, documents and accommodation are structured so the next steps are clear.",
      lt: "Profiliai, įgūdžiai, dokumentai ir apgyvendinimas struktūruojami, kad tolimesni veiksmai būtų aiškūs.",
      ru: "Профили, навыки, документы и проживание структурированы, чтобы дальнейшие шаги были ясны.",
    },
    audience: "employer",
  },
  {
    key: "verify-skills",
    question: { en: "How to verify a worker's skills", lt: "Kaip patikrinti darbuotojo įgūdžius", ru: "Как проверить навыки работника" },
    pain: {
      en: "Employers can't tell self-claimed skills from proven experience.",
      lt: "Darbdaviai negali atskirti deklaruotų įgūdžių nuo įrodytos patirties.",
      ru: "Работодатели не отличают заявленные навыки от подтверждённого опыта.",
    },
    help: {
      en: "Skills are shown as verified or self-declared — never silently mixed.",
      lt: "Įgūdžiai rodomi kaip patvirtinti arba savideklaruoti — niekada tyliai nesumaišomi.",
      ru: "Навыки показаны как подтверждённые или самозаявленные — без тихого смешивания.",
    },
    audience: "employer",
  },
  {
    key: "worker-without-cv",
    question: { en: "Worker has no CV", lt: "Darbuotojas neturi CV", ru: "У работника нет CV" },
    pain: {
      en: "Experienced workers lose opportunities for lack of a written CV.",
      lt: "Patyrę darbuotojai praranda galimybes, nes neturi parašyto CV.",
      ru: "Опытные работники теряют возможности из-за отсутствия CV.",
    },
    help: {
      en: "A structured intake turns real experience and skills into a usable profile and CV.",
      lt: "Struktūruota anketa paverčia realią patirtį ir įgūdžius naudingu profiliu ir CV.",
      ru: "Структурированная анкета превращает реальный опыт и навыки в готовый профиль и CV.",
    },
    audience: "worker",
  },
  {
    key: "unknown-real-experience",
    question: { en: "Employer doesn't know a worker's real experience", lt: "Darbdavys nežino realios darbuotojo patirties", ru: "Работодатель не знает реального опыта работника" },
    pain: {
      en: "Hiring blind on a title leads to mismatches on site.",
      lt: "Įdarbinimas aklai pagal pareigybę veda prie neatitikimų vietoje.",
      ru: "Наём вслепую по должности ведёт к несоответствиям на месте.",
    },
    help: {
      en: "Profiles surface concrete skills and work history, with verification status visible.",
      lt: "Profiliai parodo konkrečius įgūdžius ir darbo istoriją su matomu patvirtinimo statusu.",
      ru: "Профили показывают конкретные навыки и историю работы с видимым статусом проверки.",
    },
    audience: "employer",
  },
  {
    key: "find-team",
    question: { en: "How to find a reliable team / brigade", lt: "Kaip rasti patikimą brigadą", ru: "Как найти надёжную бригаду" },
    pain: {
      en: "A whole team is harder to assess than a single worker.",
      lt: "Visą brigadą įvertinti sunkiau nei vieną darbuotoją.",
      ru: "Целую бригаду оценить сложнее, чем одного работника.",
    },
    help: {
      en: "Teams can be represented and matched as a unit against a structured need.",
      lt: "Brigadas galima pristatyti ir sugretinti kaip vienetą pagal struktūruotą poreikį.",
      ru: "Бригады можно представить и подобрать как единицу под структурированную потребность.",
    },
    audience: "agency",
  },
  {
    key: "show-skills",
    question: { en: "How a worker can show what they can do", lt: "Kaip darbuotojui parodyti, ką moka", ru: "Как работнику показать, что он умеет" },
    pain: {
      en: "Skills stay invisible without a structured way to present them.",
      lt: "Įgūdžiai lieka nematomi be struktūruoto būdo juos pristatyti.",
      ru: "Навыки остаются невидимыми без структурированного способа их показать.",
    },
    help: {
      en: "Build a profile with skills, experience and availability that employers can read at a glance.",
      lt: "Susikurk profilį su įgūdžiais, patirtimi ir prieinamumu, kurį darbdaviai perskaito iš karto.",
      ru: "Создайте профиль с навыками, опытом и доступностью, понятный работодателю с первого взгляда.",
    },
    audience: "worker",
  },
  {
    key: "describe-need-fast",
    question: { en: "How a company can describe a workforce need fast", lt: "Kaip įmonei greitai aprašyti darbo poreikį", ru: "Как компании быстро описать кадровую потребность" },
    pain: {
      en: "Vague requests slow down everyone and produce poor matches.",
      lt: "Neaiškūs prašymai stabdo visus ir duoda prastus atitikimus.",
      ru: "Размытые запросы тормозят всех и дают плохие совпадения.",
    },
    help: {
      en: "A guided need form captures profession, skills, team size, location and start in minutes.",
      lt: "Vedama poreikio forma per kelias minutes surenka profesiją, įgūdžius, komandos dydį, vietą ir pradžią.",
      ru: "Управляемая форма за минуты фиксирует профессию, навыки, размер команды, локацию и старт.",
    },
    audience: "employer",
  },
];

/** Resolve a localized string from an L map for an active locale. */
export function pick(map: L, locale: ActiveLocale): string {
  return map[locale];
}
