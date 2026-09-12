"use server";

import "server-only";
import { resolveMyVerifiers } from "@/lib/journal/verifier-read";

import { getLocale, getTranslations } from "next-intl/server";

import { findWorkForChat } from "@/lib/conversation/find-work";
import { loadWorkerOpportunityBoard } from "@/lib/marketplace/worker-opportunities";
import { getReportsView } from "@/lib/reports/reports-hub";
import { listManagedProjects } from "@/lib/projects/projects";
import { listCompanyDemands } from "@/lib/scouting/scouting";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getPlanning } from "@/lib/planning/planning";
import { loadOwnWorkIntelligence } from "@/lib/journal/work-intelligence-read";
import type { WorkIntelligence, WorkPeriodKey } from "@/lib/journal/work-intelligence";
import { parseJournalPeriodPhrase, type JournalPeriodPhrase } from "@/lib/conversation/journal-period-phrase";
import type { ConversationIntent } from "@/lib/conversation/intent-router";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { isWorkTimeUnit, workTimeHours } from "@/lib/journal/work-time";
import {
  DOCUMENT_GAP_LINE_CAP,
  groupMissingDocumentsByType,
  type DocumentGap,
} from "@/lib/conversation/documents-gap";
import { loadWorkerDocumentGap } from "@/lib/conversation/documents-gap-server";
import { readLearningCompass } from "@/lib/learning/learning-compass";
import { loadUnchosenCountryNextSteps } from "@/lib/conversation/country-next-steps-server";
import { mergeFilters as mergeCarriedFilters } from "@/lib/conversation/conversation-goal";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import { loadAiWorkspaceContext } from "./ai-context";
import { buildUnavailableCountryTerms, buildWorkspaceVocabulary } from "./vocabulary-server";
import { readWorldState, type WorldStateMatch } from "./world-state-language";
import type { WorkflowResult } from "./workflow-contract";

/**
 * THE AI WORKSPACE WORKFLOWS (W4).
 *
 * "AI must execute workflows. Not only answer questions." Each function here is
 * one thing a person can ask for in their own words and have DONE — searching
 * their real board, naming their real skill gaps, opening a real project in the
 * workspace, reading their real figures.
 *
 * FOUR RULES, ENFORCED BY CONSTRUCTION:
 *
 * 1. **Real data only.** Every workflow enters through a canonical use case
 *    that already decided authorization and ranking. No table is named here,
 *    no query is written here, no ranking is recomputed here.
 * 2. **No duplicated logic.** Search goes through `findWorkForChat`, the same
 *    adapter the chip uses. Reports go through `getReportsView`, the same read
 *    the reports page renders. The AI is a new WAY IN, never a second engine.
 * 3. **Never fabricate.** Every result is a real row or an honest "not
 *    available, because…". A workflow whose data source is missing says so.
 * 4. **Always explain.** `explanation.why` is required by the contract, and it
 *    quotes what the AI understood from the person's own sentence.
 *
 * NO LLM. This is the deterministic floor the doctrine requires (§7): the whole
 * workspace works with the model switched off.
 */

/** How many rows a conversational answer may list before it stops being an
 *  answer and becomes a screen. */
const ANSWER_LIMIT = 5;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Find work — the AI writes World State instead of navigating
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "I want work in Germany."
 *
 * Reads World State out of the sentence, applies it through the CANONICAL
 * discovery filters inside the one ranking path, and reports what it changed.
 * A country the person's board does not contain is understood and answered
 * honestly — with the countries that ARE there — rather than filtered to an
 * unexplained empty list.
 */
export async function runFindWork(
  text: string,
  /**
   * What earlier turns of the SAME goal already narrowed (owner P0 §4). The
   * caller — the chat's conversation goal — owns this; a new goal hands
   * nothing, so a fresh search starts in an unnarrowed world.
   */
  carry?: DiscoveryFilterState,
): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  if (!ctx.hasWorkerProfile) {
    return blocked(t("blockedNoWorker"), t("whyNoWorker"));
  }

  const board = await loadWorkerOpportunityBoard("conversation");
  const needs = board.kind === "ready" ? board.opportunities.map((o) => o.need) : [];
  const { terms, facets } = await buildWorkspaceVocabulary(needs);
  const unavailable = await buildUnavailableCountryTerms(facets);

  const reading = readWorldState(text, [...terms, ...unavailable]);
  const applied = reading.matches.filter((m) => m.available);
  const missed = reading.matches.filter((m) => !m.available);

  // Named something the world does not have: say what it DOES have. This is
  // the difference between "no results" and an answer. What it DOES have is
  // listed on the SAME dimension the person named: an absent opportunity
  // type is answered with the types that are visible, an absent country
  // with the countries — never "no internships; visible: LT, NL".
  if (applied.length === 0 && missed.length > 0) {
    const missedDimension = missed[0].dimension;
    const alternatives =
      missedDimension === "country"
        ? facets.countries.join(", ")
        : terms
            .filter((v) => v.dimension === missedDimension && v.available)
            .map((v) => v.terms[0])
            .filter((label): label is string => typeof label === "string" && label.length > 0)
            .join(", ");
    const honest = alternatives
      ? t("noSuchValueWithAlternatives", { asked: missed[0].matchedText, available: alternatives })
      : t("noSuchValue", { asked: missed[0].matchedText });
    const explanation = {
      why: t("whyFromYourBoard"),
      unsupported: reading.unsupported.length > 0 ? [...reading.unsupported] : undefined,
    };
    // MATCHING CONTINUES AFTER "NO" (owner contract §16; prod walk 2026-09-05,
    // gap G-C2): a student asking for an internship when none is visible is
    // told so honestly — and then handed the EXISTING next steps (choose a
    // direction, ask the institution, the compass, the whole board), never a
    // dead end. The decision and its reads live in the education domain.
    if (missedDimension === "opportunityType") {
      const { loadInternshipNextSteps } = await import("@/lib/conversation/education-next-steps-server");
      const next = await loadInternshipNextSteps();
      return { kind: "answer", text: [honest, ...next.lines].join("\n"), explanation: explanation, chips: next.chips };
    }
    // A COUNTRY THE PERSON HAS NOT CHOSEN YET (real-person join walk,
    // production ca96605b, 2026-09-06): "ieškau darbo Norvegijoje" from a
    // worker whose countries were NL ended in "nothing visible there. Visible:
    // NL." — a dead end with no chip, on the very sentence the landing
    // advertises. The answer now carries the two doors that already exist:
    // the work card, where the person adds the country to their own list
    // (prefilled: their current countries plus the one they just named), and
    // the documents readiness ("what do I lack for that country?"). It also
    // says, honestly and from a bounded indexed read, whether public ads from
    // official sources exist there at all — no manufactured listing either
    // way; a failed read is named as a failed read, never as "none". The
    // reads live in the conversation domain (`country-next-steps-server`).
    if (missedDimension === "country") {
      const country = await loadUnchosenCountryNextSteps(missed[0].value);
      const supplyLine =
        country.supply === "yes"
          ? t("countryNotChosenListings")
          : country.supply === "no"
            ? t("countryNotChosenNoListings")
            : t("countryNotChosenSupplyUnknown");
      return {
        kind: "answer",
        text: [honest, supplyLine, t("countryNotChosenDoors")].join("\n"),
        explanation: explanation,
        chips: [
          {
            id: `f:worker.save-work-card?preferredCountries=${country.nextCountries.join(",")}`,
            label: t("chipAddCountry"),
          },
          { id: "documents-gap", label: t("chipDocsGap") },
        ],
      };
    }
    return { kind: "answer", text: honest, explanation: explanation };
  }

  /**
   * ── PERSISTENT FILTERS, wired at the seam this comment reserved ──────────
   * `reading.filters` is the World State THIS sentence expressed. Until the
   * owner's P0 of 2026-09-06 it was applied to this search only and then
   * forgotten, so "gerai, tada ieškok visoje Europoje" started from an
   * unnarrowed world and the profession stated one turn earlier was lost.
   *
   * The product decision this was waiting on ("when do filters clear?") has
   * been made and lives in `lib/conversation/conversation-goal.ts`: they
   * accumulate for as long as ONE goal is in flight, a later mention of the
   * same dimension replaces it (that is what a correction is), and an
   * asserted NEW goal starts from nothing. This function stays stateless —
   * the goal is the caller's, handed in as `carry` and handed back as
   * `worldState`.
   */
  const effective = carry ? mergeCarriedFilters(carry, reading.filters) : reading.filters;
  const result = await findWorkForChat(effective);
  const dimensionLabel = async (m: WorldStateMatch): Promise<string> =>
    t(`dimension.${m.dimension}` as never) as string;

  return {
    kind: "matches",
    result,
    explanation: {
      why:
        applied.length > 0
          ? t("whyFiltered", { words: applied.map((m) => m.matchedText).join(", ") })
          : t("whyUnfiltered"),
      unsupported: reading.unsupported.length > 0 ? [...reading.unsupported] : undefined,
    },
    appliedFilters: await Promise.all(
      applied.map(async (m) => ({ label: await dimensionLabel(m), matchedText: m.matchedText })),
    ),
    worldState: effective,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Skill gap — "what skills am I missing?"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The skills the person's OWN visible demands require and their profile does
 * not hold, counted across the board.
 *
 * Every number comes from the canonical match engine's fit basis — the same
 * matched/missing sets the Context Panel shows for one demand. This aggregates
 * them; it computes no score and invents no "recommended skill".
 */
export async function runSkillGap(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  if (!ctx.hasWorkerProfile) return blocked(t("blockedNoWorker"), t("whyNoWorker"));

  const board = await loadWorkerOpportunityBoard("conversation");
  if (board.kind !== "ready") return blocked(t("blockedNoWorker"), t("whyNoWorker"));
  if (!board.capabilities.boardAvailable) {
    return blocked(t("blockedNoAccess"), t("whyNoAccess"));
  }
  // MATCHING CONTINUES AFTER "NO" (owner contract 2026-09-04 §16): a gap
  // answer names the closing step. Skills close through real work in the
  // journal; documents close through the document centre — so the same
  // "what am I missing?" also states the required documents the person does
  // not hold for the countries they want to work in (own rows, same join the
  // documents page renders) — INCLUDING when no skill is missing (prod walk
  // 2026-09-04: "Nieko netrūksta" ended the answer while six required
  // documents were absent). A degraded document read adds NOTHING.
  const docs = await readDocumentGapForAnswer();
  const docTail = docs && docs.missing.length > 0 ? [await documentGapSentence(docs, t)] : [];
  const docChips = docs && docs.missing.length > 0 ? [{ id: "documents-centre", label: t("chipDocuments") }] : [];

  if (board.opportunities.length === 0) {
    return {
      kind: "answer",
      text: [t("skillGapNoDemands"), ...docTail].join("\n"),
      explanation: { why: t("whyFromYourBoard") },
      chips: docChips,
    };
  }

  // Count how many visible demands require each skill the person lacks.
  const demandsPerSkill = new Map<string, number>();
  for (const card of board.opportunities) {
    for (const slug of card.match.skillFit?.missingUris ?? []) {
      demandsPerSkill.set(slug, (demandsPerSkill.get(slug) ?? 0) + 1);
    }
  }
  if (demandsPerSkill.size === 0) {
    return {
      kind: "answer",
      text: [t("skillGapNone", { demands: board.opportunities.length }), ...docTail].join("\n"),
      explanation: { why: t("whySkillGap", { demands: board.opportunities.length }) },
      chips: docChips,
    };
  }

  const tSkill = await getTranslations("skillNames");
  const ranked = [...demandsPerSkill.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, ANSWER_LIMIT);
  const lines = ranked.map(([slug, count]) =>
    t("skillGapLine", {
      skill: tSkill.has(slug) ? (tSkill(slug) as string) : slug,
      demands: count,
    }),
  );

  return {
    kind: "answer",
    text: [t("skillGapIntro", { count: demandsPerSkill.size }), ...lines, ...docTail].join("\n"),
    explanation: { why: t("whySkillGap", { demands: board.opportunities.length }) },
    // The journal is where a skill becomes real — never a self-declaration.
    chips: [{ id: "logwork", label: t("chipLogWork") }, ...docChips],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2b. Documents — "what documents am I missing / what expires?"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The person's own documents against the requirements of the countries they
 * said they want to work in (owner contract 2026-09-04 §12). Before this the
 * `documents` sentence answered with a route chip; the document centre and
 * the country-readiness join were never read by the conversation.
 *
 * HONESTY: countries come from the person's own preferences — none stated ⇒
 * the answer ASKS where they want to work instead of inventing a country; a
 * country the matrix does not know is named as such; a degraded read is a
 * `blocked` answer, never "you have no documents".
 */
async function readDocumentGapForAnswer(): Promise<DocumentGap | null> {
  const res = await loadWorkerDocumentGap();
  return res.kind === "ok" ? res.gap : null;
}

async function documentGapSentence(
  gap: DocumentGap,
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string> {
  const tDocs = await getTranslations("documents");
  // One name per document TYPE, the countries beside it when there are
  // several — never the same name repeated per country.
  const list = groupMissingDocumentsByType(gap.missing, DOCUMENT_GAP_LINE_CAP)
    .map((g) => {
      const name = tDocs.has(`types.${g.documentTypeSlug}`)
        ? (tDocs(`types.${g.documentTypeSlug}` as never) as string)
        : g.documentTypeSlug;
      return g.countries.length > 1 ? `${name} (${g.countries.join(", ")})` : name;
    })
    .join(", ");
  return t("docsGapTail", { count: gap.missing.length, list });
}

export async function runDocumentsReadiness(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  if (!ctx.hasWorkerProfile) return blocked(t("blockedNoWorker"), t("whyNoWorker"));

  const res = await loadWorkerDocumentGap();
  if (res.kind === "no-worker") return blocked(t("blockedNoWorker"), t("whyNoWorker"));
  if (res.kind !== "ok") return blocked(t("docsBlocked"), t("whyDocsBlocked"));
  const { gap, countries } = res;

  const tDocs = await getTranslations("documents");
  const tLm = await getTranslations("labourMarket");
  const docName = (slug: string) =>
    tDocs.has(`types.${slug}`) ? (tDocs(`types.${slug}` as never) as string) : slug;
  const countryName = (code: string) =>
    tLm.has(`countryNames.${code}`) ? (tLm(`countryNames.${code}` as never) as string) : code;

  const lines: string[] = [
    t("docsIntro", { ready: gap.ready, expiring: gap.expiring.length, missing: gap.missing.length }),
  ];
  for (const e of gap.expiring.slice(0, DOCUMENT_GAP_LINE_CAP)) {
    lines.push(t("docsExpiringLine", { doc: docName(e.documentTypeSlug), date: e.validUntil }));
  }
  for (const m of gap.missing.slice(0, DOCUMENT_GAP_LINE_CAP)) {
    lines.push(
      m.sourceTitle
        ? t("docsMissingLineWithSource", { doc: docName(m.documentTypeSlug), country: countryName(m.country), source: m.sourceTitle })
        : t("docsMissingLine", { doc: docName(m.documentTypeSlug), country: countryName(m.country) }),
    );
  }
  if (countries.length === 0) lines.push(t("docsNoCountry"));
  else if (gap.missing.length === 0 && gap.countriesKnown.length > 0) {
    lines.push(t("docsAllGood", { countries: gap.countriesKnown.map(countryName).join(", ") }));
  }
  if (gap.countriesUnknown.length > 0) {
    lines.push(t("docsCountryUnknown", { countries: gap.countriesUnknown.map(countryName).join(", ") }));
  }

  const chips = [{ id: "documents-centre", label: t("chipDocuments") }];
  // The work card is where the person states WHERE they want to work — the
  // same inline form the search opens when the criteria are missing.
  if (countries.length === 0) chips.push({ id: "f:worker.save-work-card", label: t("chipWhereToWork") });

  return {
    kind: "answer",
    text: lines.join("\n"),
    explanation: {
      why:
        countries.length > 0
          ? t("whyDocs", { countries: countries.map(countryName).join(", ") })
          : t("whyDocsNoCountry"),
    },
    chips,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2c. Learning Compass — "what should I learn / what fits me / what am I becoming?"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The student's five answers IN THE CHAT (owner contract 2026-09-04 §15):
 * becoming · evidence · fits now · missing · next step — composed from the
 * SAME canonical read the profile's compass section renders
 * (`readLearningCompass` → `buildLearningCompass`). The compass was a route
 * chip; a student asked "ką man mokytis?" and was sent to a page.
 *
 * Copy: the compass vocabulary (`learningCompass.*`) exists in the five
 * routed locales; where a catalog does not carry it the answer says so and
 * hands over the compass chip — never a half-translated answer.
 */
export async function runLearningCompass(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  if (!ctx.hasWorkerProfile) return blocked(t("blockedNoWorker"), t("whyNoWorker"));

  const read = await readLearningCompass();
  if (read.status === "no-worker") return blocked(t("blockedNoWorker"), t("whyNoWorker"));
  if (read.status !== "ok") return blocked(t("compassBlocked"), t("whyCompassBlocked"));

  const tc = await getTranslations("learningCompass");
  if (!tc.has("becoming")) {
    return {
      kind: "answer",
      text: t("compassLocaleGap"),
      explanation: { why: t("whyCompass") },
      chips: [{ id: "compass-page", label: t("chipCompassPage") }],
    };
  }
  const tProf = await getTranslations("professions");
  const tSkill = await getTranslations("skillNames");
  const tLm = await getTranslations("labourMarket");
  const tsd = await getTranslations("structuredDemand");
  const prof = (slug: string) => (tProf.has(slug as never) ? (tProf(slug as never) as string) : slug.replace(/-/g, " "));
  const skill = (slug: string) => (tSkill.has(slug as never) ? (tSkill(slug as never) as string) : slug);
  const country = (code: string | null) =>
    code && tLm.has(`countryNames.${code}` as never) ? (tLm(`countryNames.${code}` as never) as string) : (code ?? "—");

  const { becoming, evidence, fitsNow, missing, nextSteps } = read.compass;
  const lines: string[] = [];

  // BECOMING
  lines.push(`${tc("becoming")}: ${becoming.professionSlug ? prof(becoming.professionSlug) : tc("becomingNone")}`);
  if (becoming.studyingAt) {
    lines.push(
      tc("studyingAt", { institution: becoming.studyingAt }) +
        (becoming.currentEducation?.programOrField ? ` · ${tc("program", { program: becoming.currentEducation.programOrField })}` : ""),
    );
  }
  for (const c of becoming.cohorts.slice(0, 2)) {
    lines.push(tc("cohortLine", { program: c.programName, cohort: c.cohortName }));
  }
  // EVIDENCE
  lines.push(
    `${tc("evidence")}: ${tc("skills", { count: evidence.skillsTotal })} · ${tc("confirmed", { count: evidence.skillsConfirmed })} · ${tc("journalEntries", { count: evidence.journalEntries })}`,
  );
  // FITS NOW
  lines.push(`${tc("fits")}:`);
  if (fitsNow.length === 0) lines.push(tc("fitsNone"));
  for (const o of fitsNow.slice(0, ANSWER_LIMIT)) {
    // Facts joined with separators — no sentence to translate; every word
    // in the line is a localized label.
    const type =
      o.opportunityType && tsd.has(`opportunityType.${o.opportunityType}` as never)
        ? (tsd(`opportunityType.${o.opportunityType}` as never) as string)
        : null;
    const fit = o.status === "strong" ? tc("fitStrong") : tc("fitPossible");
    lines.push(
      `• ${[`${o.roleSlug ? prof(o.roleSlug) : "—"} — ${o.companyName ?? "—"}`, country(o.country), type, fit]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  // MISSING → the closing step is named, never "gap found" alone (§16)
  lines.push(`${tc("missing")}:`);
  if (missing.skills.length === 0) lines.push(tc("missingNone"));
  else {
    lines.push(
      missing.source === "opportunities"
        ? tc("missingFromOpportunities")
        : missing.source === "program"
          ? tc("missingFromProgram")
          : tc("missingFromProfession"),
    );
    for (const m of missing.skills.slice(0, ANSWER_LIMIT)) {
      lines.push(t("compassMissingLine", { skill: skill(m.slug), count: m.askedBy }));
    }
  }

  // NEXT — each step is a real chat action (the same doors the section links).
  const STEP_CHIP: Record<string, string> = {
    choose_direction: "profile",
    declare_skills: "cv",
    add_current_education: "f:worker.add-education",
    log_first_entry: "logwork",
    set_availability: "f:worker.save-work-card",
    express_interest: "jobs",
    gain_evidence_for_missing: "logwork",
  };
  const chips = nextSteps
    .slice(0, 2)
    .map((step) => ({ id: STEP_CHIP[step] ?? "compass-page", label: tc(`step_${step}` as never) as string }));
  chips.push({ id: "compass-page", label: t("chipCompassPage") });

  return {
    kind: "answer",
    text: lines.join("\n"),
    explanation: { why: t("whyCompass") },
    chips,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Journal — "show my latest journal"
// ═══════════════════════════════════════════════════════════════════════════

/** "Recent" for the journal answer: the last two weeks INCLUDING today. */
const RECENT_JOURNAL_DAYS = 14;

/** Inclusive UTC calendar-day window the section's period keys describe —
 *  the SAME numbers as `PERIOD_DAYS` in work-intelligence.ts (7 / 30 / 365). */
const PERIOD_WINDOW_DAYS: Record<Exclude<JournalPeriodPhrase, "all" | "today" | "yesterday">, number> = {
  week: 7,
  month: 30,
  year: 365,
};

/**
 * The person's most recent real journal entries, from the canonical Time Engine
 * projection (the same rows the calendar shows). No second journal read.
 *
 * THE WINDOW LOOKS BACK (issue #1689). This used to read the calendar's
 * `agenda` range — today and the 13 days AFTER it — while its copy said "in
 * the last N days". The journal is FACT: what really happened, so nearly
 * every entry sat before the window and "kiek valandų dirbau šiandien?" was
 * answered from tomorrow onward. The range now ends today and starts
 * `RECENT_JOURNAL_DAYS - 1` days earlier, and the answer carries the hours
 * those entries add up to — each entry's own canonical duration label, the
 * same one the calendar shows, summed once per entry.
 *
 * THE WINDOW IS THE ONE THE PERSON ASKED ABOUT (issue #1689, outcome 1 —
 * production 2026-09-11: "kiek valandų dirbau šiandien?" answered "Iš viso
 * per 13 d.: 27 val." while the section showed today as 20 h). When the
 * sentence names a period, the figure comes from `loadOwnWorkIntelligence`'s
 * `periods` — the SAME model and the SAME number the work-in-numbers section
 * shows for that tab (today / 7 / 30 / 365 days / all, confirmed hours told
 * apart) — and the entry lines are read over that window. "Yesterday" is a
 * single-day window the section has no tab for; it is summed the recent way.
 * No period word → the recent window, as before. Every answer names its
 * window, so nothing is silently reinterpreted.
 */
export async function runRecentJournal(text?: string): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const locale = await getLocale();
  const todayIso = new Date().toISOString().slice(0, 10);
  const period = parseJournalPeriodPhrase(text);
  const range =
    period === null
      ? { start: isoDayMinus(todayIso, RECENT_JOURNAL_DAYS - 1), end: todayIso }
      : period === "today"
        ? { start: todayIso, end: todayIso }
        : period === "yesterday"
          ? { start: isoDayMinus(todayIso, 1), end: isoDayMinus(todayIso, 1) }
          : period === "all"
            ? // The lines are bounded to the year; the FIGURE below is all-time.
              { start: isoDayMinus(todayIso, PERIOD_WINDOW_DAYS.year - 1), end: todayIso }
            : { start: isoDayMinus(todayIso, PERIOD_WINDOW_DAYS[period] - 1), end: todayIso };
  const planning = await getPlanning({ rangeStart: range.start, rangeEnd: range.end });
  if (planning.status !== "ok") return blocked(t("blockedNoPlan"), t("whyNoPlan"));

  // The planning read also returns entries CREATED in the range whose work
  // day lies outside it (D-13 keeps them for the calendar, which places each
  // on its own day). An answer about a WINDOW keeps only the entries worked
  // inside it — measured 2026-09-11: "today" listed yesterday's entry, typed
  // today, under a figure that (correctly) did not count it.
  const journalItems = planning.items
    .filter(
      (it) =>
        it.sourceType === "journal" &&
        it.startDate !== null &&
        it.startDate >= range.start &&
        it.startDate <= range.end,
    )
    .sort((a, b) => (a.startDate! < b.startDate! ? 1 : -1));
  const entries = journalItems.slice(0, ANSWER_LIMIT);

  // Hours over the whole window, one canonical label per entry ("<value>|<unit>").
  let windowHours = 0;
  let windowDayUnits = 0;
  for (const it of journalItems) {
    const parsed = parseDurationLabel(it.duration);
    if (!parsed) continue;
    if (parsed.unit === "days") windowDayUnits += parsed.value;
    else windowHours += workTimeHours(parsed.value, parsed.unit);
  }
  windowHours = Math.round(windowHours * 100) / 100;

  const periodLabel = period === null ? null : t(`journalPeriod_${period}`);
  const why =
    periodLabel === null
      ? t("whyJournalWindow", { days: rangeDays(range.start, range.end) })
      : t("whyJournalPeriod", { period: periodLabel });

  // A named section period: the section's own figure for that tab. The
  // model is FOCUSED on that period so its outputs (below) describe the
  // same window the figure does; "yesterday" and the recent default have
  // no section tab, so their outputs are read over all time and say so.
  const focus: WorkPeriodKey | null = period !== null && period !== "yesterday" ? period : null;
  const wi = await loadOwnWorkIntelligence({ focus: focus ?? "all" }).catch(() => null);
  const sectionPeriod = focus !== null ? (wi?.periods.find((p) => p.key === focus) ?? null) : null;
  const periodEntries = sectionPeriod?.entries ?? journalItems.length;

  if (periodEntries === 0 && entries.length === 0) {
    return {
      kind: "answer",
      text:
        periodLabel === null
          ? t("journalEmpty", { days: rangeDays(range.start, range.end) })
          : t("journalEmptyPeriod", { period: periodLabel }),
      explanation: { why },
      chips: [{ id: "logwork", label: t("chipLogWork") }],
    };
  }

  const fmt = new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
  const lines = entries.map((e) =>
    t("journalLine", {
      day: fmt.format(new Date(`${e.startDate}T00:00:00Z`)),
      what: e.label ?? t("journalUnlabelled"),
    }),
  );

  const dayUnits = sectionPeriod?.dayUnits ?? windowDayUnits;
  const dayUnitsLine = dayUnits > 0 ? " " + t("journalDayUnits", { days: fmtHours(dayUnits, locale) }) : "";
  const hoursLine =
    periodLabel === null
      ? windowHours > 0 || windowDayUnits > 0
        ? t("journalHoursTotal", {
            hours: fmtHours(windowHours, locale),
            days: rangeDays(range.start, range.end),
            entries: journalItems.length,
          }) + dayUnitsLine
        : t("journalHoursNone", { entries: journalItems.length })
      : sectionPeriod !== null
        ? sectionPeriod.hours > 0 || sectionPeriod.dayUnits > 0
          ? t("journalHoursPeriod", {
              period: periodLabel,
              hours: fmtHours(sectionPeriod.hours, locale),
              confirmed: fmtHours(sectionPeriod.confirmedHours, locale),
              entries: sectionPeriod.entries,
            }) + dayUnitsLine
          : t("journalHoursNonePeriod", { period: periodLabel, entries: sectionPeriod.entries })
        : windowHours > 0 || windowDayUnits > 0
          ? t("journalHoursPeriodPlain", {
              period: periodLabel,
              hours: fmtHours(windowHours, locale),
              entries: journalItems.length,
            }) + dayUnitsLine
          : t("journalHoursNonePeriod", { period: periodLabel, entries: journalItems.length });

  // WHAT WAS PRODUCED (issue #1689, owner line 6 — "ką padariau per tą
  // laiką?"): the completed outputs in their recorded units, from the same
  // model, over the same window as the figure (all time when the question
  // named none — the line says which). Never converted, never time.
  const outputsLine = wi === null ? null : await formatOutputsLine(wi, focus ?? "all", locale);

  // THE ORGANIZATION'S OWN RECORDS (owner §19): when an organization
  // recorded hours about the person in the same window (timesheet lines,
  // imported documents), the answer names that ledger beside the journal
  // figure — the model's own figure, added to nothing. A window the model
  // has no tab for ("yesterday", the recent default) reads the all-time
  // ledger and says so.
  const orgLedger =
    wi?.organizationRecords?.find((p) => p.key === (focus ?? "all")) ?? null;
  const orgLine =
    orgLedger !== null && orgLedger.hours > 0
      ? t("journalOrgRecords", {
          period: t(`journalPeriod_${focus ?? "all"}`),
          hours: fmtHours(orgLedger.hours, locale),
          days: orgLedger.daysWorked,
        })
      : null;

  // A period question is answered with its FIGURE first, then the entries.
  const body =
    periodLabel === null
      ? [
          t("journalIntro", { count: entries.length }),
          ...lines,
          hoursLine,
          ...(orgLine ? [orgLine] : []),
          ...(outputsLine ? [outputsLine] : []),
        ]
      : [
          hoursLine,
          ...(orgLine ? [orgLine] : []),
          ...(outputsLine ? [outputsLine] : []),
          ...(lines.length > 0 ? [t("journalPeriodLines"), ...lines] : []),
        ];

  return {
    kind: "answer",
    text: body.join("\n"),
    explanation: { why },
    chips: [
      { id: "logwork", label: t("chipLogWork") },
      { id: "journal-numbers", label: t("chipJournalNumbers") },
    ],
  };
}

/** ISO day `days` before `todayIso` (UTC calendar days — never local time). */
function isoDayMinus(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The planning strip's canonical `"<value>|<unit>"` duration label. */
function parseDurationLabel(
  label: string | null,
): { value: number; unit: "hours" | "minutes" | "days" } | null {
  if (!label) return null;
  const sep = label.indexOf("|");
  if (sep <= 0) return null;
  const value = Number(label.slice(0, sep));
  const unit = label.slice(sep + 1);
  if (!Number.isFinite(value) || value <= 0 || !isWorkTimeUnit(unit)) return null;
  return { value, unit };
}

function fmtHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hours);
}

function fmtPct(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
}

/** The model's focus-period outputs as one sentence naming its window, or
 *  null when nothing was produced in a non-time unit. Unit names come from
 *  the ONE `productivityUnits` catalogue the section and the pickers use. */
async function formatOutputsLine(
  wi: WorkIntelligence,
  focus: WorkPeriodKey,
  locale: string,
): Promise<string | null> {
  if (wi.outputs.length === 0) return null;
  const t = await getTranslations("workspace.ai");
  const tUnit = await getTranslations("productivityUnits");
  const tProf = await getTranslations("professions");
  // one unit is totalled only inside one kind of work (re-audit F9) — the
  // kind is named so "km driven" and "km of cable" read as two outputs
  const list = wi.outputs
    .slice(0, ANSWER_LIMIT)
    .map((o) =>
      o.activity
        ? t("wiOutputItemActivity", {
            value: fmtHours(o.value, locale),
            unit: tUnit.has(o.unit) ? tUnit(o.unit) : o.unit,
            activity: tProf.has(o.activity) ? tProf(o.activity) : o.activity,
            entries: o.entries,
          })
        : t("wiOutputItem", {
            value: fmtHours(o.value, locale),
            unit: tUnit.has(o.unit) ? tUnit(o.unit) : o.unit,
            entries: o.entries,
          }),
    )
    .join("; ");
  return t("wiOutputs", { period: t(`journalPeriod_${focus}`), list });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3b. Work intelligence by sentence — "kiek programavau?", "kokius įgūdžius
//     naudoju daugiausia?", "kokia veikla užima daugiausia laiko?", "kas
//     patvirtinta?"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The questions the work-in-numbers section answers, asked in words (issue
 * #1689, re-audit 2026-09-11, owner chat lines 2–5 and 7). Measured before
 * this: every one of them fell to the generic fallback or to the PROFILE
 * answer. The data was there — `loadOwnWorkIntelligence` carries hours per
 * skill (attributed / confirmed / shared), activities, contexts and
 * confirmations — only the door was missing.
 *
 * ONE MODEL, ONE READER. Nothing is re-derived here: every figure is a field
 * of the same `WorkIntelligence` the section renders, focused on the period
 * the sentence names (`parseJournalPeriodPhrase`; none → all time). Every
 * answer NAMES ITS WINDOW AND ITS DENOMINATOR — "5 h attributed of 36 h
 * recorded", "38 % of the 13 h attributed to skills" — because a share of an
 * unstated base is the F3 defect the re-audit found on the section itself.
 *
 * THE SUBJECT IS READ BY THE JOURNAL RECOGNIZER. "Kiek programavau?" names
 * its skill the way an intake sentence does, so the SAME recognizer
 * (`extractJournalSuggestions`) reads it: `programming` as the skill,
 * `software_developer` as the kind of work. A subject it cannot recognise
 * falls back to the plain period answer (`runRecentJournal`) — an honest
 * total, never a guess at which skill was meant.
 *
 * SOURCE ENTRIES are one chip away through the journal's EXISTING
 * drill-down (`?skill=<slug>&period=<key>`), emitted by the chat as a route;
 * this layer hands over the slug and the period, never a path (W4).
 *
 * NO LLM. Deterministic floor; every figure is a real row or an honest
 * "could not read" (never a zero nobody counted — SEP-7).
 */
export async function runWorkIntelligenceQuestion(
  text: string,
  intent: ConversationIntent,
): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const locale = await getLocale();
  const phrase = parseJournalPeriodPhrase(text);
  // "Yesterday" is a single day the model has no window for: answered over
  // all time, and the answer says so (the window is always named).
  const focus: WorkPeriodKey = phrase === null || phrase === "yesterday" ? "all" : phrase;
  const periodLabel = t(`journalPeriod_${focus}`);
  const why = t("whyWi", { period: periodLabel });

  const wi = await loadOwnWorkIntelligence({ focus }).catch(() => null);
  if (wi === null) return blocked(t("wiUnread"), why);
  const totals = wi.periods.find((p) => p.key === focus) ?? null;
  if (totals === null) return blocked(t("wiUnread"), why);

  const tSkill = await getTranslations("skillNames");
  const tProf = await getTranslations("professions");
  const skillName = (slug: string): string => (tSkill.has(slug) ? tSkill(slug) : slug);
  const activityName = (key: string): string => (tProf.has(key) ? tProf(key) : key);
  const fmtDay = new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", timeZone: "UTC" });
  const dayOf = (iso: string | null): string => (iso ? fmtDay.format(new Date(`${iso}T00:00:00Z`)) : "—");
  const chips = [{ id: "journal-numbers", label: t("chipJournalNumbers") }];
  const totalHours = fmtHours(totals.hours, locale);

  if (totals.entries === 0) {
    return {
      kind: "answer",
      text: t("journalEmptyPeriod", { period: periodLabel }),
      explanation: { why },
      chips: [{ id: "logwork", label: t("chipLogWork") }],
    };
  }

  if (intent === "journal-skill") {
    const read = extractJournalSuggestions(text);
    const skill =
      read.skillSlugs.map((slug) => wi.skills.find((s) => s.slug === slug)).find((s) => s !== undefined) ?? null;
    if (skill) {
      const name = skillName(skill.slug);
      const lines = [
        t("wiSkillHours", {
          skill: name,
          hours: fmtHours(skill.attributedHours, locale),
          total: totalHours,
          period: periodLabel,
          confirmed: fmtHours(skill.confirmedHours, locale),
        }),
      ];
      if (skill.sharedHours > 0) lines.push(t("wiSkillShared", { hours: fmtHours(skill.sharedHours, locale) }));
      lines.push(
        skill.entries > 0
          ? t("wiSkillWhere", {
              entries: skill.entries,
              days: skill.days,
              contexts: skill.contexts,
              day: dayOf(skill.lastWorkedDay),
            })
          : t("wiSkillNoEntries", { period: periodLabel }),
      );
      return {
        kind: "answer",
        text: lines.join("\n"),
        explanation: { why },
        chips: [
          ...(skill.entries > 0
            ? [{ id: `journal-entries:${skill.slug}:${focus}`, label: t("chipSkillEntries", { skill: name }) }]
            : []),
          ...chips,
        ],
      };
    }
    // No catalogue skill — perhaps a kind of work ("Kiek klojau plyteles?"
    // → tiler) the activity list carries under its slug or its own label.
    const keys = read.fragments
      .flatMap((f) => [f.activitySlug, f.activityLabel])
      .filter((k): k is string => Boolean(k));
    const activity = keys.map((k) => wi.activities.find((a) => a.key === k)).find((a) => a !== undefined) ?? null;
    if (activity) {
      return {
        kind: "answer",
        text: t("wiActivityHours", {
          activity: activityName(activity.key),
          hours: fmtHours(activity.hours, locale),
          total: totalHours,
          period: periodLabel,
          entries: activity.entries,
          day: dayOf(activity.lastWorkedDay),
        }),
        explanation: { why },
        chips,
      };
    }
    const subject = read.skillSlugs[0] ? skillName(read.skillSlugs[0]) : keys[0] ? activityName(keys[0]) : null;
    if (subject) {
      // Recognised, but nothing recorded under it in this window.
      return {
        kind: "answer",
        text: t("wiSubjectNone", { subject, period: periodLabel, total: totalHours, entries: totals.entries }),
        explanation: { why },
        chips,
      };
    }
    // No subject the recognizer knows: the plain period answer, unchanged.
    return runRecentJournal(text);
  }

  if (intent === "journal-skills-top") {
    const top = wi.skills.filter((s) => s.attributedHours > 0 || s.sharedHours > 0).slice(0, ANSWER_LIMIT);
    if (top.length === 0) {
      return {
        kind: "answer",
        text: t("wiSkillsNone", { period: periodLabel, total: totalHours, entries: totals.entries }),
        explanation: { why },
        chips,
      };
    }
    const attributed = fmtHours(wi.attributedHours, locale);
    const lines = [
      t("wiSkillsIntro", { period: periodLabel, attributed, total: totalHours, entries: totals.entries }),
      ...top.map((s) =>
        t("wiSkillLine", {
          skill: skillName(s.slug),
          hours: fmtHours(s.attributedHours, locale),
          pct: fmtPct(s.share, locale),
          attributed,
          confirmed: fmtHours(s.confirmedHours, locale),
          shared: fmtHours(s.sharedHours, locale),
        }),
      ),
    ];
    if (wi.sharedHours + wi.multiActivityHours + wi.unattributedHours > 0) {
      lines.push(
        t("wiSkillsRemainder", {
          shared: fmtHours(wi.sharedHours + wi.multiActivityHours, locale),
          unlinked: fmtHours(wi.unattributedHours, locale),
        }),
      );
    }
    return { kind: "answer", text: lines.join("\n"), explanation: { why }, chips };
  }

  if (intent === "journal-activities-top") {
    const top = wi.activities.filter((a) => a.hours > 0).slice(0, ANSWER_LIMIT);
    if (top.length === 0) {
      return {
        kind: "answer",
        text: t("wiActivitiesNone", { period: periodLabel, total: totalHours, entries: totals.entries }),
        explanation: { why },
        chips,
      };
    }
    // The coverage figures are the MODEL's (`activityHours` + `unlabelledHours`
    // = the period's hours; `share` is of all recorded hours) — the same ones
    // the section's "Kinds of work" states, never re-derived here.
    const lines = [
      t("wiActivitiesIntro", { period: periodLabel, labelled: fmtHours(wi.activityHours, locale), total: totalHours }),
      ...top.map((a) =>
        t("wiActivityLine", {
          activity: activityName(a.key),
          hours: fmtHours(a.hours, locale),
          pct: fmtPct(a.share, locale),
          entries: a.entries,
        }),
      ),
    ];
    if (wi.unlabelledHours > 0) lines.push(t("wiActivitiesUnlabelled", { hours: fmtHours(wi.unlabelledHours, locale) }));
    return { kind: "answer", text: lines.join("\n"), explanation: { why }, chips };
  }

  // journal-confirmed
  const confirmedSkills = wi.skills.filter((s) => s.confirmedHours > 0).slice(0, ANSWER_LIMIT);
  if (totals.confirmedHours <= 0 && wi.evidence.confirmed === 0) {
    return {
      kind: "answer",
      text: t("wiConfirmedNone", { period: periodLabel, total: totalHours, entries: totals.entries }),
      explanation: { why },
      chips,
    };
  }
  const lines = [
    t("wiConfirmedHours", {
      period: periodLabel,
      confirmed: fmtHours(totals.confirmedHours, locale),
      total: totalHours,
      confirmedEntries: wi.evidence.confirmed,
      entries: totals.entries,
    }),
  ];
  if (confirmedSkills.length > 0) {
    lines.push(
      t("wiConfirmedSkills", {
        list: confirmedSkills
          .map((s) => t("wiConfirmedSkillItem", { skill: skillName(s.slug), hours: fmtHours(s.confirmedHours, locale) }))
          .join(", "),
      }),
    );
  }
  return { kind: "answer", text: lines.join("\n"), explanation: { why }, chips };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Figures — "show my approved hours" / "prepare the report"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The canonical reports figures for whichever side the person is acting as.
 *
 * HONESTY NOTE THAT MATTERS. The owner's example was "show my approved hours".
 * This platform does not keep an approved-hours ledger — what it really records
 * is manager-CONFIRMED journal entries and confirmed skills. So the answer
 * gives those, and says plainly that hours approval is not something the
 * product tracks. Inventing an hours figure from entry counts would be exactly
 * the fabrication doctrine §7 forbids, and it would be a number someone might
 * put in front of an employer.
 */
export async function runFigures(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  if (!ctx.permissionsKnown && !ctx.hasWorkerProfile) {
    return blocked(t("blockedNoWorker"), t("whyNoWorker"));
  }

  const view = await getReportsView(ctx.identity === "company" ? "company" : "worker");
  if (view.kind === "worker") {
    if (!view.evidence) {
      return {
        kind: "answer",
        text: t("figuresWorkerEmpty"),
        explanation: { why: t("whyFigures") },
        chips: [{ id: "logwork", label: t("chipLogWork") }],
      };
    }
    // A count we could not read must not be STATED as a number. The two
    // journal figures are nullable (see lib/reports/evidence-report.ts), and
    // interpolating null here would put a number nobody counted — or the word
    // itself — into a sentence the person reads as fact. The skills figures
    // are always counted, so those are still given.
    const entriesUnread =
      view.evidence.journalEntries === null ||
      view.evidence.confirmations === null;
    // HOURS, at last (issue #1689). The old line said the platform keeps no
    // hours figure. Since the canonical work-time rule (owner ruling
    // 2026-08-18) it does: every entry's recorded duration, counted once,
    // with the confirmed part told apart. An unreadable journal says so —
    // it never states a zero nobody counted.
    const locale = await getLocale();
    const wi = await loadOwnWorkIntelligence().catch(() => null);
    const month = wi?.periods.find((p) => p.key === "month") ?? null;
    const all = wi?.periods.find((p) => p.key === "all") ?? null;
    const hoursLine =
      wi === null || all === null || month === null
        ? t("figuresWorkerHoursUnread")
        : all.hours > 0
          ? t("figuresWorkerHours", {
              total: fmtHours(all.hours, locale),
              confirmed: fmtHours(all.confirmedHours, locale),
              month: fmtHours(month.hours, locale),
            })
          : t("figuresWorkerHoursNone", { entries: all.entries });
    return {
      kind: "answer",
      text: [
        entriesUnread
          ? t("figuresWorkerUnread", {
              skills: view.evidence.totalSkills,
              confirmed: view.evidence.confirmed,
            })
          : t("figuresWorker", {
              entries: view.evidence.journalEntries ?? 0,
              confirmations: view.evidence.confirmations ?? 0,
              skills: view.evidence.totalSkills,
              confirmed: view.evidence.confirmed,
            }),
        hoursLine,
      ].join("\n"),
      explanation: { why: t("whyFigures") },
      chips: [{ id: "journal-numbers", label: t("chipJournalNumbers") }],
    };
  }

  const demand = view.demand.state === "ok" ? view.demand : null;
  const projects = view.projects.state === "ok" ? view.projects : null;
  const tasks = view.tasks.state === "ok" ? view.tasks : null;
  const parts: string[] = [];
  if (demand) parts.push(t("figuresOrgDemand", { open: demand.open, total: demand.total }));
  if (projects) parts.push(t("figuresOrgProjects", { total: projects.total }));
  if (tasks) parts.push(t("figuresOrgTasks", { open: tasks.open, total: tasks.total }));
  if (parts.length === 0) {
    return blocked(t("figuresOrgUnavailable"), t("whyFigures"));
  }
  // §19 EXPORT / DOWNLOAD by sentence: the report a manager can take away is
  // the project operations CSV the operations page already serves (the ONE
  // route, manager-gated + RLS there). Offered for the projects the person
  // really manages — bounded, never a report store of its own.
  const locale = await getLocale();
  const managed = await listManagedProjects();
  const chips = managed.slice(0, 3).map((p) => ({
    id: `download:/${locale}/dashboard/projects/${p.id}/operations/report`,
    label: t("chipProjectCsv", { title: p.title ?? p.id.slice(0, 8) }),
  }));
  return {
    kind: "answer",
    text: [t("figuresOrgIntro"), ...parts].join("\n"),
    explanation: { why: t("whyFigures") },
    ...(chips.length > 0 ? { chips } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Open a project — the AI opens an entity, it does not navigate
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "Open this project."
 *
 * Resolves against the projects the person really manages, then returns an
 * EntityRef for the workspace to OPEN — `AI_MAY_NEVER_CHANGE` includes the page
 * and the route, so this workflow never returns a destination. The Context
 * Panel (W3) renders it.
 *
 * Ambiguity is asked about, never guessed: several name matches yield the list,
 * not a pick.
 */
export async function runOpenProject(text: string): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  const projects = await listManagedProjects();

  if (projects.length === 0) {
    // "this project" with no name: the one project covering today is the only
    // unambiguous reading, and the context resolver already applies that rule.
    if (ctx.project) {
      return {
        kind: "open-entity",
        ref: { type: "project", id: ctx.project.id },
        text: t("openedProject", { title: ctx.project.title ?? t("projectUntitled") }),
        explanation: { why: t("whyActiveProject") },
      };
    }
    return blocked(t("blockedNoProjects"), t("whyNoProjects"));
  }

  const named = matchByName(
    text,
    projects.map((p) => ({ id: p.id, name: p.title ?? "" })),
  );

  if (named.length === 1) {
    const project = projects.find((p) => p.id === named[0].id)!;
    return {
      kind: "open-entity",
      ref: { type: "project", id: project.id },
      text: t("openedProject", { title: project.title ?? t("projectUntitled") }),
      explanation: { why: t("whyNamedProject", { words: named[0].matchedText }) },
    };
  }

  if (named.length === 0 && ctx.project) {
    return {
      kind: "open-entity",
      ref: { type: "project", id: ctx.project.id },
      text: t("openedProject", { title: ctx.project.title ?? t("projectUntitled") }),
      explanation: { why: t("whyActiveProject") },
    };
  }

  const candidates = (named.length > 1 ? named : projects.slice(0, ANSWER_LIMIT)).map((c) =>
    "name" in c ? c.name : (projects.find((p) => p.id === c.id)?.title ?? ""),
  );
  return {
    kind: "answer",
    text: [t("whichProject"), ...candidates.filter(Boolean).map((c) => `— ${c}`)].join("\n"),
    explanation: { why: t("whyAmbiguous") },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Find workers — the employer side
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "Find workers."
 *
 * Scouting runs against ONE demand, so the honest first step is naming the
 * demands the company actually has. Nothing is scouted for a demand the person
 * has not chosen — a candidate list attached to the wrong need is worse than no
 * list.
 */
export async function runFindWorkers(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  if (ctx.identity !== "company") {
    return blocked(t("blockedNotEmployer"), t("whyNotEmployer"));
  }
  // W8 slice 1: the company IDENTITY is not the same fact as an active company
  // CONTEXT. Without the second one `listCompanyDemands` returns an empty list,
  // and answering "your company has not posted a demand yet" would state
  // something this workflow does not know. Blocked with the switch-space
  // explanation instead of an invented emptiness.
  if ((await resolveEmployerCompanyContext()).kind !== "ok") {
    return blocked(t("blockedNotEmployer"), t("whyNotEmployer"));
  }

  const demands = await listCompanyDemands();
  if (demands.length === 0) {
    return {
      kind: "answer",
      text: t("noDemands"),
      explanation: { why: t("whyFromYourDemands") },
      chips: [{ id: "f:company.create-demand", label: t("chipCreateDemand") }],
    };
  }

  const open = demands.slice(0, ANSWER_LIMIT);
  return {
    kind: "answer",
    text: [
      t("demandsIntro", { count: demands.length }),
      ...open.map((d) =>
        t("demandLine", {
          title: d.title,
          state: d.structured ? t("demandStructured") : t("demandUnstructured"),
        }),
      ),
      // W8 CLOSES THIS DEAD END. The line above used to be
      // `scoutingNotInWorkspaceYet` — "running the scouting engine per demand
      // needs a resolver so the candidates land in the Context Panel; until
      // that exists the AI states where the work stops instead of handing the
      // person a route". That resolver now exists
      // (`lib/conversation/employer-workspace.ts`) and the panel has a
      // `candidates` result, so the honest answer is no longer a full stop.
      t("scoutingPickDemand"),
    ].join("\n"),
    explanation: { why: t("whyFromYourDemands") },
    // STILL NO `link:` CHIP — that would navigate out of the workspace, which
    // is what `AI_MAY_NEVER_CHANGE` forbids and what the W4 final review
    // (finding A1) pinned. A `demand:` chip is the opposite: it changes the
    // result depth inside this workspace and never leaves the page. The id is
    // a request to look, not a permission — `runScouting` re-derives the
    // company context and re-verifies ownership before ranking anybody.
    chips: open.map((d) => ({ id: `demand:${d.id}`, label: d.title })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. "What do you know about me right now?"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The context readback. Not decoration: an AI that claims to understand the
 * current workspace, company, project and permissions must be able to SHOW
 * what it understands, so the person can catch it being wrong.
 */
export async function runContextReadback(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  const lines: string[] = [];

  lines.push(
    ctx.workspace
      ? t("ctxWorkspace", {
          name:
            ctx.workspace.kind === "personal"
              ? t("personalWorkspace")
              : (ctx.workspace.name ?? t("unnamedOrganization")),
        })
      : t("ctxWorkspaceUnknown"),
  );
  if (ctx.company) {
    lines.push(t("ctxCompany", { name: ctx.company.name ?? t("unnamedOrganization") }));
  }
  lines.push(
    ctx.project
      ? t("ctxProject", { title: ctx.project.title ?? t("projectUntitled") })
      : t("ctxProjectNone"),
  );
  lines.push(
    ctx.journal?.lastEntryDay
      ? t("ctxJournal", { day: ctx.journal.lastEntryDay })
      : t("ctxJournalNone"),
  );
  lines.push(
    ctx.permissionsKnown
      ? t("ctxRoles", { roles: ctx.roles.join(", ") })
      : t("ctxRolesUnknown"),
  );

  return {
    kind: "answer",
    text: lines.join("\n"),
    explanation: { why: t("whyContext") },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// helpers
// ═══════════════════════════════════════════════════════════════════════════

async function blocked(text: string, why: string): Promise<WorkflowResult> {
  return { kind: "blocked", text, explanation: { why } };
}

function rangeDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
}

/**
 * Match a sentence against real object names. Case-insensitive containment of
 * the whole name — deliberately strict, because opening the WRONG project is a
 * worse failure than asking which one.
 */
function matchByName(
  text: string,
  objects: readonly { id: string; name: string }[],
): Array<{ id: string; name: string; matchedText: string }> {
  const hay = (text ?? "").toLowerCase();
  const out: Array<{ id: string; name: string; matchedText: string }> = [];
  for (const o of objects) {
    const name = o.name.trim().toLowerCase();
    if (name.length < 3) continue;
    if (hay.includes(name)) out.push({ id: o.id, name: o.name, matchedText: o.name });
  }
  return out;
}

/**
 * "KAM PATEIKTI ATLIKTĄ DARBĄ?" — who can verify the work this person already
 * did (owner P0, 2026-09-06).
 *
 * THE DEFECT: this sentence matched `find-work` on the bare noun `darbą` and
 * the person was shown job adverts. They had not asked for work; they had
 * asked who RECEIVES work they had already done.
 *
 * Window 8 refused to route it somewhere plausible, because guessing a
 * direction was that window's entire defect class. The product decision was
 * made instead, and this implements it literally:
 *
 *   exactly one valid verifier → name it and say whether it can confirm today
 *   several                    → present the legitimate choices, choose none
 *   none                       → say so plainly; the work stays real,
 *                                self-reported evidence, and the next step is
 *                                to identify the responsible person
 *
 * A VERIFIER IS NEVER INVENTED. Every organization named here is one the
 * person genuinely holds an active relationship with, read under their own
 * RLS. `none` is a real answer, not a failure to compute one.
 *
 * UNKNOWN IS NOT "NOBODY" (§54). When the contexts cannot be read, this says
 * it could not check — never "nobody can confirm your work", which would be a
 * lie produced by an outage.
 */
export async function runWhoVerifiesWork(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const ctx = await loadAiWorkspaceContext();
  if (!ctx.hasWorkerProfile) return blocked(t("blockedNoWorker"), t("whyNoWorker"));

  const answer = await resolveMyVerifiers();

  // The read failed. Say that, and nothing else.
  if (answer.unavailable) {
    return blocked(t("verifierUnavailable"), t("whyVerifierUnavailable"));
  }

  const nameOf = (organizationId: string): string => {
    const hit = answer.options.find((o) => o.organizationId === organizationId);
    // An organization with neither display nor legal name is real and common
    // on production. "your employer" is honest; an empty string is not.
    return hit?.organizationName?.trim() || t("verifierUnnamedOrganization");
  };
  const canConfirm = (organizationId: string): boolean =>
    answer.options.find((o) => o.organizationId === organizationId)?.confirmationEnabled === true;

  // NO CHIP. W4 (`w4-ai-workspace.test.ts`): a workspace answer never offers a
  // chip that navigates out of the workspace — the answer IS the answer. The
  // first draft of this handed over a `link:/dashboard/journal` chip, which is
  // the old "here is a page, go figure it out" reflex the chat exists to
  // replace. Every branch below therefore says the whole thing in words,
  // including the next step.

  switch (answer.resolution.kind) {
    case "organization": {
      const id = answer.resolution.organizationId;
      // Two different truths, never merged: someone can confirm today, or the
      // employer is known but nobody there is set up to confirm yet.
      return {
        kind: "answer",
        text: canConfirm(id)
          ? t("verifierOne", { organization: nameOf(id) })
          : t("verifierOneNotEnabled", { organization: nameOf(id) }),
        explanation: { why: t("whyVerifier") },
      };
    }
    case "choice": {
      const names = answer.resolution.organizationIds.map(nameOf).join(" · ");
      // Several are legitimate, so NOTHING is preselected — the same rule
      // `resolveEngagementContext` follows when it refuses to guess a context.
      return {
        kind: "answer",
        text: t("verifierChoice", { organizations: names }),
        explanation: { why: t("whyVerifierChoice") },
      };
    }
    case "self": {
      return {
        kind: "answer",
        text: t("verifierSelf", { organization: nameOf(answer.resolution.organizationId) }),
        explanation: { why: t("whyVerifierSelf") },
      };
    }
    case "none":
    default: {
      // The 15 orphaned records' answer. The work is NOT dismissed: it stays
      // the person's own recorded evidence, and the honest next step is named.
      return {
        kind: "answer",
        text: t("verifierNone"),
        explanation: { why: t("whyVerifierNone") },
      };
    }
  }
}
