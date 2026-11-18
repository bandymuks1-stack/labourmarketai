/**
 * Lithuanian eval cases — one per registered agent (vacancy_translation
 * excluded, see below).
 *
 * Every case is a Lithuanian request (locale "lt") with a canned model output
 * for the MOCK provider. The SAME `LITHUANIAN_EVAL_CASES` list is what the
 * opt-in live runner (scripts/ai-evals-live.ts) sends to a real provider —
 * live, the `mock` field is ignored and the model's own answer is judged by
 * `judgeLithuanianCase` (harness.ts): (a) output schema, (b) Lithuanian
 * reader-facing text, (c) no employer / date / certificate not in the input.
 *
 * `LITHUANIAN_CHECKER_NEGATIVES` are mock-only: outputs that pass the schema
 * but break (b) or (c), proving the checks themselves catch what they claim.
 *
 * Synthetic data only — the repository is public. Organisation names are
 * obviously made up ("Bandomoji statyba" = "test construction").
 *
 * EXCLUDED: `vacancy_translation` — owner decision 2026-11-09: public job
 * advertisements are shown in their original language, so it gets no
 * Lithuanian cases here.
 */
import type { AgentEvalCase } from "./harness";
import type { AiAgentKey, PromptRegistryEntry } from "../registry/types";
import { workerProfileEntry } from "../registry/agents/worker-profile";
import { workJournalEntry } from "../registry/agents/work-journal";
import { companyNeedEntry } from "../registry/agents/company-need";
import { countryReadinessEntry } from "../registry/agents/country-readiness";
import { matchingExplanationEntry } from "../registry/agents/matching-explanation";
import { translationCopyEntry } from "../registry/agents/translation-copy";
import { marketExplanationEntry } from "../registry/agents/market-explanation";
import { conversationIntentEntry } from "../registry/agents/conversation-intent";

/** Registered agents deliberately left out of the Lithuanian evals. */
export const LITHUANIAN_EVAL_EXCLUDED: Partial<Record<AiAgentKey, string>> = {
  vacancy_translation:
    "owner decision 2026-11-09: public ads are shown in their original language",
};

export interface LithuanianEvalCase {
  readonly entry: PromptRegistryEntry;
  readonly c: AgentEvalCase;
}

function envelope(agent: string, source: string, ref: string, data: unknown) {
  return {
    suggestion: true,
    agent,
    confidence: "medium",
    evidence_refs: [{ source, ref }],
    missing_information: [],
    needs_human_review: true,
    blocked_claims: [],
    data,
  };
}

const workerProfileInput = {
  bio: "Nuo 2018 iki 2023 metų dirbau plytelių klojėju UAB „Bandomoji statyba“. Turiu A1 pažymėjimą.",
  existingSkills: ["plytelių klojimas"],
};

const workJournalInput = {
  rawText: "Šiandien Bandymų gatvės objekte klojau plyteles vonioje ir dariau hidroizoliaciją.",
  date: "2026-11-05",
};

const matchingInput = {
  workerSkills: ["plytelių klojimas", "hidroizoliacija"],
  documentsSummary: ["A1 pažymėjimas: nėra"],
  companyNeed: "Reikia plytelių klojėjo Nyderlanduose; būtinas A1 pažymėjimas.",
};

const marketInput = {
  professionSlug: "tiler",
  measuredAtIso: "2026-11-01T06:00:00Z",
  activeAds: 120,
  newAds7d: 18,
  newAds30d: 64,
  adsStatingPay: 40,
  rankingWindowAds: 120,
  rankingWindowCoversAll: true,
  topSkills: [{ key: "hidroizoliacija", ads: 30 }],
  topCities: [{ key: "Vilnius", ads: 50 }],
  countries: [{ key: "LT", ads: 120 }],
};

export const LITHUANIAN_EVAL_CASES: readonly LithuanianEvalCase[] = [
  {
    entry: workerProfileEntry,
    c: {
      name: "LT worker_profile: draft keeps only the employer, years and certificate given",
      locale: "lt",
      input: workerProfileInput,
      mock: envelope("worker_profile", "worker_bio", "profiles.profile_text", {
        suggested_headline: "Plytelių klojėjas",
        suggested_skill_claims: ["plytelių klojimas"],
        suggested_roles: ["Plytelių klojėjas"],
        experience_categories: ["statybų apdaila"],
        missing_profile_fields: ["pageidaujama darbo šalis"],
        country_readiness_questions: [],
        suggested_work_history: [
          {
            title: "Plytelių klojėjas, UAB „Bandomoji statyba“",
            start_year: 2018,
            end_year: 2023,
            is_current: false,
          },
        ],
        suggested_certificates: [{ title: "A1 pažymėjimas", year: null }],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: workJournalEntry,
    c: {
      name: "LT work_journal: structured draft of the worker's own entry",
      locale: "lt",
      input: workJournalInput,
      mock: envelope("work_journal", "journal_entries", "je_synthetic_1", {
        tasks_performed: ["plytelių klojimas vonioje", "hidroizoliacija"],
        tools_materials: [],
        possible_skills: ["plytelių klojimas", "hidroizoliacija"],
        safety_notes: [],
        evidence_summary: "Klojo plyteles vonioje ir darė hidroizoliaciją.",
        unclear_points: ["nenurodytas išklotas plotas"],
        suggested_followup_question: "Kiek kvadratinių metrų išklojote?",
        suggested_project_names: ["Bandymų gatvės objektas"],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: companyNeedEntry,
    c: {
      name: "LT company_need: draft request without invented dates or documents",
      locale: "lt",
      input: {
        companyFreeText: "Reikia 3 plytelių klojėjų Nyderlanduose dviem mėnesiams.",
        country: "NL",
      },
      mock: envelope("company_need", "company_free_text", "need_text", {
        normalized_role: "Plytelių klojėjas",
        required_skills: ["plytelių klojimas"],
        required_documents: [],
        country_readiness_blockers: [],
        missing_fields: ["pradžios data", "reikalingi dokumentai"],
        risk_flags: [],
        suggested_public_copy: "Ieškome 3 plytelių klojėjų darbui Nyderlanduose dviem mėnesiams.",
        internal_matching_criteria: ["plytelių klojimo patirtis"],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: countryReadinessEntry,
    c: {
      name: "LT country_readiness: sourced reading of the matrix rows",
      locale: "lt",
      input: {
        country: "NL",
        scope: "worker_posted",
        sourceRecords: [
          {
            ref: "a1_certificate",
            level: "required",
            risk: "high",
            grade: "official",
            source: "Your Europe — social security",
            statement: "A1 pažymėjimas parodo, kurios šalies socialinio draudimo teisė taikoma.",
          },
        ],
      },
      mock: envelope("country_readiness", "country_readiness_matrix", "a1_certificate", {
        summary: "Jei esate komandiruojamas į Nyderlandus, pirmiausia svarbus A1 pažymėjimas.",
        steps: [{ ref: "a1_certificate", step: "Paprašykite darbdavio A1 pažymėjimo prieš kelionę." }],
        needs_legal_review: true,
        limitations: ["Tai nėra teisinė konsultacija; nacionalinės detalės nepatikrintos."],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: matchingExplanationEntry,
    c: {
      name: "LT matching_explanation: blocker named, nothing added",
      locale: "lt",
      input: matchingInput,
      mock: envelope("matching_explanation", "worker_skills", "skills", {
        fit_summary: "Įgūdžiai tinka, bet trūksta A1 pažymėjimo.",
        strong_matches: ["plytelių klojimas"],
        gaps: [],
        blockers: ["nėra A1 pažymėjimo"],
        suggested_next_action: "Pasirūpinkite A1 pažymėjimu.",
        explanation_company: "Darbuotojo įgūdžiai atitinka poreikį, tačiau jis dar neturi A1 pažymėjimo.",
        explanation_worker: "Jūsų įgūdžiai tinka; kad būtumėte pasiruošę, reikia A1 pažymėjimo.",
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: translationCopyEntry,
    c: {
      name: "LT translation_copy: canonical message rendered in Lithuanian",
      locale: "lt",
      // English source → Lithuanian target; never an LT→LT request.
      sourceLanguage: "en",
      input: { canonicalMessage: "Upload your A1 certificate.", locale: "lt" },
      mock: envelope("translation_copy", "canonical_message", "message", {
        localized_copy: "Įkelkite savo A1 pažymėjimą.",
        plain_language_version: "Reikia įkelti A1 pažymėjimą.",
        wording_warnings: [],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: marketExplanationEntry,
    c: {
      name: "LT market_explanation: plain reading of the measured numbers",
      locale: "lt",
      input: marketInput,
      mock: envelope("market_explanation", "public_market_facts", "activeAds", {
        summary: "Šiuo metu yra 120 aktyvių plytelių klojėjų skelbimų; per 7 dienas atsirado 18 naujų.",
        where_demand_is: ["Daugiausia skelbimų – Vilniuje (50)."],
        skills_in_demand: ["Dažnai prašoma hidroizoliacijos įgūdžių."],
        suggested_actions: ["Įrašykite hidroizoliacijos patirtį į savo profilį."],
        limitations: ["Skaičiai rodo tik skelbimus, ne tai, kiek žmonių iš tikrųjų priimama."],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: conversationIntentEntry,
    c: {
      name: "LT conversation_intent: a question keeps the person's own words",
      locale: "lt",
      input: {
        sentence: "Kiek valandų dirbau Šiaurės bandymų aikštelėje?",
        locale: "lt",
        identity: "person",
        intents: [
          { id: "journal_list", hint: "Parodyti mano darbo žurnalą" },
          { id: "hours_summary", hint: "Kiek valandų dirbau" },
        ],
      },
      mock: envelope("conversation_intent", "conversation_sentence", "sentence", {
        kind: "question",
        reference: "Šiaurės bandymų aikštelėje",
      }),
      // lib/conversation/llm-proposal.ts passes the same cap.
      maxOutputTokens: 200,
      expect: { status: "suggestion" },
    },
  },
];

/** Mock-only: schema-valid outputs that the Lithuanian checks must FAIL. */
export const LITHUANIAN_CHECKER_NEGATIVES: readonly (LithuanianEvalCase & {
  readonly fails: "language" | "facts";
  readonly mentions: string;
})[] = [
  {
    entry: workerProfileEntry,
    fails: "facts",
    mentions: "employer",
    c: {
      name: "CHECK: invented employer is caught",
      locale: "lt",
      input: workerProfileInput,
      mock: envelope("worker_profile", "worker_bio", "profiles.profile_text", {
        suggested_headline: "Plytelių klojėjas",
        suggested_skill_claims: ["plytelių klojimas"],
        suggested_roles: [],
        experience_categories: [],
        missing_profile_fields: [],
        country_readiness_questions: [],
        suggested_work_history: [
          { title: "Klojėjas, UAB „Išgalvota apdaila“", start_year: 2018, end_year: 2023, is_current: false },
        ],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: workJournalEntry,
    fails: "facts",
    mentions: "date",
    c: {
      name: "CHECK: invented year is caught",
      locale: "lt",
      input: workJournalInput,
      mock: envelope("work_journal", "journal_entries", "je_synthetic_1", {
        tasks_performed: ["plytelių klojimas"],
        tools_materials: [],
        possible_skills: [],
        safety_notes: [],
        evidence_summary: "Plyteles kloja nuo 2019 metų.",
        unclear_points: [],
        suggested_followup_question: null,
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: matchingExplanationEntry,
    fails: "facts",
    mentions: "certificate",
    c: {
      name: "CHECK: invented certificate is caught",
      locale: "lt",
      input: matchingInput,
      mock: envelope("matching_explanation", "worker_skills", "skills", {
        fit_summary: "Darbuotojas turi VCA sertifikatą ir tinka.",
        strong_matches: ["plytelių klojimas"],
        gaps: [],
        blockers: [],
        suggested_next_action: null,
        explanation_company: null,
        explanation_worker: null,
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: translationCopyEntry,
    fails: "language",
    mentions: "non-Lithuanian",
    c: {
      name: "CHECK: English answer to a Lithuanian request is caught",
      locale: "lt",
      sourceLanguage: "en",
      input: { canonicalMessage: "Upload your A1 certificate.", locale: "lt" },
      mock: envelope("translation_copy", "canonical_message", "message", {
        localized_copy: "Upload your A1 certificate to the profile.",
        plain_language_version: "You need to upload the A1 certificate.",
        wording_warnings: [],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: marketExplanationEntry,
    fails: "language",
    mentions: "non-Lithuanian letter",
    c: {
      name: "CHECK: Russian answer to a Lithuanian request is caught",
      locale: "lt",
      input: marketInput,
      mock: envelope("market_explanation", "public_market_facts", "activeAds", {
        summary: "Сейчас 120 активных объявлений.",
        where_demand_is: [],
        skills_in_demand: [],
        suggested_actions: [],
        limitations: ["Только объявления."],
      }),
      expect: { status: "suggestion" },
    },
  },
];
