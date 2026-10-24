import type { OauthClientClaims } from "@/lib/api/api-identity";
import type { CapabilityDescriptor } from "@/lib/capabilities/contract";

/**
 * MCP PERMISSION SCOPES — which part of a person's account an OAuth-authorized
 * external client (ChatGPT, Claude, any MCP host) may act on.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * A scope is a CEILING on what a third-party client may ask for. It never
 * grants anything: every tool still runs as the person, on their own RLS
 * client, through the ONE capability registry (`lib/capabilities/registry.ts`)
 * and its draft -> confirm contract. A client holding `write:journal` can do
 * at most what the same person could do in the web journal; a client without
 * it is refused before the capability runs. There is no second permission
 * model here — RLS decides WHAT the person may do; the scope decides WHICH of
 * those things this one client was allowed to ask for.
 *
 * DERIVED, NOT HAND-LISTED. A tool's required scope comes from two facts the
 * registry already holds about every capability, in review:
 *
 *   - its DOMAIN: the capability id's leading dot-segment(s)
 *     (`journal.create_draft` -> journal, `company.create-task` ->
 *     organization), resolved by the longest matching prefix in
 *     `SCOPE_DOMAIN_PREFIXES` — about fifty domain prefixes cover 229 tools;
 *   - its ACCESS: `kind === "read"` (with `readOnlyHint: true`) is a read;
 *     `draft`, `confirm` and `execute` are writes. A draft writes nothing, but
 *     it is the first half of a write, so a read-only grant cannot even
 *     prepare one.
 *
 * `lib/guards/mcp-scope-coverage.test.ts` fails CI when an exposed tool has no
 * scope, so a new domain cannot ship unscoped by omission.
 *
 * WHO IS SCOPED. Only a token an OAuth client obtained (Supabase Auth puts the
 * `client_id` claim on those). The person's own web session, Android and iOS
 * apps (a first-party Supabase session, no `client_id`) are never scoped here —
 * they are the person, not a third party.
 *
 * BILLING: NONE. No tool can pay, charge, subscribe or move money
 * (by design, `EXTERNAL_LLM_CLIENTS_PROGRAMME` §E), so there is no billing
 * scope to grant. `billing` is listed as a reserved, never-grantable family so
 * the consent screen can say so in plain words, and the coverage guard fails
 * if a billing-shaped tool ever appears.
 */

/** The product scopes a token may carry. Order = consent-screen order. */
export const PRODUCT_SCOPES = [
  "read:profile",
  "write:profile",
  "read:journal",
  "write:journal",
  "read:demand",
  "write:demand",
  "read:organization",
  "write:organization",
  "messages",
  "marketplace",
] as const;

export type ProductScope = (typeof PRODUCT_SCOPES)[number];

/** The domain a capability belongs to. */
export type ScopeFamily = "profile" | "journal" | "demand" | "organization" | "messages" | "marketplace";

/**
 * Reserved family with ZERO tools: no external client may ever move money.
 * Never in `PRODUCT_SCOPES`, never satisfiable, never advertised.
 */
export const NON_GRANTABLE_FAMILIES = ["billing"] as const;

/**
 * THE DOMAIN TABLE. Keys are capability-id prefixes (one or more whole
 * dot-segments); the LONGEST matching key wins, so a handful of tools whose
 * leading segment names the ACTOR rather than the domain can be placed by a
 * longer key (`company.contact-worker` sends a first message, so it is
 * `messages`, while every other `company.*` tool acts on the organization).
 *
 *   profile       who the person is and their own account state: profile,
 *                 Living CV, own work cards, own preferences / languages /
 *                 documents / history, notifications, invitations, the
 *                 active-workspace pointer
 *   journal       recorded work and its evidence: journal entries, evidence
 *                 import, absence / leave, hours, review of submitted work
 *   demand        needs and the matching around them: demand, jobs, interest,
 *                 candidate search, shortlists, saved opportunities
 *   organization  the organization the person acts for: company / agency /
 *                 client / education workspaces, projects, assignments,
 *                 teams, roster, people, bookings, calendar, capacity, tasks,
 *                 reports, engagements, recorded finance records (a read of
 *                 history — never a payment)
 *   messages      conversations and sending messages
 *   marketplace   commercial offers: listings, service offerings / requests,
 *                 proposals, contracts, the commercial overview
 */
export const SCOPE_DOMAIN_PREFIXES: Readonly<Record<string, ScopeFamily>> = {
  // profile
  profile: "profile",
  living_cv: "profile",
  cv: "profile",
  worker: "profile",
  work_card: "profile",
  notification: "profile",
  invitations: "profile",
  context: "profile",
  // journal
  journal: "journal",
  evidence: "journal",
  absence: "journal",
  leave: "journal",
  timesheets: "journal",
  counterparty_review: "journal",
  "company.confirm-work": "journal",
  "company.enable-journal-review": "journal",
  // demand
  demand: "demand",
  interest: "demand",
  jobs: "demand",
  work: "demand",
  opportunities: "demand",
  candidate: "demand",
  shortlist: "demand",
  "marketplace.funnel": "demand",
  "worker.activation_queue": "demand",
  "company.confirm-need": "demand",
  "agency.propose-candidate": "demand",
  // organization
  company: "organization",
  agency: "organization",
  client: "organization",
  organization: "organization",
  education: "organization",
  project: "organization",
  projects: "organization",
  assignment: "organization",
  team_assignment: "organization",
  roster: "organization",
  people: "organization",
  workforce: "organization",
  booking: "organization",
  calendar: "organization",
  capacity: "organization",
  tasks: "organization",
  reports: "organization",
  engagement: "organization",
  finance: "organization",
  // messages
  conversation: "messages",
  message: "messages",
  "company.contact-worker": "messages",
  // marketplace
  marketplace_listing: "marketplace",
  service_offering: "marketplace",
  service_request: "marketplace",
  proposal: "marketplace",
  contract: "marketplace",
  commercial: "marketplace",
};

/** Leading segments that would mean money movement — refused by the guard. */
export const BILLING_SHAPED_ID = /(^|\.)(billing|payment|payments|checkout|payout|subscription|stripe|charge|refund)(\.|$|_)/;

/** The domain of a capability id, by longest matching prefix. */
export function scopeFamilyOf(capabilityId: string): ScopeFamily | null {
  const segments = capabilityId.split(".");
  for (let n = segments.length; n >= 1; n--) {
    const family = SCOPE_DOMAIN_PREFIXES[segments.slice(0, n).join(".")];
    if (family) return family;
  }
  return null;
}

/** Whether a capability only reads (both facts must agree). */
export function isReadCapability(c: Pick<CapabilityDescriptor, "kind" | "annotations">): boolean {
  return c.kind === "read" && c.annotations.readOnlyHint === true;
}

/**
 * The ONE scope a tool call needs. `null` means the tool has no scope — the
 * coverage guard forbids that for every exposed tool, and the door treats it
 * as unsatisfiable (fail closed) should one ever reach production.
 */
export function requiredScopeFor(
  c: Pick<CapabilityDescriptor, "id" | "kind" | "annotations">,
): ProductScope | null {
  const family = scopeFamilyOf(c.id);
  if (!family) return null;
  if (family === "messages" || family === "marketplace") return family;
  return `${isReadCapability(c) ? "read" : "write"}:${family}` as ProductScope;
}

/** `write:X` includes `read:X`; `messages` and `marketplace` are whole. */
export function scopeSatisfies(granted: ReadonlySet<ProductScope>, required: ProductScope): boolean {
  if (granted.has(required)) return true;
  if (required.startsWith("read:")) {
    return granted.has(required.replace(/^read:/, "write:") as ProductScope);
  }
  return false;
}

export function isProductScope(value: string): value is ProductScope {
  return (PRODUCT_SCOPES as readonly string[]).includes(value);
}

// ── The grant a caller holds ────────────────────────────────────────────────

/**
 * What the verified identity says about WHO is asking, for scoping only.
 *
 *   first_party     the person's own session (web cookie, or a Supabase
 *                   session bearer from the web / Android / iOS app) — no
 *                   OAuth client involved. Never scoped.
 *   oauth_scoped    a token an OAuth client obtained, carrying at least one
 *                   product scope.
 *   oauth_unscoped  a token an OAuth client obtained, carrying NO product
 *                   scope — every token Supabase Auth issues today (it
 *                   supports only openid / email / profile / phone). Allowed
 *                   while the flag is `off` or `log`; refused under `enforce`.
 */
export type ScopeGrant =
  | { readonly kind: "first_party" }
  | { readonly kind: "oauth_scoped"; readonly clientId: string; readonly scopes: ReadonlySet<ProductScope> }
  | { readonly kind: "oauth_unscoped"; readonly clientId: string };

/** `oauthClient` is what `resolveApiIdentity` read off a VERIFIED bearer token. */
export function scopeGrantOf(oauthClient: OauthClientClaims | undefined | null): ScopeGrant {
  if (!oauthClient) return { kind: "first_party" };
  const scopes = new Set((oauthClient.scopeClaim ?? []).filter(isProductScope));
  return scopes.size > 0
    ? { kind: "oauth_scoped", clientId: oauthClient.clientId, scopes }
    : { kind: "oauth_unscoped", clientId: oauthClient.clientId };
}

// ── The enforcement flag ────────────────────────────────────────────────────

/**
 * `MCP_SCOPE_ENFORCEMENT` (lib/env.ts), default `off`:
 *
 *   off      today's behaviour, byte for byte: nothing is evaluated, logged
 *            or recorded.
 *   log      every call still runs; a call the scope would refuse writes one
 *            privacy-safe `external_client.scope` log line
 *            (`outcome: "would_refuse"`) and nothing else.
 *   enforce  a call without the needed scope is refused with
 *            `insufficient_scope` before the capability runs, and leaves an
 *            audit receipt.
 */
export type ScopeEnforcementMode = "off" | "log" | "enforce";

export function scopeEnforcementModeOf(value: unknown): ScopeEnforcementMode {
  return value === "log" || value === "enforce" ? value : "off";
}

export type ScopeDecision =
  | { readonly outcome: "allow" }
  | {
      readonly outcome: "would_refuse" | "refuse";
      readonly requiredScope: ProductScope | null;
      readonly grantKind: "oauth_scoped" | "oauth_unscoped";
      readonly clientId: string;
    };

export function decideScope(
  mode: ScopeEnforcementMode,
  grant: ScopeGrant,
  capability: Pick<CapabilityDescriptor, "id" | "kind" | "annotations">,
): ScopeDecision {
  if (mode === "off" || grant.kind === "first_party") return { outcome: "allow" };
  const requiredScope = requiredScopeFor(capability);
  const allowed =
    grant.kind === "oauth_scoped" && requiredScope !== null && scopeSatisfies(grant.scopes, requiredScope);
  if (allowed) return { outcome: "allow" };
  return {
    outcome: mode === "enforce" ? "refuse" : "would_refuse",
    requiredScope,
    grantKind: grant.kind,
    clientId: grant.clientId,
  };
}

/** The structured refusal a client receives (JSON-RPC tool result, isError). */
export function insufficientScopeResult(
  capabilityId: string,
  requiredScope: ProductScope | null,
  grant: ScopeGrant,
) {
  return {
    ok: false as const,
    code: "insufficient_scope" as const,
    message:
      `This connection was not granted the permission "${requiredScope ?? "(none available)"}" ` +
      `that ${capabilityId} needs. NOTHING was read or written. Reconnect the app and allow that ` +
      "permission, or use LabourMarket.ai directly.",
    requiredScope,
    grantedScopes: grant.kind === "oauth_scoped" ? [...grant.scopes] : [],
  };
}

// ── Discovery and consent ───────────────────────────────────────────────────

/**
 * RFC 9728 `scopes_supported` (RECOMMENDED there): the scopes a client may
 * request for this resource. Only advertised when the owner switches
 * `MCP_PRM_ADVERTISE_SCOPES=on` — Claude requests exactly what this lists,
 * and an authorization server that does not know these names may refuse the
 * request, so advertising before the AS can issue them would break sign-in.
 */
export function advertisedScopes(): readonly ProductScope[] {
  return PRODUCT_SCOPES;
}

/** OIDC scopes the authorization server (Supabase Auth) issues itself. */
export const OIDC_SCOPES = ["openid", "email", "profile", "phone", "offline_access"] as const;

/**
 * The i18n key under `oauthConsent.scope` that explains a requested scope in
 * plain words, or `null` for a scope this platform does not know (shown
 * verbatim with the "not recognised" note — never silently dropped).
 */
export function consentScopeMessageKey(scope: string): string | null {
  switch (scope) {
    case "read:profile":
      return "readProfile";
    case "write:profile":
      return "writeProfile";
    case "read:journal":
      return "readJournal";
    case "write:journal":
      return "writeJournal";
    case "read:demand":
      return "readDemand";
    case "write:demand":
      return "writeDemand";
    case "read:organization":
      return "readOrganization";
    case "write:organization":
      return "writeOrganization";
    case "messages":
      return "messages";
    case "marketplace":
      return "marketplace";
    case "openid":
      return "oidcOpenid";
    case "email":
      return "oidcEmail";
    case "profile":
      return "oidcProfile";
    case "phone":
      return "oidcPhone";
    case "offline_access":
      return "oidcOfflineAccess";
    default:
      return /^billing(:|$)/.test(scope) ? "billingNone" : null;
  }
}

/** Every key `consentScopeMessageKey` can return — pinned by the i18n test. */
export const CONSENT_SCOPE_MESSAGE_KEYS = [
  "readProfile",
  "writeProfile",
  "readJournal",
  "writeJournal",
  "readDemand",
  "writeDemand",
  "readOrganization",
  "writeOrganization",
  "messages",
  "marketplace",
  "oidcOpenid",
  "oidcEmail",
  "oidcProfile",
  "oidcPhone",
  "oidcOfflineAccess",
  "billingNone",
] as const;

/** Whether the request names at least one product scope (a scoped grant). */
export function requestsProductScope(scopes: readonly string[]): boolean {
  return scopes.some(isProductScope);
}
