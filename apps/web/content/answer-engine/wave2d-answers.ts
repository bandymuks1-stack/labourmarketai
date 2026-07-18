/**
 * Answer Engine — localized answer content, Wave 2D (real demand + evidence).
 *
 * 15 canonical questions selected from real public demand (see the editorial
 * research module research/wave2d-question-signals.ts), all mapped to existing
 * ids in the 550-registry (no new canonical ids, no second taxonomy), written
 * natively in lt/en/ru/nl/de = 75 localized answer pages. Published set grows to
 * 45 questions / 225 pages.
 *
 * Risk: LOW product/career answers are editorial (no external source needed);
 * the three questions that make factual labour-market / qualifications-framework
 * claims (AE-0224 which skills to learn, AE-0239 cross-border reskilling,
 * AE-0499 automation) each carry ≥1 verified official EU source using the Wave
 * 2D source contract (sourceType + freshnessClass + supportsClaims). No exact
 * salaries/tax/visa/HIGH-risk content. Discovery signals stay separate and are
 * never rendered.
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

// ── Official evidence sources (Wave 2D source contract) ─────────────────────
const SRC_EUROPASS_EQF: AnswerEvidenceSource = {
  title: "European Qualifications Framework (EQF) — Europass",
  url: "https://europass.europa.eu/en/european-qualifications-framework-eqf",
  publisher: "European Union — Europass",
  scope: "EU",
  checkedAt: CHECKED,
  sourceType: "EU_OFFICIAL",
  freshnessClass: "slow-changing",
  supportsClaims: ["The EQF is an 8-level tool to compare qualification levels across European countries."],
};
const SRC_EUROPASS_COMPARE: AnswerEvidenceSource = {
  title: "Compare qualifications — Europass",
  url: "https://europass.europa.eu/en/compare-qualifications",
  publisher: "European Union — Europass",
  scope: "EU",
  checkedAt: CHECKED,
  sourceType: "EU_OFFICIAL",
  freshnessClass: "slow-changing",
  supportsClaims: ["Europass provides an official tool to compare national qualifications frameworks across countries."],
};
const SRC_CEDEFOP_SKILLS_INTEL: AnswerEvidenceSource = {
  title: "Skills intelligence — CEDEFOP",
  url: "https://www.cedefop.europa.eu/en/tools/skills-intelligence",
  publisher: "CEDEFOP",
  scope: "EU",
  checkedAt: CHECKED,
  sourceType: "EU_OFFICIAL",
  freshnessClass: "volatile",
  supportsClaims: ["Which occupations, sectors and skills are trending in demand across Europe."],
};
const SRC_EURES_SHORTAGES: AnswerEvidenceSource = {
  title: "Labour shortages and surpluses in Europe — EURES",
  url: "https://eures.europa.eu/living-and-working/labour-shortages-and-surpluses-europe_en",
  publisher: "EURES (European Employment Services)",
  scope: "EU",
  checkedAt: CHECKED,
  sourceType: "EU_OFFICIAL",
  freshnessClass: "volatile",
  supportsClaims: ["Which occupations are in shortage or surplus by country."],
};
const SRC_CEDEFOP_SHORTAGES: AnswerEvidenceSource = {
  title: "Skill shortages in Europe: which occupations are in demand — CEDEFOP",
  url: "https://www.cedefop.europa.eu/en/news/skill-shortages-europe-which-occupations-are-demand-and-why",
  publisher: "CEDEFOP",
  scope: "EU",
  checkedAt: CHECKED,
  sourceType: "EU_OFFICIAL",
  freshnessClass: "volatile",
  supportsClaims: ["Structural change, including automation, reshapes which skills and occupations are in demand."],
};

const DRAFTS: readonly Draft[] = [
  {
    id: "AE-0008",
    per: {
      en: {
        slug: "how-do-i-make-my-profile-visible-to-employers",
        h1: "How do I make my profile visible to employers?",
        short: "Complete your profile and set its visibility to open. A fuller profile with real skills and availability is easier for the right employers to find and understand.",
        full: [
          "Being found is partly about visibility settings and partly about substance. On LabourMarket.ai you control whether your profile is discoverable, and you can turn that on when you are open to opportunities. Visibility alone is not enough, though — a thin profile is hard to match well.",
          "What makes you findable to the right employers is a profile that names your real skills, your languages, where you can work and when you are available. The more of that is present and, where possible, backed by evidence, the more accurately you appear in matches instead of being missed.",
        ],
        steps: [
          "Fill in your skills, languages, locations and availability.",
          "Set your profile visibility to open when you are looking.",
          "Add evidence for key skills so matches are accurate.",
        ],
        limitations: "Visibility settings control who can find you; they do not guarantee an employer will make contact.",
        title: "Make your profile visible to employers",
        desc: "How to make your LabourMarket.ai profile visible to employers: open your visibility and complete real skills, languages and availability so the right ones find you.",
      },
      lt: {
        slug: "kaip-padaryti-profili-matoma-darbdaviams",
        h1: "Kaip padaryti profilį matomą darbdaviams?",
        short: "Užpildykite profilį ir nustatykite matomumą kaip atvirą. Pilnesnį profilį su realiais įgūdžiais ir prieinamumu tinkamiems darbdaviams lengviau rasti ir suprasti.",
        full: [
          "Ar būsite rasti, iš dalies priklauso nuo matomumo nustatymų, iš dalies nuo turinio. LabourMarket.ai valdote, ar profilis matomas, ir tai galite įjungti, kai esate atviri galimybėms. Vien matomumo neužtenka — plonas profilis sunkiai gerai sugretinamas.",
          "Tinkamiems darbdaviams jus randamą daro profilis, nurodantis realius įgūdžius, kalbas, kur galite dirbti ir nuo kada esate laisvi. Kuo daugiau to yra ir, kur įmanoma, paremta įrodymu, tuo tiksliau pasirodote atitiktyse, o ne praleidžiami.",
        ],
        steps: [
          "Užpildykite įgūdžius, kalbas, vietas ir prieinamumą.",
          "Kai ieškote, nustatykite profilio matomumą kaip atvirą.",
          "Pridėkite pagrindinių įgūdžių įrodymus, kad atitiktys būtų tikslios.",
        ],
        limitations: "Matomumo nustatymai valdo, kas jus gali rasti; jie negarantuoja, kad darbdavys susisieks.",
        title: "Padarykite profilį matomą darbdaviams",
        desc: "Kaip padaryti LabourMarket.ai profilį matomą darbdaviams: atverti matomumą ir užpildyti realius įgūdžius, kalbas bei prieinamumą, kad tinkami darbdaviai jus rastų.",
      },
      ru: {
        slug: "kak-sdelat-profil-vidimym-dlya-rabotodateley",
        h1: "Как сделать профиль видимым для работодателей?",
        short: "Заполните профиль и установите видимость как открытую. Более полный профиль с реальными навыками и доступностью проще найти и понять нужным работодателям.",
        full: [
          "Найдут ли вас, отчасти зависит от настроек видимости, отчасти от содержания. На LabourMarket.ai вы управляете тем, виден ли профиль, и можете включить это, когда открыты для возможностей. Одной видимости мало — тонкий профиль трудно хорошо сопоставить.",
          "Найти вас нужным работодателям помогает профиль, называющий реальные навыки, языки, где вы можете работать и когда свободны. Чем больше этого есть и, где возможно, подкреплено доказательством, тем точнее вы появляетесь в соответствиях, а не теряетесь.",
        ],
        steps: [
          "Заполните навыки, языки, локации и доступность.",
          "Когда ищете, установите видимость профиля как открытую.",
          "Добавьте доказательства ключевых навыков для точных соответствий.",
        ],
        limitations: "Настройки видимости определяют, кто может вас найти; они не гарантируют, что работодатель свяжется.",
        title: "Сделайте профиль видимым для работодателей",
        desc: "Как сделать профиль LabourMarket.ai видимым для работодателей: открыть видимость и заполнить реальные навыки, языки и доступность, чтобы нужные вас нашли.",
      },
      nl: {
        slug: "hoe-maak-ik-mijn-profiel-zichtbaar-voor-werkgevers",
        h1: "Hoe maak ik mijn profiel zichtbaar voor werkgevers?",
        short: "Vul je profiel in en zet de zichtbaarheid op open. Een voller profiel met echte vaardigheden en beschikbaarheid is voor de juiste werkgevers makkelijker te vinden en te begrijpen.",
        full: [
          "Gevonden worden hangt deels af van zichtbaarheidsinstellingen en deels van inhoud. Op LabourMarket.ai bepaal je of je profiel vindbaar is, en dat kun je aanzetten wanneer je openstaat voor kansen. Zichtbaarheid alleen is niet genoeg — een dun profiel is moeilijk goed te matchen.",
          "Wat je vindbaar maakt voor de juiste werkgevers is een profiel dat je echte vaardigheden, talen, waar je kunt werken en wanneer je beschikbaar bent benoemt. Hoe meer daarvan aanwezig is en, waar mogelijk, met bewijs onderbouwd, hoe nauwkeuriger je in matches verschijnt in plaats van gemist te worden.",
        ],
        steps: [
          "Vul je vaardigheden, talen, locaties en beschikbaarheid in.",
          "Zet je profielzichtbaarheid op open wanneer je zoekt.",
          "Voeg bewijs toe voor belangrijke vaardigheden voor accurate matches.",
        ],
        limitations: "Zichtbaarheidsinstellingen bepalen wie je kan vinden; ze garanderen niet dat een werkgever contact opneemt.",
        title: "Je profiel zichtbaar maken voor werkgevers",
        desc: "Hoe je je LabourMarket.ai-profiel zichtbaar maakt voor werkgevers: zet je zichtbaarheid open en vul echte vaardigheden, talen en beschikbaarheid in zodat de juiste je vinden.",
      },
      de: {
        slug: "wie-mache-ich-mein-profil-fuer-arbeitgeber-sichtbar",
        h1: "Wie mache ich mein Profil für Arbeitgeber sichtbar?",
        short: "Vervollständigen Sie Ihr Profil und stellen Sie die Sichtbarkeit auf offen. Ein volleres Profil mit echten Fähigkeiten und Verfügbarkeit lässt sich für die richtigen Arbeitgeber leichter finden und verstehen.",
        full: [
          "Gefunden zu werden hängt teils von den Sichtbarkeitseinstellungen, teils vom Inhalt ab. Auf LabourMarket.ai steuern Sie, ob Ihr Profil auffindbar ist, und können das aktivieren, wenn Sie für Möglichkeiten offen sind. Sichtbarkeit allein genügt nicht — ein dünnes Profil lässt sich schwer gut abgleichen.",
          "Auffindbar für die richtigen Arbeitgeber macht Sie ein Profil, das Ihre echten Fähigkeiten, Sprachen, mögliche Arbeitsorte und Verfügbarkeit nennt. Je mehr davon vorhanden und, wo möglich, mit Belegen gestützt ist, desto genauer erscheinen Sie in Abgleichen, statt übersehen zu werden.",
        ],
        steps: [
          "Tragen Sie Fähigkeiten, Sprachen, Orte und Verfügbarkeit ein.",
          "Stellen Sie die Profil-Sichtbarkeit auf offen, wenn Sie suchen.",
          "Fügen Sie Belege für zentrale Fähigkeiten hinzu für genaue Abgleiche.",
        ],
        limitations: "Sichtbarkeitseinstellungen bestimmen, wer Sie finden kann; sie garantieren nicht, dass ein Arbeitgeber Kontakt aufnimmt.",
        title: "Ihr Profil für Arbeitgeber sichtbar machen",
        desc: "Wie Sie Ihr LabourMarket.ai-Profil für Arbeitgeber sichtbar machen: Sichtbarkeit öffnen und echte Fähigkeiten, Sprachen und Verfügbarkeit eintragen, damit die richtigen Sie finden.",
      },
    },
  },
  {
    id: "AE-0011",
    per: {
      en: {
        slug: "how-will-i-know-if-an-employer-is-interested",
        h1: "How will I know if an employer is interested in me?",
        short: "You are notified when an employer acts on your profile or your expression of interest. The platform shows real activity rather than leaving you guessing after applying.",
        full: [
          "A common frustration elsewhere is silence after applying. LabourMarket.ai is built so interest is visible: when an employer engages with your profile or responds to interest you expressed, you see it, so you are not left refreshing an inbox with no signal.",
          "That said, no platform can force an employer to reply, and not every opportunity leads somewhere. The honest picture is that you will see genuine activity when it happens, and the best thing in your control is a complete, current profile so that the interest you do attract is well matched.",
        ],
        steps: [
          "Keep your profile current so matches are accurate.",
          "Express interest in opportunities that genuinely fit.",
          "Watch for notifications of real employer activity on your profile.",
        ],
        limitations: "The platform surfaces real activity, but it cannot guarantee that every employer will respond.",
        title: "Knowing if an employer is interested",
        desc: "How you know if an employer is interested on LabourMarket.ai: you are notified of real activity on your profile and interest, instead of silence after applying.",
      },
      lt: {
        slug: "kaip-suzinosiu-ar-darbdavys-susidomejo",
        h1: "Kaip sužinosiu, ar darbdavys manimi susidomėjo?",
        short: "Gaunate pranešimą, kai darbdavys ką nors daro su jūsų profiliu ar jūsų išreikštu susidomėjimu. Platforma rodo realią veiklą, o ne palieka spėlioti po kreipimosi.",
        full: [
          "Įprastas nusivylimas kitur — tyla po kreipimosi. LabourMarket.ai sukurta taip, kad susidomėjimas būtų matomas: kai darbdavys sąveikauja su jūsų profiliu ar atsako į jūsų išreikštą susidomėjimą, jūs tai matote ir nelenkiate pašto dėžutės be jokio signalo.",
          "Vis dėlto jokia platforma negali priversti darbdavio atsakyti, ir ne kiekviena galimybė kažkur veda. Sąžiningas vaizdas — matysite tikrą veiklą, kai ji vyksta, o labiausiai jūsų valioje esantis dalykas yra pilnas, aktualus profilis, kad pritrauktas susidomėjimas būtų gerai suderintas.",
        ],
        steps: [
          "Išlaikykite profilį aktualų, kad atitiktys būtų tikslios.",
          "Išreikškite susidomėjimą tikrai tinkančiomis galimybėmis.",
          "Stebėkite pranešimus apie realią darbdavio veiklą jūsų profilyje.",
        ],
        limitations: "Platforma parodo realią veiklą, bet negali garantuoti, kad kiekvienas darbdavys atsakys.",
        title: "Kaip sužinoti, ar darbdavys susidomėjo",
        desc: "Kaip sužinoti, ar darbdavys susidomėjo LabourMarket.ai: gaunate pranešimą apie realią veiklą jūsų profilyje ir susidomėjime, o ne tylą po kreipimosi.",
      },
      ru: {
        slug: "kak-ya-uznayu-chto-rabotodatel-zainteresovan",
        h1: "Как я узнаю, что работодатель заинтересован?",
        short: "Вы получаете уведомление, когда работодатель что-то делает с вашим профилем или проявленным вами интересом. Платформа показывает реальную активность, а не оставляет гадать после отклика.",
        full: [
          "Частое разочарование в других местах — тишина после отклика. LabourMarket.ai устроена так, что интерес виден: когда работодатель взаимодействует с вашим профилем или отвечает на проявленный вами интерес, вы это видите и не обновляете почту без сигнала.",
          "При этом ни одна платформа не заставит работодателя ответить, и не каждая возможность куда-то ведёт. Честная картина: вы увидите настоящую активность, когда она есть, а самое подконтрольное вам — полный, актуальный профиль, чтобы привлечённый интерес был хорошо сопоставлен.",
        ],
        steps: [
          "Держите профиль актуальным для точных соответствий.",
          "Проявляйте интерес к действительно подходящим возможностям.",
          "Следите за уведомлениями о реальной активности работодателя.",
        ],
        limitations: "Платформа показывает реальную активность, но не может гарантировать ответ каждого работодателя.",
        title: "Как узнать, что работодатель заинтересован",
        desc: "Как узнать, что работодатель заинтересован на LabourMarket.ai: вы получаете уведомление о реальной активности на профиле, а не тишину после отклика.",
      },
      nl: {
        slug: "hoe-weet-ik-of-een-werkgever-interesse-heeft",
        h1: "Hoe weet ik of een werkgever interesse in mij heeft?",
        short: "Je krijgt een melding wanneer een werkgever iets doet met je profiel of met de interesse die je toonde. Het platform toont echte activiteit in plaats van je te laten gissen na een sollicitatie.",
        full: [
          "Een veelgehoorde frustratie elders is stilte na een sollicitatie. LabourMarket.ai is zo gebouwd dat interesse zichtbaar is: wanneer een werkgever met je profiel bezig gaat of reageert op de interesse die je toonde, zie je dat, dus blijf je niet zonder signaal je inbox verversen.",
          "Dat gezegd hebbende, geen platform kan een werkgever dwingen te reageren, en niet elke kans leidt ergens toe. Het eerlijke beeld: je ziet echte activiteit wanneer die er is, en het meest in jouw hand is een volledig, actueel profiel zodat de interesse die je aantrekt goed past.",
        ],
        steps: [
          "Houd je profiel actueel voor accurate matches.",
          "Toon interesse in kansen die echt passen.",
          "Let op meldingen van echte werkgeversactiviteit op je profiel.",
        ],
        limitations: "Het platform toont echte activiteit, maar kan niet garanderen dat elke werkgever reageert.",
        title: "Weten of een werkgever interesse heeft",
        desc: "Hoe je weet of een werkgever interesse heeft op LabourMarket.ai: je krijgt een melding van echte activiteit op je profiel, in plaats van stilte na een sollicitatie.",
      },
      de: {
        slug: "wie-erfahre-ich-ob-ein-arbeitgeber-interessiert-ist",
        h1: "Wie erfahre ich, ob ein Arbeitgeber an mir interessiert ist?",
        short: "Sie werden benachrichtigt, wenn ein Arbeitgeber mit Ihrem Profil oder Ihrem gezeigten Interesse etwas tut. Die Plattform zeigt echte Aktivität, statt Sie nach der Bewerbung rätseln zu lassen.",
        full: [
          "Ein häufiger Frust anderswo ist Stille nach der Bewerbung. LabourMarket.ai ist so gebaut, dass Interesse sichtbar ist: Wenn ein Arbeitgeber mit Ihrem Profil interagiert oder auf Ihr gezeigtes Interesse reagiert, sehen Sie das und aktualisieren nicht ohne Signal Ihren Posteingang.",
          "Dennoch kann keine Plattform einen Arbeitgeber zur Antwort zwingen, und nicht jede Möglichkeit führt irgendwohin. Das ehrliche Bild: Sie sehen echte Aktivität, wenn es sie gibt, und am meisten in Ihrer Hand liegt ein vollständiges, aktuelles Profil, damit das geweckte Interesse gut passt.",
        ],
        steps: [
          "Halten Sie Ihr Profil aktuell für genaue Abgleiche.",
          "Zeigen Sie Interesse an wirklich passenden Möglichkeiten.",
          "Achten Sie auf Benachrichtigungen echter Arbeitgeber-Aktivität.",
        ],
        limitations: "Die Plattform zeigt echte Aktivität, kann aber nicht garantieren, dass jeder Arbeitgeber antwortet.",
        title: "Erfahren, ob ein Arbeitgeber interessiert ist",
        desc: "Wie Sie erfahren, ob ein Arbeitgeber interessiert ist auf LabourMarket.ai: Sie werden über echte Aktivität an Ihrem Profil benachrichtigt, statt Stille nach der Bewerbung.",
      },
    },
  },
  {
    id: "AE-0058",
    per: {
      en: {
        slug: "how-do-i-build-my-work-profile",
        h1: "How do I build my work profile?",
        short: "Start with your profession and real skills, add languages, locations and availability, then attach evidence where you can. Build it step by step — it does not need to be perfect at once.",
        full: [
          "A work profile is built from the truth of what you do, not from a template you fill to impress. Begin with your profession and the concrete skills you actually have, then add your languages, where you can work and when. You can import an existing CV to save typing and review each suggestion.",
          "The profile improves over time: as you record work and have skills confirmed, it grows into an evidence-backed picture rather than a static claim. Treat the first version as a foundation you keep updating, not a one-off document.",
        ],
        steps: [
          "Add your profession and the real skills you have.",
          "Set languages, locations and availability.",
          "Import a CV or record work, then attach evidence over time.",
        ],
        title: "Building your work profile",
        desc: "How to build your work profile on LabourMarket.ai: start with your profession, real skills, languages and availability, then add evidence step by step.",
      },
      lt: {
        slug: "kaip-susikurti-darbo-profili",
        h1: "Kaip susikurti darbo profilį?",
        short: "Pradėkite nuo profesijos ir realių įgūdžių, pridėkite kalbas, vietas ir prieinamumą, tada, kur galite, pridėkite įrodymų. Kurkite žingsnis po žingsnio — jis neturi būti tobulas iškart.",
        full: [
          "Darbo profilis kuriamas iš tiesos apie tai, ką darote, o ne iš šablono, kurį pildote, kad sužavėtumėte. Pradėkite nuo profesijos ir konkrečių įgūdžių, kuriuos realiai turite, tada pridėkite kalbas, kur galite dirbti ir kada. Galite importuoti turimą CV, kad mažiau rašytumėte, ir peržiūrėti kiekvieną pasiūlymą.",
          "Profilis gerėja laikui bėgant: fiksuojant darbą ir patvirtinant įgūdžius, jis auga į įrodymais grįstą vaizdą, o ne statišką teiginį. Pirmąją versiją laikykite pamatu, kurį nuolat pildote, ne vienkartiniu dokumentu.",
        ],
        steps: [
          "Pridėkite profesiją ir realius turimus įgūdžius.",
          "Nurodykite kalbas, vietas ir prieinamumą.",
          "Importuokite CV arba fiksuokite darbą, laikui bėgant pridėkite įrodymų.",
        ],
        title: "Darbo profilio kūrimas",
        desc: "Kaip susikurti darbo profilį LabourMarket.ai: pradėti nuo profesijos, realių įgūdžių, kalbų ir prieinamumo, tada žingsnis po žingsnio pridėti įrodymų.",
      },
      ru: {
        slug: "kak-sozdat-rabochiy-profil",
        h1: "Как создать рабочий профиль?",
        short: "Начните с профессии и реальных навыков, добавьте языки, локации и доступность, затем, где можете, приложите доказательства. Стройте шаг за шагом — он не обязан быть идеальным сразу.",
        full: [
          "Рабочий профиль строится из правды о том, что вы делаете, а не из шаблона, который заполняют, чтобы впечатлить. Начните с профессии и конкретных навыков, которые у вас реально есть, затем добавьте языки, где можете работать и когда. Можно импортировать имеющееся резюме, чтобы меньше печатать, и проверить каждое предложение.",
          "Профиль улучшается со временем: по мере фиксации работы и подтверждения навыков он вырастает в картину на основе доказательств, а не статичное утверждение. Считайте первую версию основой, которую постоянно обновляете, а не разовым документом.",
        ],
        steps: [
          "Добавьте профессию и реальные навыки.",
          "Укажите языки, локации и доступность.",
          "Импортируйте резюме или фиксируйте работу, со временем добавляйте доказательства.",
        ],
        title: "Создание рабочего профиля",
        desc: "Как создать рабочий профиль на LabourMarket.ai: начать с профессии, реальных навыков, языков и доступности, затем шаг за шагом добавлять доказательства.",
      },
      nl: {
        slug: "hoe-bouw-ik-mijn-werkprofiel",
        h1: "Hoe bouw ik mijn werkprofiel op?",
        short: "Begin met je beroep en echte vaardigheden, voeg talen, locaties en beschikbaarheid toe, en koppel bewijs waar je kunt. Bouw stap voor stap — het hoeft niet meteen perfect te zijn.",
        full: [
          "Een werkprofiel bouw je op vanuit de waarheid over wat je doet, niet vanuit een sjabloon dat je invult om indruk te maken. Begin met je beroep en de concrete vaardigheden die je echt hebt, voeg dan je talen toe, waar je kunt werken en wanneer. Je kunt een bestaand cv importeren om typen te besparen en elke suggestie beoordelen.",
          "Het profiel verbetert met de tijd: terwijl je werk vastlegt en vaardigheden laat bevestigen, groeit het tot een op bewijs gebaseerd beeld in plaats van een statische claim. Zie de eerste versie als een basis die je blijft bijwerken, geen eenmalig document.",
        ],
        steps: [
          "Voeg je beroep en de echte vaardigheden die je hebt toe.",
          "Stel talen, locaties en beschikbaarheid in.",
          "Importeer een cv of leg werk vast, en koppel na verloop van tijd bewijs.",
        ],
        title: "Je werkprofiel opbouwen",
        desc: "Hoe je je werkprofiel opbouwt op LabourMarket.ai: begin met je beroep, echte vaardigheden, talen en beschikbaarheid, en voeg stap voor stap bewijs toe.",
      },
      de: {
        slug: "wie-baue-ich-mein-arbeitsprofil-auf",
        h1: "Wie baue ich mein Arbeitsprofil auf?",
        short: "Beginnen Sie mit Beruf und echten Fähigkeiten, ergänzen Sie Sprachen, Orte und Verfügbarkeit, und fügen Sie Belege hinzu, wo Sie können. Bauen Sie Schritt für Schritt — es muss nicht sofort perfekt sein.",
        full: [
          "Ein Arbeitsprofil bauen Sie aus der Wahrheit über das, was Sie tun, nicht aus einer Vorlage, die man zum Beeindrucken ausfüllt. Beginnen Sie mit Ihrem Beruf und den konkreten Fähigkeiten, die Sie wirklich haben, ergänzen Sie dann Sprachen, mögliche Arbeitsorte und Verfügbarkeit. Sie können einen vorhandenen Lebenslauf importieren, um Tippen zu sparen, und jeden Vorschlag prüfen.",
          "Das Profil verbessert sich mit der Zeit: Während Sie Arbeit festhalten und Fähigkeiten bestätigen lassen, wächst es zu einem belegbasierten Bild statt einer statischen Behauptung. Behandeln Sie die erste Version als Grundlage, die Sie laufend aktualisieren, nicht als einmaliges Dokument.",
        ],
        steps: [
          "Fügen Sie Beruf und Ihre echten Fähigkeiten hinzu.",
          "Legen Sie Sprachen, Orte und Verfügbarkeit fest.",
          "Importieren Sie einen Lebenslauf oder halten Sie Arbeit fest, und fügen Sie mit der Zeit Belege hinzu.",
        ],
        title: "Ihr Arbeitsprofil aufbauen",
        desc: "Wie Sie Ihr Arbeitsprofil auf LabourMarket.ai aufbauen: mit Beruf, echten Fähigkeiten, Sprachen und Verfügbarkeit beginnen und Schritt für Schritt Belege hinzufügen.",
      },
    },
  },
  {
    id: "AE-0063",
    per: {
      en: {
        slug: "how-do-i-turn-work-experience-into-a-profile",
        h1: "How do I turn my work experience into a profile?",
        short: "Describe what you actually did in each role, then let those tasks become named skills. Experience becomes a profile when the doing is translated into concrete, checkable skills.",
        full: [
          "A list of past job titles says little; what you did in them says a lot. Go role by role and write the concrete tasks and responsibilities in plain terms. Those become the raw material for skills — each real task points to a skill you can name and, later, evidence.",
          "On LabourMarket.ai this turns a work history into a living profile: the tasks you record support the skills you declare, and confirmation from managers strengthens them. The aim is an honest picture of capability, not a polished story detached from what you really did.",
        ],
        steps: [
          "Go through each role and note the concrete tasks you did.",
          "Turn recurring tasks into named skills on your profile.",
          "Add evidence and seek confirmation for the key ones.",
        ],
        title: "Turning work experience into a profile",
        desc: "How to turn work experience into a profile on LabourMarket.ai: describe what you did, turn tasks into named skills, and back the key ones with evidence.",
      },
      lt: {
        slug: "kaip-paversti-darbo-patirti-profiliu",
        h1: "Kaip paversti darbo patirtį profiliu?",
        short: "Aprašykite, ką realiai darėte kiekvienose pareigose, tada leiskite toms užduotims tapti įvardytais įgūdžiais. Patirtis tampa profiliu, kai veikimas paverčiamas konkrečiais, patikrinamais įgūdžiais.",
        full: [
          "Buvusių pareigų sąrašas sako mažai; ką jose darėte — daug. Eikite pareigos po pareigos ir paprastai surašykite konkrečias užduotis bei atsakomybes. Jos tampa žaliava įgūdžiams — kiekviena reali užduotis rodo įgūdį, kurį galite įvardyti ir vėliau paremti įrodymu.",
          "LabourMarket.ai tai paverčia darbo istoriją gyvu profiliu: fiksuojamos užduotys pagrindžia deklaruojamus įgūdžius, o vadovų patvirtinimas juos sustiprina. Tikslas — sąžiningas gebėjimo vaizdas, ne nugludinta istorija, atsieta nuo to, ką realiai darėte.",
        ],
        steps: [
          "Peržiūrėkite kiekvienas pareigas ir užrašykite konkrečias atliktas užduotis.",
          "Pasikartojančias užduotis paverskite įvardytais įgūdžiais profilyje.",
          "Pridėkite įrodymų ir siekite patvirtinimo svarbiausiems.",
        ],
        title: "Darbo patirties pavertimas profiliu",
        desc: "Kaip paversti darbo patirtį profiliu LabourMarket.ai: aprašyti, ką darėte, užduotis paversti įvardytais įgūdžiais ir svarbiausius paremti įrodymu.",
      },
      ru: {
        slug: "kak-prevratit-opyt-raboty-v-profil",
        h1: "Как превратить опыт работы в профиль?",
        short: "Опишите, что вы реально делали на каждой должности, затем дайте этим задачам стать названными навыками. Опыт становится профилем, когда действия переводятся в конкретные, проверяемые навыки.",
        full: [
          "Список прошлых должностей говорит мало; что вы на них делали — многое. Идите по должностям и простыми словами запишите конкретные задачи и обязанности. Они становятся сырьём для навыков — каждая реальная задача указывает на навык, который можно назвать и позже подкрепить доказательством.",
          "На LabourMarket.ai это превращает историю работы в живой профиль: зафиксированные задачи подкрепляют заявленные навыки, а подтверждение от руководителей их усиливает. Цель — честная картина способностей, а не отшлифованная история в отрыве от того, что вы реально делали.",
        ],
        steps: [
          "Пройдите по каждой должности и отметьте конкретные задачи.",
          "Повторяющиеся задачи превратите в названные навыки в профиле.",
          "Добавьте доказательства и добейтесь подтверждения ключевых.",
        ],
        title: "Превращение опыта работы в профиль",
        desc: "Как превратить опыт работы в профиль на LabourMarket.ai: описать, что вы делали, превратить задачи в названные навыки и подкрепить ключевые доказательством.",
      },
      nl: {
        slug: "hoe-zet-ik-werkervaring-om-in-een-profiel",
        h1: "Hoe zet ik mijn werkervaring om in een profiel?",
        short: "Beschrijf wat je in elke rol echt deed, en laat die taken benoemde vaardigheden worden. Ervaring wordt een profiel wanneer het doen wordt vertaald naar concrete, controleerbare vaardigheden.",
        full: [
          "Een lijst met eerdere functietitels zegt weinig; wat je erin deed zegt veel. Ga rol voor rol en schrijf de concrete taken en verantwoordelijkheden in gewone woorden op. Die worden de grondstof voor vaardigheden — elke echte taak wijst op een vaardigheid die je kunt benoemen en later onderbouwen.",
          "Op LabourMarket.ai maakt dit van een arbeidsverleden een levend profiel: de taken die je vastlegt onderbouwen de vaardigheden die je opgeeft, en bevestiging door leidinggevenden versterkt ze. Het doel is een eerlijk beeld van kunde, geen gladde verhaallijn los van wat je echt deed.",
        ],
        steps: [
          "Ga elke rol langs en noteer de concrete taken die je deed.",
          "Maak van terugkerende taken benoemde vaardigheden op je profiel.",
          "Voeg bewijs toe en zoek bevestiging voor de belangrijkste.",
        ],
        title: "Werkervaring omzetten in een profiel",
        desc: "Hoe je werkervaring omzet in een profiel op LabourMarket.ai: beschrijf wat je deed, maak van taken benoemde vaardigheden en onderbouw de belangrijkste met bewijs.",
      },
      de: {
        slug: "wie-mache-ich-aus-berufserfahrung-ein-profil",
        h1: "Wie mache ich aus meiner Berufserfahrung ein Profil?",
        short: "Beschreiben Sie, was Sie in jeder Rolle wirklich taten, und lassen Sie diese Aufgaben zu benannten Fähigkeiten werden. Erfahrung wird zum Profil, wenn das Tun in konkrete, prüfbare Fähigkeiten übersetzt wird.",
        full: [
          "Eine Liste früherer Stellenbezeichnungen sagt wenig; was Sie darin taten, sagt viel. Gehen Sie Rolle für Rolle vor und schreiben Sie die konkreten Aufgaben und Verantwortungen in einfachen Worten auf. Diese werden zum Rohstoff für Fähigkeiten — jede echte Aufgabe verweist auf eine Fähigkeit, die Sie benennen und später belegen können.",
          "Auf LabourMarket.ai wird so aus einem Werdegang ein lebendiges Profil: die festgehaltenen Aufgaben stützen die angegebenen Fähigkeiten, und die Bestätigung durch Vorgesetzte stärkt sie. Ziel ist ein ehrliches Bild des Könnens, keine geschliffene Geschichte losgelöst von dem, was Sie wirklich taten.",
        ],
        steps: [
          "Gehen Sie jede Rolle durch und notieren Sie die konkreten Aufgaben.",
          "Machen Sie aus wiederkehrenden Aufgaben benannte Fähigkeiten im Profil.",
          "Fügen Sie Belege hinzu und suchen Sie Bestätigung für die wichtigsten.",
        ],
        title: "Aus Berufserfahrung ein Profil machen",
        desc: "Wie Sie aus Berufserfahrung ein Profil machen auf LabourMarket.ai: beschreiben, was Sie taten, Aufgaben in benannte Fähigkeiten überführen und die wichtigsten belegen.",
      },
    },
  },
  {
    id: "AE-0104",
    per: {
      en: {
        slug: "how-do-i-get-my-skills-confirmed-by-a-manager",
        h1: "How do I get my skills confirmed by a manager?",
        short: "Ask someone who saw your work — a manager or team lead — to confirm a specific skill. They verify it from real work, and it moves from declared to confirmed with a record of who confirmed it.",
        full: [
          "Confirmation is how a self-declared skill becomes evidenced. The person best placed to confirm is someone who actually observed you doing the work: a manager, team lead or supervisor. You request confirmation for a specific skill, and they verify it based on real work rather than a test.",
          "This keeps the signal honest and useful. A confirmed skill carries more weight in matching because a real person stood behind it, and the platform records who confirmed it. Skills you cannot yet get confirmed stay clearly marked as declared — nothing is invented on your behalf.",
        ],
        steps: [
          "Pick a skill a manager or lead actually saw you use.",
          "Request confirmation for that specific skill.",
          "Once verified, it shows as confirmed with the confirmer on record.",
        ],
        limitations: "Only a person who can vouch for your real work should confirm a skill; the platform never confirms skills on its own.",
        title: "Getting your skills confirmed by a manager",
        desc: "How to get your skills confirmed on LabourMarket.ai: ask a manager or lead who saw your work to verify a specific skill, moving it from declared to confirmed.",
      },
      lt: {
        slug: "kaip-gauti-vadovo-patvirtinima-igudziams",
        h1: "Kaip gauti vadovo patvirtinimą įgūdžiams?",
        short: "Paprašykite žmogaus, mačiusio jūsų darbą — vadovo ar komandos vadovo — patvirtinti konkretų įgūdį. Jis patvirtina iš realaus darbo, ir įgūdis iš deklaruoto tampa patvirtintu su įrašu, kas patvirtino.",
        full: [
          "Patvirtinimas — kaip savideklaruotas įgūdis tampa įrodytu. Tinkamiausias patvirtinti yra tas, kuris realiai matė jus dirbant: vadovas, komandos vadovas ar prižiūrėtojas. Prašote patvirtinti konkretų įgūdį, ir jis jį patikrina pagal realų darbą, ne pagal testą.",
          "Taip signalas lieka sąžiningas ir naudingas. Patvirtintas įgūdis atitiktyje sveria daugiau, nes už jo stovi realus žmogus, o platforma įrašo, kas patvirtino. Įgūdžiai, kurių dar negalite patvirtinti, lieka aiškiai pažymėti kaip deklaruoti — niekas už jus neišgalvojama.",
        ],
        steps: [
          "Pasirinkite įgūdį, kurį vadovas ar vadovas realiai matė naudojant.",
          "Paprašykite patvirtinti būtent tą įgūdį.",
          "Patikrinus jis rodomas kaip patvirtintas su įrašytu patvirtintoju.",
        ],
        limitations: "Įgūdį turėtų patvirtinti tik tas, kuris gali laiduoti už jūsų realų darbą; platforma pati įgūdžių nepatvirtina.",
        title: "Vadovo patvirtinimas įgūdžiams",
        desc: "Kaip gauti įgūdžių patvirtinimą LabourMarket.ai: paprašyti darbą mačiusio vadovo patvirtinti konkretų įgūdį, kad jis iš deklaruoto taptų patvirtintu.",
      },
      ru: {
        slug: "kak-poluchit-podtverzhdenie-navykov-ot-rukovoditelya",
        h1: "Как получить подтверждение навыков от руководителя?",
        short: "Попросите того, кто видел вашу работу — руководителя или тимлида — подтвердить конкретный навык. Он удостоверяет его по реальной работе, и навык из заявленного становится подтверждённым с записью о том, кто подтвердил.",
        full: [
          "Подтверждение — это как самозаявленный навык становится доказанным. Лучше всего подтвердит тот, кто действительно наблюдал вашу работу: руководитель, тимлид или супервайзер. Вы запрашиваете подтверждение конкретного навыка, и он удостоверяет его по реальной работе, а не по тесту.",
          "Так сигнал остаётся честным и полезным. Подтверждённый навык весит больше в подборе, потому что за ним стоит реальный человек, а платформа фиксирует, кто подтвердил. Навыки, которые пока нельзя подтвердить, остаются чётко помеченными как заявленные — ничего не выдумывается за вас.",
        ],
        steps: [
          "Выберите навык, который руководитель реально видел в деле.",
          "Запросите подтверждение именно этого навыка.",
          "После проверки он показывается как подтверждённый с записью подтвердившего.",
        ],
        limitations: "Навык должен подтверждать только тот, кто может поручиться за вашу реальную работу; платформа сама навыки не подтверждает.",
        title: "Подтверждение навыков руководителем",
        desc: "Как получить подтверждение навыков на LabourMarket.ai: попросить видевшего вашу работу руководителя удостоверить конкретный навык, переводя его из заявленного в подтверждённый.",
      },
      nl: {
        slug: "hoe-laat-ik-mijn-vaardigheden-bevestigen-door-een-leidinggevende",
        h1: "Hoe laat ik mijn vaardigheden bevestigen door een leidinggevende?",
        short: "Vraag iemand die je werk zag — een leidinggevende of teamlead — een specifieke vaardigheid te bevestigen. Die verifieert het uit echt werk, en het gaat van gedeclareerd naar bevestigd met een registratie van wie bevestigde.",
        full: [
          "Bevestiging is hoe een zelf-opgegeven vaardigheid onderbouwd wordt. Wie het best kan bevestigen is iemand die je het werk echt zag doen: een leidinggevende, teamlead of supervisor. Je vraagt bevestiging voor een specifieke vaardigheid, en die verifieert het op basis van echt werk in plaats van een test.",
          "Zo blijft het signaal eerlijk en bruikbaar. Een bevestigde vaardigheid weegt zwaarder in matching omdat er een echt persoon achter stond, en het platform legt vast wie bevestigde. Vaardigheden die je nog niet kunt laten bevestigen blijven duidelijk als gedeclareerd gemarkeerd — er wordt niets voor je verzonnen.",
        ],
        steps: [
          "Kies een vaardigheid die een leidinggevende of lead je echt zag gebruiken.",
          "Vraag bevestiging voor die specifieke vaardigheid.",
          "Na verificatie toont die als bevestigd met de bevestiger vastgelegd.",
        ],
        limitations: "Alleen iemand die voor je echte werk kan instaan zou een vaardigheid moeten bevestigen; het platform bevestigt nooit vaardigheden zelf.",
        title: "Je vaardigheden laten bevestigen door een leidinggevende",
        desc: "Hoe je vaardigheden laat bevestigen op LabourMarket.ai: vraag een leidinggevende die je werk zag een specifieke vaardigheid te verifiëren, van gedeclareerd naar bevestigd.",
      },
      de: {
        slug: "wie-lasse-ich-meine-faehigkeiten-von-einer-fuehrungskraft-bestaetigen",
        h1: "Wie lasse ich meine Fähigkeiten von einer Führungskraft bestätigen?",
        short: "Bitten Sie jemanden, der Ihre Arbeit sah — eine Führungskraft oder Teamleitung — eine bestimmte Fähigkeit zu bestätigen. Sie verifiziert sie aus echter Arbeit, und sie wechselt von angegeben zu bestätigt, mit Vermerk, wer bestätigte.",
        full: [
          "Bestätigung ist, wie eine selbst angegebene Fähigkeit belegt wird. Am besten bestätigt, wer Sie tatsächlich bei der Arbeit beobachtet hat: eine Führungskraft, Teamleitung oder Vorgesetzte. Sie bitten um Bestätigung einer bestimmten Fähigkeit, und diese wird anhand echter Arbeit verifiziert, nicht anhand eines Tests.",
          "So bleibt das Signal ehrlich und nützlich. Eine bestätigte Fähigkeit wiegt im Abgleich mehr, weil ein echter Mensch für sie einstand, und die Plattform hält fest, wer bestätigte. Fähigkeiten, die Sie noch nicht bestätigen lassen können, bleiben klar als angegeben gekennzeichnet — nichts wird für Sie erfunden.",
        ],
        steps: [
          "Wählen Sie eine Fähigkeit, die eine Führungskraft real im Einsatz sah.",
          "Bitten Sie um Bestätigung genau dieser Fähigkeit.",
          "Nach der Prüfung erscheint sie als bestätigt mit vermerktem Bestätiger.",
        ],
        limitations: "Nur wer für Ihre echte Arbeit einstehen kann, sollte eine Fähigkeit bestätigen; die Plattform bestätigt Fähigkeiten nie selbst.",
        title: "Fähigkeiten von einer Führungskraft bestätigen lassen",
        desc: "Wie Sie Fähigkeiten auf LabourMarket.ai bestätigen lassen: eine Führungskraft, die Ihre Arbeit sah, verifiziert eine bestimmte Fähigkeit — von angegeben zu bestätigt.",
      },
    },
  },
  {
    id: "AE-0106",
    per: {
      en: {
        slug: "how-are-my-skills-kept-private-from-employers",
        h1: "How are my skills kept private from employers by default?",
        short: "Your records are private by default. You choose what becomes visible when you look for work; nothing about your skills or history is shown to employers unless you decide to share it.",
        full: [
          "Privacy is the starting state, not an afterthought. By default your detailed records — what you log, your full history — stay closed. This matters especially if you are exploring options while still employed and do not want your current employer to see activity.",
          "When you are ready, you decide what to open: you can make your profile discoverable and choose what employers see. The control stays with you throughout, and making yourself visible is an explicit choice you can reverse, not something that happens automatically.",
        ],
        steps: [
          "Know that detailed records are private by default.",
          "Decide what to make visible when you are actively looking.",
          "Change or withdraw visibility at any time.",
        ],
        limitations: "Once you choose to share specific information with an employer, they can see what you shared; you control what that is.",
        title: "How your skills stay private by default",
        desc: "How LabourMarket.ai keeps your skills private by default: records are closed unless you choose to share, so you control what employers see and when.",
      },
      lt: {
        slug: "kaip-mano-igudziai-lieka-privatus-nuo-darbdaviu",
        h1: "Kaip mano įgūdžiai pagal nutylėjimą lieka privatūs nuo darbdavių?",
        short: "Jūsų įrašai pagal nutylėjimą privatūs. Jūs renkatės, kas tampa matoma, kai ieškote darbo; niekas apie jūsų įgūdžius ar istoriją nerodoma darbdaviams, nebent nuspręstumėte pasidalyti.",
        full: [
          "Privatumas — pradinė būsena, ne papildoma mintis. Pagal nutylėjimą jūsų detalūs įrašai — ką fiksuojate, visa istorija — lieka uždari. Tai ypač svarbu, jei svarstote galimybes vis dar dirbdami ir nenorite, kad dabartinis darbdavys matytų veiklą.",
          "Kai būsite pasiruošę, jūs sprendžiate, ką atverti: galite padaryti profilį matomą ir pasirinkti, ką darbdaviai mato. Valdymas visą laiką lieka jums, o savęs matomu padarymas yra aiškus, atšaukiamas pasirinkimas, ne kažkas, kas įvyksta savaime.",
        ],
        steps: [
          "Žinokite, kad detalūs įrašai pagal nutylėjimą privatūs.",
          "Nuspręskite, ką padaryti matoma, kai aktyviai ieškote.",
          "Bet kada pakeiskite ar atšaukite matomumą.",
        ],
        limitations: "Pasirinkę pasidalyti konkrečia informacija su darbdaviu, jis matys tai, kuo pasidalijote; ką — sprendžiate jūs.",
        title: "Kaip įgūdžiai lieka privatūs pagal nutylėjimą",
        desc: "Kaip LabourMarket.ai laiko įgūdžius privačius pagal nutylėjimą: įrašai uždari, nebent pasirinktumėte pasidalyti, todėl jūs valdote, ką ir kada mato darbdaviai.",
      },
      ru: {
        slug: "kak-moi-navyki-ostayutsya-privatnymi-ot-rabotodateley",
        h1: "Как мои навыки по умолчанию остаются приватными от работодателей?",
        short: "Ваши записи по умолчанию приватны. Вы выбираете, что становится видимым, когда ищете работу; ничего о ваших навыках или истории не показывается работодателям, если вы не решите поделиться.",
        full: [
          "Приватность — исходное состояние, а не запоздалая мысль. По умолчанию ваши подробные записи — то, что вы фиксируете, вся история — остаются закрытыми. Это особенно важно, если вы изучаете варианты, ещё работая, и не хотите, чтобы нынешний работодатель видел активность.",
          "Когда вы готовы, вы решаете, что открыть: можно сделать профиль видимым и выбрать, что видят работодатели. Контроль всё время остаётся у вас, а сделать себя видимым — явный, обратимый выбор, а не то, что происходит само.",
        ],
        steps: [
          "Знайте, что подробные записи по умолчанию приватны.",
          "Решите, что сделать видимым, когда активно ищете.",
          "В любой момент измените или отзовите видимость.",
        ],
        limitations: "Как только вы решите поделиться конкретной информацией с работодателем, он увидит то, чем вы поделились; что именно — решаете вы.",
        title: "Как навыки остаются приватными по умолчанию",
        desc: "Как LabourMarket.ai держит навыки приватными по умолчанию: записи закрыты, пока вы не решите поделиться, поэтому вы контролируете, что и когда видят работодатели.",
      },
      nl: {
        slug: "hoe-blijven-mijn-vaardigheden-standaard-privé-voor-werkgevers",
        h1: "Hoe blijven mijn vaardigheden standaard privé voor werkgevers?",
        short: "Je gegevens zijn standaard privé. Jij kiest wat zichtbaar wordt wanneer je werk zoekt; niets over je vaardigheden of geschiedenis wordt aan werkgevers getoond tenzij je besluit te delen.",
        full: [
          "Privacy is de begintoestand, geen bijzaak. Standaard blijven je gedetailleerde gegevens — wat je vastlegt, je volledige geschiedenis — gesloten. Dat is vooral belangrijk als je opties verkent terwijl je nog werkt en niet wilt dat je huidige werkgever activiteit ziet.",
          "Wanneer je klaar bent, bepaal jij wat je openzet: je kunt je profiel vindbaar maken en kiezen wat werkgevers zien. De controle blijft de hele tijd bij jou, en jezelf zichtbaar maken is een expliciete, terug te draaien keuze, niet iets wat vanzelf gebeurt.",
        ],
        steps: [
          "Weet dat gedetailleerde gegevens standaard privé zijn.",
          "Bepaal wat je zichtbaar maakt wanneer je actief zoekt.",
          "Wijzig of trek zichtbaarheid op elk moment in.",
        ],
        limitations: "Zodra je kiest specifieke informatie met een werkgever te delen, kan die zien wat je deelde; jij bepaalt wat dat is.",
        title: "Hoe je vaardigheden standaard privé blijven",
        desc: "Hoe LabourMarket.ai je vaardigheden standaard privé houdt: gegevens zijn gesloten tenzij je kiest te delen, dus jij bepaalt wat werkgevers zien en wanneer.",
      },
      de: {
        slug: "wie-bleiben-meine-faehigkeiten-standardmaessig-privat",
        h1: "Wie bleiben meine Fähigkeiten standardmäßig für Arbeitgeber privat?",
        short: "Ihre Einträge sind standardmäßig privat. Sie wählen, was sichtbar wird, wenn Sie Arbeit suchen; nichts über Ihre Fähigkeiten oder Historie wird Arbeitgebern gezeigt, sofern Sie sich nicht zum Teilen entscheiden.",
        full: [
          "Privatsphäre ist der Ausgangszustand, kein Nachgedanke. Standardmäßig bleiben Ihre detaillierten Einträge — was Sie festhalten, Ihre gesamte Historie — geschlossen. Das ist besonders wichtig, wenn Sie Optionen prüfen, während Sie noch angestellt sind, und nicht möchten, dass Ihr aktueller Arbeitgeber Aktivität sieht.",
          "Wenn Sie bereit sind, entscheiden Sie, was Sie öffnen: Sie können Ihr Profil auffindbar machen und wählen, was Arbeitgeber sehen. Die Kontrolle bleibt durchgehend bei Ihnen, und sich sichtbar zu machen ist eine ausdrückliche, umkehrbare Entscheidung, nicht etwas, das von selbst geschieht.",
        ],
        steps: [
          "Wissen Sie, dass detaillierte Einträge standardmäßig privat sind.",
          "Entscheiden Sie, was Sie sichtbar machen, wenn Sie aktiv suchen.",
          "Ändern oder widerrufen Sie die Sichtbarkeit jederzeit.",
        ],
        limitations: "Sobald Sie bestimmte Informationen mit einem Arbeitgeber teilen, kann dieser das Geteilte sehen; was das ist, bestimmen Sie.",
        title: "Wie Ihre Fähigkeiten standardmäßig privat bleiben",
        desc: "Wie LabourMarket.ai Ihre Fähigkeiten standardmäßig privat hält: Einträge sind geschlossen, bis Sie teilen — Sie steuern, was Arbeitgeber wann sehen.",
      },
    },
  },
  {
    id: "AE-0189",
    per: {
      en: {
        slug: "how-do-i-use-my-current-skills-to-move-into-a-new-profession",
        h1: "How do I use my current skills to move into a new profession?",
        short: "Map the skills you already have to what a target profession needs, build on the overlap, and close the small remaining gap. Move on your strengths rather than starting from zero.",
        full: [
          "Changing profession rarely means discarding everything you know. Most of your skills — how you organise, solve problems, work with tools or people — carry across. The practical move is to compare what you have with what the new profession needs and lead with the overlap.",
          "On LabourMarket.ai this is concrete: your skills point to adjacent directions, each showing which of your skills connect you to it and what you might still need. You then focus your effort on the small remaining gap instead of treating the change as a full restart.",
        ],
        steps: [
          "List the skills you already use, in plain terms.",
          "See which adjacent directions your skills already open.",
          "Focus learning on the specific gap the target direction shows.",
        ],
        title: "Using current skills to move into a new profession",
        desc: "How to use your current skills to move into a new profession on LabourMarket.ai: build on skill overlap with adjacent directions and close the remaining gap.",
      },
      lt: {
        slug: "kaip-panaudoti-dabartinius-igudzius-naujai-profesijai",
        h1: "Kaip panaudoti dabartinius įgūdžius pereinant į naują profesiją?",
        short: "Susiekite jau turimus įgūdžius su tuo, ko reikia tikslinei profesijai, remkitės sutapimu ir užpildykite mažą likusį trūkumą. Judėkite pagal stiprybes, o ne iš nulio.",
        full: [
          "Profesijos keitimas retai reiškia atsisakyti visko, ką mokate. Dauguma įgūdžių — kaip organizuojate, sprendžiate problemas, dirbate su įrankiais ar žmonėmis — persikelia. Praktiškas žingsnis — palyginti tai, ką turite, su tuo, ko reikia naujai profesijai, ir remtis sutapimu.",
          "LabourMarket.ai tai konkretu: jūsų įgūdžiai rodo gretimas kryptis, kiekviena rodo, kurie įgūdžiai jus su ja sieja ir ko dar gali trūkti. Tada pastangas sutelkiate į mažą likusį trūkumą, o ne laikote keitimą visišku prasidėjimu iš naujo.",
        ],
        steps: [
          "Paprastai išvardykite jau naudojamus įgūdžius.",
          "Pažiūrėkite, kokias gretimas kryptis jie jau atveria.",
          "Mokymąsi sutelkite į konkretų trūkumą, kurį rodo kryptis.",
        ],
        title: "Dabartinių įgūdžių panaudojimas naujai profesijai",
        desc: "Kaip panaudoti dabartinius įgūdžius pereinant į naują profesiją LabourMarket.ai: remtis įgūdžių sutapimu su gretimomis kryptimis ir užpildyti likusį trūkumą.",
      },
      ru: {
        slug: "kak-ispolzovat-tekushchie-navyki-dlya-perekhoda-v-novuyu-professiyu",
        h1: "Как использовать текущие навыки для перехода в новую профессию?",
        short: "Сопоставьте уже имеющиеся навыки с тем, что нужно целевой профессии, опирайтесь на совпадение и закройте небольшой оставшийся разрыв. Двигайтесь на сильных сторонах, а не с нуля.",
        full: [
          "Смена профессии редко означает отказ от всего, что вы знаете. Большинство навыков — как вы организуете, решаете проблемы, работаете с инструментами или людьми — переносятся. Практичный шаг — сравнить то, что у вас есть, с тем, что нужно новой профессии, и опираться на совпадение.",
          "На LabourMarket.ai это конкретно: ваши навыки указывают на смежные направления, каждое показывает, какие навыки вас с ним связывают и чего может не хватать. Затем вы сосредотачиваете усилия на небольшом оставшемся разрыве, а не воспринимаете смену как полный старт заново.",
        ],
        steps: [
          "Перечислите уже используемые навыки простыми словами.",
          "Посмотрите, какие смежные направления они уже открывают.",
          "Сфокусируйте обучение на конкретном разрыве, который показывает направление.",
        ],
        title: "Использование текущих навыков для новой профессии",
        desc: "Как использовать текущие навыки для перехода в новую профессию на LabourMarket.ai: опираться на совпадение навыков со смежными направлениями и закрыть разрыв.",
      },
      nl: {
        slug: "hoe-gebruik-ik-mijn-huidige-vaardigheden-voor-een-nieuw-beroep",
        h1: "Hoe gebruik ik mijn huidige vaardigheden om naar een nieuw beroep te stappen?",
        short: "Koppel de vaardigheden die je al hebt aan wat een doelberoep vraagt, bouw voort op de overlap en dicht het kleine resterende gat. Beweeg op je sterktes in plaats van vanaf nul.",
        full: [
          "Van beroep veranderen betekent zelden alles weggooien wat je weet. De meeste vaardigheden — hoe je organiseert, problemen oplost, met gereedschap of mensen werkt — gaan mee. De praktische stap is vergelijken wat je hebt met wat het nieuwe beroep vraagt en voortbouwen op de overlap.",
          "Op LabourMarket.ai is dit concreet: je vaardigheden wijzen naar aangrenzende richtingen, elk toont welke van je vaardigheden je ermee verbinden en wat je nog nodig hebt. Vervolgens richt je je inspanning op het kleine resterende gat in plaats van de overstap als een volledige herstart te behandelen.",
        ],
        steps: [
          "Som in gewone woorden de vaardigheden op die je al gebruikt.",
          "Bekijk welke aangrenzende richtingen ze al openen.",
          "Richt leren op het specifieke gat dat de richting toont.",
        ],
        title: "Huidige vaardigheden gebruiken voor een nieuw beroep",
        desc: "Hoe je huidige vaardigheden gebruikt om naar een nieuw beroep te stappen op LabourMarket.ai: bouw voort op overlap met aangrenzende richtingen en dicht het gat.",
      },
      de: {
        slug: "wie-nutze-ich-meine-aktuellen-faehigkeiten-fuer-einen-neuen-beruf",
        h1: "Wie nutze ich meine aktuellen Fähigkeiten, um in einen neuen Beruf zu wechseln?",
        short: "Ordnen Sie Ihre vorhandenen Fähigkeiten dem zu, was ein Zielberuf verlangt, bauen Sie auf der Überschneidung auf und schließen Sie die kleine verbleibende Lücke. Bewegen Sie sich auf Ihren Stärken, nicht bei null.",
        full: [
          "Ein Berufswechsel bedeutet selten, alles Gewusste zu verwerfen. Die meisten Fähigkeiten — wie Sie organisieren, Probleme lösen, mit Werkzeugen oder Menschen arbeiten — tragen mit. Der praktische Schritt ist, das Vorhandene mit dem zu vergleichen, was der neue Beruf verlangt, und auf der Überschneidung aufzubauen.",
          "Auf LabourMarket.ai ist das konkret: Ihre Fähigkeiten verweisen auf benachbarte Richtungen, jede zeigt, welche Ihrer Fähigkeiten Sie damit verbinden und was noch fehlt. Dann richten Sie Ihre Mühe auf die kleine verbleibende Lücke, statt den Wechsel als kompletten Neustart zu behandeln.",
        ],
        steps: [
          "Zählen Sie in einfachen Worten die Fähigkeiten auf, die Sie bereits nutzen.",
          "Sehen Sie, welche benachbarten Richtungen sie schon öffnen.",
          "Richten Sie Ihr Lernen auf die konkrete Lücke, die die Richtung zeigt.",
        ],
        title: "Aktuelle Fähigkeiten für einen neuen Beruf nutzen",
        desc: "Wie Sie aktuelle Fähigkeiten für einen Berufswechsel auf LabourMarket.ai nutzen: auf Fähigkeiten-Überschneidung mit benachbarten Richtungen aufbauen und die Lücke schließen.",
      },
    },
  },
  {
    id: "AE-0196",
    per: {
      en: {
        slug: "how-do-i-move-from-a-manual-role-into-an-office-role",
        h1: "How do I move from a manual role into an office role?",
        short: "Name the transferable strengths a manual job builds — reliability, planning, safety, coordination, problem-solving — and match them to office roles that value them, then close the specific skill gap.",
        full: [
          "Manual and physical work builds real, valued abilities: planning a job, working safely and precisely, coordinating with a team, solving problems on the spot, and showing up reliably. These are exactly the strengths many office roles need, so the move is a redirection, not a blank restart.",
          "The practical path is to make those strengths explicit, then look at office-based directions that build on them — coordination, scheduling, quality, supervision, customer-facing roles — and identify the concrete tools or knowledge to add. On LabourMarket.ai your skills drive that discovery, so you can see realistic office directions and the specific gap to close.",
        ],
        steps: [
          "Write down the transferable strengths your manual work built.",
          "Explore office-based directions that value those strengths.",
          "Add the specific tool or knowledge each direction still needs.",
        ],
        title: "Moving from a manual role into an office role",
        desc: "How to move from a manual role into an office role on LabourMarket.ai: turn transferable strengths into office directions and close the specific gap.",
      },
      lt: {
        slug: "kaip-pereiti-nuo-fizinio-darbo-prie-biuro-darbo",
        h1: "Kaip pereiti nuo fizinio darbo prie biuro darbo?",
        short: "Įvardykite perkeliamas stiprybes, kurias ugdo fizinis darbas — patikimumą, planavimą, saugą, koordinavimą, problemų sprendimą — ir suderinkite jas su biuro pareigomis, tada užpildykite konkretų įgūdžių trūkumą.",
        full: [
          "Fizinis darbas ugdo realius, vertinamus gebėjimus: darbo planavimą, saugų ir tikslų darbą, koordinavimą su komanda, problemų sprendimą vietoje ir patikimą atėjimą į darbą. Būtent šių stiprybių reikia daugeliui biuro pareigų, todėl perėjimas yra kryptis, o ne tuščias prasidėjimas iš naujo.",
          "Praktiškas kelias — šias stiprybes padaryti aiškias, tada pažvelgti į biuro kryptis, kurios jomis remiasi — koordinavimas, planavimas, kokybė, priežiūra, su klientais dirbančios pareigos — ir nustatyti konkrečius įrankius ar žinias, kurių reikia pridėti. LabourMarket.ai jūsų įgūdžiai lemia šį atradimą, todėl matote realias biuro kryptis ir konkretų trūkumą.",
        ],
        steps: [
          "Užrašykite perkeliamas stiprybes, kurias sukūrė fizinis darbas.",
          "Ištirkite biuro kryptis, kurios vertina tas stiprybes.",
          "Pridėkite konkretų įrankį ar žinias, kurių dar reikia krypčiai.",
        ],
        title: "Perėjimas nuo fizinio prie biuro darbo",
        desc: "Kaip pereiti nuo fizinio darbo prie biuro darbo LabourMarket.ai: perkeliamas stiprybes paversti biuro kryptimis ir užpildyti konkretų trūkumą.",
      },
      ru: {
        slug: "kak-pereyti-ot-fizicheskoy-raboty-k-ofisnoy",
        h1: "Как перейти от физической работы к офисной?",
        short: "Назовите переносимые сильные стороны, которые даёт физический труд — надёжность, планирование, безопасность, координацию, решение проблем — и сопоставьте их с офисными ролями, затем закройте конкретный разрыв.",
        full: [
          "Физический труд формирует реальные, ценные способности: планирование работы, безопасную и точную работу, координацию с командой, решение проблем на месте и надёжность. Именно этих сильных сторон требуют многие офисные роли, поэтому переход — это смена направления, а не старт с чистого листа.",
          "Практичный путь — сделать эти сильные стороны явными, затем посмотреть на офисные направления, опирающиеся на них — координация, планирование, качество, надзор, роли с клиентами — и определить конкретные инструменты или знания для добавления. На LabourMarket.ai ваши навыки ведут это открытие, поэтому вы видите реалистичные офисные направления и конкретный разрыв.",
        ],
        steps: [
          "Запишите переносимые сильные стороны, которые дал физический труд.",
          "Изучите офисные направления, ценящие эти стороны.",
          "Добавьте конкретный инструмент или знание, нужные направлению.",
        ],
        title: "Переход от физической работы к офисной",
        desc: "Как перейти от физической работы к офисной на LabourMarket.ai: превратить переносимые сильные стороны в офисные направления и закрыть конкретный разрыв.",
      },
      nl: {
        slug: "hoe-stap-ik-van-fysiek-werk-over-naar-kantoorwerk",
        h1: "Hoe stap ik van fysiek werk over naar kantoorwerk?",
        short: "Benoem de overdraagbare sterktes die fysiek werk opbouwt — betrouwbaarheid, plannen, veiligheid, coördinatie, problemen oplossen — en koppel ze aan kantoorrollen, en dicht dan het specifieke gat.",
        full: [
          "Fysiek werk bouwt echte, gewaardeerde kwaliteiten op: een klus plannen, veilig en nauwkeurig werken, afstemmen met een team, ter plekke problemen oplossen en betrouwbaar aanwezig zijn. Dit zijn precies de sterktes die veel kantoorrollen nodig hebben, dus de overstap is een omleiding, geen lege herstart.",
          "De praktische route is die sterktes expliciet maken, dan kijken naar kantoorrichtingen die erop voortbouwen — coördinatie, planning, kwaliteit, toezicht, klantgerichte rollen — en de concrete tools of kennis bepalen die je toevoegt. Op LabourMarket.ai sturen je vaardigheden die ontdekking, zodat je realistische kantoorrichtingen en het specifieke gat ziet.",
        ],
        steps: [
          "Schrijf de overdraagbare sterktes op die je fysieke werk opbouwde.",
          "Verken kantoorrichtingen die die sterktes waarderen.",
          "Voeg de specifieke tool of kennis toe die elke richting nog vraagt.",
        ],
        title: "Van fysiek werk overstappen naar kantoorwerk",
        desc: "Hoe je van fysiek werk overstapt naar kantoorwerk op LabourMarket.ai: overdraagbare sterktes omzetten in kantoorrichtingen en het specifieke gat dichten.",
      },
      de: {
        slug: "wie-wechsle-ich-von-koerperlicher-arbeit-in-eine-buerorolle",
        h1: "Wie wechsle ich von körperlicher Arbeit in eine Bürorolle?",
        short: "Benennen Sie die übertragbaren Stärken, die körperliche Arbeit aufbaut — Verlässlichkeit, Planung, Sicherheit, Koordination, Problemlösen — und ordnen Sie sie Bürorollen zu, dann schließen Sie die konkrete Lücke.",
        full: [
          "Körperliche Arbeit baut echte, geschätzte Fähigkeiten auf: einen Auftrag planen, sicher und präzise arbeiten, sich im Team abstimmen, Probleme vor Ort lösen und verlässlich da sein. Genau diese Stärken brauchen viele Bürorollen, daher ist der Wechsel eine Umlenkung, kein leerer Neustart.",
          "Der praktische Weg ist, diese Stärken deutlich zu machen, dann Büro-Richtungen anzusehen, die darauf aufbauen — Koordination, Planung, Qualität, Aufsicht, kundennahe Rollen — und die konkreten Werkzeuge oder Kenntnisse zu bestimmen, die Sie ergänzen. Auf LabourMarket.ai treiben Ihre Fähigkeiten diese Entdeckung, sodass Sie realistische Büro-Richtungen und die konkrete Lücke sehen.",
        ],
        steps: [
          "Notieren Sie die übertragbaren Stärken, die Ihre körperliche Arbeit aufbaute.",
          "Erkunden Sie Büro-Richtungen, die diese Stärken schätzen.",
          "Ergänzen Sie das konkrete Werkzeug oder Wissen, das jede Richtung noch braucht.",
        ],
        title: "Von körperlicher Arbeit in eine Bürorolle wechseln",
        desc: "Wie Sie von körperlicher Arbeit in eine Bürorolle wechseln auf LabourMarket.ai: übertragbare Stärken in Büro-Richtungen überführen und die konkrete Lücke schließen.",
      },
    },
  },
  {
    id: "AE-0239",
    ev: [SRC_EUROPASS_EQF, SRC_EUROPASS_COMPARE],
    per: {
      en: {
        slug: "how-do-i-plan-reskilling-if-i-want-to-change-countries",
        h1: "How do I plan reskilling if I want to change countries too?",
        short: "Plan the skill you want to build and, separately, understand how your qualification level compares abroad. The EU's EQF and Europass tools let you compare qualification levels across countries.",
        full: [
          "Reskilling for another country has two parts: the skill itself, and how your qualifications are read there. For the skill, plan as usual — target a real gap toward work that is in demand. For the qualification, use the European Qualifications Framework (EQF), an 8-level scale that acts as a translation tool between national systems, and Europass's tool to compare qualifications between countries.",
          "This lets you see roughly where your current or planned qualification sits relative to another country's system before you commit time or money. Recognition for regulated professions is a separate, formal step handled by the destination country, and national practice varies — so use the EU tools to orient yourself and check the destination country's official route for specifics.",
        ],
        steps: [
          "Decide the concrete skill or qualification you want to build.",
          "Use the EQF and the Europass compare tool to see how levels map across countries.",
          "For a regulated profession, check the destination country's official recognition route.",
        ],
        limitations: "The EQF helps compare levels; it does not itself grant recognition, and national rules for regulated professions differ. Check the destination country's official source.",
        title: "Planning reskilling across countries",
        desc: "How to plan reskilling when changing countries: build the skill and use the EU's EQF and Europass compare tools to see how qualification levels map across Europe.",
      },
      lt: {
        slug: "kaip-planuoti-persikvalifikavima-jei-noriu-keisti-salis",
        h1: "Kaip planuoti persikvalifikavimą, jei noriu keisti ir šalį?",
        short: "Planuokite įgūdį, kurį norite ugdyti, ir atskirai supraskite, kaip jūsų kvalifikacijos lygis atrodo užsienyje. ES EQF ir Europass įrankiai leidžia palyginti kvalifikacijų lygius tarp šalių.",
        full: [
          "Persikvalifikavimas kitai šaliai turi dvi dalis: patį įgūdį ir tai, kaip ten skaitoma jūsų kvalifikacija. Įgūdį planuokite kaip įprasta — taikykitės į realų trūkumą link paklausaus darbo. Kvalifikacijai naudokite Europos kvalifikacijų sandarą (EQF), 8 lygių skalę, veikiančią kaip vertimo įrankis tarp nacionalinių sistemų, ir Europass įrankį kvalifikacijoms tarp šalių palyginti.",
          "Tai leidžia maždaug pamatyti, kur jūsų dabartinė ar planuojama kvalifikacija yra kitos šalies sistemoje, prieš skiriant laiką ar pinigus. Reguliuojamų profesijų pripažinimas — atskiras formalus žingsnis, tvarkomas paskirties šalies, o nacionalinė praktika skiriasi — todėl ES įrankius naudokite orientacijai ir konkretybėms pasitikrinkite paskirties šalies oficialų kelią.",
        ],
        steps: [
          "Nuspręskite konkretų įgūdį ar kvalifikaciją, kurią norite ugdyti.",
          "Naudokite EQF ir Europass palyginimo įrankį, kad matytumėte, kaip lygiai atitinka tarp šalių.",
          "Reguliuojamai profesijai pasitikrinkite paskirties šalies oficialų pripažinimo kelią.",
        ],
        limitations: "EQF padeda palyginti lygius; jis pats pripažinimo nesuteikia, o reguliuojamų profesijų nacionalinės taisyklės skiriasi. Pasitikrinkite paskirties šalies oficialų šaltinį.",
        title: "Persikvalifikavimo planavimas keičiant šalį",
        desc: "Kaip planuoti persikvalifikavimą keičiant šalį: ugdyti įgūdį ir naudoti ES EQF bei Europass palyginimo įrankius, kad matytumėte kvalifikacijų lygius Europoje.",
      },
      ru: {
        slug: "kak-planirovat-pereobuchenie-esli-menyayu-stranu",
        h1: "Как планировать переобучение, если хочу сменить и страну?",
        short: "Планируйте навык, который хотите развить, и отдельно поймите, как ваш уровень квалификации выглядит за рубежом. Инструменты ЕС EQF и Europass позволяют сравнить уровни квалификаций между странами.",
        full: [
          "Переобучение для другой страны состоит из двух частей: сам навык и то, как там читается ваша квалификация. Навык планируйте как обычно — целитесь в реальный разрыв к востребованной работе. Для квалификации используйте Европейскую рамку квалификаций (EQF), 8-уровневую шкалу как инструмент перевода между национальными системами, и инструмент Europass для сравнения квалификаций между странами.",
          "Это позволяет примерно увидеть, где ваша нынешняя или планируемая квалификация находится в системе другой страны, прежде чем тратить время или деньги. Признание для регулируемых профессий — отдельный формальный шаг, которым занимается страна назначения, а национальная практика различается — поэтому используйте инструменты ЕС для ориентира и проверяйте конкретику в официальном порядке страны назначения.",
        ],
        steps: [
          "Определите конкретный навык или квалификацию для развития.",
          "Используйте EQF и инструмент сравнения Europass, чтобы увидеть соответствие уровней между странами.",
          "Для регулируемой профессии проверьте официальный порядок признания в стране назначения.",
        ],
        limitations: "EQF помогает сравнивать уровни; сам он признания не даёт, а национальные правила для регулируемых профессий различаются. Проверяйте официальный источник страны назначения.",
        title: "Планирование переобучения при смене страны",
        desc: "Как планировать переобучение при смене страны: развивать навык и использовать инструменты ЕС EQF и Europass для сравнения уровней квалификаций по Европе.",
      },
      nl: {
        slug: "hoe-plan-ik-omscholing-als-ik-ook-van-land-wil-veranderen",
        h1: "Hoe plan ik omscholing als ik ook van land wil veranderen?",
        short: "Plan de vaardigheid die je wilt opbouwen en begrijp apart hoe je kwalificatieniveau in het buitenland scoort. De EU-tools EQF en Europass laten je kwalificatieniveaus tussen landen vergelijken.",
        full: [
          "Omscholen voor een ander land heeft twee delen: de vaardigheid zelf en hoe je kwalificatie daar wordt gelezen. Plan de vaardigheid zoals gewoonlijk — mik op een echt gat richting gevraagd werk. Gebruik voor de kwalificatie het Europees Kwalificatiekader (EQF), een 8-niveauschaal die als vertaalinstrument tussen nationale systemen werkt, en de Europass-tool om kwalificaties tussen landen te vergelijken.",
          "Zo zie je ongeveer waar je huidige of geplande kwalificatie staat ten opzichte van het systeem van een ander land, voordat je tijd of geld inzet. Erkenning voor gereglementeerde beroepen is een aparte, formele stap die het bestemmingsland afhandelt, en de nationale praktijk verschilt — gebruik dus de EU-tools om je te oriënteren en controleer de specifieke route bij het bestemmingsland.",
        ],
        steps: [
          "Bepaal de concrete vaardigheid of kwalificatie die je wilt opbouwen.",
          "Gebruik het EQF en de Europass-vergelijktool om te zien hoe niveaus tussen landen aansluiten.",
          "Controleer voor een gereglementeerd beroep de officiële erkenningsroute van het bestemmingsland.",
        ],
        limitations: "Het EQF helpt niveaus vergelijken; het verleent zelf geen erkenning, en nationale regels voor gereglementeerde beroepen verschillen. Controleer de officiële bron van het bestemmingsland.",
        title: "Omscholing plannen bij verandering van land",
        desc: "Hoe je omscholing plant bij verandering van land: bouw de vaardigheid en gebruik de EU-tools EQF en Europass om kwalificatieniveaus in Europa te vergelijken.",
      },
      de: {
        slug: "wie-plane-ich-umschulung-wenn-ich-auch-das-land-wechseln-will",
        h1: "Wie plane ich eine Umschulung, wenn ich auch das Land wechseln will?",
        short: "Planen Sie die Fähigkeit, die Sie aufbauen wollen, und verstehen Sie getrennt, wie Ihr Qualifikationsniveau im Ausland eingeordnet wird. Die EU-Tools EQF und Europass lassen Qualifikationsniveaus zwischen Ländern vergleichen.",
        full: [
          "Umschulung für ein anderes Land hat zwei Teile: die Fähigkeit selbst und wie Ihre Qualifikation dort gelesen wird. Die Fähigkeit planen Sie wie üblich — zielen Sie auf eine echte Lücke zu gefragter Arbeit. Für die Qualifikation nutzen Sie den Europäischen Qualifikationsrahmen (EQF), eine 8-stufige Skala als Übersetzungsinstrument zwischen nationalen Systemen, und das Europass-Tool zum Vergleich von Qualifikationen zwischen Ländern.",
          "So sehen Sie ungefähr, wo Ihre aktuelle oder geplante Qualifikation im System eines anderen Landes steht, bevor Sie Zeit oder Geld investieren. Die Anerkennung reglementierter Berufe ist ein eigener, formeller Schritt des Ziellandes, und die nationale Praxis variiert — nutzen Sie die EU-Tools zur Orientierung und prüfen Sie die Einzelheiten beim offiziellen Weg des Ziellandes.",
        ],
        steps: [
          "Legen Sie die konkrete Fähigkeit oder Qualifikation fest, die Sie aufbauen wollen.",
          "Nutzen Sie den EQF und das Europass-Vergleichstool, um zu sehen, wie Niveaus zwischen Ländern zusammenpassen.",
          "Prüfen Sie für einen reglementierten Beruf den offiziellen Anerkennungsweg des Ziellandes.",
        ],
        limitations: "Der EQF hilft, Niveaus zu vergleichen; er gewährt selbst keine Anerkennung, und nationale Regeln für reglementierte Berufe unterscheiden sich. Prüfen Sie die offizielle Quelle des Ziellandes.",
        title: "Umschulung bei Länderwechsel planen",
        desc: "Wie Sie Umschulung bei Länderwechsel planen: die Fähigkeit aufbauen und mit den EU-Tools EQF und Europass Qualifikationsniveaus in Europa vergleichen.",
      },
    },
  },
  {
    id: "AE-0224",
    ev: [SRC_CEDEFOP_SKILLS_INTEL, SRC_EURES_SHORTAGES],
    per: {
      en: {
        slug: "how-do-i-know-which-skills-to-learn-next",
        h1: "How do I know which skills to learn next?",
        short: "Combine two things: the demand side, using official EU skills data on what is short, and your side, the gap between your current skills and the direction you want. Learn where they meet.",
        full: [
          "Choosing what to learn works best when it is grounded, not guessed. On the demand side, official EU sources — CEDEFOP's skills intelligence and EURES on shortages — show which occupations and skills are trending and short across Europe. That tells you where sustained need is, rather than a passing trend online.",
          "On your side, the useful question is the gap: what does a direction you care about need that you do not yet have? On LabourMarket.ai your skills point to adjacent directions and the specific gap for each. Learn the skill that both closes a real gap for you and sits where demand is genuine — that is where effort pays off.",
        ],
        steps: [
          "Check CEDEFOP skills intelligence and EURES for in-demand skills.",
          "Compare that with the gap your target direction shows on your profile.",
          "Pick the skill that closes a real gap and meets real demand.",
        ],
        limitations: "Demand data is a signal for a period in time, not a guarantee, and it shifts. Check the source date before committing to long learning.",
        title: "Knowing which skills to learn next",
        desc: "How to know which skills to learn next: combine official EU demand data (CEDEFOP, EURES) with the gap to your target direction, and learn where they meet.",
      },
      lt: {
        slug: "kaip-zinoti-kokiu-igudziu-mokytis-toliau",
        h1: "Kaip žinoti, kokių įgūdžių mokytis toliau?",
        short: "Sujunkite du dalykus: paklausą, naudodami oficialius ES įgūdžių duomenis apie tai, ko trūksta, ir savo pusę — trūkumą tarp dabartinių įgūdžių ir norimos krypties. Mokykitės ten, kur jie susitinka.",
        full: [
          "Ką mokytis, geriausiai pasirenkama pagrįstai, o ne spėjant. Paklausos pusėje oficialūs ES šaltiniai — CEDEFOP įgūdžių žvalgyba ir EURES apie trūkumus — rodo, kokių profesijų ir įgūdžių Europoje daugėja poreikio ir trūksta. Tai pasako, kur yra tvarus poreikis, o ne praeinanti mada internete.",
          "Jūsų pusėje naudingas klausimas — trūkumas: ko reikia jums rūpimai krypčiai, ko dar neturite? LabourMarket.ai jūsų įgūdžiai rodo gretimas kryptis ir konkretų kiekvienos trūkumą. Mokykitės įgūdžio, kuris ir užpildo realų jūsų trūkumą, ir yra ten, kur paklausa tikra — būtent ten pastangos atsiperka.",
        ],
        steps: [
          "Pasitikrinkite CEDEFOP įgūdžių žvalgybą ir EURES dėl paklausių įgūdžių.",
          "Palyginkite tai su trūkumu, kurį rodo jūsų tikslinė kryptis profilyje.",
          "Rinkitės įgūdį, kuris užpildo realų trūkumą ir atitinka realią paklausą.",
        ],
        limitations: "Paklausos duomenys — tam tikro laikotarpio signalas, ne garantija, ir jie kinta. Prieš ilgą mokymąsi pasitikrinkite šaltinio datą.",
        title: "Kaip žinoti, kokių įgūdžių mokytis toliau",
        desc: "Kaip žinoti, kokių įgūdžių mokytis toliau: sujungti oficialius ES paklausos duomenis (CEDEFOP, EURES) su trūkumu link tikslinės krypties ir mokytis, kur jie susitinka.",
      },
      ru: {
        slug: "kak-ponyat-kakie-navyki-uchit-dalshe",
        h1: "Как понять, какие навыки учить дальше?",
        short: "Сочетайте две вещи: сторону спроса, используя официальные данные ЕС о том, чего не хватает, и вашу сторону — разрыв между текущими навыками и желаемым направлением. Учитесь там, где они встречаются.",
        full: [
          "Выбор того, что учить, работает лучше, когда он обоснован, а не угадан. На стороне спроса официальные источники ЕС — навыковая аналитика CEDEFOP и EURES о дефиците — показывают, какие профессии и навыки в Европе набирают спрос и в дефиците. Это говорит, где устойчивая потребность, а не мимолётный тренд в сети.",
          "На вашей стороне полезный вопрос — разрыв: чего требует интересное вам направление, чего у вас пока нет? На LabourMarket.ai ваши навыки указывают на смежные направления и конкретный разрыв каждого. Учите навык, который и закрывает ваш реальный разрыв, и находится там, где спрос настоящий — именно там усилия окупаются.",
        ],
        steps: [
          "Проверьте навыковую аналитику CEDEFOP и EURES по востребованным навыкам.",
          "Сравните это с разрывом, который показывает ваше целевое направление.",
          "Выберите навык, закрывающий реальный разрыв и отвечающий реальному спросу.",
        ],
        limitations: "Данные о спросе — сигнал на период времени, не гарантия, и они меняются. Проверьте дату источника перед долгим обучением.",
        title: "Как понять, какие навыки учить дальше",
        desc: "Как понять, какие навыки учить дальше: сочетать официальные данные спроса ЕС (CEDEFOP, EURES) с разрывом к целевому направлению и учиться там, где они встречаются.",
      },
      nl: {
        slug: "hoe-weet-ik-welke-vaardigheden-ik-hierna-moet-leren",
        h1: "Hoe weet ik welke vaardigheden ik hierna moet leren?",
        short: "Combineer twee dingen: de vraagkant, met officiële EU-vaardighedendata over wat schaars is, en jouw kant, het gat tussen je huidige vaardigheden en de richting die je wilt. Leer waar ze samenkomen.",
        full: [
          "Kiezen wat je leert werkt het best als het gefundeerd is, niet gegokt. Aan de vraagkant tonen officiële EU-bronnen — de skills intelligence van CEDEFOP en EURES over tekorten — welke beroepen en vaardigheden in Europa in trek en schaars zijn. Dat vertelt waar blijvende behoefte is, in plaats van een voorbijgaande trend online.",
          "Aan jouw kant is de nuttige vraag het gat: wat vraagt een richting die je interesseert dat je nog niet hebt? Op LabourMarket.ai wijzen je vaardigheden naar aangrenzende richtingen en het specifieke gat per richting. Leer de vaardigheid die zowel een echt gat voor jou dicht als zit waar de vraag echt is — daar betaalt inspanning zich uit.",
        ],
        steps: [
          "Bekijk de CEDEFOP skills intelligence en EURES voor gevraagde vaardigheden.",
          "Vergelijk dat met het gat dat je doelrichting op je profiel toont.",
          "Kies de vaardigheid die een echt gat dicht en aan echte vraag voldoet.",
        ],
        limitations: "Vraagdata is een signaal voor een periode, geen garantie, en verschuift. Controleer de brondatum voordat je aan lang leren begint.",
        title: "Weten welke vaardigheden je hierna moet leren",
        desc: "Hoe je weet welke vaardigheden je hierna moet leren: combineer officiële EU-vraagdata (CEDEFOP, EURES) met het gat naar je doelrichting en leer waar ze samenkomen.",
      },
      de: {
        slug: "wie-weiss-ich-welche-faehigkeiten-ich-als-naechstes-lernen-soll",
        h1: "Wie weiß ich, welche Fähigkeiten ich als Nächstes lernen soll?",
        short: "Verbinden Sie zwei Dinge: die Nachfrageseite mit offiziellen EU-Fähigkeitsdaten dazu, was knapp ist, und Ihre Seite, die Lücke zwischen Ihren aktuellen Fähigkeiten und der gewünschten Richtung. Lernen Sie, wo sie sich treffen.",
        full: [
          "Die Wahl, was man lernt, gelingt am besten fundiert statt geraten. Auf der Nachfrageseite zeigen offizielle EU-Quellen — die Skills Intelligence von CEDEFOP und EURES zu Engpässen — welche Berufe und Fähigkeiten in Europa im Trend und knapp sind. Das zeigt, wo anhaltender Bedarf besteht, statt eines flüchtigen Online-Trends.",
          "Auf Ihrer Seite ist die nützliche Frage die Lücke: Was verlangt eine Richtung, die Sie interessiert, das Sie noch nicht haben? Auf LabourMarket.ai verweisen Ihre Fähigkeiten auf benachbarte Richtungen und die konkrete Lücke je Richtung. Lernen Sie die Fähigkeit, die sowohl eine echte Lücke für Sie schließt als auch dort liegt, wo die Nachfrage echt ist — dort zahlt sich Mühe aus.",
        ],
        steps: [
          "Prüfen Sie die CEDEFOP Skills Intelligence und EURES auf gefragte Fähigkeiten.",
          "Vergleichen Sie das mit der Lücke, die Ihre Zielrichtung im Profil zeigt.",
          "Wählen Sie die Fähigkeit, die eine echte Lücke schließt und echter Nachfrage entspricht.",
        ],
        limitations: "Nachfragedaten sind ein Signal für einen Zeitraum, keine Garantie, und verschieben sich. Prüfen Sie das Quellendatum vor langem Lernen.",
        title: "Wissen, welche Fähigkeiten als Nächstes lernen",
        desc: "Wie Sie wissen, welche Fähigkeiten als Nächstes lernen: offizielle EU-Nachfragedaten (CEDEFOP, EURES) mit der Lücke zur Zielrichtung verbinden und dort lernen, wo sie sich treffen.",
      },
    },
  },
  {
    id: "AE-0363",
    per: {
      en: {
        slug: "how-do-i-describe-the-role-or-work-type-i-need",
        h1: "How do I describe the role or work type I need?",
        short: "Describe the work itself — the tasks, the skills required and the context — rather than only a job title. Clear tasks and required skills produce far more accurate matches than a label alone.",
        full: [
          "A job title means different things to different people, so leading with it alone weakens matching. Describe what the work actually involves: the main tasks, the skills genuinely needed, and the context — for example the setting, tools, or pace. That gives the platform concrete signals to match against.",
          "On LabourMarket.ai a clearer description of the work matches you with people whose real skills fit, with an honest explanation of why. Distinguish must-have skills from nice-to-have, so you do not filter out capable people over a non-essential requirement.",
        ],
        steps: [
          "Describe the main tasks the work involves.",
          "List the skills genuinely required, separating must-have from nice-to-have.",
          "Add context like setting, tools or pace where it matters.",
        ],
        title: "Describing the role or work type you need",
        desc: "How to describe the role or work type you need on LabourMarket.ai: lead with tasks and required skills, not just a title, for accurate matches.",
      },
      lt: {
        slug: "kaip-apibudinti-reikalinga-pareigybe-ar-darbo-tipa",
        h1: "Kaip apibūdinti reikalingą pareigybę ar darbo tipą?",
        short: "Apibūdinkite patį darbą — užduotis, reikalingus įgūdžius ir kontekstą — o ne vien pareigų pavadinimą. Aiškios užduotys ir reikalingi įgūdžiai duoda kur kas tikslesnes atitiktis nei vien etiketė.",
        full: [
          "Pareigų pavadinimas skirtingiems žmonėms reiškia skirtingus dalykus, todėl vien juo remtis silpnina atitiktį. Apibūdinkite, ką darbas realiai apima: pagrindines užduotis, tikrai reikalingus įgūdžius ir kontekstą — pavyzdžiui, aplinką, įrankius ar tempą. Tai duoda platformai konkrečius signalus atitikčiai.",
          "LabourMarket.ai aiškesnis darbo apibūdinimas sugretina jus su žmonėmis, kurių realūs įgūdžiai tinka, su sąžiningu paaiškinimu, kodėl. Atskirkite privalomus įgūdžius nuo pageidaujamų, kad neatsijotumėte gebančių žmonių dėl neesminio reikalavimo.",
        ],
        steps: [
          "Apibūdinkite pagrindines darbo užduotis.",
          "Išvardykite tikrai reikalingus įgūdžius, atskirdami privalomus nuo pageidaujamų.",
          "Pridėkite kontekstą — aplinką, įrankius ar tempą — kur svarbu.",
        ],
        title: "Kaip apibūdinti reikalingą pareigybę ar darbo tipą",
        desc: "Kaip apibūdinti reikalingą pareigybę ar darbo tipą LabourMarket.ai: remtis užduotimis ir reikalingais įgūdžiais, ne vien pavadinimu, kad atitiktys būtų tikslios.",
      },
      ru: {
        slug: "kak-opisat-nuzhnuyu-rol-ili-tip-raboty",
        h1: "Как описать нужную роль или тип работы?",
        short: "Опишите саму работу — задачи, требуемые навыки и контекст — а не только название должности. Чёткие задачи и требуемые навыки дают гораздо более точные соответствия, чем один ярлык.",
        full: [
          "Название должности означает разное для разных людей, поэтому опора только на него ослабляет подбор. Опишите, что работа реально включает: основные задачи, действительно нужные навыки и контекст — например, обстановку, инструменты или темп. Это даёт платформе конкретные сигналы для сопоставления.",
          "На LabourMarket.ai более чёткое описание работы сопоставляет вас с людьми, чьи реальные навыки подходят, с честным объяснением почему. Отделяйте обязательные навыки от желательных, чтобы не отсеять способных людей из-за несущественного требования.",
        ],
        steps: [
          "Опишите основные задачи, которые включает работа.",
          "Перечислите действительно нужные навыки, отделив обязательные от желательных.",
          "Добавьте контекст — обстановку, инструменты или темп — где это важно.",
        ],
        title: "Как описать нужную роль или тип работы",
        desc: "Как описать нужную роль или тип работы на LabourMarket.ai: опираться на задачи и требуемые навыки, а не только на название, ради точных соответствий.",
      },
      nl: {
        slug: "hoe-beschrijf-ik-de-rol-of-het-soort-werk-dat-ik-nodig-heb",
        h1: "Hoe beschrijf ik de rol of het soort werk dat ik nodig heb?",
        short: "Beschrijf het werk zelf — de taken, de vereiste vaardigheden en de context — in plaats van alleen een functietitel. Duidelijke taken en vereiste vaardigheden geven veel accuratere matches dan een label alleen.",
        full: [
          "Een functietitel betekent voor iedereen iets anders, dus alleen daarmee beginnen verzwakt de matching. Beschrijf wat het werk echt inhoudt: de hoofdtaken, de vaardigheden die echt nodig zijn, en de context — bijvoorbeeld de omgeving, tools of het tempo. Dat geeft het platform concrete signalen om op te matchen.",
          "Op LabourMarket.ai matcht een duidelijkere beschrijving je met mensen van wie de echte vaardigheden passen, met een eerlijke uitleg waarom. Onderscheid must-have vaardigheden van nice-to-have, zodat je capabele mensen niet uitfiltert om een niet-essentiële eis.",
        ],
        steps: [
          "Beschrijf de hoofdtaken die het werk inhoudt.",
          "Som de echt vereiste vaardigheden op, must-have gescheiden van nice-to-have.",
          "Voeg context toe zoals omgeving, tools of tempo waar het telt.",
        ],
        title: "De rol of het soort werk dat je nodig hebt beschrijven",
        desc: "Hoe je de rol of het soort werk dat je nodig hebt beschrijft op LabourMarket.ai: begin met taken en vereiste vaardigheden, niet alleen een titel, voor accurate matches.",
      },
      de: {
        slug: "wie-beschreibe-ich-die-rolle-oder-arbeitsart-die-ich-brauche",
        h1: "Wie beschreibe ich die Rolle oder Arbeitsart, die ich brauche?",
        short: "Beschreiben Sie die Arbeit selbst — die Aufgaben, die nötigen Fähigkeiten und den Kontext — statt nur eine Stellenbezeichnung. Klare Aufgaben und nötige Fähigkeiten ergeben weit genauere Abgleiche als ein Etikett allein.",
        full: [
          "Eine Stellenbezeichnung bedeutet für verschiedene Menschen Verschiedenes, daher schwächt es den Abgleich, nur damit zu beginnen. Beschreiben Sie, was die Arbeit wirklich umfasst: die Hauptaufgaben, die wirklich nötigen Fähigkeiten und den Kontext — etwa Umfeld, Werkzeuge oder Tempo. Das gibt der Plattform konkrete Signale zum Abgleich.",
          "Auf LabourMarket.ai gleicht eine klarere Beschreibung Sie mit Menschen ab, deren echte Fähigkeiten passen, mit einer ehrlichen Begründung. Trennen Sie Muss-Fähigkeiten von Kann-Fähigkeiten, damit Sie fähige Menschen nicht wegen einer unwesentlichen Anforderung herausfiltern.",
        ],
        steps: [
          "Beschreiben Sie die Hauptaufgaben der Arbeit.",
          "Listen Sie die wirklich nötigen Fähigkeiten, Muss von Kann getrennt.",
          "Fügen Sie Kontext wie Umfeld, Werkzeuge oder Tempo hinzu, wo es zählt.",
        ],
        title: "Die benötigte Rolle oder Arbeitsart beschreiben",
        desc: "Wie Sie die benötigte Rolle oder Arbeitsart auf LabourMarket.ai beschreiben: mit Aufgaben und nötigen Fähigkeiten beginnen, nicht nur einem Titel, für genaue Abgleiche.",
      },
    },
  },
  {
    id: "AE-0370",
    per: {
      en: {
        slug: "what-happens-after-i-submit-a-work-need",
        h1: "What happens after I submit a work need?",
        short: "Your need enters matching and the platform surfaces people whose skills fit, each with an honest explanation. You review them and decide who to reach out to — there is no single overall score for a person.",
        full: [
          "Submitting a work need is not the same as broadcasting a vacancy and waiting. Once submitted, the platform matches your requirements against people whose real skills and availability fit, and presents them to you with a clear reason for each match rather than a black-box ranking.",
          "You stay in control of what happens next: you review the matches, look at the evidence behind their skills, and decide who to contact. The need remains yours and private to your side, and you can refine it if the matches suggest the description needs adjusting.",
        ],
        steps: [
          "The platform matches your need against fitting people.",
          "You review each match with its honest explanation and evidence.",
          "You decide who to reach out to, and can refine the need.",
        ],
        limitations: "Matching depends on who is present and open on the platform; a submitted need does not guarantee a suitable match will exist immediately.",
        title: "What happens after you submit a work need",
        desc: "What happens after you submit a work need on LabourMarket.ai: it enters matching, fitting people are surfaced with honest explanations, and you decide who to contact.",
      },
      lt: {
        slug: "kas-vyksta-pateikus-darbo-poreiki",
        h1: "Kas vyksta pateikus darbo poreikį?",
        short: "Jūsų poreikis patenka į atitiktį, ir platforma parodo žmones, kurių įgūdžiai tinka, kiekvieną su sąžiningu paaiškinimu. Juos peržiūrite ir sprendžiate, su kuo susisiekti — nėra vieno bendro žmogaus balo.",
        full: [
          "Pateikti darbo poreikį — ne tas pat kaip paskelbti laisvą vietą ir laukti. Pateiktą poreikį platforma sugretina su žmonėmis, kurių realūs įgūdžiai ir prieinamumas tinka, ir pateikia juos su aiškia kiekvienos atitikties priežastimi, o ne su juodos dėžės reitingu.",
          "Ką daryti toliau, valdote jūs: peržiūrite atitiktis, žiūrite įrodymus už jų įgūdžių ir sprendžiate, su kuo susisiekti. Poreikis lieka jūsų ir privatus jūsų pusėje, o jį galite tikslinti, jei atitiktys rodo, kad aprašymą reikia koreguoti.",
        ],
        steps: [
          "Platforma sugretina jūsų poreikį su tinkančiais žmonėmis.",
          "Peržiūrite kiekvieną atitiktį su jos sąžiningu paaiškinimu ir įrodymu.",
          "Sprendžiate, su kuo susisiekti, ir galite tikslinti poreikį.",
        ],
        limitations: "Atitiktis priklauso nuo to, kas yra platformoje ir atviras; pateiktas poreikis negarantuoja, kad tinkama atitiktis iškart egzistuos.",
        title: "Kas vyksta pateikus darbo poreikį",
        desc: "Kas vyksta pateikus darbo poreikį LabourMarket.ai: jis patenka į atitiktį, parodomi tinkantys žmonės su sąžiningais paaiškinimais, o jūs sprendžiate, su kuo susisiekti.",
      },
      ru: {
        slug: "chto-proiskhodit-posle-podachi-potrebnosti-v-rabotnikakh",
        h1: "Что происходит после подачи потребности в работниках?",
        short: "Ваша потребность попадает в подбор, и платформа показывает людей, чьи навыки подходят, каждого с честным объяснением. Вы их просматриваете и решаете, к кому обратиться — единого общего балла человека нет.",
        full: [
          "Подать потребность в работниках — не то же, что разместить вакансию и ждать. После подачи платформа сопоставляет ваши требования с людьми, чьи реальные навыки и доступность подходят, и показывает их с ясной причиной каждого соответствия, а не с рейтингом-чёрным-ящиком.",
          "Что будет дальше, контролируете вы: просматриваете соответствия, смотрите доказательства за их навыками и решаете, к кому обратиться. Потребность остаётся вашей и приватной на вашей стороне, и её можно уточнить, если соответствия показывают, что описание нужно поправить.",
        ],
        steps: [
          "Платформа сопоставляет вашу потребность с подходящими людьми.",
          "Вы просматриваете каждое соответствие с честным объяснением и доказательством.",
          "Вы решаете, к кому обратиться, и можете уточнить потребность.",
        ],
        limitations: "Подбор зависит от того, кто присутствует и открыт на платформе; поданная потребность не гарантирует, что подходящее соответствие появится сразу.",
        title: "Что происходит после подачи потребности в работниках",
        desc: "Что происходит после подачи потребности на LabourMarket.ai: она попадает в подбор, показываются подходящие люди с честными объяснениями, и вы решаете, к кому обратиться.",
      },
      nl: {
        slug: "wat-gebeurt-er-nadat-ik-een-personeelsbehoefte-indien",
        h1: "Wat gebeurt er nadat ik een personeelsbehoefte indien?",
        short: "Je behoefte gaat naar matching en het platform toont mensen van wie de vaardigheden passen, elk met een eerlijke uitleg. Jij beoordeelt ze en beslist wie je benadert — er is geen totaalscore voor een persoon.",
        full: [
          "Een personeelsbehoefte indienen is niet hetzelfde als een vacature rondsturen en wachten. Na indiening matcht het platform je eisen met mensen van wie de echte vaardigheden en beschikbaarheid passen, en toont ze met een duidelijke reden per match in plaats van een black-box-rangschikking.",
          "Jij houdt de controle over wat volgt: je beoordeelt de matches, bekijkt het bewijs achter hun vaardigheden en beslist wie je benadert. De behoefte blijft van jou en privé aan jouw kant, en je kunt die verfijnen als de matches suggereren dat de beschrijving aanpassing nodig heeft.",
        ],
        steps: [
          "Het platform matcht je behoefte met passende mensen.",
          "Je beoordeelt elke match met de eerlijke uitleg en het bewijs.",
          "Je beslist wie je benadert en kunt de behoefte verfijnen.",
        ],
        limitations: "Matching hangt af van wie aanwezig en beschikbaar is op het platform; een ingediende behoefte garandeert niet dat er meteen een passende match bestaat.",
        title: "Wat gebeurt er nadat je een personeelsbehoefte indient",
        desc: "Wat er gebeurt nadat je een personeelsbehoefte indient op LabourMarket.ai: die gaat naar matching, passende mensen verschijnen met eerlijke uitleg, en jij beslist wie je benadert.",
      },
      de: {
        slug: "was-passiert-nachdem-ich-einen-personalbedarf-einreiche",
        h1: "Was passiert, nachdem ich einen Personalbedarf einreiche?",
        short: "Ihr Bedarf geht in den Abgleich, und die Plattform zeigt Menschen, deren Fähigkeiten passen, jeweils mit einer ehrlichen Begründung. Sie prüfen sie und entscheiden, wen Sie ansprechen — es gibt keinen Gesamtwert für eine Person.",
        full: [
          "Einen Personalbedarf einzureichen ist nicht dasselbe wie eine Stelle auszuschreiben und zu warten. Nach dem Einreichen gleicht die Plattform Ihre Anforderungen mit Menschen ab, deren echte Fähigkeiten und Verfügbarkeit passen, und zeigt sie mit einer klaren Begründung je Abgleich statt einer Blackbox-Rangfolge.",
          "Was als Nächstes geschieht, steuern Sie: Sie prüfen die Abgleiche, sehen die Belege hinter ihren Fähigkeiten und entscheiden, wen Sie ansprechen. Der Bedarf bleibt Ihrer und auf Ihrer Seite privat, und Sie können ihn verfeinern, wenn die Abgleiche zeigen, dass die Beschreibung anzupassen ist.",
        ],
        steps: [
          "Die Plattform gleicht Ihren Bedarf mit passenden Menschen ab.",
          "Sie prüfen jeden Abgleich mit ehrlicher Begründung und Beleg.",
          "Sie entscheiden, wen Sie ansprechen, und können den Bedarf verfeinern.",
        ],
        limitations: "Der Abgleich hängt davon ab, wer auf der Plattform präsent und offen ist; ein eingereichter Bedarf garantiert nicht, dass sofort ein passender Abgleich existiert.",
        title: "Was passiert, nachdem Sie einen Personalbedarf einreichen",
        desc: "Was passiert, nachdem Sie einen Personalbedarf auf LabourMarket.ai einreichen: Er geht in den Abgleich, passende Menschen erscheinen mit ehrlicher Begründung, und Sie entscheiden.",
      },
    },
  },
  {
    id: "AE-0434",
    per: {
      en: {
        slug: "how-do-i-find-first-work-opportunities-as-a-student",
        h1: "How do I find first work opportunities as a student?",
        short: "Show potential over titles: put your real skills from studies, projects and any work on your profile, and look for opportunities open to new entrants. Evidence of what you can do beats a thin CV.",
        full: [
          "Without a long work history, the strongest thing you can show is capability. Skills from coursework, projects, part-time jobs, volunteering or personal work are real and count. Naming them clearly, and backing them where you can, gives an employer something concrete instead of an empty CV.",
          "On LabourMarket.ai your profile is built around skills and evidence rather than years of experience, so a new entrant can present potential fairly. Look for opportunities suited to first roles and be honest about your level — a clear, honest starting profile is more convincing than an inflated one.",
        ],
        steps: [
          "Add skills from studies, projects, part-time work and volunteering.",
          "Back the key ones with examples or evidence.",
          "Look for opportunities open to new entrants and express interest.",
        ],
        title: "Finding first work opportunities as a student",
        desc: "How to find first work opportunities as a student on LabourMarket.ai: show real skills from studies and projects as evidence, and target roles open to new entrants.",
      },
      lt: {
        slug: "kaip-rasti-pirmasias-darbo-galimybes-studentui",
        h1: "Kaip rasti pirmąsias darbo galimybes studentui?",
        short: "Parodykite potencialą, o ne pavadinimus: profilyje nurodykite realius įgūdžius iš studijų, projektų ir bet kokio darbo, ir ieškokite galimybių, atvirų pradedantiesiems. Įrodymas, ką mokate, nusveria ploną CV.",
        full: [
          "Neturint ilgos darbo istorijos, stipriausia, ką galite parodyti, yra gebėjimas. Įgūdžiai iš studijų, projektų, darbo ne visą darbo dieną, savanorystės ar asmeninio darbo yra realūs ir svarbūs. Aiškiai juos įvardijus ir, kur galite, paremus, darbdaviui duodate kažką konkretaus, o ne tuščią CV.",
          "LabourMarket.ai profilis kuriamas apie įgūdžius ir įrodymus, ne apie patirties metus, todėl pradedantysis gali sąžiningai parodyti potencialą. Ieškokite pirmoms pareigoms tinkančių galimybių ir būkite sąžiningi dėl savo lygio — aiškus, sąžiningas pradinis profilis įtikina labiau nei išpūstas.",
        ],
        steps: [
          "Pridėkite įgūdžius iš studijų, projektų, darbo ne visą dieną ir savanorystės.",
          "Svarbiausius paremkite pavyzdžiais ar įrodymais.",
          "Ieškokite pradedantiesiems atvirų galimybių ir išreikškite susidomėjimą.",
        ],
        title: "Pirmosios darbo galimybės studentui",
        desc: "Kaip rasti pirmąsias darbo galimybes studentui LabourMarket.ai: parodyti realius įgūdžius iš studijų ir projektų kaip įrodymą ir taikytis į pradedantiesiems atviras pareigas.",
      },
      ru: {
        slug: "kak-nayti-pervye-vozmozhnosti-raboty-studentu",
        h1: "Как найти первые возможности работы студенту?",
        short: "Покажите потенциал, а не должности: укажите в профиле реальные навыки из учёбы, проектов и любой работы и ищите возможности, открытые для начинающих. Доказательство того, что вы умеете, весомее тонкого резюме.",
        full: [
          "Без длинной истории работы самое сильное, что можно показать, — способность. Навыки из учёбы, проектов, подработок, волонтёрства или личной работы реальны и учитываются. Чётко их назвав и, где можно, подкрепив, вы даёте работодателю что-то конкретное вместо пустого резюме.",
          "На LabourMarket.ai профиль строится вокруг навыков и доказательств, а не лет опыта, поэтому начинающий может честно показать потенциал. Ищите возможности, подходящие для первых ролей, и будьте честны о своём уровне — ясный, честный стартовый профиль убеждает больше раздутого.",
        ],
        steps: [
          "Добавьте навыки из учёбы, проектов, подработок и волонтёрства.",
          "Ключевые подкрепите примерами или доказательствами.",
          "Ищите возможности, открытые для начинающих, и проявляйте интерес.",
        ],
        title: "Первые возможности работы студенту",
        desc: "Как найти первые возможности работы студенту на LabourMarket.ai: показать реальные навыки из учёбы и проектов как доказательство и целиться в роли для начинающих.",
      },
      nl: {
        slug: "hoe-vind-ik-eerste-werkkansen-als-student",
        h1: "Hoe vind ik eerste werkkansen als student?",
        short: "Toon potentieel boven titels: zet je echte vaardigheden uit studie, projecten en eventueel werk op je profiel en zoek kansen die openstaan voor starters. Bewijs van wat je kunt verslaat een dun cv.",
        full: [
          "Zonder lang arbeidsverleden is het sterkste wat je kunt tonen je kunde. Vaardigheden uit studievakken, projecten, bijbanen, vrijwilligerswerk of eigen werk zijn echt en tellen. Ze helder benoemen, en waar mogelijk onderbouwen, geeft een werkgever iets concreets in plaats van een leeg cv.",
          "Op LabourMarket.ai is je profiel opgebouwd rond vaardigheden en bewijs in plaats van jaren ervaring, zodat een starter potentieel eerlijk kan tonen. Zoek kansen die passen bij eerste rollen en wees eerlijk over je niveau — een helder, eerlijk startprofiel overtuigt meer dan een opgeblazen.",
        ],
        steps: [
          "Voeg vaardigheden toe uit studie, projecten, bijbanen en vrijwilligerswerk.",
          "Onderbouw de belangrijkste met voorbeelden of bewijs.",
          "Zoek kansen die openstaan voor starters en toon interesse.",
        ],
        title: "Eerste werkkansen vinden als student",
        desc: "Hoe je eerste werkkansen vindt als student op LabourMarket.ai: toon echte vaardigheden uit studie en projecten als bewijs en mik op rollen voor starters.",
      },
      de: {
        slug: "wie-finde-ich-erste-arbeitsmoeglichkeiten-als-studierender",
        h1: "Wie finde ich erste Arbeitsmöglichkeiten als Studierender?",
        short: "Zeigen Sie Potenzial statt Titel: tragen Sie Ihre echten Fähigkeiten aus Studium, Projekten und etwaiger Arbeit ins Profil und suchen Sie Möglichkeiten für Berufseinsteiger. Belege für Ihr Können schlagen einen dünnen Lebenslauf.",
        full: [
          "Ohne langen Werdegang ist das Stärkste, das Sie zeigen können, Ihr Können. Fähigkeiten aus Lehrveranstaltungen, Projekten, Nebenjobs, Ehrenamt oder eigener Arbeit sind echt und zählen. Sie klar zu benennen und, wo möglich, zu stützen, gibt einem Arbeitgeber etwas Konkretes statt eines leeren Lebenslaufs.",
          "Auf LabourMarket.ai ist Ihr Profil um Fähigkeiten und Belege statt um Jahre Erfahrung aufgebaut, sodass ein Einsteiger Potenzial fair zeigen kann. Suchen Sie Möglichkeiten für erste Rollen und seien Sie ehrlich zu Ihrem Niveau — ein klares, ehrliches Startprofil überzeugt mehr als ein aufgeblähtes.",
        ],
        steps: [
          "Fügen Sie Fähigkeiten aus Studium, Projekten, Nebenjobs und Ehrenamt hinzu.",
          "Stützen Sie die wichtigsten mit Beispielen oder Belegen.",
          "Suchen Sie Möglichkeiten für Einsteiger und zeigen Sie Interesse.",
        ],
        title: "Erste Arbeitsmöglichkeiten als Studierender finden",
        desc: "Wie Sie als Studierender erste Arbeitsmöglichkeiten auf LabourMarket.ai finden: echte Fähigkeiten aus Studium und Projekten als Beleg zeigen und Einsteiger-Rollen anvisieren.",
      },
    },
  },
  {
    id: "AE-0413",
    per: {
      en: {
        slug: "how-do-i-represent-a-real-work-team-or-brigade",
        h1: "How do I represent a real work team or brigade?",
        short: "Present the team as a unit: the type of work it does together, its combined skills, size and availability. A crew that works as one can be shown as one, not just as separate individuals.",
        full: [
          "Some work is done by an established team — a crew, brigade or small unit that already works well together. Splitting them into unrelated individual profiles loses what makes them valuable: their coordination and combined capability. LabourMarket.ai lets a company represent that team as a unit.",
          "Describe the work the team does, the mix of skills it brings, its size and when it is available. Each member's own skills still belong to them and stay under their control, but the team can be presented and matched as the working unit it really is, which fits how a lot of real work is organised.",
        ],
        steps: [
          "Create the team in your company space and describe the work it does.",
          "Capture the combined skills, size and availability.",
          "Keep each member's individual skills under their own control.",
        ],
        title: "Representing a real work team or brigade",
        desc: "How to represent a real work team or brigade on LabourMarket.ai: present the crew as a unit with its combined skills, size and availability, not just individuals.",
      },
      lt: {
        slug: "kaip-atstovauti-realiai-darbo-komandai-ar-brigadai",
        h1: "Kaip atstovauti realiai darbo komandai ar brigadai?",
        short: "Pristatykite komandą kaip vienetą: kokį darbą ji dirba kartu, jos bendrus įgūdžius, dydį ir prieinamumą. Kaip vienas dirbanti brigada gali būti parodyta kaip vienetas, ne tik atskiri žmonės.",
        full: [
          "Dalis darbo atliekama nusistovėjusios komandos — brigados ar mažo vieneto, kuris jau gerai dirba kartu. Suskaidžius juos į nesusijusius individualius profilius, prarandama tai, kas juos daro vertingus: koordinacija ir bendras gebėjimas. LabourMarket.ai leidžia įmonei atstovauti tokiai komandai kaip vienetui.",
          "Apibūdinkite, kokį darbą komanda dirba, kokį įgūdžių derinį atsineša, jos dydį ir kada ji laisva. Kiekvieno nario įgūdžiai vis tiek priklauso jam ir lieka jo valdomi, bet komanda gali būti pristatyta ir sugretinta kaip realus darbinis vienetas — tai atitinka, kaip organizuojama daug realaus darbo.",
        ],
        steps: [
          "Sukurkite komandą įmonės erdvėje ir apibūdinkite jos darbą.",
          "Užfiksuokite bendrus įgūdžius, dydį ir prieinamumą.",
          "Kiekvieno nario individualius įgūdžius palikite jo paties valdomus.",
        ],
        title: "Atstovavimas realiai darbo komandai ar brigadai",
        desc: "Kaip atstovauti realiai darbo komandai ar brigadai LabourMarket.ai: pristatyti brigadą kaip vienetą su bendrais įgūdžiais, dydžiu ir prieinamumu, ne tik žmones.",
      },
      ru: {
        slug: "kak-predstavit-realnuyu-rabochuyu-komandu-ili-brigadu",
        h1: "Как представить реальную рабочую команду или бригаду?",
        short: "Представьте команду как единицу: какой работой она занимается вместе, её совокупные навыки, размер и доступность. Слаженная бригада может быть показана как одно целое, а не только отдельные люди.",
        full: [
          "Часть работы выполняет устоявшаяся команда — бригада или небольшая единица, которая уже хорошо работает вместе. Разбив их на несвязанные индивидуальные профили, теряешь то, что делает их ценными: координацию и совокупную способность. LabourMarket.ai позволяет компании представить такую команду как единицу.",
          "Опишите, какую работу команда делает, какой набор навыков приносит, её размер и когда она доступна. Навыки каждого участника по-прежнему принадлежат ему и остаются под его контролем, но команду можно представить и сопоставить как реальную рабочую единицу — это отвечает тому, как организована большая часть реальной работы.",
        ],
        steps: [
          "Создайте команду в пространстве компании и опишите её работу.",
          "Зафиксируйте совокупные навыки, размер и доступность.",
          "Индивидуальные навыки каждого оставьте под его контролем.",
        ],
        title: "Как представить реальную рабочую команду или бригаду",
        desc: "Как представить реальную рабочую команду или бригаду на LabourMarket.ai: показать бригаду как единицу с совокупными навыками, размером и доступностью, а не только людей.",
      },
      nl: {
        slug: "hoe-vertegenwoordig-ik-een-echt-werkteam-of-ploeg",
        h1: "Hoe vertegenwoordig ik een echt werkteam of ploeg?",
        short: "Presenteer het team als eenheid: het soort werk dat het samen doet, de gecombineerde vaardigheden, omvang en beschikbaarheid. Een ploeg die als één werkt kan als één worden getoond, niet alleen als losse individuen.",
        full: [
          "Sommig werk wordt gedaan door een ingespeeld team — een ploeg of kleine eenheid die al goed samenwerkt. Ze opsplitsen in losse individuele profielen verliest wat ze waardevol maakt: hun coördinatie en gecombineerde kunde. Op LabourMarket.ai kan een bedrijf dat team als eenheid vertegenwoordigen.",
          "Beschrijf het werk dat het team doet, de mix van vaardigheden die het meebrengt, de omvang en wanneer het beschikbaar is. De eigen vaardigheden van elk lid blijven van hen en onder hun controle, maar het team kan worden gepresenteerd en gematcht als de werkeenheid die het echt is — dat past bij hoe veel echt werk is georganiseerd.",
        ],
        steps: [
          "Maak het team in je bedrijfsruimte en beschrijf het werk dat het doet.",
          "Leg de gecombineerde vaardigheden, omvang en beschikbaarheid vast.",
          "Houd de individuele vaardigheden van elk lid onder hun eigen controle.",
        ],
        title: "Een echt werkteam of ploeg vertegenwoordigen",
        desc: "Hoe je een echt werkteam of ploeg vertegenwoordigt op LabourMarket.ai: presenteer de ploeg als eenheid met gecombineerde vaardigheden, omvang en beschikbaarheid.",
      },
      de: {
        slug: "wie-vertrete-ich-ein-echtes-arbeitsteam-oder-eine-kolonne",
        h1: "Wie vertrete ich ein echtes Arbeitsteam oder eine Kolonne?",
        short: "Präsentieren Sie das Team als Einheit: die Art der gemeinsamen Arbeit, seine kombinierten Fähigkeiten, Größe und Verfügbarkeit. Eine Kolonne, die als eine arbeitet, lässt sich als eine zeigen, nicht nur als einzelne Personen.",
        full: [
          "Manche Arbeit erledigt ein eingespieltes Team — eine Kolonne oder kleine Einheit, die schon gut zusammenarbeitet. Sie in unverbundene Einzelprofile aufzuteilen verliert, was sie wertvoll macht: ihre Koordination und kombinierte Fähigkeit. Auf LabourMarket.ai kann ein Unternehmen dieses Team als Einheit vertreten.",
          "Beschreiben Sie die Arbeit des Teams, den Mix an Fähigkeiten, den es einbringt, seine Größe und wann es verfügbar ist. Die eigenen Fähigkeiten jedes Mitglieds gehören weiter ihm und bleiben unter seiner Kontrolle, doch das Team lässt sich als die Arbeitseinheit präsentieren und abgleichen, die es wirklich ist — das passt dazu, wie viel echte Arbeit organisiert ist.",
        ],
        steps: [
          "Erstellen Sie das Team im Unternehmensbereich und beschreiben Sie seine Arbeit.",
          "Erfassen Sie die kombinierten Fähigkeiten, Größe und Verfügbarkeit.",
          "Belassen Sie die individuellen Fähigkeiten jedes Mitglieds unter dessen Kontrolle.",
        ],
        title: "Ein echtes Arbeitsteam oder eine Kolonne vertreten",
        desc: "Wie Sie ein echtes Arbeitsteam oder eine Kolonne auf LabourMarket.ai vertreten: die Kolonne als Einheit mit kombinierten Fähigkeiten, Größe und Verfügbarkeit zeigen.",
      },
    },
  },
  {
    id: "AE-0499",
    ev: [SRC_CEDEFOP_SKILLS_INTEL, SRC_CEDEFOP_SHORTAGES],
    per: {
      en: {
        slug: "how-will-automation-affect-my-profession",
        h1: "How will automation affect my profession?",
        short: "Automation usually changes tasks within a profession more than it erases the profession outright. Official EU skills analysis tracks these shifts, so you can prepare by building the skills that stay in demand.",
        full: [
          "The honest answer is that automation tends to reshape work rather than simply delete it: some tasks are automated, new tasks appear, and the mix of skills a profession needs shifts. Official EU sources — CEDEFOP's skills intelligence and its analysis of skill shortages and change — track how demand for occupations and skills evolves across Europe, which is a firmer basis than alarming headlines.",
          "For your own profession, the practical response is not to guess a yes/no on being replaced, but to watch which tasks are changing and build the skills that remain valuable. On LabourMarket.ai you can see adjacent directions your skills already support, so you can adapt gradually rather than reacting late.",
        ],
        steps: [
          "Read CEDEFOP's skills intelligence for how demand in your field is shifting.",
          "Identify which of your tasks are stable and which are changing.",
          "Build skills that stay in demand and explore adjacent directions.",
        ],
        limitations: "This describes general trends, not a prediction for a specific job or year. Effects vary by role and country; check the dated official analysis.",
        title: "How automation affects your profession",
        desc: "How automation affects your profession: it usually reshapes tasks more than it deletes jobs. Official EU (CEDEFOP) skills analysis helps you prepare — general trends, not a prediction.",
      },
      lt: {
        slug: "kaip-automatizacija-paveiks-mano-profesija",
        h1: "Kaip automatizacija paveiks mano profesiją?",
        short: "Automatizacija dažniausiai labiau keičia užduotis profesijoje nei visiškai panaikina pačią profesiją. Oficiali ES įgūdžių analizė seka šiuos pokyčius, todėl galite pasiruošti ugdydami įgūdžius, kurie lieka paklausūs.",
        full: [
          "Sąžiningas atsakymas — automatizacija linkusi perkurti darbą, o ne tiesiog jį ištrinti: dalis užduočių automatizuojama, atsiranda naujų, o profesijai reikalingų įgūdžių derinys keičiasi. Oficialūs ES šaltiniai — CEDEFOP įgūdžių žvalgyba ir jo įgūdžių trūkumo bei kaitos analizė — seka, kaip profesijų ir įgūdžių paklausa kinta Europoje; tai tvirtesnis pagrindas nei gąsdinančios antraštės.",
          "Savo profesijai praktiškas atsakas — ne spėti taip/ne dėl pakeitimo, o stebėti, kurios užduotys keičiasi, ir ugdyti įgūdžius, kurie lieka vertingi. LabourMarket.ai matote gretimas kryptis, kurias jūsų įgūdžiai jau palaiko, todėl galite prisitaikyti palaipsniui, o ne reaguoti pavėluotai.",
        ],
        steps: [
          "Perskaitykite CEDEFOP įgūdžių žvalgybą, kaip kinta paklausa jūsų srityje.",
          "Nustatykite, kurios jūsų užduotys stabilios, o kurios keičiasi.",
          "Ugdykite paklausius įgūdžius ir tyrinėkite gretimas kryptis.",
        ],
        limitations: "Tai aprašo bendras tendencijas, ne prognozę konkrečiam darbui ar metams. Poveikis skiriasi pagal pareigas ir šalį; pasitikrinkite datuotą oficialią analizę.",
        title: "Kaip automatizacija paveiks jūsų profesiją",
        desc: "Kaip automatizacija paveiks jūsų profesiją: dažniausiai labiau keičia užduotis nei naikina darbus. Oficiali ES (CEDEFOP) analizė padeda pasiruošti — bendros tendencijos, ne prognozė.",
      },
      ru: {
        slug: "kak-avtomatizatsiya-povliyaet-na-moyu-professiyu",
        h1: "Как автоматизация повлияет на мою профессию?",
        short: "Автоматизация обычно меняет задачи внутри профессии больше, чем полностью стирает саму профессию. Официальный анализ навыков ЕС отслеживает эти сдвиги, поэтому можно готовиться, развивая навыки, которые остаются востребованными.",
        full: [
          "Честный ответ: автоматизация склонна перестраивать работу, а не просто удалять её: часть задач автоматизируется, появляются новые, а набор навыков профессии сдвигается. Официальные источники ЕС — навыковая аналитика CEDEFOP и его анализ дефицита и изменения навыков — отслеживают, как спрос на профессии и навыки меняется в Европе; это более прочная основа, чем пугающие заголовки.",
          "Для вашей профессии практичный ответ — не гадать «да/нет» о замене, а следить, какие задачи меняются, и развивать навыки, которые остаются ценными. На LabourMarket.ai видны смежные направления, которые ваши навыки уже поддерживают, поэтому можно адаптироваться постепенно, а не реагировать поздно.",
        ],
        steps: [
          "Прочитайте навыковую аналитику CEDEFOP о сдвиге спроса в вашей области.",
          "Определите, какие ваши задачи стабильны, а какие меняются.",
          "Развивайте востребованные навыки и изучайте смежные направления.",
        ],
        limitations: "Это описывает общие тенденции, а не прогноз для конкретной работы или года. Влияние зависит от роли и страны; проверяйте датированный официальный анализ.",
        title: "Как автоматизация повлияет на вашу профессию",
        desc: "Как автоматизация повлияет на вашу профессию: обычно перестраивает задачи больше, чем удаляет работу. Официальный анализ ЕС (CEDEFOP) помогает подготовиться — общие тенденции.",
      },
      nl: {
        slug: "hoe-beinvloedt-automatisering-mijn-beroep",
        h1: "Hoe beïnvloedt automatisering mijn beroep?",
        short: "Automatisering verandert meestal taken binnen een beroep meer dan dat het het beroep helemaal wist. Officiële EU-vaardighedenanalyse volgt deze verschuivingen, zodat je je kunt voorbereiden door vaardigheden op te bouwen die gevraagd blijven.",
        full: [
          "Het eerlijke antwoord is dat automatisering werk eerder hervormt dan simpelweg wist: sommige taken worden geautomatiseerd, nieuwe taken verschijnen, en de mix van vaardigheden die een beroep nodig heeft verschuift. Officiële EU-bronnen — de skills intelligence van CEDEFOP en zijn analyse van tekorten en verandering — volgen hoe de vraag naar beroepen en vaardigheden in Europa evolueert, een steviger basis dan alarmerende koppen.",
          "Voor je eigen beroep is de praktische reactie niet een ja/nee gokken op vervanging, maar volgen welke taken veranderen en vaardigheden opbouwen die waardevol blijven. Op LabourMarket.ai zie je aangrenzende richtingen die je vaardigheden al ondersteunen, zodat je geleidelijk kunt aanpassen in plaats van laat te reageren.",
        ],
        steps: [
          "Lees de skills intelligence van CEDEFOP over hoe de vraag in je vakgebied verschuift.",
          "Bepaal welke van je taken stabiel zijn en welke veranderen.",
          "Bouw vaardigheden op die gevraagd blijven en verken aangrenzende richtingen.",
        ],
        limitations: "Dit beschrijft algemene trends, geen voorspelling voor een specifieke baan of jaar. Effecten verschillen per rol en land; controleer de gedateerde officiële analyse.",
        title: "Hoe automatisering je beroep beïnvloedt",
        desc: "Hoe automatisering je beroep beïnvloedt: het hervormt meestal taken meer dan het banen wist. Officiële EU-analyse (CEDEFOP) helpt je voorbereiden — algemene trends.",
      },
      de: {
        slug: "wie-wirkt-sich-automatisierung-auf-meinen-beruf-aus",
        h1: "Wie wirkt sich Automatisierung auf meinen Beruf aus?",
        short: "Automatisierung verändert meist Aufgaben innerhalb eines Berufs stärker, als sie den Beruf ganz beseitigt. Offizielle EU-Fähigkeitsanalysen verfolgen diese Verschiebungen, sodass Sie sich vorbereiten können, indem Sie gefragt bleibende Fähigkeiten aufbauen.",
        full: [
          "Die ehrliche Antwort: Automatisierung neigt dazu, Arbeit umzugestalten statt sie einfach zu löschen: einige Aufgaben werden automatisiert, neue entstehen, und der Fähigkeiten-Mix eines Berufs verschiebt sich. Offizielle EU-Quellen — die Skills Intelligence von CEDEFOP und seine Analyse von Engpässen und Wandel — verfolgen, wie sich die Nachfrage nach Berufen und Fähigkeiten in Europa entwickelt; eine festere Grundlage als alarmierende Schlagzeilen.",
          "Für Ihren Beruf ist die praktische Antwort nicht, ein Ja/Nein zur Ersetzung zu raten, sondern zu beobachten, welche Aufgaben sich ändern, und Fähigkeiten aufzubauen, die wertvoll bleiben. Auf LabourMarket.ai sehen Sie benachbarte Richtungen, die Ihre Fähigkeiten bereits stützen, sodass Sie sich schrittweise anpassen statt spät zu reagieren.",
        ],
        steps: [
          "Lesen Sie die CEDEFOP Skills Intelligence dazu, wie sich die Nachfrage in Ihrem Feld verschiebt.",
          "Ermitteln Sie, welche Ihrer Aufgaben stabil sind und welche sich ändern.",
          "Bauen Sie gefragt bleibende Fähigkeiten auf und erkunden Sie benachbarte Richtungen.",
        ],
        limitations: "Dies beschreibt allgemeine Trends, keine Vorhersage für einen bestimmten Job oder ein Jahr. Effekte variieren je Rolle und Land; prüfen Sie die datierte offizielle Analyse.",
        title: "Wie sich Automatisierung auf Ihren Beruf auswirkt",
        desc: "Wie sich Automatisierung auf Ihren Beruf auswirkt: sie gestaltet meist Aufgaben um, statt Jobs zu löschen. Offizielle EU-Analyse (CEDEFOP) hilft bei der Vorbereitung — allgemeine Trends.",
      },
    },
  },
];

const LOCALES: Loc[] = ["lt", "en", "ru", "nl", "de"];

export const WAVE2D_ANSWERS: readonly LocalizedAnswer[] = DRAFTS.flatMap((d) =>
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
