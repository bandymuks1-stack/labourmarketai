/**
 * Answer Engine — localized answer content layer (versioned).
 *
 * Wave 1 PILOT: 6 low-risk questions across 6 categories, fully written in the 5
 * active locales (lt, en, ru, nl, de) = 30 localized answer pages (<= 50 limit).
 * No legal/visa/tax/salary or other HIGH-risk content. Every answer is a
 * complete, reviewed answer (never a machine-raw draft, never an English
 * fallback under another locale). Kept outside messages/*.json (no i18n-debt).
 */
import type { LocalizedAnswer } from "@/lib/answer-engine/publishing";
import type { ActiveLocale } from "@/lib/i18n/config";

type Loc = ActiveLocale;
type Body = {
  slug: string;
  h1: string;
  short: string;
  full: string[];
  steps?: string[];
  title: string;
  desc: string;
};
interface Draft {
  id: string;
  per: Record<Loc, Body>;
}

const EDITORIAL = "LabourMarket.ai editorial";
const REVIEWED = "2026-07-18";

const DRAFTS: readonly Draft[] = [
  {
    id: "AE-0001",
    per: {
      en: {
        slug: "how-to-start-looking-for-work",
        h1: "How do I start looking for work on LabourMarket.ai?",
        short: "Create a free work profile, set the countries and type of work you are open to, and opportunities that fit your skills appear on your board — you decide when to express interest.",
        full: [
          "Start by building a work profile: add your profession, your real skills, your languages and when you can start. You can import an existing CV and review every suggestion — nothing is added that you did not confirm.",
          "Once your profile reflects your skills, LabourMarket.ai shows work opportunities that fit, with an honest explanation of why. There is no guaranteed job and no ranking of you against other people — you stay in control and express interest only in what suits you.",
        ],
        steps: [
          "Create a free profile and add your profession and skills.",
          "Set your available-from date, languages and preferred countries.",
          "Open your opportunity board and express interest in a role that fits.",
        ],
        title: "Start looking for work on LabourMarket.ai",
        desc: "How to begin your job search on LabourMarket.ai: build a profile, set your preferences, and see opportunities that fit your skills.",
      },
      lt: {
        slug: "kaip-pradeti-ieskoti-darbo",
        h1: "Kaip pradėti ieškoti darbo LabourMarket.ai?",
        short: "Susikurkite nemokamą darbo profilį, nurodykite šalis ir darbo tipą, ir jūsų įgūdžius atitinkančios galimybės atsiras jūsų lentoje — jūs patys sprendžiate, kada išreikšti susidomėjimą.",
        full: [
          "Pradėkite nuo darbo profilio: nurodykite profesiją, realius įgūdžius, kalbas ir kada galite pradėti. Galite importuoti turimą CV ir peržiūrėti kiekvieną pasiūlymą — nieko nepridedama be jūsų patvirtinimo.",
          "Kai profilis atspindi jūsų įgūdžius, LabourMarket.ai parodo tinkamas darbo galimybes su sąžiningu paaiškinimu, kodėl jos tinka. Nėra garantuoto darbo ir jūs nereitinguojami prieš kitus žmones — jūs valdote procesą ir susidomėjimą išreiškiate tik tuo, kas jums tinka.",
        ],
        steps: [
          "Susikurkite nemokamą profilį ir nurodykite profesiją bei įgūdžius.",
          "Nurodykite, nuo kada esate laisvi, kalbas ir pageidaujamas šalis.",
          "Atsidarykite galimybių lentą ir išreikškite susidomėjimą tinkančiu darbu.",
        ],
        title: "Pradėkite ieškoti darbo LabourMarket.ai",
        desc: "Kaip pradėti darbo paiešką LabourMarket.ai: susikurti profilį, nurodyti pageidavimus ir matyti įgūdžius atitinkančias galimybes.",
      },
      ru: {
        slug: "kak-nachat-poisk-raboty",
        h1: "Как начать поиск работы на LabourMarket.ai?",
        short: "Создайте бесплатный рабочий профиль, укажите страны и тип работы, и подходящие вашим навыкам возможности появятся на вашей доске — вы сами решаете, когда проявить интерес.",
        full: [
          "Начните с рабочего профиля: укажите профессию, реальные навыки, языки и когда вы можете приступить. Можно импортировать имеющееся резюме и проверить каждое предложение — ничего не добавляется без вашего подтверждения.",
          "Когда профиль отражает ваши навыки, LabourMarket.ai показывает подходящие возможности с честным объяснением, почему они подходят. Нет гарантированной работы и нет ранжирования вас относительно других людей — вы управляете процессом и проявляете интерес только к тому, что вам подходит.",
        ],
        steps: [
          "Создайте бесплатный профиль и укажите профессию и навыки.",
          "Укажите дату готовности, языки и предпочитаемые страны.",
          "Откройте доску возможностей и проявите интерес к подходящей роли.",
        ],
        title: "Начните поиск работы на LabourMarket.ai",
        desc: "Как начать поиск работы на LabourMarket.ai: создать профиль, задать предпочтения и видеть подходящие вашим навыкам возможности.",
      },
      nl: {
        slug: "hoe-begin-je-met-werk-zoeken",
        h1: "Hoe begin ik met werk zoeken op LabourMarket.ai?",
        short: "Maak een gratis werkprofiel, stel de landen en het soort werk in dat je zoekt, en kansen die bij je vaardigheden passen verschijnen op je bord — jij bepaalt wanneer je interesse toont.",
        full: [
          "Begin met een werkprofiel: voeg je beroep, je echte vaardigheden, je talen en je startdatum toe. Je kunt een bestaand cv importeren en elke suggestie beoordelen — er wordt niets toegevoegd wat je niet hebt bevestigd.",
          "Zodra je profiel je vaardigheden weergeeft, toont LabourMarket.ai passende werkkansen met een eerlijke uitleg waarom. Er is geen gegarandeerde baan en je wordt niet gerangschikt ten opzichte van anderen — jij houdt de controle en toont alleen interesse in wat bij je past.",
        ],
        steps: [
          "Maak een gratis profiel en voeg je beroep en vaardigheden toe.",
          "Stel je beschikbaarheidsdatum, talen en voorkeurslanden in.",
          "Open je kansenbord en toon interesse in een passende rol.",
        ],
        title: "Begin met werk zoeken op LabourMarket.ai",
        desc: "Hoe je je werkzoektocht start op LabourMarket.ai: bouw een profiel, stel voorkeuren in en zie kansen die bij je vaardigheden passen.",
      },
      de: {
        slug: "wie-beginne-ich-die-arbeitssuche",
        h1: "Wie beginne ich die Arbeitssuche auf LabourMarket.ai?",
        short: "Erstellen Sie ein kostenloses Arbeitsprofil, legen Sie Länder und Art der Arbeit fest, und zu Ihren Fähigkeiten passende Möglichkeiten erscheinen auf Ihrer Übersicht — Sie entscheiden, wann Sie Interesse zeigen.",
        full: [
          "Beginnen Sie mit einem Arbeitsprofil: Beruf, echte Fähigkeiten, Sprachen und Ihr frühester Starttermin. Sie können einen vorhandenen Lebenslauf importieren und jeden Vorschlag prüfen — nichts wird ohne Ihre Bestätigung hinzugefügt.",
          "Sobald Ihr Profil Ihre Fähigkeiten abbildet, zeigt LabourMarket.ai passende Arbeitsmöglichkeiten mit einer ehrlichen Begründung. Es gibt keine garantierte Stelle und kein Ranking gegenüber anderen — Sie behalten die Kontrolle und zeigen nur Interesse an dem, was passt.",
        ],
        steps: [
          "Erstellen Sie ein kostenloses Profil mit Beruf und Fähigkeiten.",
          "Legen Sie Verfügbarkeit, Sprachen und Wunschländer fest.",
          "Öffnen Sie Ihre Chancen-Übersicht und zeigen Sie Interesse an einer passenden Rolle.",
        ],
        title: "Arbeitssuche auf LabourMarket.ai beginnen",
        desc: "Wie Sie Ihre Arbeitssuche auf LabourMarket.ai starten: Profil aufbauen, Präferenzen setzen und passende Möglichkeiten sehen.",
      },
    },
  },
  {
    id: "AE-0056",
    per: {
      en: {
        slug: "what-is-a-work-profile",
        h1: "What is a work profile on LabourMarket.ai?",
        short: "A work profile is a living record of your professional identity — skills, experience, languages, availability and evidence — that grows over time, unlike a static paper CV.",
        full: [
          "Instead of a one-off CV, your work profile brings together what you can do and shows it as evidence: skills you declare, work you record, and confirmations from managers. You control what is visible, and private records stay closed by default.",
          "Because it is living, the profile keeps up with your real work — new skills and experience appear as you add them, so employers see an honest, current picture rather than a document that ages the moment it is written.",
        ],
        title: "What is a work profile on LabourMarket.ai",
        desc: "A LabourMarket.ai work profile is a living, evidence-based professional identity — more than a static CV.",
      },
      lt: {
        slug: "kas-yra-darbo-profilis",
        h1: "Kas yra darbo profilis LabourMarket.ai?",
        short: "Darbo profilis — gyvas jūsų profesinės tapatybės įrašas: įgūdžiai, patirtis, kalbos, prieinamumas ir įrodymai — kuris auga laikui bėgant, skirtingai nei statiškas popierinis CV.",
        full: [
          "Vietoje vienkartinio CV, darbo profilis sujungia tai, ką mokate, ir parodo kaip įrodymą: jūsų deklaruojamus įgūdžius, fiksuojamą darbą ir vadovų patvirtinimus. Jūs valdote, kas matoma, o privatūs įrašai pagal nutylėjimą lieka uždari.",
          "Kadangi profilis gyvas, jis neatsilieka nuo realaus darbo — nauji įgūdžiai ir patirtis atsiranda vos juos pridedate, todėl darbdaviai mato sąžiningą, aktualų vaizdą, o ne dokumentą, kuris pasensta vos parašytas.",
        ],
        title: "Kas yra darbo profilis LabourMarket.ai",
        desc: "LabourMarket.ai darbo profilis — gyva, įrodymais grįsta profesinė tapatybė, daugiau nei statiškas CV.",
      },
      ru: {
        slug: "chto-takoe-rabochiy-profil",
        h1: "Что такое рабочий профиль на LabourMarket.ai?",
        short: "Рабочий профиль — это живая запись вашей профессиональной идентичности: навыки, опыт, языки, доступность и подтверждения — которая растёт со временем, в отличие от статичного бумажного резюме.",
        full: [
          "Вместо разового резюме рабочий профиль объединяет то, что вы умеете, и показывает это как подтверждения: заявленные навыки, зафиксированную работу и подтверждения от руководителей. Вы управляете видимостью, а личные записи по умолчанию закрыты.",
          "Поскольку профиль живой, он не отстаёт от вашей реальной работы — новые навыки и опыт появляются по мере добавления, поэтому работодатели видят честную актуальную картину, а не документ, устаревающий сразу после написания.",
        ],
        title: "Что такое рабочий профиль на LabourMarket.ai",
        desc: "Рабочий профиль LabourMarket.ai — живая профессиональная идентичность на основе подтверждений, больше чем статичное резюме.",
      },
      nl: {
        slug: "wat-is-een-werkprofiel",
        h1: "Wat is een werkprofiel op LabourMarket.ai?",
        short: "Een werkprofiel is een levend overzicht van je professionele identiteit — vaardigheden, ervaring, talen, beschikbaarheid en bewijs — dat met de tijd meegroeit, anders dan een statisch papieren cv.",
        full: [
          "In plaats van een eenmalig cv brengt je werkprofiel samen wat je kunt en toont het als bewijs: vaardigheden die je opgeeft, werk dat je vastlegt en bevestigingen van leidinggevenden. Jij bepaalt wat zichtbaar is; privérecords blijven standaard gesloten.",
          "Omdat het profiel leeft, blijft het je echte werk bijhouden — nieuwe vaardigheden en ervaring verschijnen zodra je ze toevoegt, zodat werkgevers een eerlijk, actueel beeld zien in plaats van een document dat meteen veroudert.",
        ],
        title: "Wat is een werkprofiel op LabourMarket.ai",
        desc: "Een LabourMarket.ai-werkprofiel is een levende, op bewijs gebaseerde professionele identiteit — meer dan een statisch cv.",
      },
      de: {
        slug: "was-ist-ein-arbeitsprofil",
        h1: "Was ist ein Arbeitsprofil auf LabourMarket.ai?",
        short: "Ein Arbeitsprofil ist ein lebendiger Nachweis Ihrer beruflichen Identität — Fähigkeiten, Erfahrung, Sprachen, Verfügbarkeit und Belege — der mit der Zeit wächst, anders als ein statischer Papier-Lebenslauf.",
        full: [
          "Statt eines einmaligen Lebenslaufs bündelt Ihr Arbeitsprofil, was Sie können, und zeigt es als Beleg: angegebene Fähigkeiten, festgehaltene Arbeit und Bestätigungen von Vorgesetzten. Sie steuern die Sichtbarkeit; private Einträge bleiben standardmäßig geschlossen.",
          "Weil es lebendig ist, bleibt das Profil an Ihrer echten Arbeit dran — neue Fähigkeiten und Erfahrung erscheinen, sobald Sie sie hinzufügen, sodass Arbeitgeber ein ehrliches, aktuelles Bild sehen statt eines Dokuments, das sofort veraltet.",
        ],
        title: "Was ist ein Arbeitsprofil auf LabourMarket.ai",
        desc: "Ein LabourMarket.ai-Arbeitsprofil ist eine lebendige, belegbasierte berufliche Identität — mehr als ein statischer Lebenslauf.",
      },
    },
  },
  {
    id: "AE-0102",
    per: {
      en: {
        slug: "declared-vs-confirmed-skill",
        h1: "What is the difference between a declared skill and a confirmed skill?",
        short: "A declared skill is one you state yourself; a confirmed skill is one a manager has verified from real work. Both are shown separately and never mixed.",
        full: [
          "When you add a skill, it starts as declared — your own honest statement. A confirmed skill is backed by evidence: a manager verifies it from work you actually did, so it carries a stronger signal.",
          "The platform always keeps the two apart. In any match you can see how much of a fit comes from confirmed skills versus declared ones, so employers and workers both know what is proven and what is self-stated.",
        ],
        title: "Declared vs confirmed skill on LabourMarket.ai",
        desc: "The difference between a self-declared skill and a manager-confirmed skill on LabourMarket.ai, and why they are always kept separate.",
      },
      lt: {
        slug: "deklaruotas-ir-patvirtintas-igudis",
        h1: "Kuo skiriasi deklaruotas ir patvirtintas įgūdis?",
        short: "Deklaruotą įgūdį nurodote patys; patvirtintą įgūdį vadovas patvirtino iš realaus darbo. Abu rodomi atskirai ir niekada nemaišomi.",
        full: [
          "Pridėtas įgūdis iš pradžių yra deklaruotas — jūsų sąžiningas teiginys. Patvirtintas įgūdis paremtas įrodymu: vadovas jį patvirtina iš realiai atlikto darbo, todėl jis turi stipresnį signalą.",
          "Platforma šiuos du visada atskiria. Bet kurioje atitiktyje matote, kiek atitikimo remiasi patvirtintais, o kiek deklaruotais įgūdžiais, todėl ir darbdaviai, ir darbuotojai žino, kas įrodyta, o kas savideklaruota.",
        ],
        title: "Deklaruotas ir patvirtintas įgūdis LabourMarket.ai",
        desc: "Skirtumas tarp savideklaruoto ir vadovo patvirtinto įgūdžio LabourMarket.ai ir kodėl jie visada atskiriami.",
      },
      ru: {
        slug: "zadeklarirovannyy-i-podtverzhdennyy-navyk",
        h1: "Чем отличается заявленный навык от подтверждённого?",
        short: "Заявленный навык вы указываете сами; подтверждённый навык руководитель проверил по реальной работе. Оба показываются отдельно и никогда не смешиваются.",
        full: [
          "Добавленный навык сначала заявленный — ваше честное утверждение. Подтверждённый навык подкреплён доказательством: руководитель подтверждает его по реально выполненной работе, поэтому у него более сильный сигнал.",
          "Платформа всегда разделяет эти два типа. В любом соответствии видно, какая часть основана на подтверждённых навыках, а какая — на заявленных, поэтому и работодатели, и работники знают, что доказано, а что заявлено самостоятельно.",
        ],
        title: "Заявленный и подтверждённый навык на LabourMarket.ai",
        desc: "Разница между самозаявленным и подтверждённым руководителем навыком на LabourMarket.ai и почему они всегда разделены.",
      },
      nl: {
        slug: "gedeclareerde-versus-bevestigde-vaardigheid",
        h1: "Wat is het verschil tussen een gedeclareerde en een bevestigde vaardigheid?",
        short: "Een gedeclareerde vaardigheid geef je zelf op; een bevestigde vaardigheid is door een leidinggevende geverifieerd op basis van echt werk. Beide worden apart getoond en nooit vermengd.",
        full: [
          "Als je een vaardigheid toevoegt, is die eerst gedeclareerd — je eigen eerlijke verklaring. Een bevestigde vaardigheid is onderbouwd met bewijs: een leidinggevende verifieert die op basis van werk dat je echt hebt gedaan, dus geeft die een sterker signaal.",
          "Het platform houdt beide altijd gescheiden. In elke match zie je hoeveel van de match uit bevestigde versus gedeclareerde vaardigheden komt, zodat werkgevers én werkenden weten wat bewezen is en wat zelf verklaard.",
        ],
        title: "Gedeclareerde vs bevestigde vaardigheid op LabourMarket.ai",
        desc: "Het verschil tussen een zelf-gedeclareerde en een door een leidinggevende bevestigde vaardigheid op LabourMarket.ai, en waarom ze altijd gescheiden blijven.",
      },
      de: {
        slug: "deklarierte-vs-bestaetigte-faehigkeit",
        h1: "Was ist der Unterschied zwischen einer angegebenen und einer bestätigten Fähigkeit?",
        short: "Eine angegebene Fähigkeit geben Sie selbst an; eine bestätigte Fähigkeit hat eine Führungskraft anhand echter Arbeit verifiziert. Beide werden getrennt gezeigt und nie vermischt.",
        full: [
          "Wenn Sie eine Fähigkeit hinzufügen, ist sie zunächst angegeben — Ihre eigene ehrliche Aussage. Eine bestätigte Fähigkeit ist durch Belege gestützt: Eine Führungskraft bestätigt sie anhand tatsächlich geleisteter Arbeit, daher hat sie ein stärkeres Signal.",
          "Die Plattform hält beide immer getrennt. In jedem Abgleich sehen Sie, wie viel der Passung auf bestätigten und wie viel auf angegebenen Fähigkeiten beruht, sodass Arbeitgeber und Arbeitskräfte wissen, was belegt und was selbst angegeben ist.",
        ],
        title: "Angegebene vs. bestätigte Fähigkeit auf LabourMarket.ai",
        desc: "Der Unterschied zwischen einer selbst angegebenen und einer von einer Führungskraft bestätigten Fähigkeit auf LabourMarket.ai — und warum sie stets getrennt bleiben.",
      },
    },
  },
  {
    id: "AE-0190",
    per: {
      en: {
        slug: "what-is-an-adjacent-profession",
        h1: "What is an adjacent professional direction?",
        short: "An adjacent direction is a profession your current skills already partly fit — a realistic next step you can move toward using what you have plus a few new skills.",
        full: [
          "Your skills rarely fit only one job title. An adjacent direction is a profession that shares many of the skills you already hold, so the move is realistic rather than a leap. LabourMarket.ai finds these from your real skills, not from a fixed list.",
          "For each direction you can see the skills that connect you to it and, honestly, what you might still need. It is a way to discover where you could grow — not just which job to take today.",
        ],
        title: "Adjacent professional directions on LabourMarket.ai",
        desc: "What an adjacent professional direction is on LabourMarket.ai and how your existing skills reveal realistic next steps.",
      },
      lt: {
        slug: "kas-yra-gretima-profesine-kryptis",
        h1: "Kas yra gretima profesinė kryptis?",
        short: "Gretima kryptis — profesija, kuriai jūsų dabartiniai įgūdžiai jau iš dalies tinka; realus kitas žingsnis, kurio galite siekti pasitelkę tai, ką turite, ir kelis naujus įgūdžius.",
        full: [
          "Įgūdžiai retai tinka tik vienai pareigybei. Gretima kryptis — profesija, turinti daug jūsų jau turimų įgūdžių, todėl perėjimas yra realus, o ne šuolis. LabourMarket.ai jas randa iš jūsų realių įgūdžių, ne iš fiksuoto sąrašo.",
          "Kiekvienai krypčiai matote įgūdžius, kurie jus su ja sieja, ir sąžiningai — ko dar gali trūkti. Tai būdas atrasti, kur galėtumėte augti, o ne tik kokį darbą rinktis šiandien.",
        ],
        title: "Gretimos profesinės kryptys LabourMarket.ai",
        desc: "Kas yra gretima profesinė kryptis LabourMarket.ai ir kaip turimi įgūdžiai atskleidžia realius kitus žingsnius.",
      },
      ru: {
        slug: "chto-takoe-smezhnoe-napravlenie",
        h1: "Что такое смежное профессиональное направление?",
        short: "Смежное направление — профессия, которой ваши нынешние навыки уже частично соответствуют; реалистичный следующий шаг, к которому можно двигаться, используя то, что есть, плюс несколько новых навыков.",
        full: [
          "Навыки редко подходят лишь к одной должности. Смежное направление — профессия, разделяющая многие уже имеющиеся у вас навыки, поэтому переход реалистичен, а не прыжок. LabourMarket.ai находит их по вашим реальным навыкам, а не по фиксированному списку.",
          "Для каждого направления видно навыки, которые вас с ним связывают, и честно — чего может не хватать. Это способ понять, куда можно расти, а не только какую работу взять сегодня.",
        ],
        title: "Смежные профессиональные направления на LabourMarket.ai",
        desc: "Что такое смежное профессиональное направление на LabourMarket.ai и как имеющиеся навыки раскрывают реалистичные следующие шаги.",
      },
      nl: {
        slug: "wat-is-een-aangrenzende-richting",
        h1: "Wat is een aangrenzende professionele richting?",
        short: "Een aangrenzende richting is een beroep waar je huidige vaardigheden al deels bij passen — een realistische volgende stap die je kunt zetten met wat je hebt plus een paar nieuwe vaardigheden.",
        full: [
          "Je vaardigheden passen zelden bij maar één functietitel. Een aangrenzende richting is een beroep dat veel van je bestaande vaardigheden deelt, dus de stap is realistisch in plaats van een sprong. LabourMarket.ai vindt deze op basis van je echte vaardigheden, niet uit een vaste lijst.",
          "Voor elke richting zie je de vaardigheden die je ermee verbinden en, eerlijk, wat je mogelijk nog nodig hebt. Zo ontdek je waar je kunt groeien — niet alleen welke baan je vandaag neemt.",
        ],
        title: "Aangrenzende professionele richtingen op LabourMarket.ai",
        desc: "Wat een aangrenzende professionele richting is op LabourMarket.ai en hoe je bestaande vaardigheden realistische volgende stappen tonen.",
      },
      de: {
        slug: "was-ist-eine-benachbarte-berufsrichtung",
        h1: "Was ist eine benachbarte Berufsrichtung?",
        short: "Eine benachbarte Richtung ist ein Beruf, zu dem Ihre aktuellen Fähigkeiten bereits teilweise passen — ein realistischer nächster Schritt mit dem, was Sie haben, plus einigen neuen Fähigkeiten.",
        full: [
          "Ihre Fähigkeiten passen selten nur zu einer Stellenbezeichnung. Eine benachbarte Richtung ist ein Beruf, der viele Ihrer vorhandenen Fähigkeiten teilt, sodass der Wechsel realistisch statt ein Sprung ist. LabourMarket.ai findet sie aus Ihren echten Fähigkeiten, nicht aus einer festen Liste.",
          "Für jede Richtung sehen Sie die Fähigkeiten, die Sie damit verbinden, und ehrlich, was noch fehlen könnte. So entdecken Sie, wohin Sie wachsen können — nicht nur, welche Stelle Sie heute annehmen.",
        ],
        title: "Benachbarte Berufsrichtungen auf LabourMarket.ai",
        desc: "Was eine benachbarte Berufsrichtung auf LabourMarket.ai ist und wie Ihre vorhandenen Fähigkeiten realistische nächste Schritte aufzeigen.",
      },
    },
  },
  {
    id: "AE-0361",
    per: {
      en: {
        slug: "how-to-post-a-work-need",
        h1: "How do I post a work need on LabourMarket.ai?",
        short: "Describe the role or work type, team size, country and location, start period, duration and any language requirement — save it as a draft or submit it for matching.",
        full: [
          "A work need captures exactly what you are looking for: the role or work type, how many people, where and when, and any language requirement. It stays private and owner-scoped — only your side sees it.",
          "You can save it as a draft and refine it, or submit it so it enters matching. From there you review candidates whose skills fit, with an honest explanation — never a single overall score for a person.",
        ],
        steps: [
          "Describe the role or work type and team size.",
          "Set the country, location, start period and duration.",
          "Add any language requirement, then save a draft or submit for matching.",
        ],
        title: "Post a work need on LabourMarket.ai",
        desc: "How an employer posts a work need on LabourMarket.ai: role, team size, location, timing and language — as a draft or submitted for matching.",
      },
      lt: {
        slug: "kaip-pateikti-darbo-poreiki",
        h1: "Kaip pateikti darbo poreikį LabourMarket.ai?",
        short: "Aprašykite pareigybę ar darbo tipą, komandos dydį, šalį ir vietą, pradžios laikotarpį, trukmę ir kalbos reikalavimą — išsaugokite kaip juodraštį arba pateikite atitikčiai.",
        full: [
          "Darbo poreikis tiksliai užfiksuoja, ko ieškote: pareigybę ar darbo tipą, kiek žmonių, kur ir kada, bei kalbos reikalavimą. Jis lieka privatus ir matomas tik jums.",
          "Galite išsaugoti kaip juodraštį ir tikslinti arba pateikti, kad prasidėtų atitiktis. Tuomet peržiūrite kandidatus, kurių įgūdžiai tinka, su sąžiningu paaiškinimu — niekada be vieno bendro žmogaus balo.",
        ],
        steps: [
          "Aprašykite pareigybę ar darbo tipą ir komandos dydį.",
          "Nurodykite šalį, vietą, pradžios laikotarpį ir trukmę.",
          "Pridėkite kalbos reikalavimą ir išsaugokite juodraštį arba pateikite atitikčiai.",
        ],
        title: "Pateikite darbo poreikį LabourMarket.ai",
        desc: "Kaip darbdavys pateikia darbo poreikį LabourMarket.ai: pareigybė, komandos dydis, vieta, laikas ir kalba — juodraštis ar pateiktas atitikčiai.",
      },
      ru: {
        slug: "kak-razmestit-potrebnost-v-rabotnikakh",
        h1: "Как разместить потребность в работниках на LabourMarket.ai?",
        short: "Опишите роль или тип работы, размер команды, страну и место, период начала, длительность и требование к языку — сохраните как черновик или отправьте на подбор.",
        full: [
          "Потребность в работниках точно фиксирует, что вы ищете: роль или тип работы, сколько людей, где и когда, а также требование к языку. Она остаётся приватной и видна только вашей стороне.",
          "Можно сохранить черновик и доработать его или отправить, чтобы началось соответствие. Затем вы просматриваете кандидатов, чьи навыки подходят, с честным объяснением — никогда без единого общего балла человека.",
        ],
        steps: [
          "Опишите роль или тип работы и размер команды.",
          "Укажите страну, место, период начала и длительность.",
          "Добавьте требование к языку и сохраните черновик или отправьте на подбор.",
        ],
        title: "Разместите потребность в работниках на LabourMarket.ai",
        desc: "Как работодатель размещает потребность в работниках на LabourMarket.ai: роль, размер команды, место, сроки и язык — черновик или отправка на подбор.",
      },
      nl: {
        slug: "hoe-plaats-je-een-personeelsbehoefte",
        h1: "Hoe plaats ik een personeelsbehoefte op LabourMarket.ai?",
        short: "Beschrijf de rol of het soort werk, teamgrootte, land en locatie, startperiode, duur en een eventuele taaleis — sla het op als concept of dien het in voor matching.",
        full: [
          "Een personeelsbehoefte legt precies vast wat je zoekt: de rol of het soort werk, hoeveel mensen, waar en wanneer, en een eventuele taaleis. Die blijft privé en alleen zichtbaar voor jouw kant.",
          "Je kunt het als concept opslaan en verfijnen, of indienen zodat matching begint. Daarna beoordeel je kandidaten van wie de vaardigheden passen, met een eerlijke uitleg — nooit met één totaalscore voor een persoon.",
        ],
        steps: [
          "Beschrijf de rol of het soort werk en de teamgrootte.",
          "Stel land, locatie, startperiode en duur in.",
          "Voeg een eventuele taaleis toe en sla een concept op of dien in voor matching.",
        ],
        title: "Personeelsbehoefte plaatsen op LabourMarket.ai",
        desc: "Hoe een werkgever een personeelsbehoefte plaatst op LabourMarket.ai: rol, teamgrootte, locatie, timing en taal — als concept of ingediend voor matching.",
      },
      de: {
        slug: "wie-stelle-ich-einen-personalbedarf-ein",
        h1: "Wie stelle ich einen Personalbedarf auf LabourMarket.ai ein?",
        short: "Beschreiben Sie Rolle oder Art der Arbeit, Teamgröße, Land und Ort, Startzeitraum, Dauer und eine etwaige Sprachanforderung — als Entwurf speichern oder zum Abgleich einreichen.",
        full: [
          "Ein Personalbedarf hält genau fest, was Sie suchen: Rolle oder Art der Arbeit, wie viele Personen, wo und wann sowie eine etwaige Sprachanforderung. Er bleibt privat und nur für Ihre Seite sichtbar.",
          "Sie können ihn als Entwurf speichern und verfeinern oder einreichen, damit der Abgleich beginnt. Danach prüfen Sie Kandidaten, deren Fähigkeiten passen, mit einer ehrlichen Begründung — nie mit einem einzigen Gesamtwert für eine Person.",
        ],
        steps: [
          "Beschreiben Sie Rolle oder Art der Arbeit und Teamgröße.",
          "Legen Sie Land, Ort, Startzeitraum und Dauer fest.",
          "Fügen Sie eine etwaige Sprachanforderung hinzu und speichern Sie einen Entwurf oder reichen Sie zum Abgleich ein.",
        ],
        title: "Personalbedarf auf LabourMarket.ai einstellen",
        desc: "Wie ein Arbeitgeber einen Personalbedarf auf LabourMarket.ai einstellt: Rolle, Teamgröße, Ort, Zeit und Sprache — als Entwurf oder zum Abgleich eingereicht.",
      },
    },
  },
  {
    id: "AE-0511",
    per: {
      en: {
        slug: "what-is-labourmarket-ai",
        h1: "What is LabourMarket.ai?",
        short: "LabourMarket.ai is a universal European space for work and professional opportunity — for people of every profession and education level, and for employers, companies, teams and agencies.",
        full: [
          "It helps everyone find work, workers, teams, projects and partners, show real skills as evidence, discover where their skills can grow, and understand the labour market — across professions and across Europe.",
          "It is a real product, honest by design: no fake data, no guaranteed jobs, and no single overall rating of a person. What you see reflects real records and real activity, and your private information stays closed by default.",
        ],
        title: "What is LabourMarket.ai",
        desc: "LabourMarket.ai is a universal European labour-market and professional-opportunity space for all professions, education levels, workers and employers.",
      },
      lt: {
        slug: "kas-yra-labourmarket-ai",
        h1: "Kas yra LabourMarket.ai?",
        short: "LabourMarket.ai — universali Europos darbo ir profesinių galimybių erdvė visų profesijų ir išsilavinimo lygių žmonėms bei darbdaviams, įmonėms, komandoms ir agentūroms.",
        full: [
          "Ji padeda kiekvienam rasti darbą, darbuotojus, komandas, projektus ir partnerius, parodyti realius įgūdžius kaip įrodymą, atrasti, kur įgūdžiai gali augti, ir suprasti darbo rinką — įvairiose profesijose ir visoje Europoje.",
          "Tai realus produktas, sąžiningas iš esmės: jokių netikrų duomenų, jokių garantuotų darbų ir jokio vieno bendro žmogaus įvertinimo. Tai, ką matote, atspindi realius įrašus ir realią veiklą, o jūsų privati informacija pagal nutylėjimą lieka uždara.",
        ],
        title: "Kas yra LabourMarket.ai",
        desc: "LabourMarket.ai — universali Europos darbo rinkos ir profesinių galimybių erdvė visų profesijų, išsilavinimo lygių žmonėms ir darbdaviams.",
      },
      ru: {
        slug: "chto-takoe-labourmarket-ai",
        h1: "Что такое LabourMarket.ai?",
        short: "LabourMarket.ai — универсальное европейское пространство работы и профессиональных возможностей для людей всех профессий и уровней образования, а также для работодателей, компаний, команд и агентств.",
        full: [
          "Оно помогает каждому найти работу, работников, команды, проекты и партнёров, показать реальные навыки как подтверждения, понять, куда навыки могут расти, и разобраться в рынке труда — по разным профессиям и по всей Европе.",
          "Это реальный продукт, честный по своей сути: никаких фальшивых данных, никаких гарантированных работ и никакой единой общей оценки человека. То, что вы видите, отражает реальные записи и реальную активность, а ваша личная информация по умолчанию закрыта.",
        ],
        title: "Что такое LabourMarket.ai",
        desc: "LabourMarket.ai — универсальное европейское пространство рынка труда и профессиональных возможностей для всех профессий, уровней образования, работников и работодателей.",
      },
      nl: {
        slug: "wat-is-labourmarket-ai",
        h1: "Wat is LabourMarket.ai?",
        short: "LabourMarket.ai is een universele Europese ruimte voor werk en professionele kansen — voor mensen van elk beroep en opleidingsniveau, en voor werkgevers, bedrijven, teams en bureaus.",
        full: [
          "Het helpt iedereen om werk, werkenden, teams, projecten en partners te vinden, echte vaardigheden als bewijs te tonen, te ontdekken waar vaardigheden kunnen groeien en de arbeidsmarkt te begrijpen — over beroepen heen en door heel Europa.",
          "Het is een echt product, eerlijk van opzet: geen nepdata, geen gegarandeerde banen en geen enkele totaalscore van een persoon. Wat je ziet weerspiegelt echte gegevens en echte activiteit, en je privé-informatie blijft standaard gesloten.",
        ],
        title: "Wat is LabourMarket.ai",
        desc: "LabourMarket.ai is een universele Europese arbeidsmarkt- en kansenruimte voor alle beroepen, opleidingsniveaus, werkenden en werkgevers.",
      },
      de: {
        slug: "was-ist-labourmarket-ai",
        h1: "Was ist LabourMarket.ai?",
        short: "LabourMarket.ai ist ein universeller europäischer Raum für Arbeit und berufliche Chancen — für Menschen jedes Berufs und Bildungsniveaus und für Arbeitgeber, Unternehmen, Teams und Agenturen.",
        full: [
          "Es hilft allen, Arbeit, Arbeitskräfte, Teams, Projekte und Partner zu finden, echte Fähigkeiten als Beleg zu zeigen, zu entdecken, wohin Fähigkeiten wachsen können, und den Arbeitsmarkt zu verstehen — über Berufe hinweg und in ganz Europa.",
          "Es ist ein echtes Produkt, ehrlich angelegt: keine falschen Daten, keine garantierten Stellen und keine einzelne Gesamtbewertung einer Person. Was Sie sehen, spiegelt echte Einträge und echte Aktivität wider, und Ihre privaten Informationen bleiben standardmäßig geschlossen.",
        ],
        title: "Was ist LabourMarket.ai",
        desc: "LabourMarket.ai ist ein universeller europäischer Arbeitsmarkt- und Chancenraum für alle Berufe, Bildungsniveaus, Arbeitskräfte und Arbeitgeber.",
      },
    },
  },
];

const LOCALES: Loc[] = ["lt", "en", "ru", "nl", "de"];

export const PILOT_ANSWERS: readonly LocalizedAnswer[] = DRAFTS.flatMap((d) =>
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
      title: b.title,
      description: b.desc,
      reviewStatus: "HUMAN_APPROVED",
      reviewDate: REVIEWED,
      editorialResponsibility: EDITORIAL,
    };
  }),
);
