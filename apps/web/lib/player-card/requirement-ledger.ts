import { deriveDocumentStatus, type RequirementRow, type WorkerDocumentRow } from "@/lib/documents/readiness";
import { inventoryHref } from "@/lib/documents/document-centre-model";
import { documentTypesForReadinessItem } from "@/lib/projects/readiness-items";
import { foldText } from "@/lib/structuring/normalize";

/**
 * REQUIREMENT LEDGER — the contextual readiness book (frozen design contract
 * 2026-09-05 §5 P3, §9 rows 1–2; owner contract §12 / §16 / §17; design
 * system N and A.4 "a gap is never the end").
 *
 * ONE read model for a PERSON in a CONTEXT — a project assignment, an
 * opportunity (a company's open demand), or a role (profession + country):
 * the ordered requirement rows, each with WHAT is required · WHY / for what ·
 * the person's CURRENT STATE from their own canonical rows · the PROVENANCE
 * of that state · and, for every row that is not satisfied, at least one
 * RESOLUTION that exists in the data (a training programme row, a service
 * offering row, the issuing authority the country matrix already names, the
 * add-document action) or the honest "no resolution recorded yet" with the
 * existing ask action.
 *
 * NOT A SECOND READINESS MODEL. The states are derived by the existing
 * derivers and only composed here:
 *   - documents → `deriveDocumentStatus` (lib/documents/readiness), the same
 *     rule the documents page, the chat's documents gap and the person's
 *     project asks use;
 *   - the manager's checklist → the rows `worker-project-asks` already bridges
 *     to document types (`READINESS_ITEM_DOCUMENT_TYPES`);
 *   - skills → the matching engine's own matched / missing slugs
 *     (`FitBasis.matchedUris` / `missingUris`) or the profession mirror
 *     (`skillsForProfession`) against the person's `worker_skills`;
 *   - availability → the same signal the player-card readiness pillar reads.
 * Nothing is scored, nothing is ranked into a number (doctrine §7 / A.7).
 *
 * PURE — no IO, no clock (the caller passes `now`), no copy: labels are slugs
 * and verbatim manager text; the consumer localizes. The server composition
 * lives in requirement-ledger-server.ts.
 */

// ── Context ──────────────────────────────────────────────────────────────────

export type RequirementLedgerContext =
  | {
      readonly kind: "project";
      readonly projectId: string;
      /** The instruction thread the person already has for this project (the
       *  existing "ask for clarification" reply path) — the honest empty
       *  state's ask action points there when known. */
      readonly conversationId?: string | null;
    }
  | { readonly kind: "opportunity"; readonly requestId: string }
  | { readonly kind: "role"; readonly professionSlug: string; readonly country: string | null };

// ── Rows ─────────────────────────────────────────────────────────────────────

export type RequirementKind = "document" | "skill" | "language" | "availability" | "other";

/** have / valid / expiring / missing / unknown in the owner's vocabulary:
 *  `valid` = the person has it and it currently covers them. */
export type RequirementState = "valid" | "expiring" | "missing" | "unknown";

export type RequirementLevel = "required" | "recommended" | "conditional";

/** WHY the row is required — who asks for it. */
export type RequirementReason = "project_checklist" | "country_requirement" | "employer_demand" | "profession";

export type ManagerChecklistStatus = "needed" | "missing" | "received" | "checked" | "rejected" | "expired";

export type RequirementSubject =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "document_type"; readonly slug: string }
  | { readonly kind: "skill"; readonly slug: string }
  | { readonly kind: "language"; readonly code: string; readonly level: string | null }
  | { readonly kind: "availability" };

/** Where the CURRENT STATE comes from — never a claim without a source. */
export type RequirementProvenance =
  | { readonly source: "own_document"; readonly validUntil: string | null }
  | { readonly source: "own_skill"; readonly verified: boolean }
  | { readonly source: "own_language"; readonly level: string }
  | { readonly source: "own_profile" }
  | { readonly source: "manager_checklist"; readonly status: ManagerChecklistStatus }
  /** The read that would answer did not answer (disabled / unavailable) —
   *  the state is UNKNOWN, never "missing". */
  | { readonly source: "not_readable" }
  /** The read answered and holds nothing for this requirement. */
  | { readonly source: "none" };

export type ResolutionWhy = "assigned_to_you" | "name_matches" | "names_the_issuer" | "records_it" | "evidence_makes_it_real" | "profile_setting" | "nothing_recorded";

export type RequirementResolution =
  | { readonly kind: "add_document"; readonly documentTypeSlug: string; readonly href: string; readonly why: "records_it" }
  | { readonly kind: "issuing_authority"; readonly title: string; readonly url: string | null; readonly why: "names_the_issuer" }
  | { readonly kind: "training_program"; readonly id: string; readonly title: string; readonly why: "assigned_to_you" | "name_matches" }
  | {
      readonly kind: "service_offering";
      readonly id: string;
      readonly title: string;
      readonly rateText: string | null;
      readonly remote: boolean;
      readonly country: string | null;
      readonly why: "name_matches";
    }
  | { readonly kind: "add_evidence"; readonly href: string; readonly why: "evidence_makes_it_real" }
  | { readonly kind: "set_availability"; readonly href: string; readonly why: "profile_setting" }
  /** The honest empty state: no resolution row exists yet — the existing
   *  ask action (the instruction thread / messages) is the next step. */
  | { readonly kind: "ask"; readonly href: string; readonly why: "nothing_recorded" };

export interface RequirementLedgerRow {
  /** Stable within one ledger: `${kind}:${key}`. */
  readonly id: string;
  readonly kind: RequirementKind;
  readonly subject: RequirementSubject;
  readonly level: RequirementLevel;
  readonly reason: RequirementReason;
  readonly state: RequirementState;
  readonly provenance: RequirementProvenance;
  /** The manager's own status for this row (project context only). */
  readonly managerStatus: ManagerChecklistStatus | null;
  /** Empty ONLY when the row is satisfied; otherwise ≥ 1 (the ask fallback). */
  readonly resolutions: readonly RequirementResolution[];
  /** How many resolution candidates were read and did NOT fit this row. */
  readonly rejectedCandidates: number;
}

export interface RequirementLedger {
  readonly context: RequirementLedgerContext;
  /** The project title / the demand's role slug / the profession slug. */
  readonly contextLabel: string | null;
  readonly country: string | null;
  readonly rows: readonly RequirementLedgerRow[];
  /** have (valid + expiring) of total — recomputed from the rows, never stored. */
  readonly ratio: { readonly have: number; readonly total: number };
  /** Which reads answered — an unanswered read makes its rows UNKNOWN. */
  readonly reads: {
    readonly documents: "ok" | "unknown";
    readonly skills: "ok" | "unknown";
    readonly languages: "ok" | "unknown";
    readonly training: "ok" | "unavailable";
    readonly services: "ok" | "unavailable";
  };
  readonly derivedAt: string;
}

// ── Input ────────────────────────────────────────────────────────────────────

export interface LedgerChecklistItem {
  readonly itemKey: string;
  /** The manager's stored label — shown verbatim, never re-labelled. */
  readonly label: string;
  readonly status: ManagerChecklistStatus;
}

export interface LedgerTrainingProgram {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  /** The person already holds a `training_assignments` row for it. */
  readonly assignedToMe: boolean;
}

export interface LedgerServiceOffering {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly categorySlug: string | null;
  readonly rateText: string | null;
  readonly remote: boolean;
  readonly country: string | null;
}

export interface RequirementLedgerInput {
  readonly context: RequirementLedgerContext;
  readonly contextLabel: string | null;
  /** The country the work happens in (project / demand country, or the role's). */
  readonly country: string | null;
  readonly now: Date;

  // What is required — by source.
  /** The manager's checklist rows for the person (project context). */
  readonly checklistItems: readonly LedgerChecklistItem[];
  /** Country document requirements (all countries; filtered by `country`). */
  readonly countryRequirements: readonly RequirementRow[];
  /** Required skill slugs already decided by the engine / profession mirror. */
  readonly requiredSkillSlugs: readonly string[];
  /** Languages the demand requires (opportunity context). */
  readonly requiredLanguages: readonly { readonly code: string; readonly level: string | null }[];
  /** Whether availability is a requirement of this context. */
  readonly availabilityRequired: boolean;

  // What the person has — own canonical rows; `null` = the read did not answer.
  readonly documents: readonly WorkerDocumentRow[] | null;
  readonly ownSkills: readonly { readonly slug: string; readonly verified: boolean }[] | null;
  readonly ownLanguages: readonly { readonly lang: string; readonly level: string }[] | null;
  readonly availabilitySet: boolean | null;

  // Resolution candidates — bounded rows that exist; `null` = source unavailable.
  readonly trainingPrograms: readonly LedgerTrainingProgram[] | null;
  readonly serviceOfferings: readonly LedgerServiceOffering[] | null;

  // Existing actions (real routes only).
  readonly hrefs: {
    readonly journal: string;
    readonly profile: string;
    readonly ask: string;
  };
}

/** Bounded ledger — never a whole-world list (design T). */
export const REQUIREMENT_LEDGER_ROW_LIMIT = 40;
/** Bounded resolution candidates per source (server read limit, guard-pinned). */
export const REQUIREMENT_LEDGER_CANDIDATE_LIMIT = 20;
/** At most this many resolutions per row are kept, best first. */
export const REQUIREMENT_LEDGER_RESOLUTIONS_PER_ROW = 3;

/** The existing routes the resolutions point at (the readiness-steps routes). */
export const REQUIREMENT_LEDGER_ROUTES = {
  journal: "/dashboard/journal",
  profile: "/dashboard/profile",
  messages: "/dashboard/communication",
} as const;

/** Document types a COURSE can lead to (a certificate is evidence a course was
 *  completed — training-model doctrine). Identity and posting papers are not
 *  earned in a course, so a programme is never offered for them. */
const COURSE_BEARING_DOCUMENT_TYPES: ReadonlySet<string> = new Set(["professional_certificate", "health_safety_card"]);

/** Word stems a human writes in a course / service title for a requirement
 *  the data only names by slug. Matching vocabulary, not data: a programme is
 *  offered only when its OWN title/description carries one of these. */
const SUBJECT_TERMS: Readonly<Record<string, readonly string[]>> = {
  a1_certificate: ["a1"],
  health_safety_card: ["saug", "safety", "sicherheit", "veiligheid", "безопас", "bhp", "arbeidsveiligheid"],
  professional_certificate: ["sertifik", "certif", "zertifik", "kvalifik", "qualif", "сертифик", "квалифик"],
  id_document: ["tapatyb", "identity", "ausweis", "identiteit", "паспорт", "asmens"],
  residence_permit: ["leidim", "permit", "aufenthalt", "verblijf", "вид на"],
  work_permit: ["leidim", "permit", "arbeitserlaubnis", "werkvergunning", "разреш"],
  employment_contract: ["sutart", "contract", "vertrag", "договор"],
  posted_worker_package: ["komandir", "posting", "posted", "entsend", "detacher", "командир"],
  posting_notification: ["komandir", "posting", "posted", "entsend", "detacher", "командир"],
  tax_registration: ["mokes", "tax", "steuer", "belasting", "налог"],
  social_security_registration: ["sodra", "social", "sozial", "sociale", "социал"],
  cv: ["cv", "gyvenimo"],
};

function tokens(text: string | null | undefined, minLength: number): string[] {
  if (!text) return [];
  return foldText(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= minLength);
}

/** Terms a resolution candidate must mention to fit a row: the alias stems
 *  of every document type that would answer it, the slug words of a skill,
 *  a language code, and the longer words of the manager's own text. */
function subjectTerms(subject: RequirementSubject, verbatim: string | null, documentTypeSlugs: readonly string[]): string[] {
  const out = new Set<string>();
  for (const slug of documentTypeSlugs) {
    for (const t of SUBJECT_TERMS[slug] ?? []) out.add(foldText(t));
    for (const t of tokens(slug.replace(/_/g, " "), 4)) out.add(t);
  }
  if (subject.kind === "skill") {
    for (const t of tokens(subject.slug.replace(/[-_]/g, " "), 4)) out.add(t);
  } else if (subject.kind === "language") {
    out.add(foldText(subject.code));
  }
  for (const t of tokens(verbatim, 5)) out.add(t);
  return [...out];
}

function candidateFits(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const folded = foldText(text);
  return terms.some((t) => t.length >= 2 && folded.includes(t));
}

type OwnDocState = "valid" | "expiring" | "missing";

function rank(s: OwnDocState): number {
  return s === "valid" ? 2 : s === "expiring" ? 1 : 0;
}

/** Best own state per document type (a country-scoped record wins over a
 *  generic one of the same type, same rule as computeCountryReadiness). */
function ownDocumentStates(
  documents: readonly WorkerDocumentRow[],
  country: string | null,
  now: Date,
): Map<string, { state: OwnDocState; validUntil: string | null }> {
  const out = new Map<string, { state: OwnDocState; validUntil: string | null; scoped: boolean }>();
  for (const d of documents) {
    const st = deriveDocumentStatus(d, now);
    const state: OwnDocState = st === "ready" ? "valid" : st === "expiring" ? "expiring" : "missing";
    const scoped = country !== null && d.country === country;
    const prev = out.get(d.documentTypeSlug);
    if (!prev || (scoped && !prev.scoped) || (scoped === prev.scoped && rank(state) > rank(prev.state))) {
      out.set(d.documentTypeSlug, { state, validUntil: d.validUntil, scoped });
    }
  }
  return out;
}

interface Draft {
  readonly id: string;
  readonly kind: RequirementKind;
  readonly subject: RequirementSubject;
  readonly level: RequirementLevel;
  readonly reason: RequirementReason;
  readonly state: RequirementState;
  readonly provenance: RequirementProvenance;
  readonly managerStatus: ManagerChecklistStatus | null;
  /** Text the manager typed (project rows) — matching terms and nothing else. */
  readonly verbatim: string | null;
  /** The country requirement row (issuing authority), when one backs the row. */
  readonly requirement: RequirementRow | null;
  /** Document types that would answer the row (first = the one to record). */
  readonly documentTypeSlugs: readonly string[];
}

function stateOrder(s: RequirementState): number {
  return s === "missing" ? 0 : s === "expiring" ? 1 : s === "unknown" ? 2 : 3;
}
function levelOrder(l: RequirementLevel): number {
  return l === "required" ? 0 : l === "conditional" ? 1 : 2;
}

/**
 * Resolutions for one unsatisfied row, fastest first, and how many read
 * candidates did not fit. Every offered row EXISTS in the input; when nothing
 * fits, the honest ask action is the one resolution.
 */
function resolve(
  d: Draft,
  input: RequirementLedgerInput,
): { resolutions: RequirementResolution[]; rejected: number } {
  const out: RequirementResolution[] = [];
  let rejected = 0;
  const terms = subjectTerms(d.subject, d.verbatim, d.documentTypeSlugs);

  if (d.kind === "document" && d.documentTypeSlugs.length > 0) {
    const slug = d.documentTypeSlugs[0];
    out.push({
      kind: "add_document",
      documentTypeSlug: slug,
      href: inventoryHref({ type: slug, country: input.country }),
      why: "records_it",
    });
  }
  if (d.kind === "availability") {
    out.push({ kind: "set_availability", href: input.hrefs.profile, why: "profile_setting" });
  }

  const courseBearing =
    d.kind === "skill" ||
    d.kind === "language" ||
    (d.kind === "document" && d.documentTypeSlugs.some((s) => COURSE_BEARING_DOCUMENT_TYPES.has(s)));
  if (input.trainingPrograms && courseBearing) {
    const fitting: RequirementResolution[] = [];
    for (const p of input.trainingPrograms) {
      const fits = candidateFits(`${p.title} ${p.description ?? ""}`, terms);
      if (p.assignedToMe && fits) fitting.unshift({ kind: "training_program", id: p.id, title: p.title, why: "assigned_to_you" });
      else if (fits) fitting.push({ kind: "training_program", id: p.id, title: p.title, why: "name_matches" });
      else rejected += 1;
    }
    out.push(...fitting);
  } else if (input.trainingPrograms) {
    rejected += input.trainingPrograms.length;
  }

  if (d.kind === "skill") {
    out.push({ kind: "add_evidence", href: input.hrefs.journal, why: "evidence_makes_it_real" });
  }

  if (input.serviceOfferings && d.kind === "document") {
    for (const s of input.serviceOfferings) {
      if (candidateFits(`${s.title} ${s.categorySlug ?? ""} ${s.description ?? ""}`, terms)) {
        out.push({
          kind: "service_offering",
          id: s.id,
          title: s.title,
          rateText: s.rateText,
          remote: s.remote,
          country: s.country,
          why: "name_matches",
        });
      } else rejected += 1;
    }
  } else if (input.serviceOfferings) {
    rejected += input.serviceOfferings.length;
  }

  if (d.requirement?.sourceTitle) {
    out.push({
      kind: "issuing_authority",
      title: d.requirement.sourceTitle,
      url: d.requirement.sourceUrl ?? null,
      why: "names_the_issuer",
    });
  }

  if (out.length === 0) out.push({ kind: "ask", href: input.hrefs.ask, why: "nothing_recorded" });
  if (out.length > REQUIREMENT_LEDGER_RESOLUTIONS_PER_ROW) {
    rejected += out.length - REQUIREMENT_LEDGER_RESOLUTIONS_PER_ROW;
    out.length = REQUIREMENT_LEDGER_RESOLUTIONS_PER_ROW;
  }
  return { resolutions: out, rejected };
}

/** Pure: the ledger for one person in one context. */
export function deriveRequirementLedger(input: RequirementLedgerInput): RequirementLedger {
  const country = input.country ? input.country.toUpperCase() : null;
  const docsKnown = input.documents !== null;
  const own = ownDocumentStates(input.documents ?? [], country, input.now);
  const drafts: Draft[] = [];
  const coveredDocumentTypes = new Set<string>();
  const countryRows = country ? input.countryRequirements.filter((r) => r.country === country) : [];
  const requirementByType = new Map<string, RequirementRow>();
  for (const r of countryRows) if (!requirementByType.has(r.documentTypeSlug)) requirementByType.set(r.documentTypeSlug, r);

  // 1. The manager's checklist rows (project context) — verbatim.
  for (const it of input.checklistItems) {
    const slugs = documentTypesForReadinessItem(it.itemKey);
    const isDocument = slugs.length > 0;
    for (const s of slugs) coveredDocumentTypes.add(s);
    let state: RequirementState;
    let provenance: RequirementProvenance;
    if (it.status === "rejected" || it.status === "expired") {
      state = "missing";
      provenance = { source: "manager_checklist", status: it.status };
    } else if (it.status === "received" || it.status === "checked") {
      state = "valid";
      provenance = { source: "manager_checklist", status: it.status };
    } else if (isDocument) {
      if (!docsKnown) {
        state = "unknown";
        provenance = { source: "not_readable" };
      } else {
        let best: { state: OwnDocState; validUntil: string | null } | null = null;
        for (const s of slugs) {
          const o = own.get(s);
          if (o && (!best || rank(o.state) > rank(best.state))) best = o;
        }
        if (best && best.state !== "missing") {
          state = best.state;
          provenance = { source: "own_document", validUntil: best.validUntil };
        } else {
          state = "missing";
          provenance = { source: "none" };
        }
      }
    } else {
      // A briefing, availability, a client's own rule: only the manager can say.
      state = "unknown";
      provenance = { source: "manager_checklist", status: it.status };
    }
    drafts.push({
      id: `checklist:${it.itemKey}`,
      kind: isDocument ? "document" : "other",
      subject: { kind: "text", text: it.label },
      level: "required",
      reason: "project_checklist",
      state,
      provenance,
      managerStatus: it.status,
      verbatim: it.label,
      requirement: slugs.map((s) => requirementByType.get(s)).find((r): r is RequirementRow => Boolean(r)) ?? null,
      documentTypeSlugs: slugs,
    });
  }

  // 2. The country's document requirements (not already a checklist row).
  for (const r of countryRows) {
    if (coveredDocumentTypes.has(r.documentTypeSlug)) continue;
    coveredDocumentTypes.add(r.documentTypeSlug);
    let state: RequirementState;
    let provenance: RequirementProvenance;
    if (!docsKnown) {
      state = "unknown";
      provenance = { source: "not_readable" };
    } else {
      const o = own.get(r.documentTypeSlug);
      if (o && o.state !== "missing") {
        state = o.state;
        provenance = { source: "own_document", validUntil: o.validUntil };
      } else {
        state = "missing";
        provenance = { source: "none" };
      }
    }
    drafts.push({
      id: `document:${r.documentTypeSlug}`,
      kind: "document",
      subject: { kind: "document_type", slug: r.documentTypeSlug },
      level: r.requirementLevel,
      reason: "country_requirement",
      state,
      provenance,
      managerStatus: null,
      verbatim: null,
      requirement: r,
      documentTypeSlugs: [r.documentTypeSlug],
    });
  }

  // 3. Skills the context requires — against the person's own worker_skills.
  const ownSkill = new Map<string, boolean>();
  for (const s of input.ownSkills ?? []) ownSkill.set(s.slug, ownSkill.get(s.slug) === true || s.verified);
  for (const slug of [...new Set(input.requiredSkillSlugs)]) {
    let state: RequirementState;
    let provenance: RequirementProvenance;
    if (input.ownSkills === null) {
      state = "unknown";
      provenance = { source: "not_readable" };
    } else if (ownSkill.has(slug)) {
      state = "valid";
      provenance = { source: "own_skill", verified: ownSkill.get(slug) === true };
    } else {
      state = "missing";
      provenance = { source: "none" };
    }
    drafts.push({
      id: `skill:${slug}`,
      kind: "skill",
      subject: { kind: "skill", slug },
      level: "required",
      reason: input.context.kind === "role" ? "profession" : "employer_demand",
      state,
      provenance,
      managerStatus: null,
      verbatim: null,
      requirement: null,
      documentTypeSlugs: [],
    });
  }

  // 4. Languages the demand requires — against the person's own stated languages.
  const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native"];
  const ownLang = new Map<string, string>();
  for (const l of input.ownLanguages ?? []) {
    const prev = ownLang.get(l.lang);
    if (!prev || LEVELS.indexOf(l.level) > LEVELS.indexOf(prev)) ownLang.set(l.lang, l.level);
  }
  for (const req of input.requiredLanguages) {
    const code = req.code.toLowerCase();
    let state: RequirementState;
    let provenance: RequirementProvenance;
    if (input.ownLanguages === null) {
      state = "unknown";
      provenance = { source: "not_readable" };
    } else {
      const have = ownLang.get(code);
      const enough = have !== undefined && (req.level === null || LEVELS.indexOf(have) >= LEVELS.indexOf(req.level));
      if (have !== undefined && enough) {
        state = "valid";
        provenance = { source: "own_language", level: have };
      } else if (have !== undefined) {
        state = "missing";
        provenance = { source: "own_language", level: have };
      } else {
        state = "missing";
        provenance = { source: "none" };
      }
    }
    drafts.push({
      id: `language:${code}`,
      kind: "language",
      subject: { kind: "language", code, level: req.level },
      level: "required",
      reason: "employer_demand",
      state,
      provenance,
      managerStatus: null,
      verbatim: null,
      requirement: null,
      documentTypeSlugs: [],
    });
  }

  // 5. Availability — the same signal the readiness pillar reads.
  if (input.availabilityRequired) {
    drafts.push({
      id: "availability",
      kind: "availability",
      subject: { kind: "availability" },
      level: "required",
      reason: input.context.kind === "role" ? "profession" : "employer_demand",
      state: input.availabilitySet === null ? "unknown" : input.availabilitySet ? "valid" : "missing",
      provenance: input.availabilitySet === null ? { source: "not_readable" } : { source: "own_profile" },
      managerStatus: null,
      verbatim: null,
      requirement: null,
      documentTypeSlugs: [],
    });
  }

  // Order: what needs action first (missing → expiring → unknown → valid),
  // required before conditional before recommended; source order otherwise.
  const ordered = drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => stateOrder(a.d.state) - stateOrder(b.d.state) || levelOrder(a.d.level) - levelOrder(b.d.level) || a.i - b.i)
    .map(({ d }) => d)
    .slice(0, REQUIREMENT_LEDGER_ROW_LIMIT);

  const rows: RequirementLedgerRow[] = ordered.map((d) => {
    const { resolutions, rejected } = d.state === "valid" ? { resolutions: [], rejected: 0 } : resolve(d, input);
    return {
      id: d.id,
      kind: d.kind,
      subject: d.subject,
      level: d.level,
      reason: d.reason,
      state: d.state,
      provenance: d.provenance,
      managerStatus: d.managerStatus,
      resolutions,
      rejectedCandidates: rejected,
    };
  });

  return {
    context: input.context,
    contextLabel: input.contextLabel,
    country,
    rows,
    ratio: deriveLedgerRatio(rows),
    reads: {
      documents: docsKnown ? "ok" : "unknown",
      skills: input.ownSkills === null ? "unknown" : "ok",
      languages: input.ownLanguages === null ? "unknown" : "ok",
      training: input.trainingPrograms === null ? "unavailable" : "ok",
      services: input.serviceOfferings === null ? "unavailable" : "ok",
    },
    derivedAt: input.now.toISOString(),
  };
}

/** Pure: have (valid + expiring) of total — the person's side of the same
 *  "N of M" the manager's readiness line shows; recomputed from rows. */
export function deriveLedgerRatio(rows: readonly RequirementLedgerRow[]): { have: number; total: number } {
  let have = 0;
  for (const r of rows) if (r.state === "valid" || r.state === "expiring") have += 1;
  return { have, total: rows.length };
}

/** The rows that still need something from the person, in ledger order. */
export function openLedgerRows(ledger: RequirementLedger): readonly RequirementLedgerRow[] {
  return ledger.rows.filter((r) => r.state !== "valid");
}
