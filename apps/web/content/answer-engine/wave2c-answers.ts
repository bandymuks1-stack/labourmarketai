/**
 * Answer Engine — localized answer content, Wave 2C (evidence-backed).
 *
 * 12 canonical questions selected from REAL public demand (see the editorial
 * research module content/answer-engine/research/public-question-signals.ts),
 * written natively in lt/en/ru/nl/de = 60 localized answer pages. Published set
 * grows to 30 questions / 150 pages.
 *
 * Two source layers are kept separate (owner doctrine):
 *  - question DISCOVERY signals (why the question matters) live in the research
 *    module and are NEVER rendered;
 *  - answer EVIDENCE sources (official/primary, backing factual claims) are set
 *    here and shown publicly under the Sources heading.
 *
 * MEDIUM-risk EU-mobility / labour-demand questions each carry ≥1 official EU
 * source (Your Europe, EURES, CEDEFOP, Europass), a scope tag and a checkedAt
 * date. No exact salaries, no invented statistics, no legal certainty — factual
 * specifics defer to the cited official source. LOW-risk product/career answers
 * are editorial and need no external source. No HIGH-risk content.
 */
import type { LocalizedAnswer, AnswerEvidenceSource } from "@/lib/answer-engine/publishing";
import type { ActiveLocale } from "@/lib/i18n/config";

type Loc = ActiveLocale;
type Body = {
  slug: string;
  h1: string;
  short: string;
  full: string[];
  steps?: string[];
  limitations?: string;
  title: string;
  desc: string;
};
interface Draft {
  id: string;
  country?: string;
  ev?: readonly AnswerEvidenceSource[];
  per: Record<Loc, Body>;
}

const EDITORIAL = "LabourMarket.ai editorial";
const REVIEWED = "2026-07-18";
const CHECKED = "2026-07-18";

// ── Official evidence sources (reused across questions) ─────────────────────
const SRC_WORKING_EU: AnswerEvidenceSource = {
  title: "Working in the EU",
  url: "https://european-union.europa.eu/live-work-study/working-eu_en",
  publisher: "European Union",
  scope: "EU",
  checkedAt: CHECKED,
};
const SRC_WORK_PERMITS: AnswerEvidenceSource = {
  title: "Work permits — Your Europe",
  url: "https://europa.eu/youreurope/citizens/work/work-abroad/work-permits/index_en.htm",
  publisher: "European Union — Your Europe",
  scope: "EU",
  checkedAt: CHECKED,
};
const SRC_PROF_QUALS: AnswerEvidenceSource = {
  title: "Professional qualifications — Your Europe",
  url: "https://europa.eu/youreurope/citizens/work/professional-qualifications/index_en.htm",
  publisher: "European Union — Your Europe",
  scope: "EU",
  checkedAt: CHECKED,
};
const SRC_EURES_SHORTAGES: AnswerEvidenceSource = {
  title: "Labour shortages and surpluses in Europe",
  url: "https://eures.europa.eu/living-and-working/labour-shortages-and-surpluses-europe_en",
  publisher: "EURES (European Employment Services)",
  scope: "EU",
  checkedAt: CHECKED,
};
const SRC_CEDEFOP_DEMAND: AnswerEvidenceSource = {
  title: "Demand for occupations — EURES / CEDEFOP",
  url: "https://www.cedefop.europa.eu/en/tools/skills-online-vacancies/ela-eures/demand-occupations",
  publisher: "CEDEFOP",
  scope: "EU",
  checkedAt: CHECKED,
};
const SRC_CEDEFOP_SHORTAGES: AnswerEvidenceSource = {
  title: "Skill shortages in Europe: which occupations are in demand",
  url: "https://www.cedefop.europa.eu/en/news/skill-shortages-europe-which-occupations-are-demand-and-why",
  publisher: "CEDEFOP",
  scope: "EU",
  checkedAt: CHECKED,
};
const SRC_EURES_LIVING: AnswerEvidenceSource = {
  title: "Living and working conditions — EURES",
  url: "https://eures.europa.eu/living-and-working/living-and-working-conditions_en",
  publisher: "EURES (European Employment Services)",
  scope: "EU",
  checkedAt: CHECKED,
};
const SRC_EUROPASS: AnswerEvidenceSource = {
  title: "Europass",
  url: "https://europass.europa.eu/en",
  publisher: "European Union — Europass",
  scope: "EU",
  checkedAt: CHECKED,
};

const DRAFTS: readonly Draft[] = [
  // ═══ MEDIUM-risk, EU-mobility / labour-demand — official evidence ═══
  {
    id: "AE-0336",
    ev: [SRC_WORKING_EU, SRC_WORK_PERMITS],
    per: {
      en: {
        slug: "what-is-free-movement-of-workers-in-the-eu",
        h1: "What is free movement of workers in the EU?",
        short: "Free movement of workers is an EU right that lets citizens of an EU country work in another EU country without a work permit, under the same conditions as that country's own nationals.",
        full: [
          "As an EU citizen you do not need a work permit to take a job — employed or self-employed — in any other EU country. You are also entitled to equal treatment with local workers in access to jobs, working conditions, pay and social advantages. The right extends across the EU and, in practice, to the wider EEA (Iceland, Liechtenstein, Norway) and Switzerland.",
          "Free movement is a general rule, not a guarantee of a specific job, and some points still depend on national law — for example, certain public-sector posts can be reserved for nationals, and if your profession is regulated you may need your qualifications recognised first. For the current rules that apply to your situation, check the official EU sources below.",
        ],
        limitations: "This is general EU-level information, not advice for a specific case. National rules and exceptions apply; confirm the details for your country and profession with the official sources.",
        title: "Free movement of workers in the EU explained",
        desc: "What free movement of workers in the EU means: EU citizens can work in another EU country without a permit, with equal treatment — general rule, official sources.",
      },
      lt: {
        slug: "kas-yra-laisvas-darbuotoju-judejimas-es",
        h1: "Kas yra laisvas darbuotojų judėjimas ES?",
        short: "Laisvas darbuotojų judėjimas — ES teisė, leidžianti vienos ES šalies piliečiams dirbti kitoje ES šalyje be darbo leidimo, tokiomis pačiomis sąlygomis kaip tos šalies piliečiai.",
        full: [
          "Kaip ES pilietis neprivalote turėti darbo leidimo, kad įsidarbintumėte — pagal darbo sutartį ar savarankiškai — bet kurioje kitoje ES šalyje. Taip pat turite teisę į vienodą požiūrį su vietos darbuotojais dėl galimybės įsidarbinti, darbo sąlygų, atlyginimo ir socialinių lengvatų. Ši teisė galioja visoje ES ir praktiškai platesnėje EEE (Islandija, Lichtenšteinas, Norvegija) bei Šveicarijoje.",
          "Laisvas judėjimas yra bendra taisyklė, o ne konkretaus darbo garantija, ir kai kurie dalykai priklauso nuo nacionalinės teisės — pavyzdžiui, tam tikros viešojo sektoriaus pareigos gali būti skirtos tik piliečiams, o jei jūsų profesija reguliuojama, pirma gali reikėti pripažinti kvalifikaciją. Aktualias jūsų situacijai taisykles rasite oficialiuose ES šaltiniuose žemiau.",
        ],
        limitations: "Tai bendra ES lygmens informacija, ne patarimas konkrečiam atvejui. Galioja nacionalinės taisyklės ir išimtys; detales savo šaliai ir profesijai pasitikrinkite oficialiuose šaltiniuose.",
        title: "Laisvas darbuotojų judėjimas ES paaiškintas",
        desc: "Ką reiškia laisvas darbuotojų judėjimas ES: ES piliečiai gali dirbti kitoje ES šalyje be leidimo, vienodomis sąlygomis — bendra taisyklė, oficialūs šaltiniai.",
      },
      ru: {
        slug: "chto-takoe-svobodnoe-peredvizhenie-rabotnikov-es",
        h1: "Что такое свободное передвижение работников в ЕС?",
        short: "Свободное передвижение работников — право ЕС, позволяющее гражданам одной страны ЕС работать в другой стране ЕС без разрешения на работу, на тех же условиях, что и граждане этой страны.",
        full: [
          "Как гражданину ЕС вам не нужно разрешение на работу, чтобы устроиться — по найму или самостоятельно — в любой другой стране ЕС. Вы также имеете право на равное обращение с местными работниками в доступе к работе, условиях труда, оплате и социальных льготах. Право действует по всему ЕС и на практике в более широком ЕЭП (Исландия, Лихтенштейн, Норвегия) и Швейцарии.",
          "Свободное передвижение — общее правило, а не гарантия конкретной работы, и часть моментов зависит от национального права: например, некоторые должности в госсекторе могут быть закреплены за гражданами, а если ваша профессия регулируется, может понадобиться признание квалификации. Актуальные для вашей ситуации правила смотрите в официальных источниках ЕС ниже.",
        ],
        limitations: "Это общая информация уровня ЕС, а не совет по конкретному случаю. Действуют национальные правила и исключения; уточняйте детали для вашей страны и профессии в официальных источниках.",
        title: "Свободное передвижение работников в ЕС — объяснение",
        desc: "Что означает свободное передвижение работников в ЕС: граждане ЕС могут работать в другой стране ЕС без разрешения, с равным обращением — общее правило, официальные источники.",
      },
      nl: {
        slug: "wat-is-vrij-verkeer-van-werknemers-in-de-eu",
        h1: "Wat is vrij verkeer van werknemers in de EU?",
        short: "Vrij verkeer van werknemers is een EU-recht waarmee burgers van een EU-land in een ander EU-land mogen werken zonder werkvergunning, onder dezelfde voorwaarden als de eigen inwoners van dat land.",
        full: [
          "Als EU-burger heb je geen werkvergunning nodig om — in loondienst of als zelfstandige — in een ander EU-land te werken. Je hebt ook recht op gelijke behandeling met lokale werknemers wat betreft toegang tot werk, arbeidsvoorwaarden, beloning en sociale voordelen. Het recht geldt in de hele EU en in de praktijk in de bredere EER (IJsland, Liechtenstein, Noorwegen) en Zwitserland.",
          "Vrij verkeer is een algemene regel, geen garantie op een specifieke baan, en sommige punten hangen af van nationaal recht — zo kunnen bepaalde overheidsfuncties voorbehouden zijn aan eigen inwoners, en als je beroep gereglementeerd is, moet je kwalificatie misschien eerst erkend worden. De actuele regels voor jouw situatie vind je in de officiële EU-bronnen hieronder.",
        ],
        limitations: "Dit is algemene EU-informatie, geen advies voor een specifiek geval. Nationale regels en uitzonderingen gelden; controleer de details voor jouw land en beroep bij de officiële bronnen.",
        title: "Vrij verkeer van werknemers in de EU uitgelegd",
        desc: "Wat vrij verkeer van werknemers in de EU betekent: EU-burgers mogen zonder vergunning in een ander EU-land werken, met gelijke behandeling — algemene regel, officiële bronnen.",
      },
      de: {
        slug: "was-ist-die-arbeitnehmerfreizuegigkeit-in-der-eu",
        h1: "Was ist die Arbeitnehmerfreizügigkeit in der EU?",
        short: "Die Arbeitnehmerfreizügigkeit ist ein EU-Recht, das Bürgern eines EU-Landes erlaubt, in einem anderen EU-Land ohne Arbeitserlaubnis zu arbeiten — zu denselben Bedingungen wie die Staatsangehörigen dieses Landes.",
        full: [
          "Als EU-Bürger brauchen Sie keine Arbeitserlaubnis, um — angestellt oder selbstständig — in einem anderen EU-Land zu arbeiten. Sie haben zudem Anspruch auf Gleichbehandlung mit einheimischen Arbeitskräften bei Zugang zu Arbeit, Arbeitsbedingungen, Bezahlung und sozialen Vergünstigungen. Das Recht gilt in der gesamten EU und praktisch im weiteren EWR (Island, Liechtenstein, Norwegen) sowie in der Schweiz.",
          "Freizügigkeit ist eine allgemeine Regel, keine Garantie für eine bestimmte Stelle, und einiges hängt vom nationalen Recht ab — etwa können bestimmte Stellen im öffentlichen Dienst Staatsangehörigen vorbehalten sein, und ist Ihr Beruf reglementiert, muss Ihre Qualifikation ggf. zuerst anerkannt werden. Die aktuellen Regeln für Ihre Situation finden Sie in den offiziellen EU-Quellen unten.",
        ],
        limitations: "Dies ist allgemeine EU-Information, keine Beratung für einen Einzelfall. Nationale Regeln und Ausnahmen gelten; prüfen Sie die Details für Ihr Land und Ihren Beruf bei den offiziellen Quellen.",
        title: "Arbeitnehmerfreizügigkeit in der EU erklärt",
        desc: "Was Arbeitnehmerfreizügigkeit in der EU bedeutet: EU-Bürger dürfen ohne Erlaubnis in einem anderen EU-Land arbeiten, mit Gleichbehandlung — allgemeine Regel, offizielle Quellen.",
      },
    },
  },
  {
    id: "AE-0349",
    ev: [SRC_PROF_QUALS, SRC_WORKING_EU],
    per: {
      en: {
        slug: "how-is-my-qualification-recognised-in-another-eu-country",
        h1: "How do I understand recognition of my qualifications abroad?",
        short: "In the EU, formal recognition is needed only if your profession is regulated in the country where you want to work. For regulated professions you apply to that country's authority; some professions are recognised automatically.",
        full: [
          "Whether you need recognition depends on the profession, not on you. If the profession is not regulated in the host country, no formal recognition is required — you can apply for work directly. If it is regulated (for example teacher, lawyer, engineer, some healthcare roles), you apply to the competent authority there, which has up to four months to decide and may ask for extra experience, a course or an aptitude test where training differs significantly.",
          "A few professions — such as doctors, general-care nurses, dentists, midwives, vets, pharmacists and architects — are in principle recognised automatically across the EU. Because rules vary by profession and country, always confirm your specific case with the official EU source below rather than relying on general guidance.",
        ],
        limitations: "General EU-level information, not legal advice. Whether and how your qualification is recognised depends on the profession and the specific country — check the official source for your case.",
        title: "Recognition of your qualifications in the EU",
        desc: "How qualification recognition works in the EU: needed only for regulated professions, decided by the host country's authority, some professions automatic — official source.",
      },
      lt: {
        slug: "kaip-pripazistama-mano-kvalifikacija-kitoje-es-salyje",
        h1: "Kaip suprasti kvalifikacijos pripažinimą užsienyje?",
        short: "ES formalus pripažinimas reikalingas tik jei jūsų profesija šalyje, kurioje norite dirbti, yra reguliuojama. Reguliuojamoms profesijoms kreipiamasi į tos šalies instituciją; kai kurios profesijos pripažįstamos automatiškai.",
        full: [
          "Ar reikia pripažinimo, priklauso nuo profesijos, o ne nuo jūsų. Jei profesija priimančioje šalyje nereguliuojama, formalus pripažinimas nereikalingas — galite iškart kreiptis dėl darbo. Jei ji reguliuojama (pvz., mokytojas, teisininkas, inžinierius, kai kurios sveikatos priežiūros pareigos), kreipiatės į tos šalies kompetentingą instituciją, kuri turi iki keturių mėnesių sprendimui ir gali paprašyti papildomos patirties, kurso ar tinkamumo testo, jei rengimas gerokai skiriasi.",
          "Kelios profesijos — pavyzdžiui, gydytojai, bendrosios praktikos slaugytojai, odontologai, akušeriai, veterinarai, vaistininkai ir architektai — iš esmės pripažįstamos automatiškai visoje ES. Kadangi taisyklės skiriasi pagal profesiją ir šalį, savo konkretų atvejį visada pasitikrinkite oficialiame ES šaltinyje žemiau, o ne pagal bendrą informaciją.",
        ],
        limitations: "Bendra ES lygmens informacija, ne teisinis patarimas. Ar ir kaip pripažįstama kvalifikacija, priklauso nuo profesijos ir konkrečios šalies — savo atvejį pasitikrinkite oficialiame šaltinyje.",
        title: "Kvalifikacijos pripažinimas ES",
        desc: "Kaip veikia kvalifikacijos pripažinimas ES: reikalingas tik reguliuojamoms profesijoms, sprendžia priimančios šalies institucija, kai kurios automatiškai — oficialus šaltinis.",
      },
      ru: {
        slug: "kak-priznaetsya-moya-kvalifikatsiya-v-drugoy-strane-es",
        h1: "Как понять признание квалификации за рубежом?",
        short: "В ЕС формальное признание нужно, только если ваша профессия регулируется в стране, где вы хотите работать. Для регулируемых профессий обращаются в орган этой страны; некоторые профессии признаются автоматически.",
        full: [
          "Нужно ли признание, зависит от профессии, а не от вас. Если в принимающей стране профессия не регулируется, формальное признание не требуется — можно сразу искать работу. Если регулируется (например, учитель, юрист, инженер, ряд медицинских профессий), вы обращаетесь в компетентный орган этой страны, у которого до четырёх месяцев на решение; он может запросить дополнительный опыт, курс или тест на пригодность, если подготовка существенно отличается.",
          "Несколько профессий — врачи, медсёстры общего ухода, стоматологи, акушерки, ветеринары, фармацевты и архитекторы — в принципе признаются автоматически по всему ЕС. Поскольку правила зависят от профессии и страны, всегда проверяйте свой конкретный случай в официальном источнике ЕС ниже, а не по общей информации.",
        ],
        limitations: "Общая информация уровня ЕС, не юридический совет. Признаётся ли квалификация и как, зависит от профессии и конкретной страны — проверьте свой случай в официальном источнике.",
        title: "Признание квалификации в ЕС",
        desc: "Как работает признание квалификации в ЕС: нужно только для регулируемых профессий, решает орган принимающей страны, часть — автоматически — официальный источник.",
      },
      nl: {
        slug: "hoe-wordt-mijn-kwalificatie-in-een-ander-eu-land-erkend",
        h1: "Hoe begrijp ik erkenning van mijn kwalificatie in het buitenland?",
        short: "In de EU is formele erkenning alleen nodig als je beroep gereglementeerd is in het land waar je wilt werken. Voor gereglementeerde beroepen vraag je het aan bij de instantie van dat land; sommige beroepen worden automatisch erkend.",
        full: [
          "Of je erkenning nodig hebt, hangt af van het beroep, niet van jou. Is het beroep in het gastland niet gereglementeerd, dan is formele erkenning niet nodig — je kunt direct solliciteren. Is het wel gereglementeerd (bijvoorbeeld leraar, advocaat, ingenieur, sommige zorgberoepen), dan vraag je het aan bij de bevoegde instantie daar, die tot vier maanden heeft om te beslissen en om extra ervaring, een cursus of een bekwaamheidstest kan vragen als de opleiding sterk verschilt.",
          "Enkele beroepen — zoals artsen, verpleegkundigen algemene zorg, tandartsen, verloskundigen, dierenartsen, apothekers en architecten — worden in principe automatisch erkend in de hele EU. Omdat de regels per beroep en land verschillen, controleer je jouw specifieke geval altijd bij de officiële EU-bron hieronder in plaats van bij algemene uitleg.",
        ],
        limitations: "Algemene EU-informatie, geen juridisch advies. Of en hoe je kwalificatie wordt erkend, hangt af van het beroep en het specifieke land — controleer je geval bij de officiële bron.",
        title: "Erkenning van je kwalificatie in de EU",
        desc: "Hoe erkenning van kwalificaties werkt in de EU: alleen nodig voor gereglementeerde beroepen, beslist door het gastland, sommige automatisch — officiële bron.",
      },
      de: {
        slug: "wie-wird-meine-qualifikation-in-einem-anderen-eu-land-anerkannt",
        h1: "Wie verstehe ich die Anerkennung meiner Qualifikation im Ausland?",
        short: "In der EU ist eine formelle Anerkennung nur nötig, wenn Ihr Beruf im Land, in dem Sie arbeiten möchten, reglementiert ist. Für reglementierte Berufe beantragen Sie sie bei der Behörde dieses Landes; einige Berufe werden automatisch anerkannt.",
        full: [
          "Ob Sie eine Anerkennung brauchen, hängt vom Beruf ab, nicht von Ihnen. Ist der Beruf im Aufnahmeland nicht reglementiert, ist keine formelle Anerkennung nötig — Sie können sich direkt bewerben. Ist er reglementiert (etwa Lehrkraft, Anwalt, Ingenieur, manche Gesundheitsberufe), beantragen Sie sie bei der zuständigen Behörde dort, die bis zu vier Monate für die Entscheidung hat und zusätzliche Erfahrung, einen Kurs oder eine Eignungsprüfung verlangen kann, wenn die Ausbildung deutlich abweicht.",
          "Einige Berufe — etwa Ärzte, Pflegefachkräfte, Zahnärzte, Hebammen, Tierärzte, Apotheker und Architekten — werden EU-weit grundsätzlich automatisch anerkannt. Da die Regeln je Beruf und Land variieren, prüfen Sie Ihren konkreten Fall stets bei der offiziellen EU-Quelle unten statt anhand allgemeiner Hinweise.",
        ],
        limitations: "Allgemeine EU-Information, keine Rechtsberatung. Ob und wie Ihre Qualifikation anerkannt wird, hängt vom Beruf und vom jeweiligen Land ab — prüfen Sie Ihren Fall bei der offiziellen Quelle.",
        title: "Anerkennung Ihrer Qualifikation in der EU",
        desc: "Wie die Anerkennung von Qualifikationen in der EU funktioniert: nur für reglementierte Berufe nötig, entschieden vom Aufnahmeland, einige automatisch — offizielle Quelle.",
      },
    },
  },
  {
    id: "AE-0350",
    ev: [SRC_EURES_SHORTAGES, SRC_CEDEFOP_DEMAND],
    per: {
      en: {
        slug: "which-countries-need-my-profession-most",
        h1: "How do I recognise which countries need my profession most?",
        short: "Use official EU labour-shortage data: EURES and CEDEFOP publish which occupations are in shortage in each country, so you can see where your profession is most in demand rather than guessing.",
        full: [
          "Demand is uneven across Europe and changes over time, so the reliable way to judge it is official data, not anecdotes. EURES publishes labour shortages and surpluses by country, and CEDEFOP tracks demand for occupations from online job vacancies. Together they show where a given profession is short-staffed.",
          "On LabourMarket.ai you start from your real profession and skills; you can then read the official shortage data for the countries you are open to and weigh it against language, location and your own preferences. Treat the figures as a signal about the market, not a promise of a specific job.",
        ],
        steps: [
          "Confirm your profession and skills on your profile.",
          "Check the EURES shortage list and CEDEFOP demand data for the countries you are open to.",
          "Weigh demand against language, location and your preferences before deciding.",
        ],
        limitations: "Shortage data is a market signal, not a guarantee of a job, and it changes over time. Check the publication date on the official sources.",
        title: "Which countries need your profession most",
        desc: "How to see which EU countries need your profession most using official EURES and CEDEFOP shortage data — a market signal, not a job guarantee.",
      },
      lt: {
        slug: "kurios-salys-labiausiai-reikalauja-mano-profesijos",
        h1: "Kaip atpažinti, kurios šalys labiausiai reikalauja mano profesijos?",
        short: "Naudokitės oficialiais ES trūkumo duomenimis: EURES ir CEDEFOP skelbia, kokių profesijų trūksta kiekvienoje šalyje, todėl matote, kur jūsų profesija paklausiausia, o ne spėjate.",
        full: [
          "Paklausa Europoje netolygi ir kinta laikui bėgant, todėl patikimas būdas ją vertinti — oficialūs duomenys, ne pavieniai pasakojimai. EURES skelbia darbo jėgos trūkumą ir perteklių pagal šalis, o CEDEFOP stebi profesijų paklausą iš internetinių skelbimų. Kartu jie parodo, kur konkrečios profesijos trūksta.",
          "LabourMarket.ai pradedate nuo savo realios profesijos ir įgūdžių; tada galite perskaityti oficialius trūkumo duomenis apie šalis, kurioms atviri, ir palyginti su kalba, vieta bei savo pageidavimais. Skaičius laikykite rinkos signalu, o ne konkretaus darbo pažadu.",
        ],
        steps: [
          "Patvirtinkite profilyje savo profesiją ir įgūdžius.",
          "Peržiūrėkite EURES trūkumo sąrašą ir CEDEFOP paklausos duomenis apie jums įdomias šalis.",
          "Prieš spręsdami palyginkite paklausą su kalba, vieta ir pageidavimais.",
        ],
        limitations: "Trūkumo duomenys — rinkos signalas, ne darbo garantija, ir jie kinta. Pasitikrinkite oficialių šaltinių paskelbimo datą.",
        title: "Kurios šalys labiausiai reikalauja jūsų profesijos",
        desc: "Kaip pamatyti, kurioms ES šalims labiausiai reikia jūsų profesijos, naudojant oficialius EURES ir CEDEFOP trūkumo duomenis — rinkos signalas, ne garantija.",
      },
      ru: {
        slug: "kakie-strany-bolshe-vsego-nuzhdayutsya-v-moey-professii",
        h1: "Как понять, каким странам больше всего нужна моя профессия?",
        short: "Используйте официальные данные ЕС о дефиците: EURES и CEDEFOP публикуют, каких профессий не хватает в каждой стране, поэтому вы видите, где ваша профессия востребована, а не гадаете.",
        full: [
          "Спрос по Европе неравномерен и меняется со временем, поэтому надёжный способ его оценить — официальные данные, а не отдельные истории. EURES публикует нехватку и избыток рабочей силы по странам, а CEDEFOP отслеживает спрос на профессии по онлайн-вакансиям. Вместе они показывают, где не хватает конкретной профессии.",
          "На LabourMarket.ai вы начинаете со своей реальной профессии и навыков; затем можно прочитать официальные данные о дефиците по интересующим странам и сопоставить их с языком, местом и вашими предпочтениями. Считайте цифры сигналом рынка, а не обещанием конкретной работы.",
        ],
        steps: [
          "Подтвердите профессию и навыки в профиле.",
          "Проверьте список дефицита EURES и данные спроса CEDEFOP по интересующим странам.",
          "Взвесьте спрос с языком, местом и предпочтениями перед решением.",
        ],
        limitations: "Данные о дефиците — сигнал рынка, а не гарантия работы, и они меняются. Проверяйте дату публикации официальных источников.",
        title: "Каким странам больше всего нужна ваша профессия",
        desc: "Как увидеть, каким странам ЕС больше всего нужна ваша профессия, по официальным данным EURES и CEDEFOP о дефиците — сигнал рынка, не гарантия.",
      },
      nl: {
        slug: "welke-landen-hebben-mijn-beroep-het-hardst-nodig",
        h1: "Hoe herken ik welke landen mijn beroep het hardst nodig hebben?",
        short: "Gebruik officiële EU-tekortdata: EURES en CEDEFOP publiceren welke beroepen in elk land schaars zijn, zodat je ziet waar je beroep het meest gevraagd is in plaats van te gokken.",
        full: [
          "De vraag verschilt binnen Europa en verandert in de tijd, dus de betrouwbare manier om die te beoordelen zijn officiële data, geen anekdotes. EURES publiceert tekorten en overschotten per land, en CEDEFOP volgt de vraag naar beroepen via online vacatures. Samen tonen ze waar een bepaald beroep te weinig mensen heeft.",
          "Op LabourMarket.ai begin je bij je echte beroep en vaardigheden; daarna kun je de officiële tekortdata lezen voor de landen die je overweegt en die afwegen tegen taal, locatie en je eigen voorkeuren. Zie de cijfers als een marktsignaal, niet als een belofte van een specifieke baan.",
        ],
        steps: [
          "Bevestig je beroep en vaardigheden op je profiel.",
          "Bekijk de EURES-tekortlijst en CEDEFOP-vraagdata voor de landen die je overweegt.",
          "Weeg vraag af tegen taal, locatie en voorkeuren voordat je beslist.",
        ],
        limitations: "Tekortdata is een marktsignaal, geen baangarantie, en verandert in de tijd. Controleer de publicatiedatum bij de officiële bronnen.",
        title: "Welke landen je beroep het hardst nodig hebben",
        desc: "Hoe je ziet welke EU-landen je beroep het hardst nodig hebben met officiële EURES- en CEDEFOP-tekortdata — een marktsignaal, geen garantie.",
      },
      de: {
        slug: "welche-laender-brauchen-meinen-beruf-am-meisten",
        h1: "Wie erkenne ich, welche Länder meinen Beruf am meisten brauchen?",
        short: "Nutzen Sie offizielle EU-Mangeldaten: EURES und CEDEFOP veröffentlichen, welche Berufe in jedem Land knapp sind, sodass Sie sehen, wo Ihr Beruf am gefragtesten ist — statt zu raten.",
        full: [
          "Die Nachfrage ist in Europa ungleich und ändert sich mit der Zeit, daher ist der verlässliche Weg, sie einzuschätzen, offizielle Daten, keine Einzelberichte. EURES veröffentlicht Arbeitskräftemangel und -überschuss nach Land, und CEDEFOP verfolgt die Nachfrage nach Berufen aus Online-Stellenanzeigen. Zusammen zeigen sie, wo ein bestimmter Beruf unterbesetzt ist.",
          "Auf LabourMarket.ai starten Sie bei Ihrem echten Beruf und Ihren Fähigkeiten; dann können Sie die offiziellen Mangeldaten für die Länder lesen, die für Sie infrage kommen, und sie gegen Sprache, Ort und eigene Präferenzen abwägen. Behandeln Sie die Zahlen als Marktsignal, nicht als Zusage einer bestimmten Stelle.",
        ],
        steps: [
          "Bestätigen Sie Beruf und Fähigkeiten in Ihrem Profil.",
          "Prüfen Sie die EURES-Mangelliste und CEDEFOP-Nachfragedaten für die infrage kommenden Länder.",
          "Wägen Sie Nachfrage gegen Sprache, Ort und Präferenzen ab, bevor Sie entscheiden.",
        ],
        limitations: "Mangeldaten sind ein Marktsignal, keine Jobgarantie, und ändern sich mit der Zeit. Prüfen Sie das Veröffentlichungsdatum bei den offiziellen Quellen.",
        title: "Welche Länder Ihren Beruf am meisten brauchen",
        desc: "Wie Sie sehen, welche EU-Länder Ihren Beruf am meisten brauchen — mit offiziellen EURES- und CEDEFOP-Mangeldaten. Ein Marktsignal, keine Garantie.",
      },
    },
  },
  {
    id: "AE-0481",
    ev: [SRC_EURES_SHORTAGES, SRC_CEDEFOP_DEMAND],
    per: {
      en: {
        slug: "which-professions-are-in-demand-where-i-want-to-work",
        h1: "How do I find which professions are in demand where I want to work?",
        short: "Check official EU sources for the country: EURES lists shortage occupations and CEDEFOP tracks demand from online vacancies, so you can see which professions that country is actively short of.",
        full: [
          "Rather than trusting a headline about \"the jobs of the future\", look at the country you care about in official data. EURES publishes per-country shortage and surplus occupations, and CEDEFOP's demand-for-occupations tool draws on real online vacancies. Reading both gives you a grounded picture of which professions a specific country needs.",
          "Use that picture alongside your own profile on LabourMarket.ai: it shows opportunities that fit your skills, while the official data tells you how strong demand is for your profession in a given place. Demand shifts, so note when the data was published.",
        ],
        steps: [
          "Pick the country or countries you are considering.",
          "Read the EURES shortage list and CEDEFOP demand data for them.",
          "Compare that demand with your own profession and skills.",
        ],
        limitations: "Demand data reflects a period in time and does not guarantee a job in any single company. Always check the source date.",
        title: "Which professions are in demand where you want to work",
        desc: "How to find in-demand professions in a country using official EURES and CEDEFOP data — a grounded market picture, not a job guarantee.",
      },
      lt: {
        slug: "kokios-profesijos-paklausios-ten-kur-noriu-dirbti",
        h1: "Kaip sužinoti, kokios profesijos paklausios ten, kur noriu dirbti?",
        short: "Pasitikrinkite oficialius ES šaltinius apie šalį: EURES išvardija trūkstamas profesijas, o CEDEFOP stebi paklausą iš internetinių skelbimų, todėl matote, kokių profesijų šalis aktyviai stokoja.",
        full: [
          "Užuot patikėję antrašte apie „ateities darbus“, pažvelkite į jums rūpimą šalį oficialiuose duomenyse. EURES skelbia trūkstamas ir perteklines profesijas pagal šalį, o CEDEFOP profesijų paklausos įrankis remiasi realiais internetiniais skelbimais. Perskaitę abu, gaunate pagrįstą vaizdą, kokių profesijų reikia konkrečiai šaliai.",
          "Šį vaizdą naudokite kartu su savo profiliu LabourMarket.ai: jis rodo jūsų įgūdžius atitinkančias galimybes, o oficialūs duomenys pasako, kokia stipri jūsų profesijos paklausa konkrečioje vietoje. Paklausa keičiasi, todėl atkreipkite dėmesį, kada duomenys paskelbti.",
        ],
        steps: [
          "Pasirinkite šalį ar šalis, kurias svarstote.",
          "Perskaitykite jų EURES trūkumo sąrašą ir CEDEFOP paklausos duomenis.",
          "Palyginkite paklausą su savo profesija ir įgūdžiais.",
        ],
        limitations: "Paklausos duomenys atspindi tam tikrą laikotarpį ir negarantuoja darbo konkrečioje įmonėje. Visada pasitikrinkite šaltinio datą.",
        title: "Kokios profesijos paklausios ten, kur norite dirbti",
        desc: "Kaip rasti paklausias profesijas šalyje pagal oficialius EURES ir CEDEFOP duomenis — pagrįstas rinkos vaizdas, ne darbo garantija.",
      },
      ru: {
        slug: "kakie-professii-vostrebovany-tam-gde-ya-khochu-rabotat",
        h1: "Как узнать, какие профессии востребованы там, где я хочу работать?",
        short: "Проверьте официальные источники ЕС по стране: EURES перечисляет дефицитные профессии, а CEDEFOP отслеживает спрос по онлайн-вакансиям, поэтому вы видите, каких профессий стране активно не хватает.",
        full: [
          "Вместо того чтобы верить заголовку о «профессиях будущего», посмотрите на интересующую страну в официальных данных. EURES публикует дефицитные и избыточные профессии по странам, а инструмент спроса CEDEFOP опирается на реальные онлайн-вакансии. Прочитав оба, вы получите обоснованную картину того, какие профессии нужны конкретной стране.",
          "Используйте эту картину вместе со своим профилем на LabourMarket.ai: он показывает возможности под ваши навыки, а официальные данные говорят, насколько силён спрос на вашу профессию в конкретном месте. Спрос меняется, поэтому отмечайте, когда данные опубликованы.",
        ],
        steps: [
          "Выберите страну или страны, которые рассматриваете.",
          "Прочитайте по ним список дефицита EURES и данные спроса CEDEFOP.",
          "Сравните этот спрос со своей профессией и навыками.",
        ],
        limitations: "Данные о спросе отражают определённый период и не гарантируют работу в конкретной компании. Всегда проверяйте дату источника.",
        title: "Какие профессии востребованы там, где вы хотите работать",
        desc: "Как найти востребованные профессии в стране по официальным данным EURES и CEDEFOP — обоснованная картина рынка, не гарантия работы.",
      },
      nl: {
        slug: "welke-beroepen-zijn-gevraagd-waar-ik-wil-werken",
        h1: "Hoe vind ik welke beroepen gevraagd zijn waar ik wil werken?",
        short: "Controleer officiële EU-bronnen voor het land: EURES noemt tekortberoepen en CEDEFOP volgt de vraag via online vacatures, zodat je ziet welke beroepen dat land actief tekortkomt.",
        full: [
          "In plaats van te vertrouwen op een kop over \"de banen van de toekomst\", bekijk je het land dat je interesseert in officiële data. EURES publiceert tekort- en overschotberoepen per land, en de vraag-naar-beroepen-tool van CEDEFOP put uit echte online vacatures. Beide lezen geeft een gefundeerd beeld van welke beroepen een specifiek land nodig heeft.",
          "Gebruik dat beeld naast je eigen profiel op LabourMarket.ai: dat toont kansen die bij je vaardigheden passen, terwijl de officiële data vertelt hoe sterk de vraag naar je beroep op een bepaalde plek is. De vraag verschuift, dus let op wanneer de data is gepubliceerd.",
        ],
        steps: [
          "Kies het land of de landen die je overweegt.",
          "Lees de EURES-tekortlijst en CEDEFOP-vraagdata ervoor.",
          "Vergelijk die vraag met je eigen beroep en vaardigheden.",
        ],
        limitations: "Vraagdata weerspiegelt een periode en garandeert geen baan bij een specifiek bedrijf. Controleer altijd de brondatum.",
        title: "Welke beroepen gevraagd zijn waar je wilt werken",
        desc: "Hoe je gevraagde beroepen in een land vindt met officiële EURES- en CEDEFOP-data — een gefundeerd marktbeeld, geen baangarantie.",
      },
      de: {
        slug: "welche-berufe-sind-gefragt-wo-ich-arbeiten-moechte",
        h1: "Wie finde ich, welche Berufe dort gefragt sind, wo ich arbeiten möchte?",
        short: "Prüfen Sie offizielle EU-Quellen zum Land: EURES listet Mangelberufe und CEDEFOP verfolgt die Nachfrage aus Online-Stellenanzeigen, sodass Sie sehen, welche Berufe dem Land aktiv fehlen.",
        full: [
          "Statt einer Schlagzeile über die \"Jobs der Zukunft\" zu vertrauen, sehen Sie sich das Land, das Sie interessiert, in offiziellen Daten an. EURES veröffentlicht Mangel- und Überschussberufe je Land, und das CEDEFOP-Tool zur Berufsnachfrage stützt sich auf echte Online-Stellenanzeigen. Beides zu lesen ergibt ein fundiertes Bild, welche Berufe ein bestimmtes Land braucht.",
          "Nutzen Sie dieses Bild zusammen mit Ihrem Profil auf LabourMarket.ai: Es zeigt Möglichkeiten, die zu Ihren Fähigkeiten passen, während die offiziellen Daten sagen, wie stark die Nachfrage nach Ihrem Beruf an einem Ort ist. Nachfrage verschiebt sich, achten Sie also darauf, wann die Daten veröffentlicht wurden.",
        ],
        steps: [
          "Wählen Sie das Land oder die Länder, die Sie erwägen.",
          "Lesen Sie dazu die EURES-Mangelliste und CEDEFOP-Nachfragedaten.",
          "Vergleichen Sie diese Nachfrage mit Ihrem Beruf und Ihren Fähigkeiten.",
        ],
        limitations: "Nachfragedaten spiegeln einen Zeitraum wider und garantieren keine Stelle in einem bestimmten Unternehmen. Prüfen Sie stets das Quellendatum.",
        title: "Welche Berufe gefragt sind, wo Sie arbeiten möchten",
        desc: "Wie Sie gefragte Berufe in einem Land finden — mit offiziellen EURES- und CEDEFOP-Daten. Ein fundiertes Marktbild, keine Jobgarantie.",
      },
    },
  },
  {
    id: "AE-0480",
    ev: [SRC_CEDEFOP_SHORTAGES, SRC_EURES_SHORTAGES],
    per: {
      en: {
        slug: "why-does-job-demand-differ-between-countries",
        h1: "How do I understand differences in demand between countries?",
        short: "Demand differs because of ageing populations, migration of skilled workers, and each economy's structure. Official EU analysis explains these drivers, so differences are readable rather than random.",
        full: [
          "The same profession can be in shortage in one country and not in another. Official EU analysis points to a few consistent drivers: ageing populations raise demand for healthcare and teaching; skilled workers moving between countries can leave gaps behind; and each country's industry mix shapes which occupations it needs. CEDEFOP and EURES describe these patterns Europe-wide.",
          "For your own choice, read the demand for your profession per country rather than assuming a single European trend. LabourMarket.ai helps you compare places against your skills, while the official sources explain why demand looks the way it does. Note the publication date, because these patterns shift over years.",
        ],
        limitations: "This explains general drivers, not a forecast for a specific company or year. Check the date and country scope on the official analysis.",
        title: "Why job demand differs between countries",
        desc: "How to understand why job demand differs between EU countries — ageing, worker mobility and economic structure, explained by official CEDEFOP and EURES analysis.",
      },
      lt: {
        slug: "kodel-darbo-paklausa-skiriasi-tarp-saliu",
        h1: "Kaip suprasti paklausos skirtumus tarp šalių?",
        short: "Paklausa skiriasi dėl senėjančių visuomenių, kvalifikuotų darbuotojų migracijos ir kiekvienos ekonomikos struktūros. Oficiali ES analizė paaiškina šiuos veiksnius, todėl skirtumai yra suprantami, o ne atsitiktiniai.",
        full: [
          "Tos pačios profesijos vienoje šalyje gali trūkti, o kitoje ne. Oficiali ES analizė nurodo kelis nuoseklius veiksnius: senėjančios visuomenės didina sveikatos priežiūros ir mokymo paklausą; kvalifikuotų darbuotojų judėjimas tarp šalių gali palikti spragas; o kiekvienos šalies pramonės sudėtis lemia, kokių profesijų jai reikia. CEDEFOP ir EURES aprašo šiuos dėsningumus visoje Europoje.",
          "Savo pasirinkimui skaitykite savo profesijos paklausą pagal šalį, o ne darykite prielaidą apie vieną europinę tendenciją. LabourMarket.ai padeda palyginti vietas su jūsų įgūdžiais, o oficialūs šaltiniai paaiškina, kodėl paklausa tokia. Atkreipkite dėmesį į paskelbimo datą, nes šie dėsningumai kinta per metus.",
        ],
        limitations: "Tai paaiškina bendrus veiksnius, ne konkrečios įmonės ar metų prognozę. Pasitikrinkite oficialios analizės datą ir šalies apimtį.",
        title: "Kodėl darbo paklausa skiriasi tarp šalių",
        desc: "Kaip suprasti, kodėl darbo paklausa skiriasi tarp ES šalių — senėjimas, darbuotojų judumas ir ekonomikos struktūra, pagal oficialią CEDEFOP ir EURES analizę.",
      },
      ru: {
        slug: "pochemu-spros-na-rabotu-otlichaetsya-mezhdu-stranami",
        h1: "Как понять различия в спросе между странами?",
        short: "Спрос различается из-за старения населения, миграции квалифицированных работников и структуры каждой экономики. Официальный анализ ЕС объясняет эти факторы, поэтому различия понятны, а не случайны.",
        full: [
          "Одной и той же профессии в одной стране может не хватать, а в другой — нет. Официальный анализ ЕС указывает на несколько устойчивых факторов: старение населения повышает спрос на здравоохранение и образование; переезд квалифицированных работников между странами может оставлять пробелы; а структура промышленности каждой страны определяет, какие профессии ей нужны. CEDEFOP и EURES описывают эти закономерности по всей Европе.",
          "Для собственного выбора читайте спрос на вашу профессию по странам, а не предполагайте единый европейский тренд. LabourMarket.ai помогает сравнивать места с вашими навыками, а официальные источники объясняют, почему спрос выглядит именно так. Отмечайте дату публикации, ведь эти закономерности меняются годами.",
        ],
        limitations: "Это объясняет общие факторы, а не прогноз для конкретной компании или года. Проверяйте дату и охват страны в официальном анализе.",
        title: "Почему спрос на работу различается между странами",
        desc: "Как понять, почему спрос на работу различается между странами ЕС — старение, мобильность работников и структура экономики, по официальному анализу CEDEFOP и EURES.",
      },
      nl: {
        slug: "waarom-verschilt-de-vraag-naar-werk-tussen-landen",
        h1: "Hoe begrijp ik verschillen in vraag tussen landen?",
        short: "De vraag verschilt door vergrijzing, migratie van geschoolde werknemers en de structuur van elke economie. Officiële EU-analyse legt deze drijfveren uit, zodat verschillen leesbaar zijn en niet willekeurig.",
        full: [
          "Hetzelfde beroep kan in het ene land schaars zijn en in het andere niet. Officiële EU-analyse wijst op enkele consistente drijfveren: vergrijzing verhoogt de vraag naar zorg en onderwijs; geschoolde werknemers die tussen landen verhuizen kunnen gaten achterlaten; en de industriemix van elk land bepaalt welke beroepen het nodig heeft. CEDEFOP en EURES beschrijven deze patronen in heel Europa.",
          "Lees voor je eigen keuze de vraag naar jouw beroep per land in plaats van uit te gaan van één Europese trend. LabourMarket.ai helpt plaatsen te vergelijken met je vaardigheden, terwijl de officiële bronnen uitleggen waarom de vraag eruitziet zoals ze doet. Let op de publicatiedatum, want deze patronen verschuiven over jaren.",
        ],
        limitations: "Dit legt algemene drijfveren uit, geen prognose voor een specifiek bedrijf of jaar. Controleer datum en landbereik in de officiële analyse.",
        title: "Waarom de vraag naar werk tussen landen verschilt",
        desc: "Hoe je begrijpt waarom de vraag naar werk tussen EU-landen verschilt — vergrijzing, mobiliteit en economische structuur, uitgelegd door officiële CEDEFOP- en EURES-analyse.",
      },
      de: {
        slug: "warum-unterscheidet-sich-die-nachfrage-zwischen-laendern",
        h1: "Wie verstehe ich Unterschiede in der Nachfrage zwischen Ländern?",
        short: "Die Nachfrage unterscheidet sich wegen alternder Bevölkerungen, der Abwanderung von Fachkräften und der Struktur jeder Wirtschaft. Offizielle EU-Analysen erklären diese Treiber, sodass Unterschiede lesbar statt zufällig sind.",
        full: [
          "Derselbe Beruf kann in einem Land knapp sein und in einem anderen nicht. Offizielle EU-Analysen nennen einige beständige Treiber: alternde Bevölkerungen erhöhen die Nachfrage nach Gesundheit und Bildung; zwischen Ländern wandernde Fachkräfte können Lücken hinterlassen; und der Branchenmix jedes Landes prägt, welche Berufe es braucht. CEDEFOP und EURES beschreiben diese Muster europaweit.",
          "Lesen Sie für Ihre eigene Wahl die Nachfrage nach Ihrem Beruf je Land, statt einen einzigen europäischen Trend anzunehmen. LabourMarket.ai hilft, Orte mit Ihren Fähigkeiten zu vergleichen, während die offiziellen Quellen erklären, warum die Nachfrage so aussieht. Achten Sie auf das Veröffentlichungsdatum, denn diese Muster verschieben sich über Jahre.",
        ],
        limitations: "Dies erklärt allgemeine Treiber, keine Prognose für ein bestimmtes Unternehmen oder Jahr. Prüfen Sie Datum und Länderbezug in der offiziellen Analyse.",
        title: "Warum sich die Nachfrage zwischen Ländern unterscheidet",
        desc: "Wie Sie verstehen, warum sich die Arbeitsnachfrage zwischen EU-Ländern unterscheidet — Alterung, Mobilität und Wirtschaftsstruktur, erklärt von CEDEFOP und EURES.",
      },
    },
  },
  {
    id: "AE-0321",
    country: "Netherlands",
    ev: [SRC_EURES_LIVING],
    per: {
      en: {
        slug: "do-i-need-to-speak-dutch-to-work-in-the-netherlands",
        h1: "Do I need to speak the local language to work in the Netherlands?",
        short: "It depends on the job. English is widely used in many international and technical roles in the Netherlands, but Dutch is often expected in customer-facing, public-sector and many everyday jobs.",
        full: [
          "There is no single language rule for working in the Netherlands — the requirement comes from the employer and the role, not from a national permit. In international companies, IT, research and some engineering, English is frequently enough. In healthcare, education, retail, hospitality and public services, Dutch is usually expected because you work directly with people.",
          "Treat any specific claim about a job as coming from that vacancy, not from a general rule. For living-and-working conditions in the Netherlands, including language and practicalities, the official EURES pages are the reliable reference; on LabourMarket.ai you can also set the languages you speak so opportunities match your real level.",
        ],
        limitations: "Language requirements vary by employer, sector and role. This is general guidance for the Netherlands; check the specific vacancy and the official EURES country information.",
        title: "Do you need Dutch to work in the Netherlands?",
        desc: "Whether you need Dutch to work in the Netherlands: it depends on the role — English suits many international jobs, Dutch is expected in customer-facing work. Official EURES reference.",
      },
      lt: {
        slug: "ar-reikia-moketi-olandu-kalba-dirbti-nyderlanduose",
        h1: "Ar reikia mokėti vietos kalbą dirbti Nyderlanduose?",
        short: "Priklauso nuo darbo. Daugelyje tarptautinių ir techninių pareigų Nyderlanduose plačiai vartojama anglų kalba, bet su klientais dirbančiose, viešojo sektoriaus ir daugelyje kasdienių darbų dažnai tikimasi olandų kalbos.",
        full: [
          "Nėra vienos kalbos taisyklės dirbti Nyderlanduose — reikalavimas kyla iš darbdavio ir pareigų, ne iš nacionalinio leidimo. Tarptautinėse įmonėse, IT, moksliniuose tyrimuose ir kai kurioje inžinerijoje anglų kalbos dažnai pakanka. Sveikatos priežiūroje, švietime, mažmeninėje prekyboje, svetingumo srityje ir viešosiose paslaugose paprastai tikimasi olandų, nes dirbate tiesiogiai su žmonėmis.",
          "Bet kokį konkretų teiginį apie darbą laikykite kilusiu iš to skelbimo, ne iš bendros taisyklės. Dėl gyvenimo ir darbo sąlygų Nyderlanduose, įskaitant kalbą ir praktinius dalykus, patikimas šaltinis yra oficialūs EURES puslapiai; LabourMarket.ai taip pat galite nurodyti mokamas kalbas, kad galimybės atitiktų realų lygį.",
        ],
        limitations: "Kalbos reikalavimai skiriasi pagal darbdavį, sektorių ir pareigas. Tai bendra informacija apie Nyderlandus; pasitikrinkite konkretų skelbimą ir oficialią EURES šalies informaciją.",
        title: "Ar reikia olandų kalbos dirbti Nyderlanduose?",
        desc: "Ar reikia olandų kalbos dirbti Nyderlanduose: priklauso nuo pareigų — anglų tinka daugeliui tarptautinių darbų, olandų tikimasi dirbant su klientais. Oficialus EURES šaltinis.",
      },
      ru: {
        slug: "nuzhno-li-znat-niderlandskiy-chtoby-rabotat-v-niderlandakh",
        h1: "Нужно ли знать местный язык, чтобы работать в Нидерландах?",
        short: "Зависит от работы. Во многих международных и технических ролях в Нидерландах широко используется английский, но в работе с клиентами, госсекторе и многих повседневных профессиях обычно ожидают нидерландский.",
        full: [
          "Единого языкового правила для работы в Нидерландах нет — требование исходит от работодателя и роли, а не от национального разрешения. В международных компаниях, ИТ, исследованиях и части инженерии английского часто достаточно. В здравоохранении, образовании, рознице, гостеприимстве и госуслугах обычно ожидают нидерландский, потому что вы работаете напрямую с людьми.",
          "Любое конкретное утверждение о работе считайте исходящим из этой вакансии, а не из общего правила. По условиям жизни и работы в Нидерландах, включая язык и практические вопросы, надёжный ориентир — официальные страницы EURES; на LabourMarket.ai вы также можете указать языки, которыми владеете, чтобы возможности соответствовали реальному уровню.",
        ],
        limitations: "Языковые требования зависят от работодателя, сектора и роли. Это общая информация по Нидерландам; проверяйте конкретную вакансию и официальную страновую информацию EURES.",
        title: "Нужен ли нидерландский для работы в Нидерландах?",
        desc: "Нужен ли нидерландский для работы в Нидерландах: зависит от роли — английский подходит для многих международных работ, нидерландский ожидают в работе с клиентами. Официальный EURES.",
      },
      nl: {
        slug: "moet-ik-nederlands-spreken-om-in-nederland-te-werken",
        h1: "Moet ik de lokale taal spreken om in Nederland te werken?",
        short: "Dat hangt van de baan af. Engels wordt in Nederland veel gebruikt in internationale en technische functies, maar Nederlands wordt vaak verwacht in klantgerichte, publieke en veel alledaagse banen.",
        full: [
          "Er is geen enkele taalregel om in Nederland te werken — de eis komt van de werkgever en de functie, niet van een nationale vergunning. Bij internationale bedrijven, IT, onderzoek en sommige techniek is Engels vaak genoeg. In de zorg, het onderwijs, de detailhandel, de horeca en publieke diensten wordt meestal Nederlands verwacht, omdat je direct met mensen werkt.",
          "Behandel elke specifieke claim over een baan als afkomstig van die vacature, niet van een algemene regel. Voor woon- en werkomstandigheden in Nederland, inclusief taal en praktische zaken, zijn de officiële EURES-pagina's de betrouwbare referentie; op LabourMarket.ai kun je ook de talen instellen die je spreekt, zodat kansen bij je echte niveau passen.",
        ],
        limitations: "Taaleisen verschillen per werkgever, sector en functie. Dit is algemene informatie over Nederland; controleer de specifieke vacature en de officiële EURES-landeninformatie.",
        title: "Heb je Nederlands nodig om in Nederland te werken?",
        desc: "Of je Nederlands nodig hebt om in Nederland te werken: het hangt van de functie af — Engels past bij veel internationale banen, Nederlands wordt verwacht in klantgericht werk. Officiële EURES-bron.",
      },
      de: {
        slug: "muss-ich-niederlaendisch-sprechen-um-in-den-niederlanden-zu-arbeiten",
        h1: "Muss ich die Landessprache sprechen, um in den Niederlanden zu arbeiten?",
        short: "Das hängt vom Job ab. Englisch ist in den Niederlanden in vielen internationalen und technischen Rollen weit verbreitet, aber Niederländisch wird oft in kundennahen, öffentlichen und vielen Alltagsjobs erwartet.",
        full: [
          "Es gibt keine einheitliche Sprachregel für das Arbeiten in den Niederlanden — die Anforderung kommt vom Arbeitgeber und der Rolle, nicht von einer nationalen Erlaubnis. In internationalen Unternehmen, IT, Forschung und Teilen der Technik reicht oft Englisch. In Gesundheit, Bildung, Einzelhandel, Gastgewerbe und öffentlichen Diensten wird meist Niederländisch erwartet, weil Sie direkt mit Menschen arbeiten.",
          "Behandeln Sie jede konkrete Aussage über einen Job als von dieser Stellenanzeige stammend, nicht von einer allgemeinen Regel. Für Lebens- und Arbeitsbedingungen in den Niederlanden, einschließlich Sprache und Praktischem, sind die offiziellen EURES-Seiten die verlässliche Referenz; auf LabourMarket.ai können Sie zudem Ihre Sprachen angeben, damit Möglichkeiten zu Ihrem echten Niveau passen.",
        ],
        limitations: "Sprachanforderungen variieren je Arbeitgeber, Branche und Rolle. Dies ist allgemeine Information zu den Niederlanden; prüfen Sie die konkrete Stelle und die offiziellen EURES-Länderinfos.",
        title: "Brauchen Sie Niederländisch, um in den Niederlanden zu arbeiten?",
        desc: "Ob Sie Niederländisch brauchen, um in den Niederlanden zu arbeiten: hängt von der Rolle ab — Englisch passt für viele internationale Jobs, Niederländisch wird kundennah erwartet. Offizielle EURES-Quelle.",
      },
    },
  },
  // ═══ LOW-risk, real forum demand — editorial answers ═══
  {
    id: "AE-0043",
    per: {
      en: {
        slug: "how-do-i-find-work-with-no-formal-qualifications",
        h1: "How do I find work if I have no formal qualifications?",
        short: "Lead with what you can actually do. Many jobs value demonstrated skills and reliability over certificates, and LabourMarket.ai lets you show skills as evidence rather than only listing diplomas.",
        full: [
          "Missing a formal qualification does not mean missing skills. Work you have done — paid, unpaid, at home or helping others — builds real, usable skills. The key is to name them clearly and, where possible, back them with evidence rather than presenting yourself only through documents you do not have.",
          "On LabourMarket.ai your profile is built around skills and what you can show, not around diplomas. You can record work, declare skills honestly and have them confirmed from real activity, so employers who care about capability can see it. Some professions are regulated and do require a formal qualification — in those cases the platform is honest about the gap instead of hiding it.",
        ],
        steps: [
          "List the concrete things you can do, from any kind of work.",
          "Add those as skills on your profile and back them with real examples.",
          "Focus on opportunities that value demonstrated skill over formal certificates.",
        ],
        limitations: "Some regulated professions legally require a formal qualification; for those, no profile can replace it.",
        title: "Finding work with no formal qualifications",
        desc: "How to find work without formal qualifications: lead with demonstrated skills and evidence. LabourMarket.ai builds your profile around what you can do.",
      },
      lt: {
        slug: "kaip-rasti-darba-be-formalios-kvalifikacijos",
        h1: "Kaip rasti darbą neturint formalios kvalifikacijos?",
        short: "Pradėkite nuo to, ką realiai mokate. Daugelis darbų vertina parodytus įgūdžius ir patikimumą labiau nei pažymėjimus, o LabourMarket.ai leidžia parodyti įgūdžius kaip įrodymą, ne tik išvardyti diplomus.",
        full: [
          "Formalios kvalifikacijos nebuvimas nereiškia įgūdžių nebuvimo. Atliktas darbas — apmokamas, neapmokamas, namuose ar padedant kitiems — ugdo realius, pritaikomus įgūdžius. Svarbiausia juos aiškiai įvardyti ir, kur įmanoma, paremti įrodymu, o ne pristatyti save tik per dokumentus, kurių neturite.",
          "LabourMarket.ai jūsų profilis kuriamas apie įgūdžius ir tai, ką galite parodyti, ne apie diplomus. Galite fiksuoti darbą, sąžiningai deklaruoti įgūdžius ir gauti jų patvirtinimą iš realios veiklos, kad darbdaviai, kuriems svarbu gebėjimas, jį matytų. Kai kurios profesijos reguliuojamos ir formalios kvalifikacijos reikalauja — tokiais atvejais platforma sąžiningai parodo šį trūkumą, o ne jį slepia.",
        ],
        steps: [
          "Išvardykite konkrečius dalykus, kuriuos mokate, iš bet kokio darbo.",
          "Pridėkite juos kaip įgūdžius profilyje ir paremkite realiais pavyzdžiais.",
          "Sutelkite dėmesį į galimybes, vertinančias parodytą įgūdį labiau nei pažymėjimus.",
        ],
        limitations: "Kai kurios reguliuojamos profesijos teisiškai reikalauja formalios kvalifikacijos; joms jokio profilio nepakeis.",
        title: "Darbo paieška be formalios kvalifikacijos",
        desc: "Kaip rasti darbą neturint formalios kvalifikacijos: pradėti nuo parodytų įgūdžių ir įrodymų. LabourMarket.ai kuria profilį apie tai, ką mokate.",
      },
      ru: {
        slug: "kak-nayti-rabotu-bez-formalnoy-kvalifikatsii",
        h1: "Как найти работу без формальной квалификации?",
        short: "Начните с того, что вы реально умеете. Многие работы ценят показанные навыки и надёжность выше сертификатов, а LabourMarket.ai позволяет показать навыки как доказательство, а не только перечислять дипломы.",
        full: [
          "Отсутствие формальной квалификации не означает отсутствия навыков. Работа, которую вы делали — оплачиваемая, неоплачиваемая, дома или помогая другим — формирует реальные, применимые навыки. Главное — чётко их назвать и, где возможно, подкрепить доказательством, а не представлять себя только через документы, которых у вас нет.",
          "На LabourMarket.ai ваш профиль строится вокруг навыков и того, что вы можете показать, а не вокруг дипломов. Можно фиксировать работу, честно заявлять навыки и получать их подтверждение из реальной деятельности, чтобы работодатели, которым важна способность, её видели. Некоторые профессии регулируются и требуют формальной квалификации — в таких случаях платформа честно показывает этот пробел, а не скрывает его.",
        ],
        steps: [
          "Перечислите конкретные вещи, которые умеете, из любой работы.",
          "Добавьте их как навыки в профиль и подкрепите реальными примерами.",
          "Сосредоточьтесь на возможностях, ценящих показанный навык выше сертификатов.",
        ],
        limitations: "Некоторые регулируемые профессии по закону требуют формальной квалификации; для них никакой профиль её не заменит.",
        title: "Поиск работы без формальной квалификации",
        desc: "Как найти работу без формальной квалификации: начать с показанных навыков и доказательств. LabourMarket.ai строит профиль вокруг того, что вы умеете.",
      },
      nl: {
        slug: "hoe-vind-ik-werk-zonder-formele-kwalificaties",
        h1: "Hoe vind ik werk als ik geen formele kwalificaties heb?",
        short: "Begin met wat je echt kunt. Veel banen waarderen aangetoonde vaardigheden en betrouwbaarheid boven certificaten, en LabourMarket.ai laat je vaardigheden als bewijs tonen in plaats van alleen diploma's op te sommen.",
        full: [
          "Geen formele kwalificatie betekent niet geen vaardigheden. Werk dat je hebt gedaan — betaald, onbetaald, thuis of anderen helpend — bouwt echte, bruikbare vaardigheden op. De sleutel is ze helder te benoemen en, waar mogelijk, met bewijs te onderbouwen in plaats van jezelf alleen te presenteren via documenten die je niet hebt.",
          "Op LabourMarket.ai is je profiel opgebouwd rond vaardigheden en wat je kunt tonen, niet rond diploma's. Je kunt werk vastleggen, vaardigheden eerlijk opgeven en ze laten bevestigen vanuit echte activiteit, zodat werkgevers die om kunde geven het zien. Sommige beroepen zijn gereglementeerd en vereisen wél een formele kwalificatie — dan is het platform eerlijk over dat gat in plaats van het te verbergen.",
        ],
        steps: [
          "Som de concrete dingen op die je kunt, uit elk soort werk.",
          "Voeg die toe als vaardigheden op je profiel en onderbouw ze met echte voorbeelden.",
          "Richt je op kansen die aangetoonde vaardigheid boven certificaten waarderen.",
        ],
        limitations: "Sommige gereglementeerde beroepen vereisen wettelijk een formele kwalificatie; daarvoor kan geen profiel die vervangen.",
        title: "Werk vinden zonder formele kwalificaties",
        desc: "Hoe je werk vindt zonder formele kwalificaties: begin met aangetoonde vaardigheden en bewijs. LabourMarket.ai bouwt je profiel rond wat je kunt.",
      },
      de: {
        slug: "wie-finde-ich-arbeit-ohne-formale-qualifikationen",
        h1: "Wie finde ich Arbeit ohne formale Qualifikationen?",
        short: "Beginnen Sie mit dem, was Sie wirklich können. Viele Jobs schätzen gezeigte Fähigkeiten und Verlässlichkeit höher als Zertifikate, und LabourMarket.ai lässt Sie Fähigkeiten als Beleg zeigen, statt nur Abschlüsse aufzuzählen.",
        full: [
          "Eine fehlende formale Qualifikation bedeutet keine fehlenden Fähigkeiten. Arbeit, die Sie geleistet haben — bezahlt, unbezahlt, zu Hause oder anderen helfend — baut echte, nutzbare Fähigkeiten auf. Entscheidend ist, sie klar zu benennen und, wo möglich, mit Belegen zu stützen, statt sich nur über Dokumente darzustellen, die Sie nicht haben.",
          "Auf LabourMarket.ai ist Ihr Profil um Fähigkeiten und das, was Sie zeigen können, aufgebaut, nicht um Abschlüsse. Sie können Arbeit festhalten, Fähigkeiten ehrlich angeben und sie aus echter Aktivität bestätigen lassen, damit Arbeitgeber, denen Können wichtig ist, es sehen. Manche Berufe sind reglementiert und verlangen sehr wohl eine formale Qualifikation — dann ist die Plattform ehrlich über diese Lücke, statt sie zu verbergen.",
        ],
        steps: [
          "Zählen Sie die konkreten Dinge auf, die Sie können, aus jeder Art von Arbeit.",
          "Fügen Sie diese als Fähigkeiten in Ihr Profil ein und stützen Sie sie mit echten Beispielen.",
          "Konzentrieren Sie sich auf Möglichkeiten, die gezeigtes Können höher schätzen als Zertifikate.",
        ],
        limitations: "Einige reglementierte Berufe verlangen gesetzlich eine formale Qualifikation; dafür kann kein Profil sie ersetzen.",
        title: "Arbeit finden ohne formale Qualifikationen",
        desc: "Wie Sie ohne formale Qualifikationen Arbeit finden: mit gezeigten Fähigkeiten und Belegen beginnen. LabourMarket.ai baut Ihr Profil um Ihr Können.",
      },
    },
  },
  {
    id: "AE-0090",
    per: {
      en: {
        slug: "how-do-i-present-a-career-gap-honestly",
        h1: "How do I present a career gap honestly?",
        short: "State it briefly and factually, note anything useful you did or learned, and move on. A gap is common and honesty about it reads better than hiding or padding it.",
        full: [
          "Time away from paid work — for caregiving, health, study, travel or a hard job market — is normal, and most employers have seen it. The mistake is trying to disguise it, which tends to look worse than the gap itself. A short, plain explanation removes the question mark.",
          "Where the time built something useful — a course, volunteering, caring responsibilities, a personal project — name it, because it is real experience. On LabourMarket.ai you can keep your profile current and show skills as evidence, so a period out of formal employment does not erase what you can do.",
        ],
        steps: [
          "Note the gap briefly and factually, without over-explaining.",
          "Add anything useful you did or learned during it as real experience.",
          "Keep your profile current so your skills, not the gap, lead.",
        ],
        title: "Presenting a career gap honestly",
        desc: "How to present a career gap honestly: a brief factual note plus anything useful you did. LabourMarket.ai keeps your skills leading, not the gap.",
      },
      lt: {
        slug: "kaip-saziningai-pateikti-karjeros-pertrauka",
        h1: "Kaip sąžiningai pateikti karjeros pertrauką?",
        short: "Nurodykite ją trumpai ir dalykiškai, paminėkite, ką naudingo veikėte ar išmokote, ir eikite toliau. Pertrauka dažna, o sąžiningumas apie ją atrodo geriau nei slėpimas ar dirbtinis pildymas.",
        full: [
          "Laikas be apmokamo darbo — dėl priežiūros, sveikatos, studijų, kelionių ar sunkios darbo rinkos — yra įprastas, ir dauguma darbdavių tai matę. Klaida — bandyti tai užmaskuoti, nes tai dažnai atrodo blogiau nei pati pertrauka. Trumpas, aiškus paaiškinimas pašalina klaustuką.",
          "Jei tas laikas kažką naudingo sukūrė — kursą, savanorystę, priežiūros pareigas, asmeninį projektą — įvardykite tai, nes tai reali patirtis. LabourMarket.ai galite išlaikyti profilį aktualų ir rodyti įgūdžius kaip įrodymą, todėl laikotarpis be formalaus įdarbinimo neištrina to, ką mokate.",
        ],
        steps: [
          "Trumpai ir dalykiškai paminėkite pertrauką, be perteklinio aiškinimo.",
          "Pridėkite, ką naudingo per ją veikėte ar išmokote, kaip realią patirtį.",
          "Išlaikykite profilį aktualų, kad pirmautų įgūdžiai, ne pertrauka.",
        ],
        title: "Kaip sąžiningai pateikti karjeros pertrauką",
        desc: "Kaip sąžiningai pateikti karjeros pertrauką: trumpas dalykiškas paminėjimas ir tai, ką naudingo veikėte. LabourMarket.ai palieka pirmauti įgūdžius, ne pertrauką.",
      },
      ru: {
        slug: "kak-chestno-predstavit-pereryv-v-kariere",
        h1: "Как честно представить перерыв в карьере?",
        short: "Укажите его кратко и по фактам, отметьте, что полезного вы делали или узнали, и двигайтесь дальше. Перерыв — обычное дело, и честность о нём выглядит лучше, чем сокрытие или искусственное заполнение.",
        full: [
          "Время вне оплачиваемой работы — из-за ухода, здоровья, учёбы, путешествий или трудного рынка — это нормально, и большинство работодателей это видели. Ошибка — пытаться его замаскировать, что обычно выглядит хуже самого перерыва. Короткое ясное объяснение снимает вопрос.",
          "Если это время что-то полезное создало — курс, волонтёрство, обязанности по уходу, личный проект — назовите это, ведь это реальный опыт. На LabourMarket.ai можно держать профиль актуальным и показывать навыки как доказательство, поэтому период вне формальной занятости не стирает то, что вы умеете.",
        ],
        steps: [
          "Отметьте перерыв кратко и по фактам, без лишних объяснений.",
          "Добавьте всё полезное, что делали или узнали за это время, как реальный опыт.",
          "Держите профиль актуальным, чтобы вели навыки, а не перерыв.",
        ],
        title: "Как честно представить перерыв в карьере",
        desc: "Как честно представить перерыв в карьере: краткая фактическая заметка и то полезное, что вы делали. LabourMarket.ai оставляет ведущими навыки, а не перерыв.",
      },
      nl: {
        slug: "hoe-presenteer-ik-een-hiaat-in-mijn-loopbaan-eerlijk",
        h1: "Hoe presenteer ik een hiaat in mijn loopbaan eerlijk?",
        short: "Benoem het kort en feitelijk, vermeld iets nuttigs dat je deed of leerde, en ga verder. Een hiaat is gewoon, en eerlijkheid erover leest beter dan het verbergen of opvullen.",
        full: [
          "Tijd weg van betaald werk — voor zorg, gezondheid, studie, reizen of een moeilijke arbeidsmarkt — is normaal, en de meeste werkgevers hebben het gezien. De fout is het te verhullen, wat er meestal slechter uitziet dan het hiaat zelf. Een korte, heldere uitleg haalt het vraagteken weg.",
          "Waar die tijd iets nuttigs opleverde — een cursus, vrijwilligerswerk, zorgtaken, een persoonlijk project — benoem het, want het is echte ervaring. Op LabourMarket.ai houd je je profiel actueel en toon je vaardigheden als bewijs, zodat een periode buiten formeel werk niet wist wat je kunt.",
        ],
        steps: [
          "Benoem het hiaat kort en feitelijk, zonder te veel uitleg.",
          "Voeg iets nuttigs toe dat je deed of leerde als echte ervaring.",
          "Houd je profiel actueel zodat je vaardigheden leiden, niet het hiaat.",
        ],
        title: "Een loopbaanhiaat eerlijk presenteren",
        desc: "Hoe je een loopbaanhiaat eerlijk presenteert: een korte feitelijke notitie plus iets nuttigs dat je deed. LabourMarket.ai laat je vaardigheden leiden, niet het hiaat.",
      },
      de: {
        slug: "wie-stelle-ich-eine-luecke-im-lebenslauf-ehrlich-dar",
        h1: "Wie stelle ich eine Lücke im Lebenslauf ehrlich dar?",
        short: "Benennen Sie sie kurz und sachlich, erwähnen Sie Nützliches, das Sie getan oder gelernt haben, und gehen Sie weiter. Eine Lücke ist üblich, und Ehrlichkeit darüber wirkt besser als Verbergen oder Auffüllen.",
        full: [
          "Zeit ohne bezahlte Arbeit — für Betreuung, Gesundheit, Studium, Reisen oder einen schwierigen Arbeitsmarkt — ist normal, und die meisten Arbeitgeber kennen das. Der Fehler ist, sie zu verschleiern, was meist schlechter aussieht als die Lücke selbst. Eine kurze, klare Erklärung nimmt das Fragezeichen weg.",
          "Wo diese Zeit etwas Nützliches geschaffen hat — einen Kurs, Ehrenamt, Betreuungsaufgaben, ein persönliches Projekt — benennen Sie es, denn es ist echte Erfahrung. Auf LabourMarket.ai halten Sie Ihr Profil aktuell und zeigen Fähigkeiten als Beleg, sodass eine Zeit außerhalb formaler Beschäftigung nicht auslöscht, was Sie können.",
        ],
        steps: [
          "Benennen Sie die Lücke kurz und sachlich, ohne Über-Erklärung.",
          "Fügen Sie Nützliches hinzu, das Sie in der Zeit taten oder lernten, als echte Erfahrung.",
          "Halten Sie Ihr Profil aktuell, damit Ihre Fähigkeiten führen, nicht die Lücke.",
        ],
        title: "Eine Lebenslauf-Lücke ehrlich darstellen",
        desc: "Wie Sie eine Lebenslauf-Lücke ehrlich darstellen: eine kurze sachliche Notiz plus Nützliches, das Sie taten. LabourMarket.ai lässt Ihre Fähigkeiten führen, nicht die Lücke.",
      },
    },
  },
  {
    id: "AE-0208",
    per: {
      en: {
        slug: "how-do-i-recognise-transferable-skills",
        h1: "How do I recognise skills I can carry into any profession?",
        short: "Look for what you do regardless of the job — organising, solving problems, communicating, working with tools or people. These transferable skills move with you into new roles.",
        full: [
          "Transferable skills are the abilities that are not tied to one job title: planning and organising, solving problems, communicating, learning quickly, working carefully with tools, or coordinating with people. You build them in any work, which is exactly why they carry into a different profession.",
          "A useful way to spot yours is to describe what you actually did, not just your job name, and notice the verbs that repeat. On LabourMarket.ai these skills sit at the centre of your profile, and the platform uses them to suggest adjacent directions — professions your current skills already partly fit.",
        ],
        steps: [
          "Describe concrete tasks you have done, in plain verbs.",
          "Pick out the ones that would matter in many different jobs.",
          "Add them as skills so they can drive matches and adjacent directions.",
        ],
        title: "Recognising transferable skills",
        desc: "How to recognise transferable skills you can carry into any profession — the abilities not tied to one job title. LabourMarket.ai puts them at the centre.",
      },
      lt: {
        slug: "kaip-atpazinti-perkeliamus-igudzius",
        h1: "Kaip atpažinti įgūdžius, kuriuos galiu perkelti į bet kurią profesiją?",
        short: "Ieškokite to, ką darote nepriklausomai nuo darbo — organizuojate, sprendžiate problemas, bendraujate, dirbate su įrankiais ar žmonėmis. Šie perkeliami įgūdžiai keliauja su jumis į naujas pareigas.",
        full: [
          "Perkeliami įgūdžiai — gebėjimai, nesusieti su viena pareigybe: planavimas ir organizavimas, problemų sprendimas, bendravimas, greitas mokymasis, kruopštus darbas su įrankiais ar veiklos derinimas su žmonėmis. Juos ugdote bet kokiame darbe, todėl jie ir persikelia į kitą profesiją.",
          "Naudingas būdas savuosius pastebėti — aprašyti, ką realiai darėte, ne tik pareigų pavadinimą, ir atkreipti dėmesį į pasikartojančius veiksmažodžius. LabourMarket.ai šie įgūdžiai yra jūsų profilio centre, o platforma juos naudoja gretimoms kryptims siūlyti — profesijoms, kurioms dabartiniai įgūdžiai jau iš dalies tinka.",
        ],
        steps: [
          "Aprašykite konkrečias atliktas užduotis paprastais veiksmažodžiais.",
          "Išsirinkite tas, kurios būtų svarbios daugelyje skirtingų darbų.",
          "Pridėkite jas kaip įgūdžius, kad jie lemtų atitiktis ir gretimas kryptis.",
        ],
        title: "Perkeliamų įgūdžių atpažinimas",
        desc: "Kaip atpažinti perkeliamus įgūdžius, kuriuos galima perkelti į bet kurią profesiją — gebėjimus, nesusietus su viena pareigybe. LabourMarket.ai juos stato į centrą.",
      },
      ru: {
        slug: "kak-raspoznat-perenosimye-navyki",
        h1: "Как распознать навыки, которые я могу перенести в любую профессию?",
        short: "Ищите то, что вы делаете независимо от работы — организуете, решаете проблемы, общаетесь, работаете с инструментами или людьми. Эти переносимые навыки идут с вами в новые роли.",
        full: [
          "Переносимые навыки — это способности, не привязанные к одной должности: планирование и организация, решение проблем, общение, быстрое обучение, аккуратная работа с инструментами или координация с людьми. Вы развиваете их в любой работе, поэтому они и переходят в другую профессию.",
          "Полезный способ заметить свои — описать, что вы реально делали, а не только название должности, и обратить внимание на повторяющиеся глаголы. На LabourMarket.ai эти навыки в центре вашего профиля, и платформа использует их, чтобы предлагать смежные направления — профессии, которым ваши нынешние навыки уже частично подходят.",
        ],
        steps: [
          "Опишите конкретные задачи, которые выполняли, простыми глаголами.",
          "Выберите те, что важны во многих разных работах.",
          "Добавьте их как навыки, чтобы они определяли соответствия и смежные направления.",
        ],
        title: "Распознавание переносимых навыков",
        desc: "Как распознать переносимые навыки для любой профессии — способности, не привязанные к одной должности. LabourMarket.ai ставит их в центр.",
      },
      nl: {
        slug: "hoe-herken-ik-overdraagbare-vaardigheden",
        h1: "Hoe herken ik vaardigheden die ik naar elk beroep kan meenemen?",
        short: "Zoek naar wat je doet ongeacht de baan — organiseren, problemen oplossen, communiceren, werken met gereedschap of mensen. Deze overdraagbare vaardigheden gaan met je mee naar nieuwe rollen.",
        full: [
          "Overdraagbare vaardigheden zijn de kwaliteiten die niet aan één functietitel vastzitten: plannen en organiseren, problemen oplossen, communiceren, snel leren, zorgvuldig met gereedschap werken, of afstemmen met mensen. Je bouwt ze op in elk werk, en juist daarom gaan ze mee naar een ander beroep.",
          "Een handige manier om de jouwe te zien is beschrijven wat je echt deed, niet alleen je functienaam, en letten op de werkwoorden die terugkeren. Op LabourMarket.ai staan deze vaardigheden centraal in je profiel, en het platform gebruikt ze om aangrenzende richtingen voor te stellen — beroepen waar je huidige vaardigheden al deels bij passen.",
        ],
        steps: [
          "Beschrijf concrete taken die je deed, in gewone werkwoorden.",
          "Kies die eruit die in veel verschillende banen zouden tellen.",
          "Voeg ze toe als vaardigheden zodat ze matches en aangrenzende richtingen sturen.",
        ],
        title: "Overdraagbare vaardigheden herkennen",
        desc: "Hoe je overdraagbare vaardigheden herkent voor elk beroep — de kwaliteiten die niet aan één functietitel vastzitten. LabourMarket.ai zet ze centraal.",
      },
      de: {
        slug: "wie-erkenne-ich-uebertragbare-faehigkeiten",
        h1: "Wie erkenne ich Fähigkeiten, die ich in jeden Beruf mitnehmen kann?",
        short: "Achten Sie auf das, was Sie unabhängig vom Job tun — organisieren, Probleme lösen, kommunizieren, mit Werkzeugen oder Menschen arbeiten. Diese übertragbaren Fähigkeiten gehen mit Ihnen in neue Rollen.",
        full: [
          "Übertragbare Fähigkeiten sind die Fertigkeiten, die nicht an eine Stellenbezeichnung gebunden sind: planen und organisieren, Probleme lösen, kommunizieren, schnell lernen, sorgfältig mit Werkzeugen arbeiten oder sich mit Menschen abstimmen. Sie bauen sie in jeder Arbeit auf, und genau deshalb tragen sie in einen anderen Beruf.",
          "Ein guter Weg, Ihre zu erkennen, ist zu beschreiben, was Sie tatsächlich taten, nicht nur Ihre Jobbezeichnung, und auf wiederkehrende Verben zu achten. Auf LabourMarket.ai stehen diese Fähigkeiten im Mittelpunkt Ihres Profils, und die Plattform nutzt sie, um benachbarte Richtungen vorzuschlagen — Berufe, zu denen Ihre aktuellen Fähigkeiten bereits teils passen.",
        ],
        steps: [
          "Beschreiben Sie konkrete Aufgaben, die Sie erledigt haben, in einfachen Verben.",
          "Wählen Sie jene aus, die in vielen verschiedenen Jobs zählen würden.",
          "Fügen Sie sie als Fähigkeiten hinzu, damit sie Treffer und benachbarte Richtungen steuern.",
        ],
        title: "Übertragbare Fähigkeiten erkennen",
        desc: "Wie Sie übertragbare Fähigkeiten für jeden Beruf erkennen — die Fertigkeiten, die nicht an eine Stellenbezeichnung gebunden sind. LabourMarket.ai stellt sie ins Zentrum.",
      },
    },
  },
  {
    id: "AE-0123",
    per: {
      en: {
        slug: "practical-skills-vs-formal-qualifications",
        h1: "How do practical skills compare to formal qualifications here?",
        short: "Both count, and the platform keeps them distinct. Practical skills are shown as evidence from real work; formal qualifications are shown as what they are — neither is faked or inflated into the other.",
        full: [
          "A formal qualification tells you someone completed a recognised programme; a practical skill tells you they can actually do something. LabourMarket.ai does not rank one above the other in general — it shows each honestly. Practical skills appear as declared or confirmed from real work, and qualifications appear as qualifications.",
          "This matters because many roles value demonstrated ability, while some regulated professions require a specific qualification by law. Keeping the two separate lets an employer weigh what the role actually needs, and lets you show strength on the side where you have it, without one being disguised as the other.",
        ],
        title: "Practical skills vs formal qualifications",
        desc: "How practical skills compare to formal qualifications on LabourMarket.ai: both shown honestly and kept distinct, neither inflated into the other.",
      },
      lt: {
        slug: "praktiniai-igudziai-ir-formali-kvalifikacija",
        h1: "Kaip praktiniai įgūdžiai lyginami su formalia kvalifikacija čia?",
        short: "Svarbu abu, ir platforma juos atskiria. Praktiniai įgūdžiai rodomi kaip įrodymas iš realaus darbo; formali kvalifikacija rodoma kaip yra — nė vienas nefalsifikuojamas ir neverčiamas kitu.",
        full: [
          "Formali kvalifikacija sako, kad žmogus baigė pripažintą programą; praktinis įgūdis sako, kad jis iš tikrųjų kažką moka. LabourMarket.ai apskritai nereitinguoja vieno virš kito — rodo kiekvieną sąžiningai. Praktiniai įgūdžiai atsiranda kaip deklaruoti ar patvirtinti iš realaus darbo, o kvalifikacija atsiranda kaip kvalifikacija.",
          "Tai svarbu, nes daugelis pareigų vertina parodytą gebėjimą, o kai kurios reguliuojamos profesijos pagal įstatymą reikalauja konkrečios kvalifikacijos. Šių dviejų atskyrimas leidžia darbdaviui pasverti, ko iš tikrųjų reikia pareigoms, o jums — parodyti stiprybę toje pusėje, kurioje ją turite, be to, kad vienas būtų užmaskuotas kitu.",
        ],
        title: "Praktiniai įgūdžiai ir formali kvalifikacija",
        desc: "Kaip praktiniai įgūdžiai lyginami su formalia kvalifikacija LabourMarket.ai: abu rodomi sąžiningai ir atskirti, nė vienas neverčiamas kitu.",
      },
      ru: {
        slug: "prakticheskie-navyki-i-formalnaya-kvalifikatsiya",
        h1: "Как практические навыки соотносятся с формальной квалификацией здесь?",
        short: "Важны оба, и платформа их разделяет. Практические навыки показываются как доказательство из реальной работы; формальная квалификация показывается как есть — ни одно не подделывается и не выдаётся за другое.",
        full: [
          "Формальная квалификация говорит, что человек прошёл признанную программу; практический навык говорит, что он действительно что-то умеет. LabourMarket.ai в целом не ставит одно выше другого — показывает каждое честно. Практические навыки появляются как заявленные или подтверждённые из реальной работы, а квалификация появляется как квалификация.",
          "Это важно, потому что многие роли ценят показанную способность, а некоторые регулируемые профессии по закону требуют конкретной квалификации. Разделение этих двух позволяет работодателю взвесить, что действительно нужно роли, а вам — показать силу на той стороне, где она есть, без того чтобы одно маскировалось под другое.",
        ],
        title: "Практические навыки и формальная квалификация",
        desc: "Как практические навыки соотносятся с формальной квалификацией на LabourMarket.ai: оба показаны честно и разделены, ни одно не выдаётся за другое.",
      },
      nl: {
        slug: "praktische-vaardigheden-versus-formele-kwalificaties",
        h1: "Hoe verhouden praktische vaardigheden zich hier tot formele kwalificaties?",
        short: "Beide tellen, en het platform houdt ze apart. Praktische vaardigheden worden als bewijs uit echt werk getoond; formele kwalificaties worden getoond als wat ze zijn — geen van beide wordt vervalst of tot het andere opgeblazen.",
        full: [
          "Een formele kwalificatie zegt dat iemand een erkend programma afrondde; een praktische vaardigheid zegt dat iemand echt iets kan. LabourMarket.ai zet het een in het algemeen niet boven het ander — het toont elk eerlijk. Praktische vaardigheden verschijnen als gedeclareerd of bevestigd uit echt werk, en kwalificaties verschijnen als kwalificaties.",
          "Dat is belangrijk omdat veel rollen aangetoonde kunde waarderen, terwijl sommige gereglementeerde beroepen wettelijk een specifieke kwalificatie vereisen. Beide apart houden laat een werkgever afwegen wat de rol echt nodig heeft, en laat jou sterkte tonen aan de kant waar je die hebt, zonder dat het een als het ander wordt vermomd.",
        ],
        title: "Praktische vaardigheden versus formele kwalificaties",
        desc: "Hoe praktische vaardigheden zich verhouden tot formele kwalificaties op LabourMarket.ai: beide eerlijk getoond en apart gehouden, geen van beide opgeblazen tot het andere.",
      },
      de: {
        slug: "praktische-faehigkeiten-versus-formale-qualifikationen",
        h1: "Wie verhalten sich praktische Fähigkeiten hier zu formalen Qualifikationen?",
        short: "Beide zählen, und die Plattform hält sie getrennt. Praktische Fähigkeiten werden als Beleg aus echter Arbeit gezeigt; formale Qualifikationen werden als das gezeigt, was sie sind — keines wird gefälscht oder zum anderen aufgeblasen.",
        full: [
          "Eine formale Qualifikation sagt, dass jemand ein anerkanntes Programm abschloss; eine praktische Fähigkeit sagt, dass jemand wirklich etwas kann. LabourMarket.ai stellt das eine generell nicht über das andere — es zeigt jedes ehrlich. Praktische Fähigkeiten erscheinen als angegeben oder aus echter Arbeit bestätigt, und Qualifikationen erscheinen als Qualifikationen.",
          "Das ist wichtig, weil viele Rollen gezeigtes Können schätzen, während einige reglementierte Berufe gesetzlich eine bestimmte Qualifikation verlangen. Beide getrennt zu halten lässt einen Arbeitgeber abwägen, was die Rolle wirklich braucht, und Sie Stärke auf der Seite zeigen, auf der Sie sie haben, ohne dass eines als das andere getarnt wird.",
        ],
        title: "Praktische Fähigkeiten versus formale Qualifikationen",
        desc: "Wie sich praktische Fähigkeiten zu formalen Qualifikationen auf LabourMarket.ai verhalten: beide ehrlich gezeigt und getrennt gehalten, keines zum anderen aufgeblasen.",
      },
    },
  },
  {
    id: "AE-0438",
    ev: [SRC_EUROPASS],
    per: {
      en: {
        slug: "how-do-i-present-a-diploma-on-my-profile",
        h1: "How do I present a diploma or qualification on my profile?",
        short: "Add it as a qualification with the real title, issuing institution and year. Keep it factual and let your skills sit alongside it, so a reader sees both what you studied and what you can do.",
        full: [
          "A qualification is most useful when it is precise: the actual name of the diploma or certificate, who issued it and when. Avoid inflating a title into something it is not — accuracy is what makes it credible to an employer, and it is easy to check.",
          "On LabourMarket.ai a diploma is one part of your profile, shown next to the skills you can demonstrate. If you are moving between countries, the EU's Europass tools help present qualifications in a common European format that employers across Europe recognise. The platform keeps a qualification distinct from a confirmed skill, so neither is mistaken for the other.",
        ],
        steps: [
          "Add the qualification with its real title, institution and year.",
          "Keep the wording factual — do not inflate the level or field.",
          "Show your demonstrable skills alongside it for a full picture.",
        ],
        title: "Presenting a diploma on your profile",
        desc: "How to present a diploma or qualification on LabourMarket.ai: real title, institution and year, shown alongside your skills. Europass helps across Europe.",
      },
      lt: {
        slug: "kaip-pateikti-diploma-savo-profilyje",
        h1: "Kaip pateikti diplomą ar kvalifikaciją savo profilyje?",
        short: "Pridėkite ją kaip kvalifikaciją su tikru pavadinimu, išdavusia institucija ir metais. Laikykite dalykiškai ir šalia palikite įgūdžius, kad skaitytojas matytų ir ką studijavote, ir ką mokate.",
        full: [
          "Kvalifikacija naudingiausia, kai ji tiksli: tikras diplomo ar pažymėjimo pavadinimas, kas ir kada išdavė. Venkite pučiamo pavadinimo į tai, kas jis nėra — būtent tikslumas daro jį patikimą darbdaviui, o patikrinti lengva.",
          "LabourMarket.ai diplomas yra viena profilio dalis, rodoma šalia įgūdžių, kuriuos galite parodyti. Jei judate tarp šalių, ES Europass įrankiai padeda pateikti kvalifikacijas bendru europiniu formatu, kurį darbdaviai visoje Europoje atpažįsta. Platforma kvalifikaciją laiko atskirai nuo patvirtinto įgūdžio, kad nė vienas nebūtų palaikytas kitu.",
        ],
        steps: [
          "Pridėkite kvalifikaciją su tikru pavadinimu, institucija ir metais.",
          "Formuluokite dalykiškai — nepūskite lygio ar srities.",
          "Šalia parodykite parodomus įgūdžius, kad vaizdas būtų pilnas.",
        ],
        title: "Diplomo pateikimas profilyje",
        desc: "Kaip pateikti diplomą ar kvalifikaciją LabourMarket.ai: tikras pavadinimas, institucija ir metai, rodoma šalia įgūdžių. Europass padeda visoje Europoje.",
      },
      ru: {
        slug: "kak-predstavit-diplom-v-profile",
        h1: "Как представить диплом или квалификацию в профиле?",
        short: "Добавьте его как квалификацию с настоящим названием, выдавшим учреждением и годом. Держите фактично и рядом разместите навыки, чтобы читатель видел и что вы изучали, и что умеете.",
        full: [
          "Квалификация полезнее всего, когда она точна: настоящее название диплома или сертификата, кто и когда выдал. Избегайте раздувания названия до того, чем оно не является — именно точность делает его убедительным для работодателя, а проверить легко.",
          "На LabourMarket.ai диплом — одна часть профиля, показанная рядом с навыками, которые вы можете продемонстрировать. Если вы переезжаете между странами, инструменты ЕС Europass помогают представить квалификации в общем европейском формате, который узнают работодатели по всей Европе. Платформа держит квалификацию отдельно от подтверждённого навыка, чтобы одно не приняли за другое.",
        ],
        steps: [
          "Добавьте квалификацию с настоящим названием, учреждением и годом.",
          "Формулируйте фактично — не раздувайте уровень или область.",
          "Покажите рядом свои демонстрируемые навыки для полной картины.",
        ],
        title: "Как представить диплом в профиле",
        desc: "Как представить диплом или квалификацию на LabourMarket.ai: настоящее название, учреждение и год, рядом с навыками. Europass помогает по всей Европе.",
      },
      nl: {
        slug: "hoe-presenteer-ik-een-diploma-op-mijn-profiel",
        h1: "Hoe presenteer ik een diploma of kwalificatie op mijn profiel?",
        short: "Voeg het toe als kwalificatie met de echte titel, de uitgevende instelling en het jaar. Houd het feitelijk en zet je vaardigheden ernaast, zodat een lezer ziet wat je studeerde én wat je kunt.",
        full: [
          "Een kwalificatie is het nuttigst als die precies is: de echte naam van het diploma of certificaat, wie het uitgaf en wanneer. Vermijd het opblazen van een titel tot iets wat die niet is — juist nauwkeurigheid maakt het geloofwaardig voor een werkgever, en het is makkelijk te controleren.",
          "Op LabourMarket.ai is een diploma één deel van je profiel, getoond naast de vaardigheden die je kunt aantonen. Verhuis je tussen landen, dan helpen de Europass-tools van de EU om kwalificaties in een gemeenschappelijk Europees format te presenteren dat werkgevers in heel Europa herkennen. Het platform houdt een kwalificatie apart van een bevestigde vaardigheid, zodat het een niet voor het ander wordt aangezien.",
        ],
        steps: [
          "Voeg de kwalificatie toe met echte titel, instelling en jaar.",
          "Houd de bewoording feitelijk — blaas niveau of vakgebied niet op.",
          "Toon je aantoonbare vaardigheden ernaast voor een volledig beeld.",
        ],
        title: "Een diploma op je profiel presenteren",
        desc: "Hoe je een diploma of kwalificatie op LabourMarket.ai presenteert: echte titel, instelling en jaar, naast je vaardigheden. Europass helpt in heel Europa.",
      },
      de: {
        slug: "wie-praesentiere-ich-ein-diplom-in-meinem-profil",
        h1: "Wie präsentiere ich ein Diplom oder eine Qualifikation in meinem Profil?",
        short: "Fügen Sie es als Qualifikation mit dem echten Titel, der ausstellenden Einrichtung und dem Jahr hinzu. Halten Sie es sachlich und stellen Sie Ihre Fähigkeiten daneben, sodass ein Leser sieht, was Sie studierten und was Sie können.",
        full: [
          "Eine Qualifikation ist am nützlichsten, wenn sie präzise ist: der tatsächliche Name des Diploms oder Zertifikats, wer es ausstellte und wann. Vermeiden Sie es, einen Titel zu etwas aufzublasen, das er nicht ist — gerade Genauigkeit macht ihn für einen Arbeitgeber glaubwürdig, und er ist leicht prüfbar.",
          "Auf LabourMarket.ai ist ein Diplom ein Teil Ihres Profils, gezeigt neben den Fähigkeiten, die Sie nachweisen können. Wechseln Sie zwischen Ländern, helfen die Europass-Werkzeuge der EU, Qualifikationen in einem gemeinsamen europäischen Format darzustellen, das Arbeitgeber europaweit anerkennen. Die Plattform hält eine Qualifikation getrennt von einer bestätigten Fähigkeit, damit keines für das andere gehalten wird.",
        ],
        steps: [
          "Fügen Sie die Qualifikation mit echtem Titel, Einrichtung und Jahr hinzu.",
          "Halten Sie die Formulierung sachlich — blähen Sie Niveau oder Feld nicht auf.",
          "Zeigen Sie Ihre nachweisbaren Fähigkeiten daneben für ein vollständiges Bild.",
        ],
        title: "Ein Diplom in Ihrem Profil präsentieren",
        desc: "Wie Sie ein Diplom oder eine Qualifikation auf LabourMarket.ai präsentieren: echter Titel, Einrichtung und Jahr, neben Ihren Fähigkeiten. Europass hilft europaweit.",
      },
    },
  },
  {
    id: "AE-0242",
    ev: [SRC_CEDEFOP_DEMAND, SRC_EURES_SHORTAGES],
    per: {
      en: {
        slug: "how-do-i-avoid-learning-skills-that-are-not-in-demand",
        h1: "How do I avoid learning skills that are not in demand?",
        short: "Check demand before you commit: official EU sources show which occupations and skills are short across Europe, so you can aim your learning where there is real, lasting need.",
        full: [
          "Learning takes time, so it is worth pointing it at skills that employers actually need. Official EU sources — EURES on shortages and CEDEFOP on demand from online vacancies — show which occupations and skills are in short supply, and where. That is a stronger basis than a trend headline or a single opinion online.",
          "Combine that with your own starting point: on LabourMarket.ai you can see which skills you already have and which adjacent directions they open, then choose learning that closes a real gap toward in-demand work. Demand changes, so treat it as a current signal and re-check the source date rather than assuming it is fixed.",
        ],
        steps: [
          "Read the official EURES and CEDEFOP demand data for your area.",
          "Compare it with the skills you already have on your profile.",
          "Choose learning that closes a real gap toward in-demand work.",
        ],
        limitations: "Demand data reflects a period in time and is a signal, not a guarantee. Re-check the source date before making long-term learning decisions.",
        title: "Avoid learning skills that are not in demand",
        desc: "How to avoid learning skills that are not in demand: use official EURES and CEDEFOP demand data to aim your learning where there is real need.",
      },
      lt: {
        slug: "kaip-nesimokyti-nepaklausiu-igudziu",
        h1: "Kaip nesimokyti įgūdžių, kurie nepaklausūs?",
        short: "Pasitikrinkite paklausą prieš imdamiesi: oficialūs ES šaltiniai rodo, kokių profesijų ir įgūdžių trūksta visoje Europoje, todėl mokymąsi galite nukreipti ten, kur yra reali, ilgalaikė paklausa.",
        full: [
          "Mokymasis atima laiko, todėl verta jį nukreipti į įgūdžius, kurių darbdaviams iš tikrųjų reikia. Oficialūs ES šaltiniai — EURES apie trūkumus ir CEDEFOP apie paklausą iš internetinių skelbimų — rodo, kokių profesijų ir įgūdžių trūksta ir kur. Tai stipresnis pagrindas nei madinga antraštė ar viena nuomonė internete.",
          "Sujunkite tai su savo atspirties tašku: LabourMarket.ai matote, kokius įgūdžius jau turite ir kokias gretimas kryptis jie atveria, tada rinkitės mokymąsi, kuris užpildo realų trūkumą link paklausaus darbo. Paklausa keičiasi, todėl laikykite ją dabartiniu signalu ir pasitikrinkite šaltinio datą, o ne laikykite ją pastovia.",
        ],
        steps: [
          "Perskaitykite oficialius EURES ir CEDEFOP paklausos duomenis apie savo sritį.",
          "Palyginkite juos su įgūdžiais, kuriuos jau turite profilyje.",
          "Rinkitės mokymąsi, kuris užpildo realų trūkumą link paklausaus darbo.",
        ],
        limitations: "Paklausos duomenys atspindi tam tikrą laikotarpį ir yra signalas, ne garantija. Prieš ilgalaikius mokymosi sprendimus pasitikrinkite šaltinio datą.",
        title: "Nesimokyti nepaklausių įgūdžių",
        desc: "Kaip nesimokyti nepaklausių įgūdžių: naudokitės oficialiais EURES ir CEDEFOP paklausos duomenimis, kad mokymąsi nukreiptumėte ten, kur yra reali paklausa.",
      },
      ru: {
        slug: "kak-ne-uchit-navyki-kotorye-ne-vostrebovany",
        h1: "Как не учить навыки, которые не востребованы?",
        short: "Проверьте спрос, прежде чем браться: официальные источники ЕС показывают, каких профессий и навыков не хватает по Европе, поэтому вы можете направить обучение туда, где есть реальная, устойчивая потребность.",
        full: [
          "Обучение отнимает время, поэтому стоит направить его на навыки, которые действительно нужны работодателям. Официальные источники ЕС — EURES о дефиците и CEDEFOP о спросе по онлайн-вакансиям — показывают, каких профессий и навыков не хватает и где. Это более прочная основа, чем модный заголовок или одно мнение в сети.",
          "Соедините это со своей отправной точкой: на LabourMarket.ai видно, какие навыки у вас уже есть и какие смежные направления они открывают, затем выбирайте обучение, закрывающее реальный пробел к востребованной работе. Спрос меняется, поэтому считайте его текущим сигналом и перепроверяйте дату источника, а не считайте его неизменным.",
        ],
        steps: [
          "Прочитайте официальные данные спроса EURES и CEDEFOP по вашей области.",
          "Сравните их с навыками, которые уже есть в профиле.",
          "Выберите обучение, закрывающее реальный пробел к востребованной работе.",
        ],
        limitations: "Данные о спросе отражают определённый период и являются сигналом, а не гарантией. Перепроверяйте дату источника перед долгосрочными решениями об обучении.",
        title: "Не учить невостребованные навыки",
        desc: "Как не учить невостребованные навыки: используйте официальные данные спроса EURES и CEDEFOP, чтобы направить обучение туда, где есть реальная потребность.",
      },
      nl: {
        slug: "hoe-voorkom-ik-dat-ik-vaardigheden-leer-die-niet-gevraagd-zijn",
        h1: "Hoe voorkom ik dat ik vaardigheden leer die niet gevraagd zijn?",
        short: "Controleer de vraag voordat je begint: officiële EU-bronnen tonen welke beroepen en vaardigheden schaars zijn in Europa, zodat je je leren richt waar echte, blijvende behoefte is.",
        full: [
          "Leren kost tijd, dus is het de moeite waard het te richten op vaardigheden die werkgevers echt nodig hebben. Officiële EU-bronnen — EURES over tekorten en CEDEFOP over vraag uit online vacatures — tonen welke beroepen en vaardigheden schaars zijn, en waar. Dat is een sterkere basis dan een trendkop of één mening online.",
          "Combineer dat met je eigen startpunt: op LabourMarket.ai zie je welke vaardigheden je al hebt en welke aangrenzende richtingen ze openen, en kies je leren dat een echt gat dicht richting gevraagd werk. Vraag verandert, dus behandel het als een actueel signaal en check de brondatum opnieuw in plaats van aan te nemen dat het vaststaat.",
        ],
        steps: [
          "Lees de officiële EURES- en CEDEFOP-vraagdata voor jouw vakgebied.",
          "Vergelijk die met de vaardigheden die je al op je profiel hebt.",
          "Kies leren dat een echt gat dicht richting gevraagd werk.",
        ],
        limitations: "Vraagdata weerspiegelt een periode en is een signaal, geen garantie. Check de brondatum opnieuw voor langetermijnbeslissingen over leren.",
        title: "Voorkom het leren van niet-gevraagde vaardigheden",
        desc: "Hoe je voorkomt dat je niet-gevraagde vaardigheden leert: gebruik officiële EURES- en CEDEFOP-vraagdata om je leren te richten waar echte behoefte is.",
      },
      de: {
        slug: "wie-vermeide-ich-faehigkeiten-zu-lernen-die-nicht-gefragt-sind",
        h1: "Wie vermeide ich, Fähigkeiten zu lernen, die nicht gefragt sind?",
        short: "Prüfen Sie die Nachfrage, bevor Sie sich festlegen: offizielle EU-Quellen zeigen, welche Berufe und Fähigkeiten europaweit knapp sind, sodass Sie Ihr Lernen dorthin richten, wo echter, dauerhafter Bedarf ist.",
        full: [
          "Lernen kostet Zeit, daher lohnt es, es auf Fähigkeiten zu richten, die Arbeitgeber wirklich brauchen. Offizielle EU-Quellen — EURES zu Engpässen und CEDEFOP zur Nachfrage aus Online-Stellenanzeigen — zeigen, welche Berufe und Fähigkeiten knapp sind und wo. Das ist eine stärkere Grundlage als eine Trend-Schlagzeile oder eine einzelne Meinung im Netz.",
          "Verbinden Sie das mit Ihrem Ausgangspunkt: Auf LabourMarket.ai sehen Sie, welche Fähigkeiten Sie schon haben und welche benachbarten Richtungen sie öffnen, und wählen dann Lernen, das eine echte Lücke zu gefragter Arbeit schließt. Nachfrage ändert sich, behandeln Sie sie also als aktuelles Signal und prüfen Sie das Quellendatum erneut, statt sie als fest anzunehmen.",
        ],
        steps: [
          "Lesen Sie die offiziellen EURES- und CEDEFOP-Nachfragedaten für Ihr Feld.",
          "Vergleichen Sie sie mit den Fähigkeiten, die Sie schon im Profil haben.",
          "Wählen Sie Lernen, das eine echte Lücke zu gefragter Arbeit schließt.",
        ],
        limitations: "Nachfragedaten spiegeln einen Zeitraum wider und sind ein Signal, keine Garantie. Prüfen Sie das Quellendatum erneut vor langfristigen Lernentscheidungen.",
        title: "Vermeiden, nicht gefragte Fähigkeiten zu lernen",
        desc: "Wie Sie vermeiden, nicht gefragte Fähigkeiten zu lernen: offizielle EURES- und CEDEFOP-Nachfragedaten nutzen, um Ihr Lernen dorthin zu richten, wo echter Bedarf ist.",
      },
    },
  },
];

const LOCALES: Loc[] = ["lt", "en", "ru", "nl", "de"];

export const WAVE2C_ANSWERS: readonly LocalizedAnswer[] = DRAFTS.flatMap((d) =>
  LOCALES.map((locale): LocalizedAnswer => {
    const b = d.per[locale];
    return {
      canonicalQuestionId: d.id,
      locale,
      localizedSlug: b.slug,
      h1: b.h1,
      shortAnswer: b.short,
      fullAnswer: b.full,
      practicalActions: b.steps,
      limitations: b.limitations,
      countryScope: d.country,
      title: b.title,
      description: b.desc,
      reviewStatus: "HUMAN_APPROVED",
      reviewDate: REVIEWED,
      editorialResponsibility: EDITORIAL,
      evidenceSources: d.ev,
    };
  }),
);
