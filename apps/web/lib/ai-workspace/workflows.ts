"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { findWorkForChat } from "@/lib/conversation/find-work";
import { loadWorkerOpportunityBoard } from "@/lib/marketplace/worker-opportunities";
import { getReportsView } from "@/lib/reports/reports-hub";
import { listManagedProjects } from "@/lib/projects/projects";
import { listCompanyDemands } from "@/lib/scouting/scouting";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getPlanning } from "@/lib/planning/planning";
import { visibleRange } from "@/lib/planning/planning-model";
import {
  DOCUMENT_GAP_LINE_CAP,
  groupMissingDocumentsByType,
  type DocumentGap,
} from "@/lib/conversation/documents-gap";
import { loadWorkerDocumentGap } from "@/lib/conversation/documents-gap-server";
import { readLearningCompass } from "@/lib/learning/learning-compass";
import { loadUnchosenCountryNextSteps } from "@/lib/conversation/country-next-steps-server";
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
export async function runFindWork(text: string): Promise<WorkflowResult> {
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
   * ── W6 EXTENSION POINT (persistent filters) ──────────────────────────────
   * `reading.filters` is the World State the person just expressed. Today it is
   * applied to THIS search only and then forgotten, so a later sentence starts
   * from an unnarrowed world.
   *
   * When the owner approves persistence, this is the seam: the caller dispatches
   * `change_world_state` per entry of `reading.filters` before searching, and
   * the search reads `state.activeFilters` instead of this local value. The
   * reducer transition already exists and is unit-tested; the map subscribes to
   * the same slot in W6. See docs/product/AI_WORKSPACE_W4_V1.md §7.
   *
   * NOT wired here on purpose: persistence changes behaviour across turns
   * (when do filters clear?), which is a product decision, not a refactor.
   */
  const result = await findWorkForChat(reading.filters);
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

/**
 * The person's most recent real journal entries, from the canonical Time Engine
 * projection (the same rows the calendar shows). No second journal read.
 */
export async function runRecentJournal(): Promise<WorkflowResult> {
  const t = await getTranslations("workspace.ai");
  const locale = await getLocale();
  const todayIso = new Date().toISOString().slice(0, 10);
  const range = visibleRange("agenda", todayIso);
  const planning = await getPlanning({ rangeStart: range.start, rangeEnd: range.end });
  if (planning.status !== "ok") return blocked(t("blockedNoPlan"), t("whyNoPlan"));

  const entries = planning.items
    .filter((it) => it.sourceType === "journal" && it.startDate !== null)
    .sort((a, b) => (a.startDate! < b.startDate! ? 1 : -1))
    .slice(0, ANSWER_LIMIT);

  if (entries.length === 0) {
    return {
      kind: "answer",
      text: t("journalEmpty", { days: rangeDays(range.start, range.end) }),
      explanation: { why: t("whyJournalWindow", { days: rangeDays(range.start, range.end) }) },
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

  return {
    kind: "answer",
    text: [t("journalIntro", { count: entries.length }), ...lines].join("\n"),
    explanation: { why: t("whyJournalWindow", { days: rangeDays(range.start, range.end) }) },
    chips: [{ id: "logwork", label: t("chipLogWork") }],
  };
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
    return {
      kind: "answer",
      text: [
        t("figuresWorker", {
          entries: view.evidence.journalEntries,
          confirmations: view.evidence.confirmations,
          skills: view.evidence.totalSkills,
          confirmed: view.evidence.confirmed,
        }),
        t("figuresNoHoursLedger"),
      ].join("\n"),
      explanation: { why: t("whyFigures") },
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
