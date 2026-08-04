/**
 * Conversation Control — canonical RESULT registry (unified premium product v1).
 *
 * The missing architectural slot identified by the unified-product audit: the
 * conversation already exists (`/dashboard` renders `<ConversationChat>`), but a
 * conversation with nowhere to render an answer turns every answer into a ROUTE.
 * That is why the product grew ~72 authenticated routes and a second dashboard.
 *
 * This module is the map from "what the user asked for" to "which canonical
 * result component renders it in the result panel".
 *
 * DELIBERATELY A SATELLITE, NOT A SECOND REGISTRY
 * -----------------------------------------------
 * `action-registry.ts` stays the single source of truth for WHAT the
 * conversation can do (ids, roles, confirmation tiers, preconditions,
 * telemetry, handlers). This module only answers a narrower question: when an
 * action produces something the user should LOOK at, which component shows it,
 * and can it be shown inline instead of navigating away.
 *
 * It therefore:
 *   - never redefines an action id — it REFERENCES ids from the action registry
 *     (`openedBy`), and a guard test pins that every referenced id exists;
 *   - never carries domain logic, data reads or writes — the result components
 *     keep using the SAME `lib/*` readers the routes already use;
 *   - never replaces `advancedRoute` — that route stays the honest fallback and
 *     the "open the full screen" affordance. A result is an ADDITION, never a
 *     removal of the working path (NO REGRESSION, goal doc §2.7).
 *
 * PURITY: like the action registry, this module has no `server-only` import, no
 * supabase and no fetch, so it is safe on both sides of the boundary and is
 * trivially unit-testable. A guard test pins that property.
 */

import {
  getConversationAction,
  type ConversationActionDescriptor,
} from "@/lib/conversation/action-registry";

/**
 * The canonical result surfaces. One entry per ANSWER SHAPE, not per route —
 * `/documents`, `/gallery` and `/assets` are three routes but ONE answer
 * ("show me my evidence"), so they collapse to a single `evidence` result.
 */
export type ResultKind =
  | "player-card"
  | "journal"
  | "calendar"
  | "market"
  | "opportunities"
  /**
   * W8 — the EMPLOYER's answer shape: "who can do this work, and what happens
   * next with them". One result for the whole demand→candidates→shortlist→
   * contact→booking stage, because it is one question asked at increasing
   * depth — not five screens. The depth lives in the URL (`&demand=`), the
   * same way `market` carries `&geo=`/`&project=`.
   *
   * It exists because the employer half of the chat-first workspace had NO
   * result surface at all: `project` (below) was the only employer entry and
   * it has no inline renderer, so every employer answer had to become a route.
   */
  | "candidates"
  | "project"
  | "evidence"
  /**
   * W6 slice 3 — the experience domain. This slot used to be called
   * `reputation` and was gated `unverified` while it waited for a real
   * subjective-experience store (W3 capability matrix row 24). W6 built that
   * store, so the slot is PROMOTED here rather than joined by a second one:
   * two reputation results would be exactly the second reputation system the
   * W6 directive forbids. The world element it extends is still `reputation`
   * (`lib/product-gate/world-elements.ts`); the RESULT is named after the
   * canonical domain that fills it — `experience_records`.
   */
  | "experiences"
  | "invoice";

/**
 * Which work context a result is meaningful in. A result offered in a context
 * where it cannot be honest is simply not offered — we never render an empty
 * shell to look complete.
 */
export type ResultContext = "personal" | "organization" | "project";

/**
 * Readiness of the underlying data source. This is the REAL DATA ONLY gate
 * (goal doc §2.5) expressed in code rather than in a document, so a result can
 * never quietly ship on placeholder data.
 *
 *   - `real`       — reads a verified canonical `lib/*` source. Safe to render.
 *   - `unverified` — the source has NOT been confirmed to return real rows yet.
 *                    The panel must NOT render it as a finished result; it
 *                    falls back to `advancedRoute`.
 *
 * Downgrading an entry to `unverified` is always safe. Promoting one to `real`
 * requires having actually read its data path.
 */
export type ResultDataReadiness = "real" | "unverified";

export interface ResultDescriptor {
  /** Stable kind — also the `?result=` deep-link value. */
  readonly kind: ResultKind;
  /** i18n key (namespace `conversation.results`) for the panel title. */
  readonly titleKey: string;
  /**
   * Action ids from `action-registry.ts` that open this result. Every id here
   * MUST exist in that registry — pinned by a guard test so a rename in the
   * action registry cannot silently orphan a result.
   */
  readonly openedBy: readonly string[];
  /**
   * The existing route that performs this today. Kept as the honest fallback
   * and the "open full screen" affordance. NEVER removed by this work.
   */
  readonly advancedRoute: string;
  /** Contexts where this result is meaningful. */
  readonly contexts: readonly ResultContext[];
  /** REAL DATA ONLY gate — see `ResultDataReadiness`. */
  readonly dataReadiness: ResultDataReadiness;
}

/**
 * The canonical result set.
 *
 * `dataReadiness` reflects what has ACTUALLY been verified in the source tree,
 * not what is planned. Entries whose data path has not been read end up
 * `unverified` and therefore keep routing to `advancedRoute` — an honest
 * degradation rather than an empty premium-looking panel.
 */
export const CONVERSATION_RESULTS: readonly ResultDescriptor[] = [
  {
    kind: "player-card",
    titleKey: "conversation.results.playerCard.title",
    openedBy: ["worker.complete-profile", "worker.save-work-card"],
    advancedRoute: "/dashboard/profile",
    contexts: ["personal"],
    // lib/player-card/* — 8 modules, already feeding the restored charts.
    dataReadiness: "real",
  },
  {
    kind: "journal",
    titleKey: "conversation.results.journal.title",
    openedBy: ["worker.log-work"],
    advancedRoute: "/dashboard/journal",
    contexts: ["personal", "organization", "project"],
    // lib/journal/* — the richest domain in the tree (50+ modules), and that
    // richness is exactly what made this entry misleading: the DATA is real,
    // the RESULT is not. There is no `case "journal"` in `InlineResult`, so
    // `real` made `canRenderInline` true, suppressed the fallback and rendered
    // "Preparing this result." with no route to `/dashboard/journal`.
    //
    // The W11 audit named `project`, `evidence` and `invoice` (P0-4) and missed
    // this one. It is the WORST of the four: `journal` and `invoice` are both
    // opened by `worker.log-work`, and `resultForAction` is first-match-wins,
    // so `journal` — declared earlier — is the one that action actually
    // resolves to. The other three need a hand-typed `?result=`; this one sits
    // on a live action.
    //
    // `real` again only once `case "journal"` exists.
    dataReadiness: "unverified",
  },
  {
    kind: "calendar",
    titleKey: "conversation.results.calendar.title",
    openedBy: ["worker.review-bookings", "worker.respond-booking"],
    advancedRoute: "/dashboard/planning",
    contexts: ["personal", "organization", "project"],
    // lib/planning + lib/booking + lib/leave.
    dataReadiness: "real",
  },
  {
    kind: "market",
    titleKey: "conversation.results.market.title",
    // `worker.express-interest` used to be listed here as well. Its OWN
    // descriptor in the action registry says `advancedRoute:
    // "/dashboard/opportunities"` — so the action and the result it opened
    // disagreed about where the capability lives, and `resultForAction` (first
    // match wins) resolved it to the map. W3 row 5 gave that action a result
    // whose route matches its own, which is where it moved.
    openedBy: ["worker.what-next"],
    advancedRoute: "/dashboard/market-map",
    contexts: ["personal", "organization"],
    // VERIFIED: `lib/market-map/market-result.ts` aggregates REAL rows —
    // open job_demands joined to their project's geography — and resolves
    // coordinates through the canonical city table, falling back to a country
    // centroid. No demo fallback: an empty market renders as empty. The
    // landing's scripted scenario lives in a separate module tagged `demo` and
    // cannot reach this path.
    dataReadiness: "real",
  },
  {
    kind: "opportunities",
    titleKey: "conversation.results.opportunities.title",
    // The action whose own advancedRoute is `/dashboard/opportunities`. The
    // result and the action now name the SAME screen.
    openedBy: ["worker.express-interest"],
    advancedRoute: "/dashboard/opportunities",
    // PERSONAL ONLY, and that is a product statement, not an oversight: these
    // are the matches for THIS PERSON's skills. Inside an organization context
    // "my matches" answers a question nobody asked there, so it is not offered
    // rather than offered and quietly wrong.
    contexts: ["personal"],
    // VERIFIED (W3 row 5): the read is the canonical marketplace use case
    // `loadWorkerOpportunityMatches` → `getWorkerJobRecommendations` — the same
    // gated RPC rows × match engine the board runs, ranked by the shared §19
    // comparator. No second engine, no invented company, need, salary or
    // score. The two ways real data can be absent (gated RPC unapplied, no
    // worker row) are DISTINCT states in the panel, so an absent source is
    // never rendered as an empty result.
    dataReadiness: "real",
  },
  {
    kind: "candidates",
    titleKey: "conversation.results.candidates.title",
    // BOTH doors are real registry ids: the read that opens the surface, and
    // the write whose outcome the surface shows. `company.review-candidates`
    // was a `deep_link` action whose only destination was
    // `/dashboard/company/scouting` — it now ALSO has an inline answer, which
    // is exactly the "a result is an ADDITION, never a removal" rule: the
    // route stays, and stays the fallback.
    openedBy: ["company.review-candidates", "company.shortlist-candidate"],
    advancedRoute: "/dashboard/company/scouting",
    // ORGANIZATION ONLY, and that is the same product statement `opportunities`
    // makes in reverse. Every read behind this result (`listCompanyDemands`,
    // `runScouting`, the three lifecycle writes) is refused outside a company
    // context by the W8 employer resolver — that is the slice-1 gate, not an
    // oversight — so offering the panel in a personal space could only ever
    // render "you are not acting for a company". The person keeps reaching the
    // full screen through `advancedRoute`, which renders exactly that state
    // with the switcher beside it.
    contexts: ["organization"],
    // VERIFIED: `lib/conversation/employer-workspace.ts` is a thin adapter over
    // `runScouting` — the SAME canonical read `/dashboard/company/scouting`
    // performs, over the same RLS-scoped supply, ranked by the same §19
    // comparator, with the same Step 3A anonymization applied before anything
    // leaves the server. No second engine and no demo path: an empty supply
    // renders as empty, an underivable need renders as `not-structured`, and an
    // unapplied table renders as `needs-migration` — three distinct states, so
    // an absent source is never shown as "nobody matched".
    dataReadiness: "real",
  },
  {
    kind: "project",
    titleKey: "conversation.results.project.title",
    openedBy: ["company.assign-worker", "company.who-waits"],
    advancedRoute: "/dashboard/projects",
    contexts: ["organization", "project"],
    // W11 audit P0-4: this said `real` while `InlineResult` has no `case
    // "project"`. `real` + meaningful context makes `canRenderInline` true, so
    // `ResultBody` took the inline branch and SKIPPED the fallback that the
    // module's own doc-comment calls "the NO REGRESSION guarantee". The person
    // got one sentence — "Preparing this result." — and no button to
    // `/dashboard/projects`. A readiness flag that suppresses the way forward
    // is worse than no result at all.
    //
    // `unverified` is the honest state: the project domain is real and
    // reachable, but it has no inline renderer, so the panel says so plainly
    // and hands over the working full screen. Flip this back to `real` in the
    // same PR that adds `case "project"` — never before it.
    dataReadiness: "unverified",
  },
  {
    kind: "evidence",
    titleKey: "conversation.results.evidence.title",
    openedBy: ["worker.add-work-history", "worker.add-achievement"],
    advancedRoute: "/dashboard/documents",
    contexts: ["personal", "project"],
    // Same defect as `project` (W11 audit P0-4). No `case "evidence"` in
    // `InlineResult`, so `real` bought a dead end instead of a renderer.
    dataReadiness: "unverified",
  },
  {
    kind: "experiences",
    titleKey: "conversation.results.experiences.title",
    // Its OWN action, not a share of `worker.what-next`. The old `reputation`
    // entry listed `worker.what-next`, which `market` also lists — and
    // `resultForAction` is first-match-wins, so the market always won and the
    // reputation slot was unreachable except by hand-typing the query string.
    // A result nobody can open from the conversation is not a result.
    openedBy: ["worker.review-experiences"],
    // NOT `/dashboard/experiences`. W6 slice 3B briefly created that screen and
    // the Product Gate refused it (A-09, undeclared surface): the workspace is
    // chat-first, so an answer belongs in the result panel, not in a 73rd
    // route. The screen was deleted. This route stays the honest full-screen
    // destination for professional identity — the fallback path the registry
    // requires — and it is the ONLY route this result names.
    advancedRoute: "/dashboard/profile",
    // EVERY CONTEXT — the `journal` pattern, NOT the `opportunities` one.
    //
    // This was `["personal"]` first, copying the opportunities reasoning ("my
    // matches answer a question nobody asked inside an organization"), and the
    // authenticated browser proof refuted it immediately: the employer in the
    // Dev Construction workspace got "this result is not available in the
    // current context" instead of their own submissions. That is not an edge
    // case — the AUTHOR side of this domain is normally an employer acting
    // from inside their organization, so personal-only hid half the domain
    // from the half of the product that produces it.
    //
    // The opportunities precedent does not transfer: "jobs that fit me" really
    // is meaningless to an organization, whereas "the experiences I submitted,
    // and the ones written about me" is a fact about the SIGNED-IN PERSON that
    // stays true whichever workspace they are standing in — exactly like the
    // work journal. The read is RLS-scoped to the viewer either way, so the
    // context changes nothing about what comes back.
    contexts: ["personal", "organization", "project"],
    // PROMOTED unverified → real by W6 slice 3. The store is now canonical:
    // `experience_records` / `experience_responses`, read through
    // `lib/trust/experience-records.ts`, counted by the ONE aggregation rule
    // (published positive / published negative; disputed stays counted and is
    // marked; resolved_removed leaves the count). Same precedent as
    // `opportunities`: the underlying migration is owner-gated, and that is a
    // DISTINCT rendered state (`unavailable`), never an empty result and never
    // a fabricated zero — so the data path is real even before the apply.
    dataReadiness: "real",
  },
  {
    kind: "invoice",
    titleKey: "conversation.results.invoice.title",
    openedBy: ["worker.log-work"],
    advancedRoute: "/dashboard/finance",
    contexts: ["personal", "organization", "project"],
    // lib/finance + journal aggregation. NOTE: preview/export only — any
    // payment, Stripe or billing behaviour is an explicit owner gate (§16).
    //
    // Same defect as `project` and `evidence` (W11 audit P0-4): no `case
    // "invoice"` in `InlineResult`, so `real` suppressed the fallback and the
    // person reached "Preparing this result." with no route to
    // `/dashboard/finance`. Money is the worst place to show a stub that calls
    // itself ready.
    dataReadiness: "unverified",
  },
] as const;

/** All result kinds (guard: unique, stable). */
export const RESULT_KINDS: readonly ResultKind[] = CONVERSATION_RESULTS.map(
  (r) => r.kind,
);

/** Narrowing type guard — used to validate the `?result=` deep-link value. */
export function isResultKind(value: unknown): value is ResultKind {
  return typeof value === "string" && RESULT_KINDS.includes(value as ResultKind);
}

/** Lookup by kind. Unknown kind → undefined (an invented kind never renders). */
export function getResult(kind: string): ResultDescriptor | undefined {
  return CONVERSATION_RESULTS.find((r) => r.kind === kind);
}

/**
 * Which result (if any) an action opens. Unknown or result-less action →
 * undefined, and the caller keeps its existing `deep_link` behaviour.
 */
export function resultForAction(actionId: string): ResultDescriptor | undefined {
  return CONVERSATION_RESULTS.find((r) => r.openedBy.includes(actionId));
}

/**
 * Results meaningful in a context AND safe to render on real data.
 *
 * This is the function the panel should use — it applies the REAL DATA ONLY
 * gate, so an `unverified` result is never offered as a finished surface.
 */
export function renderableResultsForContext(
  context: ResultContext,
): readonly ResultDescriptor[] {
  return CONVERSATION_RESULTS.filter(
    (r) => r.contexts.includes(context) && r.dataReadiness === "real",
  );
}

/**
 * Whether the panel may render this result inline, or must fall back to the
 * existing route.
 *
 * Honest degradation: an unverified result is NOT hidden from the user — they
 * still reach the working screen through `advancedRoute`. They simply do not
 * get a premium-looking panel built on unconfirmed data.
 */
export function canRenderInline(kind: ResultKind, context: ResultContext): boolean {
  const r = getResult(kind);
  if (!r) return false;
  return r.dataReadiness === "real" && r.contexts.includes(context);
}

/**
 * The action descriptors that open a result — resolved through the action
 * registry so roles, preconditions and confirmation tiers keep coming from the
 * single source of truth.
 */
export function actionsOpeningResult(
  kind: ResultKind,
): readonly ConversationActionDescriptor[] {
  const r = getResult(kind);
  if (!r) return [];
  return r.openedBy
    .map((id) => getConversationAction(id))
    .filter((a): a is ConversationActionDescriptor => a !== undefined);
}
