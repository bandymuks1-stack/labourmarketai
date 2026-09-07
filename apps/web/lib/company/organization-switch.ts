/**
 * Pure multi-company switching logic (Company Architecture Completion,
 * Sprint v2 §5). Client-safe, no IO — the server resolvers
 * (lib/company/active-organization.ts) and the header switcher both consume
 * these helpers so the "which org is active / is a switcher shown at all"
 * decisions have exactly one implementation.
 *
 * Honesty contract:
 *   - a switcher is offered ONLY when the profile really belongs to MORE
 *     than one organization (a single-company user sees no switcher — no
 *     fake multi-tenancy chrome);
 *   - the active organization is ALWAYS membership-validated: a stored
 *     pointer that no longer matches a membership (org deleted, ownership
 *     transferred, stale value) silently falls back to the first
 *     membership, never to a fabricated org and never to a foreign org.
 *
 * Guard: lib/company/organization-switch.test.ts +
 * lib/guards/company-architecture-v1.test.ts.
 */

export interface SwitchableOrganization {
  readonly id: string;
  /** Human label — display_name, else legal_name (resolved by the reader). */
  readonly name: string;
}

/**
 * Workspace context (real-user workflow rebuild W1). A "workspace" is NOT a
 * new module or a second dashboard — it is only the ACTIVE WORK CONTEXT a
 * person is acting in right now: their personal space, or one of the
 * organizations they own / manage / work for. The DB spine already expresses
 * this (organizations + engagement_contexts, doctrine §5.5); these types are
 * the thin client-safe projection of it.
 */
export const PERSONAL_WORKSPACE_ID = "personal";

export type WorkspaceRelationship = "owner" | "manager" | "employee" | "other";

export interface WorkspaceInfo {
  /** Organization id, or PERSONAL_WORKSPACE_ID for the personal space. */
  readonly id: string;
  /** Org display name; empty string for the personal workspace (the client
   *  substitutes the localized "personal space" label — never a fabricated
   *  org name). */
  readonly name: string;
  readonly kind: "personal" | "organization";
  readonly organizationType?: "company" | "agency" | "team" | "other";
  readonly relationship?: WorkspaceRelationship;
  /** Stable accent hue index (0..WORKSPACE_ACCENT_COUNT-1) derived from the
   *  org id — the SAME org always renders the SAME accent, everywhere. The
   *  hues map onto the EXISTING brand tokens (no new palette). */
  readonly accentIndex: number;
}

/** Number of workspace accent hues — matches the existing brand token set
 *  (blue, cyan, violet, purple, orange) in tokens/colors.ts. */
export const WORKSPACE_ACCENT_COUNT = 5;

/** Deterministic, dependency-free hash → accent index. Pure so the server
 *  resolver and any client code agree without a round trip. */
export function workspaceAccentIndex(organizationId: string): number {
  let h = 0;
  for (let i = 0; i < organizationId.length; i += 1) {
    h = (h * 31 + organizationId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % WORKSPACE_ACCENT_COUNT;
}

/**
 * Membership-validated active-WORKSPACE resolution.
 *
 *   - an EXPLICIT personal choice always wins (see below);
 *   - a stored org pointer that matches a real membership wins next;
 *   - company identity with EXACTLY ONE organization → that organization
 *     (an unambiguous default is not a guess — M-P0-2's "single
 *     unambiguous row" doctrine at the workspace level);
 *   - company identity with SEVERAL organizations and no valid pointer →
 *     the personal workspace, FAIL CLOSED (M-P0-5: the person explicitly
 *     picks in the chip; the old `organizationIds[0]` fallback was exactly
 *     the forbidden first/oldest-organization inference and made a revoked
 *     workspace silently snap to another org);
 *   - person identity with no valid pointer → the personal workspace;
 *   - never a fabricated org, never a foreign org.
 *
 * WHY `PERSONAL_WORKSPACE_ID` IS AN ACCEPTED STORED VALUE (D-20).
 *
 * "I chose personal" and "I have never chosen" used to be the SAME stored
 * state — `null`. The callers flattened an explicit personal pointer to null
 * one line before calling this, and the single-org rule below then handed the
 * person straight back to their organization. For a company identity with
 * exactly one organization — the ordinary employer account — picking the
 * personal space was undone on the very next page load, so an employer could
 * not stay in their own worker space to fill their own Work Journal.
 *
 * No test caught it because the single-org default is CORRECT and is asserted
 * as such; the defect was that an explicit choice could not be expressed at
 * all. Accepting the sentinel here is what separates the two states, and it
 * belongs in the pure resolver rather than as a short-circuit at each call
 * site — there are two call sites, and one of them would have been forgotten.
 */
export function resolveActiveWorkspaceId(
  identity: "person" | "company" | null,
  organizationIds: readonly string[],
  storedOrganizationId: string | null,
): string {
  // An explicit choice outranks every inference below, including the
  // unambiguous single-org default. Deliberate: an inference may only fill a
  // gap the person left, never overrule what they actually said.
  if (storedOrganizationId === PERSONAL_WORKSPACE_ID) {
    return PERSONAL_WORKSPACE_ID;
  }
  if (
    storedOrganizationId !== null &&
    organizationIds.includes(storedOrganizationId)
  ) {
    return storedOrganizationId;
  }
  if (identity === "company" && organizationIds.length === 1) {
    return organizationIds[0];
  }
  return PERSONAL_WORKSPACE_ID;
}

/** A switcher is rendered ONLY for a real multi-company profile. */
export function shouldOfferOrganizationSwitch(
  organizations: readonly SwitchableOrganization[],
): boolean {
  return organizations.length > 1;
}

/**
 * Membership-validated active-organization resolution.
 *
 *   - an EXPLICIT personal choice → null (D-20: no organization is active,
 *     because the person said so — same reasoning as
 *     `resolveActiveWorkspaceId`, and both resolvers must agree or the header
 *     and the surfaces below it describe different contexts);
 *   - stored pointer matches a membership → that org;
 *   - EXACTLY ONE membership → that org (unambiguous default);
 *   - SEVERAL memberships and a stale/null pointer → null, FAIL CLOSED
 *     (M-P0-5: the surface renders an explicit chooser state — the old
 *     `organizations[0]` fallback silently picked the first/oldest org,
 *     the exact inference the multi-org doctrine forbids);
 *   - no memberships → null (an honest "no company yet" — never fabricated).
 *
 * This narrows CONTEXT, never permission: every organization-scoped action
 * re-validates membership server-side regardless of what is active here.
 */
export function resolveActiveOrganizationId(
  organizations: readonly SwitchableOrganization[],
  storedActiveOrganizationId: string | null,
): string | null {
  if (storedActiveOrganizationId === PERSONAL_WORKSPACE_ID) return null;
  if (organizations.length === 0) return null;
  if (
    storedActiveOrganizationId !== null &&
    organizations.some((o) => o.id === storedActiveOrganizationId)
  ) {
    return storedActiveOrganizationId;
  }
  return organizations.length === 1 ? organizations[0].id : null;
}

/**
 * THE LABEL A PERSON ACTUALLY READS in the workspace switcher.
 *
 * WHY THIS IS NOT `w.name || fallback`. Five production organizations carry
 * neither a `display_name` nor a `legal_name` (all created 2026-05-21/22,
 * before `saveCompanySetup` began rejecting a name shorter than 2 characters —
 * the intake path is already closed, the rows remain). The owner's own account
 * is a member of exactly two of them, so the switcher rendered:
 *
 *     Asmenine erdve
 *     Imones erdve      <- organization A
 *     Imones erdve      <- organization B
 *
 * Two rows, identical text, no way to tell which one is active or what
 * switching would change (owner audit defects A and B). The single shared
 * fallback string was itself the defect: it made distinct workspaces
 * indistinguishable.
 *
 * ── THE FIX FOR THAT BECAME THE NEXT DEFECT (owner walk, 2026-09-07) ───────
 *
 * The answer then was a positional suffix, argued as "a number is not a name,
 * it is a way to say 'this is the second one'." On production the owner read:
 *
 *     Asmeninė erdvė
 *     Įmonės erdvė 1            <- unnamed organization
 *     Labour market ai Sp. z o.o
 *     Įmonės erdvė 2            <- another unnamed organization
 *
 * and could not tell whether those were real companies, incomplete records,
 * synthetic placeholders or orphaned test data. The argument was wrong:
 * "Įmonės erdvė 1" sits in a list beside a real registered company name and
 * reads as one. UNKNOWN was rendered as KNOWN.
 *
 * ── WHAT THE ROWS ACTUALLY ARE (traced on production, 2026-09-07) ──────────
 *
 * Real organizations. Not synthetic, not test data, and nothing to delete:
 *
 *   · 5 of 17 production organizations have neither `display_name` nor
 *     `legal_name`. Every one carries a `legacy_company_id` or
 *     `legacy_agency_id`; ZERO were created nameless by the current product.
 *   · Provenance is migration `0013_work_journal_m1.sql`, whose backfill
 *     copies `legal_name` / `display_name` from `companies` / `agencies`
 *     verbatim. The legacy rows were themselves NULL, so **no name was ever
 *     lost — none ever existed.**
 *   · They hold real memberships and, in two cases, real content (one carries
 *     a live `customer_requests` row).
 *   · The intake path is already closed: `saveCompanySetup` rejects a name
 *     shorter than 2 characters, which is why the count is a fixed legacy
 *     residue rather than a growing one.
 *
 * ── THE RULE NOW ──────────────────────────────────────────────────────────
 *
 * An organization with no stored name is labelled with a phrase that SAYS SO,
 * chosen by its real type ("Įmonė be pavadinimo" / "Agentūra be pavadinimo").
 * The type is real data and is usually enough to tell two of them apart. If
 * two unnamed organizations of the SAME type still collide, the discriminator
 * is a fragment of the organization id — unmistakably a reference, never
 * mistakable for a name. No counter, ever.
 *
 * Pure so the ordering is identical everywhere the context is rendered, and so
 * the collision rule is unit-testable without a browser.
 */
/** The unnamed-organization phrases, one per organization type. Each must
 *  SAY that the name is missing — none of them may read as a name. */
export type UnnamedOrganizationLabels = Readonly<
  Record<"company" | "agency" | "team" | "other", string>
>;

/**
 * Is this workspace label an honest "no name stored" phrase rather than a
 * name the organization actually has? Exported so surfaces can render it
 * differently — italic, muted, with a "name this organization" action — and
 * so the guard can assert the distinction survives.
 */
export function isUnnamedOrganizationLabel(
  label: string,
  labels: UnnamedOrganizationLabels,
): boolean {
  return Object.values(labels).some((l) => label === l || label.startsWith(`${l} ·`));
}

export function workspaceDisplayLabels(
  workspaces: readonly WorkspaceInfo[],
  labels: {
    readonly personal: string;
    readonly unnamedOrganization: UnnamedOrganizationLabels;
  },
): Map<string, string> {
  const base = new Map<string, string>();
  for (const w of workspaces) {
    if (w.kind === "personal") {
      base.set(w.id, labels.personal);
      continue;
    }
    // The stored name, or an explicit statement that there is none — chosen
    // by the organization's REAL type, which is the first honest thing that
    // tells two unnamed workspaces apart.
    base.set(
      w.id,
      w.name.trim() || labels.unnamedOrganization[w.organizationType ?? "other"],
    );
  }
  // Which texts are claimed by more than one workspace?
  const counts = new Map<string, number>();
  for (const text of base.values()) counts.set(text, (counts.get(text) ?? 0) + 1);

  const out = new Map<string, string>();
  for (const w of workspaces) {
    const text = base.get(w.id)!;
    if ((counts.get(text) ?? 0) < 2) {
      out.set(w.id, text);
      continue;
    }
    // STILL COLLIDING — two unnamed organizations of the SAME type. The
    // discriminator is a fragment of the organization's own id: unmistakably
    // a reference, never mistakable for a name. A counter is what this code
    // used to append, and a counter is exactly what the owner read as a name
    // on production ("Įmonės erdvė 1", "Įmonės erdvė 2" — see the note above).
    //
    // The personal workspace can never reach here (there is only ever one),
    // so no id fragment is ever shown for it.
    out.set(w.id, `${text} · ${w.id.slice(0, 8)}`);
  }
  return out;
}
