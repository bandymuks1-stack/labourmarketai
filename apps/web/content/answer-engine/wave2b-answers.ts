/**
 * Answer Engine — localized answer content, Wave 2B.
 *
 * 12 additional LOW-risk canonical questions across the 5 active locales
 * (lt, en, ru, nl, de) = 60 localized answer pages. Every question here is
 * directly referenced by a published Wave 1 pilot question's relatedQuestionIds,
 * so publishing them lights up the pilot pages' related-question graph with
 * reciprocal internal links (no orphans). No legal/visa/tax/salary or other
 * HIGH-risk content — all are product-capability questions answered from the
 * real product. Every answer is written natively per locale (never a
 * machine-raw draft, never an English fallback under another locale) and is
 * only indexed when HUMAN_APPROVED (enforced by the publishing engine).
 *
 * Kept as its own module (not merged into pilot-answers.ts) so the Wave 1
 * pilot cap guard stays exact; publishing.ts concatenates both.
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
    id: "AE-0002",
    per: {
      en: {
        slug: "how-does-labourmarket-ai-help-me-find-work",
        h1: "How does LabourMarket.ai help me find work?",
        short: "It matches your real skills and preferences to work opportunities and shows each one with an honest reason it fits — you keep the initiative and choose what to pursue.",
        full: [
          "LabourMarket.ai does not send your details out to employers or promise you a job. Instead, it reads the skills, languages, availability and locations on your profile and surfaces opportunities that genuinely overlap with them, on a board you control.",
          "For every opportunity you can see why it appeared: which of your skills connect to it and what might still be missing. Nothing is decided for you and there is no single score ranking you against other people — you express interest only in what suits you.",
        ],
        steps: [
          "Complete your profile so it reflects your real skills and preferences.",
          "Open your opportunity board and read the fit explanation on each item.",
          "Express interest in the ones that suit you; ignore the rest.",
        ],
        title: "How LabourMarket.ai helps you find work",
        desc: "How LabourMarket.ai helps you find work: skill-based opportunity matching with an honest fit explanation, and you stay in control.",
      },
      lt: {
        slug: "kaip-labourmarket-ai-padeda-rasti-darba",
        h1: "Kaip LabourMarket.ai padeda rasti darbą?",
        short: "Ji sugretina jūsų realius įgūdžius ir pageidavimus su darbo galimybėmis ir kiekvieną parodo su sąžiningu paaiškinimu, kodėl ji tinka — iniciatyva lieka jums, jūs renkatės, ką bandyti.",
        full: [
          "LabourMarket.ai nesiunčia jūsų duomenų darbdaviams ir nežada darbo. Vietoje to ji perskaito jūsų profilyje nurodytus įgūdžius, kalbas, prieinamumą ir vietas bei parodo galimybes, kurios su jais tikrai sutampa, jūsų valdomoje lentoje.",
          "Kiekvienai galimybei matote, kodėl ji atsirado: kurie jūsų įgūdžiai su ja siejasi ir ko dar gali trūkti. Už jus niekas nesprendžia ir nėra vieno balo, reitinguojančio jus prieš kitus — susidomėjimą išreiškiate tik tuo, kas jums tinka.",
        ],
        steps: [
          "Užpildykite profilį, kad jis atspindėtų realius įgūdžius ir pageidavimus.",
          "Atsidarykite galimybių lentą ir perskaitykite kiekvienos tinkamumo paaiškinimą.",
          "Išreikškite susidomėjimą tinkančiomis; kitas praleiskite.",
        ],
        title: "Kaip LabourMarket.ai padeda rasti darbą",
        desc: "Kaip LabourMarket.ai padeda rasti darbą: įgūdžiais grįstas galimybių sugretinimas su sąžiningu paaiškinimu, o sprendimas lieka jums.",
      },
      ru: {
        slug: "kak-labourmarket-ai-pomogaet-nayti-rabotu",
        h1: "Как LabourMarket.ai помогает найти работу?",
        short: "Она сопоставляет ваши реальные навыки и предпочтения с возможностями работы и показывает каждую с честным объяснением, почему она подходит — инициатива остаётся у вас.",
        full: [
          "LabourMarket.ai не рассылает ваши данные работодателям и не обещает работу. Вместо этого она читает навыки, языки, доступность и локации в вашем профиле и показывает возможности, которые действительно с ними совпадают, на доске, которой управляете вы.",
          "Для каждой возможности видно, почему она появилась: какие ваши навыки с ней связаны и чего может не хватать. За вас ничего не решают, и нет единого балла, ранжирующего вас относительно других — интерес вы проявляете только к тому, что подходит.",
        ],
        steps: [
          "Заполните профиль, чтобы он отражал реальные навыки и предпочтения.",
          "Откройте доску возможностей и прочитайте объяснение соответствия по каждой.",
          "Проявите интерес к подходящим; остальные пропустите.",
        ],
        title: "Как LabourMarket.ai помогает найти работу",
        desc: "Как LabourMarket.ai помогает найти работу: подбор возможностей по навыкам с честным объяснением соответствия, а решение остаётся за вами.",
      },
      nl: {
        slug: "hoe-helpt-labourmarket-ai-mij-werk-vinden",
        h1: "Hoe helpt LabourMarket.ai mij werk te vinden?",
        short: "Het koppelt je echte vaardigheden en voorkeuren aan werkkansen en toont er bij elke een eerlijke reden waarom die past — jij houdt het initiatief en kiest wat je oppakt.",
        full: [
          "LabourMarket.ai stuurt je gegevens niet naar werkgevers en belooft geen baan. In plaats daarvan leest het de vaardigheden, talen, beschikbaarheid en locaties op je profiel en toont het kansen die daar echt bij aansluiten, op een bord dat jij beheert.",
          "Bij elke kans zie je waarom die verscheen: welke van je vaardigheden ermee verbonden zijn en wat er nog kan ontbreken. Er wordt niets voor je beslist en er is geen totaalscore die je rangschikt tegenover anderen — je toont alleen interesse in wat past.",
        ],
        steps: [
          "Vul je profiel in zodat het je echte vaardigheden en voorkeuren weergeeft.",
          "Open je kansenbord en lees bij elke kans de uitleg over de match.",
          "Toon interesse in de passende kansen; sla de rest over.",
        ],
        title: "Hoe LabourMarket.ai je helpt werk te vinden",
        desc: "Hoe LabourMarket.ai je helpt werk te vinden: kansen matchen op vaardigheden met een eerlijke uitleg, en jij houdt de controle.",
      },
      de: {
        slug: "wie-hilft-labourmarket-ai-mir-arbeit-zu-finden",
        h1: "Wie hilft mir LabourMarket.ai, Arbeit zu finden?",
        short: "Es gleicht Ihre echten Fähigkeiten und Präferenzen mit Arbeitsmöglichkeiten ab und zeigt zu jeder eine ehrliche Begründung, warum sie passt — die Initiative bleibt bei Ihnen.",
        full: [
          "LabourMarket.ai versendet Ihre Daten nicht an Arbeitgeber und verspricht keine Stelle. Stattdessen liest es die Fähigkeiten, Sprachen, Verfügbarkeit und Orte in Ihrem Profil und zeigt Möglichkeiten, die wirklich dazu passen, auf einer Übersicht, die Sie steuern.",
          "Zu jeder Möglichkeit sehen Sie, warum sie erschien: welche Ihrer Fähigkeiten sie verbinden und was noch fehlen könnte. Nichts wird für Sie entschieden, und es gibt keinen Gesamtwert, der Sie gegenüber anderen einordnet — Sie zeigen nur Interesse an dem, was passt.",
        ],
        steps: [
          "Vervollständigen Sie Ihr Profil, damit es Ihre echten Fähigkeiten und Präferenzen abbildet.",
          "Öffnen Sie Ihre Chancen-Übersicht und lesen Sie zu jeder die Passungs-Begründung.",
          "Zeigen Sie Interesse an den passenden; überspringen Sie den Rest.",
        ],
        title: "Wie LabourMarket.ai Ihnen hilft, Arbeit zu finden",
        desc: "Wie LabourMarket.ai Ihnen hilft, Arbeit zu finden: Chancen nach Fähigkeiten abgleichen mit ehrlicher Begründung — und Sie behalten die Kontrolle.",
      },
    },
  },
  {
    id: "AE-0003",
    per: {
      en: {
        slug: "do-i-need-to-pay-to-look-for-work",
        h1: "Do I need to pay to look for work on LabourMarket.ai?",
        short: "No. Building a profile, seeing matching opportunities and expressing interest are free for people looking for work. You are never charged to be found or to apply.",
        full: [
          "For workers and job seekers, the core of the platform is free: creating your profile, importing a CV, having your skills matched to opportunities and reaching out about the ones that fit. There is no fee to appear in results and no pay-to-rank.",
          "Paid features exist on the employer and company side — for organisations that post needs and manage hiring — not for the people looking for work. If anything ever asked a worker to pay to be seen, that would go against how the platform is designed.",
        ],
        title: "Is looking for work on LabourMarket.ai free?",
        desc: "Looking for work on LabourMarket.ai is free: profile, matching and expressing interest cost nothing for workers. No pay-to-rank.",
      },
      lt: {
        slug: "ar-reikia-moketi-uz-darbo-paieska",
        h1: "Ar reikia mokėti už darbo paiešką LabourMarket.ai?",
        short: "Ne. Profilio kūrimas, tinkančių galimybių matymas ir susidomėjimo išreiškimas ieškantiems darbo yra nemokami. Už tai, kad jus rastų ar galėtumėte kreiptis, niekada neimamas mokestis.",
        full: [
          "Darbuotojams ir darbo ieškantiems pagrindinė platformos dalis nemokama: profilio kūrimas, CV importavimas, įgūdžių sugretinimas su galimybėmis ir kreipimasis dėl tinkančių. Nėra mokesčio už pasirodymą rezultatuose ir nėra mokamo reitingavimo.",
          "Mokamos funkcijos yra darbdavių ir įmonių pusėje — organizacijoms, kurios skelbia poreikius ir valdo įdarbinimą, — o ne ieškantiems darbo. Jei kada nors būtų prašoma darbuotojo mokėti, kad būtų matomas, tai prieštarautų platformos sandarai.",
        ],
        title: "Ar darbo paieška LabourMarket.ai nemokama?",
        desc: "Darbo paieška LabourMarket.ai nemokama: profilis, sugretinimas ir susidomėjimo išreiškimas darbuotojams nieko nekainuoja. Jokio mokamo reitingavimo.",
      },
      ru: {
        slug: "nuzhno-li-platit-za-poisk-raboty",
        h1: "Нужно ли платить за поиск работы на LabourMarket.ai?",
        short: "Нет. Создание профиля, просмотр подходящих возможностей и проявление интереса для ищущих работу бесплатны. С вас никогда не берут плату за то, чтобы вас нашли или чтобы откликнуться.",
        full: [
          "Для работников и соискателей основа платформы бесплатна: создание профиля, импорт резюме, сопоставление навыков с возможностями и обращение по подходящим. Нет платы за появление в результатах и нет платного ранжирования.",
          "Платные функции есть на стороне работодателей и компаний — для организаций, которые размещают потребности и управляют наймом, — а не для ищущих работу. Если бы у работника попросили плату за видимость, это противоречило бы устройству платформы.",
        ],
        title: "Поиск работы на LabourMarket.ai бесплатный?",
        desc: "Поиск работы на LabourMarket.ai бесплатен: профиль, сопоставление и проявление интереса ничего не стоят работникам. Никакого платного ранжирования.",
      },
      nl: {
        slug: "moet-ik-betalen-om-werk-te-zoeken",
        h1: "Moet ik betalen om werk te zoeken op LabourMarket.ai?",
        short: "Nee. Een profiel maken, passende kansen zien en interesse tonen zijn gratis voor wie werk zoekt. Je betaalt nooit om gevonden te worden of om te reageren.",
        full: [
          "Voor werkenden en werkzoekenden is de kern van het platform gratis: je profiel maken, een cv importeren, je vaardigheden laten matchen met kansen en contact opnemen over wat past. Er is geen kosten om in resultaten te verschijnen en geen betaald ranken.",
          "Betaalde functies bestaan aan de kant van werkgevers en bedrijven — voor organisaties die behoeften plaatsen en werving beheren — niet voor wie werk zoekt. Als iets ooit een werkende zou vragen te betalen om zichtbaar te zijn, zou dat ingaan tegen de opzet van het platform.",
        ],
        title: "Is werk zoeken op LabourMarket.ai gratis?",
        desc: "Werk zoeken op LabourMarket.ai is gratis: profiel, matching en interesse tonen kosten werkenden niets. Geen betaald ranken.",
      },
      de: {
        slug: "muss-ich-fuer-die-arbeitssuche-bezahlen",
        h1: "Muss ich für die Arbeitssuche auf LabourMarket.ai bezahlen?",
        short: "Nein. Ein Profil anzulegen, passende Möglichkeiten zu sehen und Interesse zu zeigen ist für Arbeitsuchende kostenlos. Sie zahlen nie dafür, gefunden zu werden oder sich zu bewerben.",
        full: [
          "Für Arbeitskräfte und Arbeitsuchende ist der Kern der Plattform kostenlos: Profil anlegen, Lebenslauf importieren, Fähigkeiten mit Möglichkeiten abgleichen und sich zu passenden melden. Es gibt keine Gebühr, um in Ergebnissen zu erscheinen, und kein Bezahl-Ranking.",
          "Kostenpflichtige Funktionen gibt es auf der Arbeitgeber- und Unternehmensseite — für Organisationen, die Bedarfe einstellen und Einstellungen verwalten — nicht für Arbeitsuchende. Würde je eine Arbeitskraft zur Zahlung für Sichtbarkeit aufgefordert, widerspräche das dem Aufbau der Plattform.",
        ],
        title: "Ist die Arbeitssuche auf LabourMarket.ai kostenlos?",
        desc: "Die Arbeitssuche auf LabourMarket.ai ist kostenlos: Profil, Abgleich und Interesse zeigen kosten Arbeitskräfte nichts. Kein Bezahl-Ranking.",
      },
    },
  },
  {
    id: "AE-0057",
    per: {
      en: {
        slug: "work-profile-vs-paper-cv",
        h1: "How is a work profile different from a paper CV?",
        short: "A paper CV is a fixed snapshot you rewrite by hand; a work profile is a living record that updates as you work and can show evidence behind each claim.",
        full: [
          "A CV is written once for a moment and starts ageing immediately: it lists what you say you did, with no way for a reader to check it. A work profile keeps the same information but stays current and separates what you declare from what has been confirmed.",
          "Because the profile is connected to your real activity, skills and confirmations can be attached as evidence, and you control what is visible. It complements a CV rather than replacing the idea — you can still export or import one — but it does not go stale the moment it is saved.",
        ],
        title: "Work profile vs paper CV on LabourMarket.ai",
        desc: "How a LabourMarket.ai work profile differs from a paper CV: living, evidence-based and current, instead of a fixed snapshot that ages.",
      },
      lt: {
        slug: "darbo-profilis-ir-popierinis-cv",
        h1: "Kuo darbo profilis skiriasi nuo popierinio CV?",
        short: "Popierinis CV — fiksuota momentinė nuotrauka, kurią perrašote ranka; darbo profilis — gyvas įrašas, kuris atsinaujina jums dirbant ir gali parodyti kiekvieno teiginio įrodymą.",
        full: [
          "CV parašomas vieną kartą tam tikram momentui ir iškart pradeda senti: jame surašyta, ką sakote nuveikęs, o skaitytojas negali to patikrinti. Darbo profilis saugo tą pačią informaciją, bet lieka aktualus ir atskiria tai, ką deklaruojate, nuo to, kas patvirtinta.",
          "Kadangi profilis susietas su jūsų realia veikla, įgūdžiai ir patvirtinimai gali būti pridedami kaip įrodymai, o jūs valdote, kas matoma. Jis papildo CV, o ne panaikina pačią idėją — CV vis tiek galite eksportuoti ar importuoti — tačiau nepasensta vos išsaugotas.",
        ],
        title: "Darbo profilis ir popierinis CV LabourMarket.ai",
        desc: "Kuo LabourMarket.ai darbo profilis skiriasi nuo popierinio CV: gyvas, įrodymais grįstas ir aktualus, o ne fiksuota senstanti nuotrauka.",
      },
      ru: {
        slug: "rabochiy-profil-i-bumazhnoe-rezyume",
        h1: "Чем рабочий профиль отличается от бумажного резюме?",
        short: "Бумажное резюме — застывший снимок, который вы переписываете вручную; рабочий профиль — живая запись, которая обновляется по мере работы и может показать доказательство за каждым утверждением.",
        full: [
          "Резюме пишется однажды для конкретного момента и сразу начинает устаревать: в нём указано, что вы, по вашим словам, делали, а проверить это читатель не может. Рабочий профиль хранит ту же информацию, но остаётся актуальным и разделяет заявленное и подтверждённое.",
          "Поскольку профиль связан с вашей реальной активностью, навыки и подтверждения можно приложить как доказательства, а вы управляете видимостью. Он дополняет резюме, а не отменяет саму идею — резюме по-прежнему можно экспортировать или импортировать — но не устаревает сразу после сохранения.",
        ],
        title: "Рабочий профиль и бумажное резюме на LabourMarket.ai",
        desc: "Чем рабочий профиль LabourMarket.ai отличается от бумажного резюме: живой, основанный на доказательствах и актуальный, а не застывший снимок.",
      },
      nl: {
        slug: "werkprofiel-versus-papieren-cv",
        h1: "Hoe verschilt een werkprofiel van een papieren cv?",
        short: "Een papieren cv is een vaste momentopname die je met de hand herschrijft; een werkprofiel is een levend overzicht dat meebeweegt met je werk en bewijs achter elke claim kan tonen.",
        full: [
          "Een cv wordt eenmalig voor een moment geschreven en veroudert meteen: het vermeldt wat je zegt te hebben gedaan, zonder dat een lezer het kan controleren. Een werkprofiel bewaart dezelfde informatie maar blijft actueel en scheidt wat je verklaart van wat is bevestigd.",
          "Omdat het profiel verbonden is met je echte activiteit, kunnen vaardigheden en bevestigingen als bewijs worden toegevoegd, en jij bepaalt wat zichtbaar is. Het vult een cv aan in plaats van het idee te vervangen — je kunt er nog steeds een exporteren of importeren — maar het veroudert niet zodra het is opgeslagen.",
        ],
        title: "Werkprofiel versus papieren cv op LabourMarket.ai",
        desc: "Hoe een LabourMarket.ai-werkprofiel verschilt van een papieren cv: levend, op bewijs gebaseerd en actueel, in plaats van een vaste momentopname.",
      },
      de: {
        slug: "arbeitsprofil-versus-papier-lebenslauf",
        h1: "Wie unterscheidet sich ein Arbeitsprofil von einem Papier-Lebenslauf?",
        short: "Ein Papier-Lebenslauf ist eine feste Momentaufnahme, die Sie von Hand neu schreiben; ein Arbeitsprofil ist ein lebendiger Nachweis, der sich mit Ihrer Arbeit aktualisiert und Belege zu jeder Angabe zeigen kann.",
        full: [
          "Ein Lebenslauf wird einmal für einen Moment geschrieben und veraltet sofort: Er listet, was Sie eigenen Angaben nach getan haben, ohne dass ein Leser es prüfen kann. Ein Arbeitsprofil bewahrt dieselben Informationen, bleibt aber aktuell und trennt Angegebenes von Bestätigtem.",
          "Weil das Profil mit Ihrer echten Aktivität verbunden ist, lassen sich Fähigkeiten und Bestätigungen als Belege anhängen, und Sie steuern die Sichtbarkeit. Es ergänzt einen Lebenslauf, statt die Idee zu ersetzen — Sie können weiterhin einen exportieren oder importieren — veraltet aber nicht im Moment des Speicherns.",
        ],
        title: "Arbeitsprofil versus Papier-Lebenslauf auf LabourMarket.ai",
        desc: "Wie sich ein LabourMarket.ai-Arbeitsprofil von einem Papier-Lebenslauf unterscheidet: lebendig, belegbasiert und aktuell statt feste Momentaufnahme.",
      },
    },
  },
  {
    id: "AE-0060",
    per: {
      en: {
        slug: "how-do-i-import-my-cv",
        h1: "How do I import my existing CV?",
        short: "Upload your CV file and the platform reads it into structured profile suggestions. You review every item and nothing is added to your profile until you confirm it.",
        full: [
          "Importing a CV saves you retyping. The platform extracts likely roles, skills and experience from the document and presents them as suggestions, mapped to the fields of your work profile.",
          "You stay in charge of the result: each suggestion is yours to accept, edit or reject, and imported skills start as declared, not confirmed. The original file is your data — you can remove it — and the import never changes your profile on its own.",
        ],
        steps: [
          "Open your profile and choose to import a CV.",
          "Upload the file and let the platform read it into suggestions.",
          "Review each suggestion and confirm only what is correct.",
        ],
        title: "Import your CV into LabourMarket.ai",
        desc: "How to import an existing CV into LabourMarket.ai: upload, review the extracted suggestions, and confirm only what you approve.",
      },
      lt: {
        slug: "kaip-importuoti-cv",
        h1: "Kaip importuoti turimą CV?",
        short: "Įkelkite CV failą ir platforma jį perskaito į struktūruotus profilio pasiūlymus. Kiekvieną punktą peržiūrite patys, ir niekas nepridedama prie profilio, kol nepatvirtinate.",
        full: [
          "CV importavimas leidžia iš naujo neperrašinėti. Platforma iš dokumento išskiria tikėtinas pareigas, įgūdžius ir patirtį ir pateikia juos kaip pasiūlymus, priskirtus jūsų darbo profilio laukams.",
          "Rezultatą valdote jūs: kiekvieną pasiūlymą galite priimti, redaguoti ar atmesti, o importuoti įgūdžiai prasideda kaip deklaruoti, ne patvirtinti. Originalus failas — jūsų duomenys, galite jį pašalinti — ir importas savaime nekeičia profilio.",
        ],
        steps: [
          "Atsidarykite profilį ir pasirinkite CV importavimą.",
          "Įkelkite failą ir leiskite platformai perskaityti jį į pasiūlymus.",
          "Peržiūrėkite kiekvieną pasiūlymą ir patvirtinkite tik tai, kas teisinga.",
        ],
        title: "Importuokite CV į LabourMarket.ai",
        desc: "Kaip importuoti turimą CV į LabourMarket.ai: įkelti, peržiūrėti išskirtus pasiūlymus ir patvirtinti tik tai, ką pritariate.",
      },
      ru: {
        slug: "kak-importirovat-rezyume",
        h1: "Как импортировать имеющееся резюме?",
        short: "Загрузите файл резюме, и платформа прочитает его в структурированные предложения для профиля. Вы проверяете каждый пункт, и ничего не добавляется в профиль без вашего подтверждения.",
        full: [
          "Импорт резюме избавляет от повторного набора. Платформа извлекает из документа вероятные должности, навыки и опыт и показывает их как предложения, сопоставленные с полями вашего рабочего профиля.",
          "Результатом управляете вы: каждое предложение можно принять, изменить или отклонить, а импортированные навыки начинаются как заявленные, а не подтверждённые. Исходный файл — ваши данные, вы можете его удалить — и импорт сам по себе не меняет профиль.",
        ],
        steps: [
          "Откройте профиль и выберите импорт резюме.",
          "Загрузите файл и дайте платформе прочитать его в предложения.",
          "Проверьте каждое предложение и подтвердите только то, что верно.",
        ],
        title: "Импортируйте резюме в LabourMarket.ai",
        desc: "Как импортировать имеющееся резюме в LabourMarket.ai: загрузить, проверить извлечённые предложения и подтвердить только одобренное.",
      },
      nl: {
        slug: "hoe-importeer-ik-mijn-cv",
        h1: "Hoe importeer ik mijn bestaande cv?",
        short: "Upload je cv-bestand en het platform leest het in als gestructureerde profielsuggesties. Jij beoordeelt elk item en niets komt in je profiel tot je het bevestigt.",
        full: [
          "Een cv importeren scheelt overtypen. Het platform haalt waarschijnlijke functies, vaardigheden en ervaring uit het document en toont ze als suggesties, gekoppeld aan de velden van je werkprofiel.",
          "Jij houdt de regie over het resultaat: elke suggestie kun je accepteren, bewerken of afwijzen, en geïmporteerde vaardigheden beginnen als gedeclareerd, niet bevestigd. Het originele bestand is jouw data — je kunt het verwijderen — en de import verandert je profiel nooit vanzelf.",
        ],
        steps: [
          "Open je profiel en kies om een cv te importeren.",
          "Upload het bestand en laat het platform het inlezen tot suggesties.",
          "Beoordeel elke suggestie en bevestig alleen wat klopt.",
        ],
        title: "Je cv importeren in LabourMarket.ai",
        desc: "Hoe je een bestaand cv importeert in LabourMarket.ai: uploaden, de uitgelezen suggesties beoordelen en alleen bevestigen wat je goedkeurt.",
      },
      de: {
        slug: "wie-importiere-ich-meinen-lebenslauf",
        h1: "Wie importiere ich meinen vorhandenen Lebenslauf?",
        short: "Laden Sie Ihre Lebenslauf-Datei hoch, und die Plattform liest sie in strukturierte Profilvorschläge ein. Sie prüfen jeden Punkt, und nichts kommt ins Profil, bis Sie es bestätigen.",
        full: [
          "Der Import erspart das Abtippen. Die Plattform entnimmt dem Dokument wahrscheinliche Tätigkeiten, Fähigkeiten und Erfahrung und zeigt sie als Vorschläge, den Feldern Ihres Arbeitsprofils zugeordnet.",
          "Das Ergebnis bestimmen Sie: Jeden Vorschlag können Sie annehmen, bearbeiten oder ablehnen, und importierte Fähigkeiten beginnen als angegeben, nicht bestätigt. Die Originaldatei sind Ihre Daten — Sie können sie entfernen — und der Import ändert Ihr Profil nie von selbst.",
        ],
        steps: [
          "Öffnen Sie Ihr Profil und wählen Sie den Lebenslauf-Import.",
          "Laden Sie die Datei hoch und lassen Sie die Plattform sie in Vorschläge einlesen.",
          "Prüfen Sie jeden Vorschlag und bestätigen Sie nur, was korrekt ist.",
        ],
        title: "Ihren Lebenslauf in LabourMarket.ai importieren",
        desc: "Wie Sie einen vorhandenen Lebenslauf in LabourMarket.ai importieren: hochladen, die ausgelesenen Vorschläge prüfen und nur Bestätigtes übernehmen.",
      },
    },
  },
  {
    id: "AE-0099",
    per: {
      en: {
        slug: "what-do-red-yellow-green-skill-signals-mean",
        h1: "What do the red, yellow and green skill signals mean?",
        short: "They show how much evidence backs a skill: green means confirmed from real work, yellow means declared or partly supported, and red means stated but not yet evidenced.",
        full: [
          "The colour is an honesty signal, not a grade of how good you are. Green marks a skill a manager has confirmed from work you actually did; yellow marks a skill you have declared or that has some supporting activity; red marks a skill you have listed but for which there is no evidence yet.",
          "The point is to keep self-stated and evidenced skills visibly separate, so both you and an employer can tell what is proven. A red signal is not a criticism — it simply shows where confirmation could be added next.",
        ],
        title: "Red, yellow and green skill signals explained",
        desc: "What the red, yellow and green skill signals mean on LabourMarket.ai: a transparent measure of how much evidence backs each skill.",
      },
      lt: {
        slug: "ka-reiskia-raudonas-geltonas-zalias-igudziu-signalai",
        h1: "Ką reiškia raudonas, geltonas ir žalias įgūdžių signalai?",
        short: "Jie rodo, kiek įrodymų pagrindžia įgūdį: žalias — patvirtintas iš realaus darbo, geltonas — deklaruotas ar iš dalies pagrįstas, raudonas — nurodytas, bet dar be įrodymų.",
        full: [
          "Spalva yra sąžiningumo signalas, ne jūsų gebumo pažymys. Žalias žymi įgūdį, kurį vadovas patvirtino iš realiai atlikto darbo; geltonas — įgūdį, kurį deklaravote arba kurį šiek tiek pagrindžia veikla; raudonas — įgūdį, kurį nurodėte, bet kuriam dar nėra įrodymų.",
          "Tikslas — matomai atskirti savideklaruotus ir įrodytus įgūdžius, kad ir jūs, ir darbdavys matytumėte, kas įrodyta. Raudonas signalas nėra kritika — jis tiesiog rodo, kur toliau būtų galima pridėti patvirtinimą.",
        ],
        title: "Raudonas, geltonas ir žalias įgūdžių signalai",
        desc: "Ką reiškia raudonas, geltonas ir žalias įgūdžių signalai LabourMarket.ai: skaidrus matas, kiek įrodymų pagrindžia kiekvieną įgūdį.",
      },
      ru: {
        slug: "chto-znachat-krasnyy-zheltyy-zelenyy-signaly-navykov",
        h1: "Что значат красный, жёлтый и зелёный сигналы навыков?",
        short: "Они показывают, сколько доказательств за навыком: зелёный — подтверждён по реальной работе, жёлтый — заявлен или частично подкреплён, красный — указан, но пока без доказательств.",
        full: [
          "Цвет — сигнал честности, а не оценка того, насколько вы хороши. Зелёный отмечает навык, который руководитель подтвердил по реально выполненной работе; жёлтый — навык, который вы заявили или который частично подкреплён активностью; красный — навык, который вы указали, но для которого пока нет доказательств.",
          "Смысл — наглядно разделять самозаявленные и подтверждённые навыки, чтобы и вы, и работодатель видели, что доказано. Красный сигнал — не критика, он просто показывает, где дальше можно добавить подтверждение.",
        ],
        title: "Красный, жёлтый и зелёный сигналы навыков",
        desc: "Что значат красный, жёлтый и зелёный сигналы навыков на LabourMarket.ai: прозрачная мера того, сколько доказательств за каждым навыком.",
      },
      nl: {
        slug: "wat-betekenen-rode-gele-groene-vaardigheidssignalen",
        h1: "Wat betekenen de rode, gele en groene vaardigheidssignalen?",
        short: "Ze tonen hoeveel bewijs een vaardigheid onderbouwt: groen is bevestigd uit echt werk, geel is gedeclareerd of deels onderbouwd, en rood is opgegeven maar nog zonder bewijs.",
        full: [
          "De kleur is een eerlijkheidssignaal, geen cijfer voor hoe goed je bent. Groen markeert een vaardigheid die een leidinggevende heeft bevestigd op basis van werk dat je echt deed; geel markeert een vaardigheid die je hebt opgegeven of die enige onderbouwende activiteit heeft; rood markeert een vaardigheid die je hebt vermeld maar waarvoor nog geen bewijs is.",
          "Het doel is zelf-opgegeven en onderbouwde vaardigheden zichtbaar gescheiden te houden, zodat jij én een werkgever zien wat bewezen is. Een rood signaal is geen kritiek — het laat gewoon zien waar bevestiging als volgende kan worden toegevoegd.",
        ],
        title: "Rode, gele en groene vaardigheidssignalen uitgelegd",
        desc: "Wat de rode, gele en groene vaardigheidssignalen op LabourMarket.ai betekenen: een transparante maat voor hoeveel bewijs elke vaardigheid onderbouwt.",
      },
      de: {
        slug: "was-bedeuten-rote-gelbe-gruene-faehigkeitssignale",
        h1: "Was bedeuten die roten, gelben und grünen Fähigkeitssignale?",
        short: "Sie zeigen, wie viel Beleg eine Fähigkeit stützt: Grün heißt aus echter Arbeit bestätigt, Gelb heißt angegeben oder teils gestützt, und Rot heißt genannt, aber noch ohne Beleg.",
        full: [
          "Die Farbe ist ein Ehrlichkeitssignal, keine Note dafür, wie gut Sie sind. Grün kennzeichnet eine Fähigkeit, die eine Führungskraft anhand tatsächlich geleisteter Arbeit bestätigt hat; Gelb kennzeichnet eine Fähigkeit, die Sie angegeben haben oder die etwas stützende Aktivität hat; Rot kennzeichnet eine Fähigkeit, die Sie genannt haben, für die es aber noch keinen Beleg gibt.",
          "Der Zweck ist, selbst angegebene und belegte Fähigkeiten sichtbar getrennt zu halten, damit Sie und ein Arbeitgeber erkennen, was belegt ist. Ein rotes Signal ist keine Kritik — es zeigt nur, wo als Nächstes eine Bestätigung ergänzt werden könnte.",
        ],
        title: "Rote, gelbe und grüne Fähigkeitssignale erklärt",
        desc: "Was die roten, gelben und grünen Fähigkeitssignale auf LabourMarket.ai bedeuten: ein transparentes Maß dafür, wie viel Beleg jede Fähigkeit stützt.",
      },
    },
  },
  {
    id: "AE-0100",
    per: {
      en: {
        slug: "how-is-a-skill-confirmed",
        h1: "How is a skill confirmed on the platform?",
        short: "A skill becomes confirmed when someone who saw your real work — usually a manager or team lead — verifies it. Until then it stays a declared skill, clearly marked as such.",
        full: [
          "Confirmation is tied to evidence, not to a test or a self-assessment. When you have done work that demonstrates a skill, a person who can vouch for that work confirms it, and the skill moves from declared to confirmed with a record of who confirmed it.",
          "This keeps the signal honest: a confirmed skill means a real person stood behind real work, and it cannot be granted by the platform itself or bought. You can hold declared skills indefinitely; confirmation is simply a stronger, evidenced state.",
        ],
        title: "How a skill is confirmed on LabourMarket.ai",
        desc: "How a skill is confirmed on LabourMarket.ai: a person who saw your real work verifies it, moving it from declared to evidenced.",
      },
      lt: {
        slug: "kaip-patvirtinamas-igudis",
        h1: "Kaip įgūdis patvirtinamas platformoje?",
        short: "Įgūdis tampa patvirtintu, kai jį patvirtina žmogus, matęs jūsų realų darbą — dažniausiai vadovas ar komandos vadovas. Iki tol jis lieka deklaruotas ir aiškiai taip pažymėtas.",
        full: [
          "Patvirtinimas siejamas su įrodymu, o ne su testu ar savęs vertinimu. Kai atlikote darbą, kuris parodo įgūdį, už tą darbą galintis laiduoti žmogus jį patvirtina, ir įgūdis iš deklaruoto tampa patvirtintu su įrašu, kas patvirtino.",
          "Taip signalas lieka sąžiningas: patvirtintas įgūdis reiškia, kad realus žmogus stovi už realaus darbo, ir jo negali suteikti pati platforma ar nupirkti. Deklaruotus įgūdžius galite turėti neribotai; patvirtinimas tiesiog yra stipresnė, įrodyta būsena.",
        ],
        title: "Kaip patvirtinamas įgūdis LabourMarket.ai",
        desc: "Kaip įgūdis patvirtinamas LabourMarket.ai: jūsų realų darbą matęs žmogus jį patvirtina, ir įgūdis iš deklaruoto tampa įrodytu.",
      },
      ru: {
        slug: "kak-podtverzhdaetsya-navyk",
        h1: "Как навык подтверждается на платформе?",
        short: "Навык становится подтверждённым, когда его удостоверяет тот, кто видел вашу реальную работу — обычно руководитель или тимлид. До этого он остаётся заявленным и явно так помечен.",
        full: [
          "Подтверждение связано с доказательством, а не с тестом или самооценкой. Когда вы выполнили работу, демонстрирующую навык, человек, способный поручиться за эту работу, подтверждает его, и навык переходит из заявленного в подтверждённый с записью о том, кто подтвердил.",
          "Так сигнал остаётся честным: подтверждённый навык означает, что реальный человек ручается за реальную работу, и его нельзя выдать самой платформой или купить. Заявленные навыки можно держать сколько угодно; подтверждение — просто более сильное, доказанное состояние.",
        ],
        title: "Как навык подтверждается на LabourMarket.ai",
        desc: "Как навык подтверждается на LabourMarket.ai: человек, видевший вашу реальную работу, удостоверяет его, переводя из заявленного в доказанный.",
      },
      nl: {
        slug: "hoe-wordt-een-vaardigheid-bevestigd",
        h1: "Hoe wordt een vaardigheid op het platform bevestigd?",
        short: "Een vaardigheid wordt bevestigd wanneer iemand die je echte werk zag — meestal een leidinggevende of teamlead — die verifieert. Tot dan blijft het een gedeclareerde vaardigheid, duidelijk zo gemarkeerd.",
        full: [
          "Bevestiging is gekoppeld aan bewijs, niet aan een test of een zelfbeoordeling. Als je werk hebt gedaan dat een vaardigheid aantoont, bevestigt iemand die voor dat werk kan instaan die, en gaat de vaardigheid van gedeclareerd naar bevestigd, met een registratie van wie bevestigde.",
          "Zo blijft het signaal eerlijk: een bevestigde vaardigheid betekent dat een echt persoon achter echt werk stond, en die kan niet door het platform zelf worden verleend of gekocht. Gedeclareerde vaardigheden mag je onbeperkt houden; bevestiging is simpelweg een sterkere, onderbouwde staat.",
        ],
        title: "Hoe een vaardigheid wordt bevestigd op LabourMarket.ai",
        desc: "Hoe een vaardigheid wordt bevestigd op LabourMarket.ai: iemand die je echte werk zag verifieert die, van gedeclareerd naar onderbouwd.",
      },
      de: {
        slug: "wie-wird-eine-faehigkeit-bestaetigt",
        h1: "Wie wird eine Fähigkeit auf der Plattform bestätigt?",
        short: "Eine Fähigkeit wird bestätigt, wenn jemand, der Ihre echte Arbeit gesehen hat — meist eine Führungskraft oder Teamleitung — sie verifiziert. Bis dahin bleibt sie eine angegebene Fähigkeit, klar so gekennzeichnet.",
        full: [
          "Bestätigung ist an Belege gebunden, nicht an einen Test oder eine Selbsteinschätzung. Wenn Sie Arbeit geleistet haben, die eine Fähigkeit zeigt, bestätigt eine Person, die für diese Arbeit einstehen kann, sie, und die Fähigkeit wechselt von angegeben zu bestätigt, mit einem Vermerk, wer bestätigt hat.",
          "So bleibt das Signal ehrlich: Eine bestätigte Fähigkeit bedeutet, dass ein echter Mensch für echte Arbeit einstand, und sie kann nicht von der Plattform selbst vergeben oder gekauft werden. Angegebene Fähigkeiten können Sie unbegrenzt behalten; Bestätigung ist einfach ein stärkerer, belegter Zustand.",
        ],
        title: "Wie eine Fähigkeit auf LabourMarket.ai bestätigt wird",
        desc: "Wie eine Fähigkeit auf LabourMarket.ai bestätigt wird: jemand, der Ihre echte Arbeit sah, verifiziert sie — von angegeben zu belegt.",
      },
    },
  },
  {
    id: "AE-0187",
    per: {
      en: {
        slug: "how-does-the-platform-discover-adjacent-professions",
        h1: "How does the platform help me discover adjacent professions?",
        short: "It compares the skills you already hold to the skills different professions need, then surfaces the ones with the most overlap as realistic adjacent directions — with the connecting skills shown.",
        full: [
          "Rather than asking you to guess, the platform starts from your actual skills. It looks at which professions share many of them and presents those as adjacent directions, ordered by how much of the move you can already make.",
          "For each direction you see the skills that connect you to it and, honestly, the ones you might still need — so a suggestion is a starting point for a real decision, not a promise. The directions come from your skills, not from a fixed list of popular jobs.",
        ],
        title: "Discovering adjacent professions on LabourMarket.ai",
        desc: "How LabourMarket.ai helps you discover adjacent professions: it matches your existing skills to related roles and shows the connecting skills.",
      },
      lt: {
        slug: "kaip-platforma-padeda-atrasti-gretimas-profesijas",
        h1: "Kaip platforma padeda atrasti gretimas profesijas?",
        short: "Ji palygina jūsų jau turimus įgūdžius su tuo, ko reikia įvairioms profesijoms, ir parodo daugiausiai sutampančias kaip realias gretimas kryptis — su jas siejančiais įgūdžiais.",
        full: [
          "Užuot prašiusi spėti, platforma pradeda nuo jūsų realių įgūdžių. Ji žiūri, kurios profesijos turi daug tų pačių įgūdžių, ir pateikia jas kaip gretimas kryptis, surikiuotas pagal tai, kiek perėjimo jau galite atlikti.",
          "Kiekvienai krypčiai matote įgūdžius, kurie jus su ja sieja, ir sąžiningai — kurių dar gali trūkti — todėl pasiūlymas yra atspirties taškas realiam sprendimui, o ne pažadas. Kryptys kyla iš jūsų įgūdžių, ne iš fiksuoto populiarių darbų sąrašo.",
        ],
        title: "Gretimų profesijų atradimas LabourMarket.ai",
        desc: "Kaip LabourMarket.ai padeda atrasti gretimas profesijas: sugretina turimus įgūdžius su susijusiomis pareigybėmis ir parodo siejančius įgūdžius.",
      },
      ru: {
        slug: "kak-platforma-pomogaet-otkryt-smezhnye-professii",
        h1: "Как платформа помогает открыть смежные профессии?",
        short: "Она сравнивает уже имеющиеся у вас навыки с тем, что нужно разным профессиям, и показывает наиболее совпадающие как реалистичные смежные направления — со связующими навыками.",
        full: [
          "Вместо того чтобы просить вас угадывать, платформа начинает с ваших реальных навыков. Она смотрит, какие профессии разделяют многие из них, и представляет их как смежные направления, упорядоченные по тому, какую часть перехода вы уже можете сделать.",
          "Для каждого направления видно навыки, которые вас с ним связывают, и честно — те, которых может не хватать, — поэтому предложение это отправная точка для реального решения, а не обещание. Направления исходят из ваших навыков, а не из фиксированного списка популярных работ.",
        ],
        title: "Открытие смежных профессий на LabourMarket.ai",
        desc: "Как LabourMarket.ai помогает открыть смежные профессии: сопоставляет имеющиеся навыки со связанными ролями и показывает связующие навыки.",
      },
      nl: {
        slug: "hoe-helpt-het-platform-aangrenzende-beroepen-ontdekken",
        h1: "Hoe helpt het platform mij aangrenzende beroepen te ontdekken?",
        short: "Het vergelijkt de vaardigheden die je al hebt met wat verschillende beroepen vragen en toont de meest overlappende als realistische aangrenzende richtingen — met de verbindende vaardigheden erbij.",
        full: [
          "In plaats van je te laten gissen, begint het platform bij je echte vaardigheden. Het kijkt welke beroepen er veel van delen en presenteert die als aangrenzende richtingen, geordend naar hoeveel van de stap je al kunt maken.",
          "Voor elke richting zie je de vaardigheden die je ermee verbinden en, eerlijk, die je mogelijk nog nodig hebt — zo is een suggestie een startpunt voor een echte beslissing, geen belofte. De richtingen komen uit je vaardigheden, niet uit een vaste lijst populaire banen.",
        ],
        title: "Aangrenzende beroepen ontdekken op LabourMarket.ai",
        desc: "Hoe LabourMarket.ai je helpt aangrenzende beroepen te ontdekken: het matcht je bestaande vaardigheden aan verwante rollen en toont de verbindende vaardigheden.",
      },
      de: {
        slug: "wie-hilft-die-plattform-benachbarte-berufe-zu-entdecken",
        h1: "Wie hilft mir die Plattform, benachbarte Berufe zu entdecken?",
        short: "Sie vergleicht Ihre vorhandenen Fähigkeiten mit dem, was verschiedene Berufe verlangen, und zeigt die am stärksten überlappenden als realistische benachbarte Richtungen — samt der verbindenden Fähigkeiten.",
        full: [
          "Statt Sie raten zu lassen, beginnt die Plattform bei Ihren echten Fähigkeiten. Sie prüft, welche Berufe viele davon teilen, und zeigt diese als benachbarte Richtungen, geordnet danach, wie viel des Wechsels Sie bereits gehen können.",
          "Zu jeder Richtung sehen Sie die verbindenden Fähigkeiten und ehrlich jene, die noch fehlen könnten — so ist ein Vorschlag ein Ausgangspunkt für eine echte Entscheidung, kein Versprechen. Die Richtungen ergeben sich aus Ihren Fähigkeiten, nicht aus einer festen Liste beliebter Jobs.",
        ],
        title: "Benachbarte Berufe auf LabourMarket.ai entdecken",
        desc: "Wie LabourMarket.ai Ihnen hilft, benachbarte Berufe zu entdecken: Es gleicht Ihre vorhandenen Fähigkeiten mit verwandten Rollen ab und zeigt die verbindenden Fähigkeiten.",
      },
    },
  },
  {
    id: "AE-0188",
    per: {
      en: {
        slug: "how-do-i-know-which-career-change-is-realistic",
        h1: "How do I know which career change is realistic for my skills?",
        short: "Compare the skills a direction needs with the ones you already have. The more they overlap and the smaller the remaining gap, the more realistic the change is right now.",
        full: [
          "A realistic change is one where most of the required skills are already yours and the missing piece is learnable in a reasonable step, not a full restart. LabourMarket.ai makes this visible by showing, for each direction, the overlap and the specific gap.",
          "Use that to weigh effort against fit: a direction with a large overlap and a small, clear gap is a near-term move; one with a small overlap is a longer project. The tool informs the decision honestly — it does not decide for you or hide what a change would take.",
        ],
        title: "Which career change is realistic for your skills?",
        desc: "How to tell which career change is realistic on LabourMarket.ai: weigh the skill overlap against the remaining gap for each direction.",
      },
      lt: {
        slug: "kaip-suprasti-kuris-karjeros-keitimas-realus",
        h1: "Kaip suprasti, kuris karjeros keitimas realus mano įgūdžiams?",
        short: "Palyginkite, kokių įgūdžių reikia krypčiai, su tais, kuriuos jau turite. Kuo daugiau jie sutampa ir kuo mažesnis likęs skirtumas, tuo keitimas šiuo metu realesnis.",
        full: [
          "Realus keitimas — kai didžioji dalis reikalingų įgūdžių jau jūsų, o trūkstamą galima išmokti pagrįstu žingsniu, ne pradedant iš naujo. LabourMarket.ai tai parodo matomai: kiekvienai krypčiai atskleidžia sutapimą ir konkretų trūkumą.",
          "Tuo remdamiesi pasverkite pastangas ir tinkamumą: kryptis su dideliu sutapimu ir mažu, aiškiu trūkumu — artimo laikotarpio žingsnis; kryptis su mažu sutapimu — ilgesnis projektas. Įrankis sąžiningai padeda apsispręsti — už jus nesprendžia ir neslepia, ko keitimas pareikalaus.",
        ],
        title: "Kuris karjeros keitimas realus jūsų įgūdžiams?",
        desc: "Kaip suprasti, kuris karjeros keitimas realus LabourMarket.ai: palyginkite įgūdžių sutapimą su likusiu trūkumu kiekvienai krypčiai.",
      },
      ru: {
        slug: "kak-ponyat-kakaya-smena-kariery-realistichna",
        h1: "Как понять, какая смена карьеры реалистична для моих навыков?",
        short: "Сравните навыки, нужные направлению, с теми, что у вас уже есть. Чем больше совпадение и меньше оставшийся разрыв, тем реалистичнее смена прямо сейчас.",
        full: [
          "Реалистичная смена — та, где большинство требуемых навыков уже ваши, а недостающее можно освоить разумным шагом, а не начиная с нуля. LabourMarket.ai делает это наглядным, показывая для каждого направления совпадение и конкретный разрыв.",
          "На этой основе взвесьте усилия и соответствие: направление с большим совпадением и небольшим ясным разрывом — шаг ближайшего времени; с малым совпадением — более долгий проект. Инструмент честно помогает решению — не решает за вас и не скрывает, чего смена потребует.",
        ],
        title: "Какая смена карьеры реалистична для ваших навыков?",
        desc: "Как понять, какая смена карьеры реалистична на LabourMarket.ai: взвесьте совпадение навыков и оставшийся разрыв для каждого направления.",
      },
      nl: {
        slug: "hoe-weet-ik-welke-loopbaanswitch-realistisch-is",
        h1: "Hoe weet ik welke loopbaanswitch realistisch is voor mijn vaardigheden?",
        short: "Vergelijk de vaardigheden die een richting vraagt met wat je al hebt. Hoe groter de overlap en hoe kleiner het resterende gat, hoe realistischer de switch nu is.",
        full: [
          "Een realistische switch is er een waarbij de meeste gevraagde vaardigheden al van jou zijn en het ontbrekende stuk met een redelijke stap te leren is, geen volledige herstart. LabourMarket.ai maakt dit zichtbaar door per richting de overlap en het specifieke gat te tonen.",
          "Gebruik dat om inspanning tegen fit af te wegen: een richting met veel overlap en een klein, duidelijk gat is een stap op korte termijn; een met weinig overlap is een langer project. De tool ondersteunt de beslissing eerlijk — het beslist niet voor je en verbergt niet wat een switch kost.",
        ],
        title: "Welke loopbaanswitch is realistisch voor je vaardigheden?",
        desc: "Hoe je weet welke loopbaanswitch realistisch is op LabourMarket.ai: weeg de vaardighedenoverlap af tegen het resterende gat per richting.",
      },
      de: {
        slug: "wie-erkenne-ich-welcher-berufswechsel-realistisch-ist",
        h1: "Wie erkenne ich, welcher Berufswechsel für meine Fähigkeiten realistisch ist?",
        short: "Vergleichen Sie die Fähigkeiten, die eine Richtung verlangt, mit denen, die Sie schon haben. Je größer die Überschneidung und je kleiner die verbleibende Lücke, desto realistischer ist der Wechsel jetzt.",
        full: [
          "Ein realistischer Wechsel ist einer, bei dem die meisten geforderten Fähigkeiten bereits Ihre sind und das Fehlende in einem vernünftigen Schritt erlernbar ist, kein kompletter Neustart. LabourMarket.ai macht das sichtbar, indem es je Richtung die Überschneidung und die konkrete Lücke zeigt.",
          "Wägen Sie damit Aufwand gegen Passung ab: eine Richtung mit großer Überschneidung und kleiner, klarer Lücke ist ein Schritt für die nahe Zukunft; eine mit geringer Überschneidung ein längeres Projekt. Das Werkzeug unterstützt die Entscheidung ehrlich — es entscheidet nicht für Sie und verschweigt nicht, was ein Wechsel erfordert.",
        ],
        title: "Welcher Berufswechsel ist für Ihre Fähigkeiten realistisch?",
        desc: "Wie Sie erkennen, welcher Berufswechsel auf LabourMarket.ai realistisch ist: Fähigkeiten-Überschneidung gegen die verbleibende Lücke je Richtung abwägen.",
      },
    },
  },
  {
    id: "AE-0362",
    per: {
      en: {
        slug: "what-information-does-a-work-need-require",
        h1: "What information does a work need require?",
        short: "The essentials: the role or type of work, how many people, the country and location, when it starts and for how long, and any language requirement. Everything else is optional detail.",
        full: [
          "A work need is a structured description of what you are looking for, so matching can be precise. The required parts are the role or work type, team size, country and location, the start period and duration, and any language you need — these let the platform find people whose skills and availability actually fit.",
          "You can add optional detail — specific skills, context about the work — to sharpen the match, and save the need as a draft before submitting. The need stays private to your side; workers are matched to it and you review those whose skills fit, always with an honest explanation rather than one overall score for a person.",
        ],
        steps: [
          "State the role or type of work and how many people you need.",
          "Set the country, location, start period and duration.",
          "Add any language requirement and optional skills, then save or submit.",
        ],
        title: "What a work need requires on LabourMarket.ai",
        desc: "The information a LabourMarket.ai work need requires: role, team size, location, timing and language — with optional detail to sharpen the match.",
      },
      lt: {
        slug: "kokios-informacijos-reikia-darbo-poreikiui",
        h1: "Kokios informacijos reikia darbo poreikiui?",
        short: "Būtina: pareigybė ar darbo tipas, kiek žmonių, šalis ir vieta, kada prasideda ir kiek trunka, bei kalbos reikalavimas. Visa kita — neprivaloma detalė.",
        full: [
          "Darbo poreikis — struktūruotas aprašymas, ko ieškote, kad atitiktis būtų tiksli. Privalomos dalys: pareigybė ar darbo tipas, komandos dydis, šalis ir vieta, pradžios laikotarpis ir trukmė bei reikalinga kalba — jos leidžia platformai rasti žmones, kurių įgūdžiai ir prieinamumas tikrai tinka.",
          "Galite pridėti neprivalomos detalės — konkrečius įgūdžius, darbo kontekstą — kad atitiktis būtų tikslesnė, ir išsaugoti poreikį kaip juodraštį prieš pateikdami. Poreikis lieka privatus jūsų pusėje; darbuotojai sugretinami su juo, o jūs peržiūrite tuos, kurių įgūdžiai tinka, visada su sąžiningu paaiškinimu, o ne vienu bendru žmogaus balu.",
        ],
        steps: [
          "Nurodykite pareigybę ar darbo tipą ir kiek žmonių reikia.",
          "Nustatykite šalį, vietą, pradžios laikotarpį ir trukmę.",
          "Pridėkite kalbos reikalavimą ir neprivalomus įgūdžius, tada išsaugokite ar pateikite.",
        ],
        title: "Ko reikia darbo poreikiui LabourMarket.ai",
        desc: "Kokios informacijos reikia LabourMarket.ai darbo poreikiui: pareigybė, komandos dydis, vieta, laikas ir kalba — su neprivaloma detale tikslesnei atitikčiai.",
      },
      ru: {
        slug: "kakaya-informatsiya-nuzhna-dlya-potrebnosti-v-rabotnikakh",
        h1: "Какая информация нужна для потребности в работниках?",
        short: "Обязательное: роль или тип работы, сколько людей, страна и место, когда начинается и на какой срок, и требование к языку. Всё остальное — необязательная деталь.",
        full: [
          "Потребность в работниках — это структурированное описание того, что вы ищете, чтобы подбор был точным. Обязательные части: роль или тип работы, размер команды, страна и место, период начала и длительность, а также нужный язык — они позволяют платформе найти людей, чьи навыки и доступность действительно подходят.",
          "Можно добавить необязательные детали — конкретные навыки, контекст работы — чтобы уточнить подбор, и сохранить потребность как черновик перед отправкой. Потребность остаётся приватной на вашей стороне; работники сопоставляются с ней, а вы просматриваете тех, чьи навыки подходят, всегда с честным объяснением, а не с единым общим баллом человека.",
        ],
        steps: [
          "Укажите роль или тип работы и сколько людей нужно.",
          "Задайте страну, место, период начала и длительность.",
          "Добавьте требование к языку и необязательные навыки, затем сохраните или отправьте.",
        ],
        title: "Что нужно для потребности в работниках на LabourMarket.ai",
        desc: "Какая информация нужна для потребности в работниках на LabourMarket.ai: роль, размер команды, место, сроки и язык — с необязательной деталью для точности.",
      },
      nl: {
        slug: "welke-informatie-vraagt-een-personeelsbehoefte",
        h1: "Welke informatie vraagt een personeelsbehoefte?",
        short: "Het essentiële: de rol of het soort werk, hoeveel mensen, het land en de locatie, wanneer het start en voor hoe lang, en een eventuele taaleis. De rest is optionele detail.",
        full: [
          "Een personeelsbehoefte is een gestructureerde beschrijving van wat je zoekt, zodat matching precies kan zijn. De verplichte delen zijn de rol of het soort werk, de teamgrootte, het land en de locatie, de startperiode en duur, en een eventuele taal — daarmee vindt het platform mensen van wie de vaardigheden en beschikbaarheid echt passen.",
          "Je kunt optionele detail toevoegen — specifieke vaardigheden, context over het werk — om de match te scherpen, en de behoefte als concept opslaan voordat je indient. De behoefte blijft privé aan jouw kant; werkenden worden eraan gematcht en jij beoordeelt wie qua vaardigheden past, altijd met een eerlijke uitleg in plaats van één totaalscore voor een persoon.",
        ],
        steps: [
          "Benoem de rol of het soort werk en hoeveel mensen je nodig hebt.",
          "Stel het land, de locatie, de startperiode en de duur in.",
          "Voeg een eventuele taaleis en optionele vaardigheden toe, en sla op of dien in.",
        ],
        title: "Wat een personeelsbehoefte vraagt op LabourMarket.ai",
        desc: "Welke informatie een LabourMarket.ai-personeelsbehoefte vraagt: rol, teamgrootte, locatie, timing en taal — met optionele detail voor een scherpere match.",
      },
      de: {
        slug: "welche-informationen-braucht-ein-personalbedarf",
        h1: "Welche Informationen braucht ein Personalbedarf?",
        short: "Das Wesentliche: Rolle oder Art der Arbeit, wie viele Personen, Land und Ort, wann es beginnt und wie lange, sowie eine etwaige Sprachanforderung. Alles Weitere ist optionales Detail.",
        full: [
          "Ein Personalbedarf ist eine strukturierte Beschreibung dessen, was Sie suchen, damit der Abgleich präzise sein kann. Die Pflichtangaben sind Rolle oder Art der Arbeit, Teamgröße, Land und Ort, Startzeitraum und Dauer sowie eine benötigte Sprache — damit findet die Plattform Menschen, deren Fähigkeiten und Verfügbarkeit wirklich passen.",
          "Sie können optionale Angaben ergänzen — bestimmte Fähigkeiten, Kontext zur Arbeit — um den Abgleich zu schärfen, und den Bedarf vor dem Einreichen als Entwurf speichern. Der Bedarf bleibt auf Ihrer Seite privat; Arbeitskräfte werden ihm zugeordnet, und Sie prüfen jene, deren Fähigkeiten passen, stets mit einer ehrlichen Begründung statt mit einem Gesamtwert für eine Person.",
        ],
        steps: [
          "Nennen Sie Rolle oder Art der Arbeit und wie viele Personen Sie brauchen.",
          "Legen Sie Land, Ort, Startzeitraum und Dauer fest.",
          "Fügen Sie eine etwaige Sprachanforderung und optionale Fähigkeiten hinzu, dann speichern oder einreichen.",
        ],
        title: "Was ein Personalbedarf auf LabourMarket.ai braucht",
        desc: "Welche Informationen ein LabourMarket.ai-Personalbedarf braucht: Rolle, Teamgröße, Ort, Zeit und Sprache — mit optionalem Detail für einen schärferen Abgleich.",
      },
    },
  },
  {
    id: "AE-0512",
    per: {
      en: {
        slug: "who-is-labourmarket-ai-for",
        h1: "Who is LabourMarket.ai for?",
        short: "For everyone in the world of work: people of any profession or education level looking for work or growth, and employers, companies, teams and agencies looking for people.",
        full: [
          "On the worker side it is for anyone — trades and manual work, care, services, office and professional roles, graduates and students, people changing direction — not one narrow group. Whatever your level, you can build a profile, show real skills and find opportunities.",
          "On the organisation side it is for employers, companies, teams and agencies that need to find workers, build teams or run projects. The platform is designed so both sides meet honestly, across professions and across Europe.",
        ],
        title: "Who LabourMarket.ai is for",
        desc: "Who LabourMarket.ai is for: workers of every profession and level, and employers, companies, teams and agencies — across Europe.",
      },
      lt: {
        slug: "kam-skirta-labourmarket-ai",
        h1: "Kam skirta LabourMarket.ai?",
        short: "Visiems darbo pasaulyje: bet kurios profesijos ar išsilavinimo žmonėms, ieškantiems darbo ar augimo, ir darbdaviams, įmonėms, komandoms bei agentūroms, ieškančioms žmonių.",
        full: [
          "Darbuotojų pusėje ji skirta bet kam — amatams ir fiziniam darbui, priežiūrai, paslaugoms, biuro ir profesinėms pareigoms, absolventams ir studentams, keičiantiems kryptį — ne vienai siaurai grupei. Kad ir koks jūsų lygis, galite susikurti profilį, parodyti realius įgūdžius ir rasti galimybių.",
          "Organizacijų pusėje ji skirta darbdaviams, įmonėms, komandoms ir agentūroms, kurioms reikia rasti darbuotojų, suburti komandas ar vykdyti projektus. Platforma sukurta taip, kad abi pusės susitiktų sąžiningai, įvairiose profesijose ir visoje Europoje.",
        ],
        title: "Kam skirta LabourMarket.ai",
        desc: "Kam skirta LabourMarket.ai: visų profesijų ir lygių darbuotojams bei darbdaviams, įmonėms, komandoms ir agentūroms — visoje Europoje.",
      },
      ru: {
        slug: "dlya-kogo-labourmarket-ai",
        h1: "Для кого LabourMarket.ai?",
        short: "Для всех в мире труда: людей любой профессии и уровня образования, ищущих работу или рост, и работодателей, компаний, команд и агентств, ищущих людей.",
        full: [
          "Со стороны работников это для любого — ремёсла и физический труд, уход, услуги, офисные и профессиональные роли, выпускники и студенты, меняющие направление — не одна узкая группа. Каким бы ни был ваш уровень, вы можете создать профиль, показать реальные навыки и найти возможности.",
          "Со стороны организаций это для работодателей, компаний, команд и агентств, которым нужно найти работников, собрать команды или вести проекты. Платформа устроена так, чтобы обе стороны встречались честно, по разным профессиям и по всей Европе.",
        ],
        title: "Для кого LabourMarket.ai",
        desc: "Для кого LabourMarket.ai: для работников любой профессии и уровня и для работодателей, компаний, команд и агентств — по всей Европе.",
      },
      nl: {
        slug: "voor-wie-is-labourmarket-ai",
        h1: "Voor wie is LabourMarket.ai?",
        short: "Voor iedereen in de wereld van werk: mensen van elk beroep of opleidingsniveau die werk of groei zoeken, en werkgevers, bedrijven, teams en bureaus die mensen zoeken.",
        full: [
          "Aan de kant van werkenden is het voor iedereen — ambachten en handwerk, zorg, diensten, kantoor- en professionele rollen, afgestudeerden en studenten, mensen die van richting veranderen — niet één smalle groep. Wat je niveau ook is, je kunt een profiel bouwen, echte vaardigheden tonen en kansen vinden.",
          "Aan de kant van organisaties is het voor werkgevers, bedrijven, teams en bureaus die mensen willen vinden, teams willen bouwen of projecten willen draaien. Het platform is zo opgezet dat beide kanten elkaar eerlijk ontmoeten, over beroepen heen en door heel Europa.",
        ],
        title: "Voor wie LabourMarket.ai is",
        desc: "Voor wie LabourMarket.ai is: werkenden van elk beroep en niveau, en werkgevers, bedrijven, teams en bureaus — door heel Europa.",
      },
      de: {
        slug: "fuer-wen-ist-labourmarket-ai",
        h1: "Für wen ist LabourMarket.ai?",
        short: "Für alle in der Arbeitswelt: Menschen jedes Berufs oder Bildungsniveaus, die Arbeit oder Wachstum suchen, und Arbeitgeber, Unternehmen, Teams und Agenturen, die Menschen suchen.",
        full: [
          "Auf der Seite der Arbeitskräfte ist es für alle — Handwerk und körperliche Arbeit, Pflege, Dienstleistungen, Büro- und Fachrollen, Absolventen und Studierende, Menschen im Richtungswechsel — nicht eine enge Gruppe. Welches Niveau Sie auch haben, Sie können ein Profil aufbauen, echte Fähigkeiten zeigen und Möglichkeiten finden.",
          "Auf der Seite der Organisationen ist es für Arbeitgeber, Unternehmen, Teams und Agenturen, die Arbeitskräfte finden, Teams bilden oder Projekte umsetzen müssen. Die Plattform ist so angelegt, dass beide Seiten sich ehrlich begegnen, über Berufe hinweg und in ganz Europa.",
        ],
        title: "Für wen LabourMarket.ai ist",
        desc: "Für wen LabourMarket.ai ist: Arbeitskräfte jedes Berufs und Niveaus und Arbeitgeber, Unternehmen, Teams und Agenturen — in ganz Europa.",
      },
    },
  },
  {
    id: "AE-0513",
    per: {
      en: {
        slug: "is-labourmarket-ai-only-for-one-sector",
        h1: "Is LabourMarket.ai only for one sector?",
        short: "No. It is cross-sector by design — the same skill-based approach works for trades, care, services, logistics, office and professional work alike, not a single industry.",
        full: [
          "The platform describes people by their real skills rather than by one industry label, so it is not tied to a particular sector. A profession in construction, healthcare, hospitality, transport or an office role all fit the same model of skills, evidence and matching.",
          "This is deliberate: skills often carry across sectors, and limiting the platform to one would hide realistic opportunities and directions. Whatever field you come from, you are described the same honest way and matched on what you can actually do.",
        ],
        title: "Is LabourMarket.ai only for one sector?",
        desc: "LabourMarket.ai is cross-sector by design: its skill-based model works across trades, care, services, logistics and office work — not one industry.",
      },
      lt: {
        slug: "ar-labourmarket-ai-tik-vienam-sektoriui",
        h1: "Ar LabourMarket.ai skirta tik vienam sektoriui?",
        short: "Ne. Ji tarpsektorinė iš esmės — tas pats įgūdžiais grįstas principas tinka amatams, priežiūrai, paslaugoms, logistikai, biuro ir profesiniam darbui, o ne vienai pramonės šakai.",
        full: [
          "Platforma apibūdina žmones pagal realius įgūdžius, o ne pagal vieną pramonės etiketę, todėl nėra pririšta prie konkretaus sektoriaus. Profesija statyboje, sveikatos priežiūroje, svetingumo srityje, transporte ar biuro pareigos — visos telpa į tą patį įgūdžių, įrodymų ir atitikties modelį.",
          "Tai sąmoninga: įgūdžiai dažnai persikelia tarp sektorių, o apribojus platformą vienu, būtų paslėptos realios galimybės ir kryptys. Iš kokios srities beateitumėte, esate apibūdinami tuo pačiu sąžiningu būdu ir sugretinami pagal tai, ką realiai mokate.",
        ],
        title: "Ar LabourMarket.ai tik vienam sektoriui?",
        desc: "LabourMarket.ai yra tarpsektorinė: įgūdžiais grįstas modelis tinka amatams, priežiūrai, paslaugoms, logistikai ir biuro darbui — ne vienai šakai.",
      },
      ru: {
        slug: "labourmarket-ai-tolko-dlya-odnogo-sektora",
        h1: "LabourMarket.ai только для одного сектора?",
        short: "Нет. Она межсекторная по замыслу — один и тот же подход на основе навыков работает для ремёсел, ухода, услуг, логистики, офисной и профессиональной работы, а не для одной отрасли.",
        full: [
          "Платформа описывает людей по реальным навыкам, а не по одной отраслевой метке, поэтому не привязана к конкретному сектору. Профессия в строительстве, здравоохранении, гостеприимстве, транспорте или офисная роль — все вписываются в одну модель навыков, доказательств и подбора.",
          "Это сделано намеренно: навыки часто переносятся между секторами, а ограничение платформы одним скрыло бы реальные возможности и направления. Из какой бы сферы вы ни пришли, вас описывают одинаково честно и сопоставляют по тому, что вы реально умеете.",
        ],
        title: "LabourMarket.ai только для одного сектора?",
        desc: "LabourMarket.ai межсекторная: модель на основе навыков работает для ремёсел, ухода, услуг, логистики и офисной работы — не для одной отрасли.",
      },
      nl: {
        slug: "is-labourmarket-ai-alleen-voor-een-sector",
        h1: "Is LabourMarket.ai alleen voor één sector?",
        short: "Nee. Het is sectoroverstijgend van opzet — dezelfde op vaardigheden gebaseerde aanpak werkt voor ambachten, zorg, diensten, logistiek, kantoor- en professioneel werk, niet één branche.",
        full: [
          "Het platform beschrijft mensen aan de hand van hun echte vaardigheden in plaats van één branchelabel, dus is het niet aan een bepaalde sector gebonden. Een beroep in de bouw, zorg, horeca, transport of een kantoorrol passen allemaal in hetzelfde model van vaardigheden, bewijs en matching.",
          "Dat is bewust: vaardigheden dragen vaak over tussen sectoren, en het platform tot één beperken zou realistische kansen en richtingen verbergen. Uit welk vakgebied je ook komt, je wordt op dezelfde eerlijke manier beschreven en gematcht op wat je echt kunt.",
        ],
        title: "Is LabourMarket.ai alleen voor één sector?",
        desc: "LabourMarket.ai is sectoroverstijgend: het op vaardigheden gebaseerde model werkt over ambachten, zorg, diensten, logistiek en kantoorwerk — niet één branche.",
      },
      de: {
        slug: "ist-labourmarket-ai-nur-fuer-eine-branche",
        h1: "Ist LabourMarket.ai nur für eine Branche?",
        short: "Nein. Es ist von Grund auf branchenübergreifend — derselbe fähigkeitsbasierte Ansatz funktioniert für Handwerk, Pflege, Dienstleistungen, Logistik, Büro- und Facharbeit, nicht für eine einzelne Branche.",
        full: [
          "Die Plattform beschreibt Menschen anhand ihrer echten Fähigkeiten statt anhand eines Branchenetiketts und ist daher nicht an einen bestimmten Sektor gebunden. Ein Beruf im Bau, im Gesundheitswesen, in der Gastronomie, im Transport oder eine Bürorolle passen alle in dasselbe Modell aus Fähigkeiten, Belegen und Abgleich.",
          "Das ist bewusst so: Fähigkeiten übertragen sich oft zwischen Branchen, und die Plattform auf eine zu beschränken würde realistische Möglichkeiten und Richtungen verbergen. Aus welchem Bereich Sie auch kommen, Sie werden gleich ehrlich beschrieben und danach abgeglichen, was Sie wirklich können.",
        ],
        title: "Ist LabourMarket.ai nur für eine Branche?",
        desc: "LabourMarket.ai ist branchenübergreifend: Das fähigkeitsbasierte Modell funktioniert über Handwerk, Pflege, Dienstleistungen, Logistik und Büroarbeit — nicht eine Branche.",
      },
    },
  },
  {
    id: "AE-0514",
    per: {
      en: {
        slug: "is-labourmarket-ai-only-a-job-board",
        h1: "Is LabourMarket.ai only a job board?",
        short: "No. Finding work is one part. It is also a living work profile, evidence-based skills, discovery of adjacent directions, tools for companies and teams, and labour-market understanding.",
        full: [
          "A job board mostly lists vacancies and stops there. LabourMarket.ai includes opportunity matching, but it is built around your professional identity: a work profile that shows real, evidenced skills, and directions for where those skills can grow.",
          "For organisations it goes further than posting a role — representing a company, describing needs, building teams and running projects. Alongside that, it helps everyone understand the labour market. The listing of opportunities is a feature, not the whole product.",
        ],
        title: "Is LabourMarket.ai only a job board?",
        desc: "LabourMarket.ai is more than a job board: a living work profile, evidenced skills, adjacent-direction discovery, company and team tools, and market insight.",
      },
      lt: {
        slug: "ar-labourmarket-ai-tik-skelbimu-lenta",
        h1: "Ar LabourMarket.ai tik darbo skelbimų lenta?",
        short: "Ne. Darbo radimas — tik dalis. Tai ir gyvas darbo profilis, įrodymais grįsti įgūdžiai, gretimų krypčių atradimas, įrankiai įmonėms ir komandoms bei darbo rinkos supratimas.",
        full: [
          "Skelbimų lenta daugiausiai išvardija laisvas vietas ir tuo baigiasi. LabourMarket.ai apima galimybių sugretinimą, bet yra sukurta aplink jūsų profesinę tapatybę: darbo profilį, rodantį realius, įrodytus įgūdžius, ir kryptis, kur tie įgūdžiai gali augti.",
          "Organizacijoms ji apima daugiau nei pareigybės paskelbimą — įmonės pristatymą, poreikių aprašymą, komandų kūrimą ir projektų vykdymą. Kartu ji padeda visiems suprasti darbo rinką. Galimybių sąrašas — funkcija, o ne visas produktas.",
        ],
        title: "Ar LabourMarket.ai tik skelbimų lenta?",
        desc: "LabourMarket.ai — daugiau nei skelbimų lenta: gyvas darbo profilis, įrodyti įgūdžiai, gretimų krypčių atradimas, įmonių ir komandų įrankiai bei rinkos įžvalgos.",
      },
      ru: {
        slug: "labourmarket-ai-tolko-doska-vakansiy",
        h1: "LabourMarket.ai только доска вакансий?",
        short: "Нет. Поиск работы — лишь часть. Это ещё живой рабочий профиль, навыки на основе доказательств, открытие смежных направлений, инструменты для компаний и команд и понимание рынка труда.",
        full: [
          "Доска вакансий в основном перечисляет вакансии и на этом останавливается. LabourMarket.ai включает подбор возможностей, но построена вокруг вашей профессиональной идентичности: рабочего профиля, показывающего реальные, подтверждённые навыки, и направлений, куда эти навыки могут расти.",
          "Для организаций это больше, чем размещение роли — представление компании, описание потребностей, сбор команд и ведение проектов. Вместе с этим она помогает всем понимать рынок труда. Список возможностей — функция, а не весь продукт.",
        ],
        title: "LabourMarket.ai только доска вакансий?",
        desc: "LabourMarket.ai больше чем доска вакансий: живой рабочий профиль, подтверждённые навыки, открытие смежных направлений, инструменты компаний и команд и аналитика рынка.",
      },
      nl: {
        slug: "is-labourmarket-ai-alleen-een-vacaturebank",
        h1: "Is LabourMarket.ai alleen een vacaturebank?",
        short: "Nee. Werk vinden is één deel. Het is ook een levend werkprofiel, op bewijs gebaseerde vaardigheden, ontdekking van aangrenzende richtingen, tools voor bedrijven en teams, en inzicht in de arbeidsmarkt.",
        full: [
          "Een vacaturebank somt vooral vacatures op en houdt daar op. LabourMarket.ai bevat kansenmatching, maar is gebouwd rond je professionele identiteit: een werkprofiel dat echte, onderbouwde vaardigheden toont, en richtingen voor waar die vaardigheden kunnen groeien.",
          "Voor organisaties gaat het verder dan een rol plaatsen — een bedrijf vertegenwoordigen, behoeften beschrijven, teams bouwen en projecten draaien. Daarnaast helpt het iedereen de arbeidsmarkt te begrijpen. Het tonen van kansen is een functie, niet het hele product.",
        ],
        title: "Is LabourMarket.ai alleen een vacaturebank?",
        desc: "LabourMarket.ai is meer dan een vacaturebank: een levend werkprofiel, onderbouwde vaardigheden, aangrenzende richtingen, bedrijfs- en teamtools en marktinzicht.",
      },
      de: {
        slug: "ist-labourmarket-ai-nur-eine-jobboerse",
        h1: "Ist LabourMarket.ai nur eine Jobbörse?",
        short: "Nein. Arbeit zu finden ist ein Teil. Es ist auch ein lebendiges Arbeitsprofil, belegbasierte Fähigkeiten, das Entdecken benachbarter Richtungen, Werkzeuge für Unternehmen und Teams und Verständnis des Arbeitsmarkts.",
        full: [
          "Eine Jobbörse listet vor allem Stellen auf und hört dort auf. LabourMarket.ai enthält den Abgleich von Möglichkeiten, ist aber um Ihre berufliche Identität herum gebaut: ein Arbeitsprofil, das echte, belegte Fähigkeiten zeigt, und Richtungen, wohin diese Fähigkeiten wachsen können.",
          "Für Organisationen geht es über das Einstellen einer Rolle hinaus — ein Unternehmen darstellen, Bedarfe beschreiben, Teams bilden und Projekte umsetzen. Daneben hilft es allen, den Arbeitsmarkt zu verstehen. Die Auflistung von Möglichkeiten ist eine Funktion, nicht das ganze Produkt.",
        ],
        title: "Ist LabourMarket.ai nur eine Jobbörse?",
        desc: "LabourMarket.ai ist mehr als eine Jobbörse: ein lebendiges Arbeitsprofil, belegte Fähigkeiten, benachbarte Richtungen, Unternehmens- und Team-Werkzeuge und Marktverständnis.",
      },
    },
  },
];

const LOCALES: Loc[] = ["lt", "en", "ru", "nl", "de"];

export const WAVE2B_ANSWERS: readonly LocalizedAnswer[] = DRAFTS.flatMap((d) =>
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
