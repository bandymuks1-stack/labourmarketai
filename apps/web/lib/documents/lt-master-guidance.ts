/**
 * LT MASTER jurisdiction/document guidance registry (CR train WAGON 9,
 * area 17 — owner correction 2026-07-05).
 *
 * OWNER RULE: all legal/compliance/document-requirement guidance is prepared
 * FIRST in Lithuanian only. This module is the SINGLE SOURCE OF TRUTH for
 * that Lithuanian master text. Other locales must never render these bodies
 * until the owner approves the Lithuanian master and explicitly moves an
 * item through the translation pipeline — until then EN/RU surfaces show
 * only a short "being prepared from the Lithuanian master" notice.
 *
 * Honesty rules (map area 17 + train stop-rules):
 *   - informational only — NOT legal advice, and it says so;
 *   - conservative wording only: "gali reikėti", "reikia pasitikrinti",
 *     "informacinio pobūdžio" — never "privaloma", never a guarantee;
 *   - EVERY item carries needsLegalReview: true until an owner/lawyer pass
 *     flips its status to OWNER_APPROVED_LT (none are approved yet);
 *   - no invented legal facts: items name widely known document KINDS and
 *     always defer to official sources for the current rules;
 *   - no payment work, no external provider, no auto-translation.
 *
 * The DB registry country_document_requirements (ships empty,
 * needs_legal_source) is UNTOUCHED — this module is the reviewable
 * pre-legal draft layer, not a second requirements engine: once the owner
 * approves rows they can be curated into that table by the existing flow.
 *
 * Owner review index: runtime/audits/lt-master-documents-owner-review-2026-07-05.md
 */

/** Review/translation pipeline states (owner spec, WAGON 9). */
export const GUIDANCE_STATUSES = [
  "LT_DRAFT_READY",
  "OWNER_EDITING",
  "OWNER_APPROVED_LT",
  "TRANSLATION_READY",
  "TRANSLATED",
] as const;
export type GuidanceStatus = (typeof GUIDANCE_STATUSES)[number];

/** Statuses that still REQUIRE the legal-review flag to be on. */
export const PRE_APPROVAL_STATUSES: readonly GuidanceStatus[] = [
  "LT_DRAFT_READY",
  "OWNER_EDITING",
];

export type GuidanceAudience = "worker" | "company" | "both";

/** Engagement contexts a row speaks to ("any" = context-independent). */
export type GuidanceContext =
  | "employment"
  | "posted_work"
  | "self_employed"
  | "team"
  | "agency"
  | "any";

/** Input dimensions the guidance depends on (map area 17 gap). */
export type GuidanceDimension =
  | "worker_country"
  | "company_country"
  | "work_country"
  | "role_service_type"
  | "engagement_context";

export type GuidanceWorkCountry =
  | "ALL"
  | "LT"
  | "LV"
  | "EE"
  | "NL"
  | "DE"
  | "DK"
  | "NO"
  | "SE"
  | "PL";

export type LtGuidanceItem = {
  /** Stable id — referenced by the owner review index. */
  id: string;
  /** Country the WORK happens in; "ALL" = applies everywhere. */
  workCountry: GuidanceWorkCountry;
  audience: GuidanceAudience;
  contexts: readonly GuidanceContext[];
  dependsOn: readonly GuidanceDimension[];
  /** Lithuanian master text — the only content language until owner approval. */
  titleLt: string;
  bodyLt: string;
  whoUsuallyProvidesLt: string;
  status: GuidanceStatus;
  /** Must stay true until an owner/lawyer review approves the LT text. */
  needsLegalReview: boolean;
};

const PASITIKRINTI =
  "Tikslią ir aktualią tvarką reikia pasitikrinti oficialiuose tos šalies šaltiniuose arba su specialistu.";

export const LT_MASTER_GUIDANCE: readonly LtGuidanceItem[] = [
  // ── Bendri punktai (visos šalys) ─────────────────────────────────────
  {
    id: "all-identity-document",
    workCountry: "ALL",
    audience: "worker",
    contexts: ["any"],
    dependsOn: ["worker_country", "work_country"],
    titleLt: "Asmens tapatybės dokumentas",
    bodyLt:
      "Dirbant bet kurioje šalyje gali reikėti galiojančio paso arba asmens tapatybės kortelės. Ne ES piliečiams papildomai gali reikėti leidimo gyventi ar dirbti. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "Dažniausiai pasirūpina pats darbuotojas; leidimų klausimais neretai padeda darbdavys.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "all-a1-certificate",
    workCountry: "ALL",
    audience: "both",
    contexts: ["posted_work", "employment"],
    dependsOn: ["worker_country", "company_country", "work_country", "engagement_context"],
    titleLt: "A1 pažymėjimas (socialinis draudimas)",
    bodyLt:
      "Komandiruojant darbuotoją dirbti kitoje ES/EEE šalyje gali reikėti A1 pažymėjimo, kuris parodo, kurioje šalyje mokamos socialinio draudimo įmokos. Tai informacinio pobūdžio gairė — ar A1 reikalingas jūsų situacijoje, reikia pasitikrinti Sodroje arba atitinkamoje institucijoje.",
    whoUsuallyProvidesLt:
      "Dažniausiai tvarko komandiruojantis darbdavys; savarankiškai dirbantys kreipiasi patys.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "all-work-contract",
    workCountry: "ALL",
    audience: "both",
    contexts: ["employment", "self_employed", "agency"],
    dependsOn: ["role_service_type", "engagement_context"],
    titleLt: "Darbo arba paslaugų sutartis",
    bodyLt:
      "Beveik visada gali reikėti rašytinės darbo sutarties arba paslaugų (rangos) sutarties, kuri parodo santykio pobūdį — samdomas darbas, savarankiška veikla ar subranga. Kokia forma tinkama, priklauso nuo šalies ir situacijos. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "Dažniausiai parengia darbdavys arba užsakovas; savarankiškai dirbantys — patys ar su buhalteriu.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "all-qualification-safety",
    workCountry: "ALL",
    audience: "worker",
    contexts: ["any"],
    dependsOn: ["role_service_type", "work_country"],
    titleLt: "Kvalifikacijos ir darbų saugos pažymėjimai",
    bodyLt:
      "Pagal darbo pobūdį (pvz., aukštuminiai darbai, elektra, kranai) gali reikėti kvalifikacijos ar darbų saugos pažymėjimų. Dalis šalių pripažįsta kitur išduotus pažymėjimus, dalis reikalauja vietinių. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "Mokymus dažnai organizuoja darbdavys; pažymėjimas išduodamas darbuotojui.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "all-posting-notification",
    workCountry: "ALL",
    audience: "company",
    contexts: ["posted_work"],
    dependsOn: ["company_country", "work_country", "engagement_context"],
    titleLt: "Komandiravimo pranešimas priimančiojoje šalyje",
    bodyLt:
      "Daugumoje ES šalių apie komandiruojamus darbuotojus gali reikėti iš anksto pranešti tos šalies institucijai (deklaravimo sistemos skiriasi). Už pranešimą paprastai atsako komandiruojanti įmonė. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Dažniausiai tvarko komandiruojanti įmonė.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "all-health-check",
    workCountry: "ALL",
    audience: "worker",
    contexts: ["employment"],
    dependsOn: ["role_service_type"],
    titleLt: "Sveikatos patikros pažyma",
    bodyLt:
      "Pagal darbo pobūdį gali reikėti privalomos sveikatos patikros pažymos (ypač fiziniam ar naktiniam darbui). Tvarka ir periodiškumas skiriasi pagal šalį ir pareigybę. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "Dažniausiai organizuoja darbdavys; pažyma išduodama darbuotojui.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Lietuva ──────────────────────────────────────────────────────────
  {
    id: "lt-local-work",
    workCountry: "LT",
    audience: "both",
    contexts: ["employment", "self_employed"],
    dependsOn: ["role_service_type"],
    titleLt: "Darbas Lietuvoje — registracijos pagrindai",
    bodyLt:
      "Dirbant pagal darbo sutartį Lietuvoje, Sodros ir GPM klausimus paprastai tvarko darbdavys. Dirbant savarankiškai gali reikėti individualios veiklos pažymos arba verslo liudijimo. Tai informacinio pobūdžio gairė. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "Samdomam darbui — darbdavys; savarankiškai veiklai — pats asmuo (VMI).",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Latvija / Estija ─────────────────────────────────────────────────
  {
    id: "lv-posted-basics",
    workCountry: "LV",
    audience: "company",
    contexts: ["posted_work"],
    dependsOn: ["company_country", "work_country"],
    titleLt: "Latvija — komandiravimo pagrindai",
    bodyLt:
      "Komandiruojant darbuotojus dirbti Latvijoje gali reikėti pranešti Latvijos darbo inspekcijai ir laikytis vietinių minimalių darbo sąlygų. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Dažniausiai tvarko komandiruojanti įmonė.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "ee-posted-basics",
    workCountry: "EE",
    audience: "company",
    contexts: ["posted_work"],
    dependsOn: ["company_country", "work_country"],
    titleLt: "Estija — komandiravimo pagrindai",
    bodyLt:
      "Komandiruojant darbuotojus dirbti Estijoje gali reikėti registruoti komandiruotę Estijos darbo inspekcijoje ir užtikrinti vietines minimalias darbo sąlygas. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Dažniausiai tvarko komandiruojanti įmonė.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Nyderlandai ──────────────────────────────────────────────────────
  {
    id: "nl-bsn-registration",
    workCountry: "NL",
    audience: "worker",
    contexts: ["employment", "posted_work"],
    dependsOn: ["worker_country", "work_country"],
    titleLt: "Nyderlandai — BSN numeris ir registracija",
    bodyLt:
      "Dirbant Nyderlanduose gali reikėti BSN (piliečio aptarnavimo) numerio, kuris gaunamas registruojantis savivaldybėje. Ilgesniam gyvenimui gali reikėti pilnos registracijos. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "Registruojasi pats darbuotojas; darbdavys dažnai padeda susitarti dėl vizito.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "nl-posted-notification",
    workCountry: "NL",
    audience: "company",
    contexts: ["posted_work"],
    dependsOn: ["company_country", "work_country"],
    titleLt: "Nyderlandai — komandiruotų darbuotojų pranešimas",
    bodyLt:
      "Užsienio įmonėms, siunčiančioms darbuotojus dirbti į Nyderlandus, gali reikėti iš anksto deklaruoti komandiruotę internetinėje pranešimų sistemoje. Statybų sektoriuje papildomai gali taikytis kolektyvinės sutarties (CAO) sąlygos. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Dažniausiai tvarko komandiruojanti įmonė.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Vokietija ────────────────────────────────────────────────────────
  {
    id: "de-posting-construction",
    workCountry: "DE",
    audience: "company",
    contexts: ["posted_work"],
    dependsOn: ["company_country", "work_country", "role_service_type"],
    titleLt: "Vokietija — komandiravimo pranešimas ir statybų sektoriaus reikalavimai",
    bodyLt:
      "Komandiruojant darbuotojus dirbti Vokietijoje gali reikėti pranešimo muitinės tarnybai (Zoll). Statybų sektoriuje papildomai gali taikytis atostogų kasos (pvz., SOKA-BAU) dalyvavimo pareiga. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Dažniausiai tvarko komandiruojanti įmonė su buhalteriu ar konsultantu.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  {
    id: "de-self-employed-trade",
    workCountry: "DE",
    audience: "worker",
    contexts: ["self_employed"],
    dependsOn: ["role_service_type", "work_country"],
    titleLt: "Vokietija — savarankiška veikla ir amatų registracija",
    bodyLt:
      "Savarankiškai teikiant statybos ar amatų paslaugas Vokietijoje gali reikėti veiklos registracijos, o kai kuriems amatams — įrašo amatų registre. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Registruojasi pats paslaugų teikėjas.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Danija ───────────────────────────────────────────────────────────
  {
    id: "dk-rut-registration",
    workCountry: "DK",
    audience: "company",
    contexts: ["posted_work", "self_employed"],
    dependsOn: ["company_country", "work_country"],
    titleLt: "Danija — RUT registracija",
    bodyLt:
      "Užsienio paslaugų teikėjams, dirbantiems Danijoje, gali reikėti registruotis RUT (užsienio paslaugų teikėjų) registre dar prieš pradedant darbus. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Dažniausiai tvarko paslaugas teikianti įmonė arba savarankiškas teikėjas.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Norvegija ────────────────────────────────────────────────────────
  {
    id: "no-hms-id-card",
    workCountry: "NO",
    audience: "worker",
    contexts: ["employment", "posted_work"],
    dependsOn: ["work_country", "role_service_type"],
    titleLt: "Norvegija — HMS kortelė statybvietėse",
    bodyLt:
      "Dirbant Norvegijos statybvietėse gali reikėti asmeninės HMS (saugos) kortelės, o prieš ją — registracijos vietinėse institucijose. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "Kortelę dažniausiai užsako darbdavys; kortelė išduodama darbuotojui.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Švedija ──────────────────────────────────────────────────────────
  {
    id: "se-id06-card",
    workCountry: "SE",
    audience: "worker",
    contexts: ["employment", "posted_work"],
    dependsOn: ["work_country", "role_service_type"],
    titleLt: "Švedija — ID06 kortelė statybvietėse",
    bodyLt:
      "Švedijos statybvietėse dažnai prašoma ID06 kortelės — sektoriaus naudojamos tapatybės kortelės. Ilgesniam darbui gali reikėti ir mokesčių registracijos ar koordinacinio numerio. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt:
      "ID06 dažniausiai užsako darbdavys; mokesčių klausimais kreipiamasi į Švedijos mokesčių tarnybą.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
  // ── Lenkija ──────────────────────────────────────────────────────────
  {
    id: "pl-posted-basics",
    workCountry: "PL",
    audience: "company",
    contexts: ["posted_work"],
    dependsOn: ["company_country", "work_country"],
    titleLt: "Lenkija — komandiravimo pagrindai",
    bodyLt:
      "Komandiruojant darbuotojus dirbti Lenkijoje gali reikėti pranešti Lenkijos darbo inspekcijai ir laikytis vietinių minimalių darbo sąlygų. " +
      PASITIKRINTI,
    whoUsuallyProvidesLt: "Dažniausiai tvarko komandiruojanti įmonė.",
    status: "LT_DRAFT_READY",
    needsLegalReview: true,
  },
];

/** Per-status counts for the honest review-state summary. */
export function guidanceStatusCounts(): Record<GuidanceStatus, number> {
  const counts = Object.fromEntries(
    GUIDANCE_STATUSES.map((s) => [s, 0]),
  ) as Record<GuidanceStatus, number>;
  for (const item of LT_MASTER_GUIDANCE) counts[item.status] += 1;
  return counts;
}

/** Items grouped by work country, "ALL" first, then the launch-market order. */
export function guidanceByCountry(): ReadonlyMap<
  GuidanceWorkCountry,
  LtGuidanceItem[]
> {
  const order: GuidanceWorkCountry[] = [
    "ALL",
    "LT",
    "LV",
    "EE",
    "NL",
    "DE",
    "DK",
    "NO",
    "SE",
    "PL",
  ];
  const map = new Map<GuidanceWorkCountry, LtGuidanceItem[]>();
  for (const c of order) {
    const items = LT_MASTER_GUIDANCE.filter((i) => i.workCountry === c);
    if (items.length > 0) map.set(c, items);
  }
  return map;
}
