import "server-only";

import { revalidatePath } from "next/cache";

import {
  resolveEmployerCompanyContext,
  type EmployerContextReason,
} from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import {
  getOwnedCompanyById,
  isKnownCountryCode,
  saveCompanySetup,
  type CompanyRow,
} from "@/lib/company/company-setup";

/**
 * RENAME THE ACTIVE ORGANIZATION — one domain core (owner program 2026-09-23,
 * CASE 3/4/12), composed ENTIRELY from what already exists. No migration, no
 * new write path, no second name writer:
 *
 *   server-resolved active workspace   (`resolveEmployerCompanyContext` — the
 *                                       ONE employer resolver; never a client id)
 *   → governance                      (`manage-company-profile`: owner/admin)
 *   → the company row, read by id     (`getOwnedCompanyById`)
 *   → THE canonical name writer       (`saveCompanySetup` → `save_company_setup_v3`,
 *                                       which the settings form already calls;
 *                                       the mirror trigger carries the name to
 *                                       `organizations`, and so to the chip)
 *   → readback                        (`getOwnedCompanyById` again)
 *
 * The chat (`company.rename-organization`) is its only caller today; an MCP
 * capability would bind here through the G4 `conversationActionId` bridge,
 * never through a second implementation.
 *
 * ── WHAT IT REFUSES, AND WHY THE REFUSALS ARE THE HONEST PART ────────────
 *
 *  · `personal_workspace` — no organisation is active. Nothing is renamed on a
 *    guess; the caller asks which organisation is meant.
 *  · `no_company_profile` — the organisation has no company binding (a legacy
 *    agency-backed organisation: `resolveEmployerCompanyCore` answers
 *    `no-company-binding`). `save_company_setup_v3` can only target a
 *    `companies` row and `authenticated` holds no UPDATE on `organizations` or
 *    `agencies` in production, so there is no canonical writer for its name
 *    today. It is refused as that — never retargeted to "the company this
 *    person owns", which is the fallback that wrote the WRONG organisation's
 *    name through the setup page (proven 2026-09-23).
 *  · `not_authorized` — the person lacks `manage-company-profile` (a manager
 *    runs operations, not company identity).
 *  · `legal_name_verified` — THE VERIFIED-NAME LOCK, KEPT. The canonical writer
 *    sets `legal_name = display_name = name` in one statement; there is no
 *    display-name-only path without a schema change. For a VERIFIED company
 *    `resolveCompanyLegalParams` keeps the stored legal name, so the save would
 *    have returned `ok` while changing nothing — a fake success. The option
 *    the existing core supports honestly is to REFUSE before writing: a
 *    verified legal name is changed by a platform administrator.
 *  · `unavailable` — a read failed or the environment is incomplete. Never
 *    rendered as "you have no organisation".
 *
 * ── WHAT IT PRESERVES ────────────────────────────────────────────────────
 *  · PENDING VERIFICATION. The RPC recomputes `verification_status` on every
 *    save: `p_submit = false` drops a `pending_verification` company back to
 *    the automated status. The current submit state is therefore passed
 *    through (`submit` = "is it pending now"), so a rename never withdraws a
 *    review request. (The RPC also re-stamps `requested_at` on a submit —
 *    recorded here as the one side effect of that choice.)
 *  · EVERY OTHER FIELD. Each stored value is passed back as it is — the RPC
 *    keeps a stored value wherever the parameter is empty, and it re-runs its
 *    automated checks on exactly what the settings form would send. The
 *    country and type are left to the RPC's own `coalesce` so a stored value
 *    outside today's selectable list can never block a rename.
 */

export const ORGANIZATION_NAME_MIN = 2;
export const ORGANIZATION_NAME_MAX = 200;

export type RenameRefusal =
  | "personal_workspace"
  | "no_company_profile"
  | "not_authorized"
  | "legal_name_verified"
  | "unavailable";

export type RenameTarget =
  | {
      readonly kind: "ready";
      readonly organizationId: string;
      readonly companyId: string;
      /** The name stored NOW — `null` for an organisation that never had one. */
      readonly currentName: string | null;
      readonly row: CompanyRow;
    }
  | {
      readonly kind: "refused";
      readonly reason: RenameRefusal;
      /** The organisation's stored name when it is known — for the sentence. */
      readonly organizationName: string | null;
    };

export type RenameResult =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly previousName: string | null;
      /** The name as READ BACK after the write (or the stored one, unchanged). */
      readonly name: string;
      readonly unchanged: boolean;
    }
  | {
      readonly ok: false;
      readonly code:
        | RenameRefusal
        /** The active workspace is no longer the one the form was opened for. */
        | "workspace_changed"
        | "invalid"
        | "duplicate_company"
        | "needs_migration"
        | "error";
    };

function refusalFor(reason: EmployerContextReason): RenameRefusal {
  switch (reason) {
    case "personal-workspace":
    case "no-organization":
      return "personal_workspace";
    case "no-company-binding":
      return "no_company_profile";
    case "unauthenticated":
    case "company-not-owned":
    case "not-a-member":
      return "not_authorized";
    default:
      // company-missing / ambiguous-binding / needs-migration / error — an
      // incomplete environment or a failed read, never "you have nothing".
      return "unavailable";
  }
}

const storedName = (row: CompanyRow): string | null =>
  row.displayName?.trim() || row.legalName?.trim() || null;

/**
 * Which organisation a rename would touch RIGHT NOW, and whether this person
 * may rename it. Read-only. The chat asks this BEFORE it opens the confirm
 * form, and the write below asks it again — the same gates, one code path.
 */
export async function resolveRenameTarget(): Promise<RenameTarget> {
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") {
    return {
      kind: "refused",
      reason: refusalFor(ctx.reason),
      organizationName: ctx.activeWorkspaceName?.trim() || null,
    };
  }
  const organizationName = ctx.organizationName.trim() || null;
  if (!hasOrganizationCapability(ctx.role, "manage-company-profile")) {
    return { kind: "refused", reason: "not_authorized", organizationName };
  }
  const read = await getOwnedCompanyById(ctx.companyId);
  if (read.kind !== "ok") {
    return { kind: "refused", reason: "unavailable", organizationName };
  }
  if (!read.row) {
    // The creator-or-owner/admin read found nothing: not theirs to rename.
    return { kind: "refused", reason: "not_authorized", organizationName };
  }
  if (read.row.verificationStatus === "verified") {
    return {
      kind: "refused",
      reason: "legal_name_verified",
      organizationName: storedName(read.row) ?? organizationName,
    };
  }
  return {
    kind: "ready",
    organizationId: ctx.organizationId,
    companyId: read.row.id,
    currentName: storedName(read.row),
    row: read.row,
  };
}

/**
 * Rename the ACTIVE organisation to `rawName` through the canonical writer.
 * Every gate of `resolveRenameTarget` runs again here — the confirm form is a
 * view, never an authority. The receipt names old → new from a READBACK.
 *
 * `expectedOrganizationId` never CHOOSES the target — the server-resolved
 * workspace does. It is the organisation the confirm form was opened for, and
 * it can only REFUSE: a person who opened the form in organisation A and then
 * switched to B in another tab would otherwise rename B with a name typed for
 * A. (The dispatcher's token fingerprint — this organization + its current
 * name, from `resolveRenameTarget` — covers the instant between prepare and
 * execute and makes the token single-use; this covers the whole time the
 * form was open.)
 */
export async function renameActiveOrganization(
  rawName: string,
  opts: { readonly expectedOrganizationId?: string | null } = {},
): Promise<RenameResult> {
  const name = String(rawName ?? "").trim();
  if (name.length < ORGANIZATION_NAME_MIN || name.length > ORGANIZATION_NAME_MAX) {
    return { ok: false, code: "invalid" };
  }

  const target = await resolveRenameTarget();
  if (target.kind === "refused") return { ok: false, code: target.reason };
  if (opts.expectedOrganizationId && opts.expectedOrganizationId !== target.organizationId) {
    return { ok: false, code: "workspace_changed" };
  }

  const { row } = target;
  if (target.currentName === name) {
    // Already so named: nothing to write, and saying "renamed" would be false.
    return {
      ok: true,
      organizationId: target.organizationId,
      previousName: target.currentName,
      name,
      unchanged: true,
    };
  }

  const saved = await saveCompanySetup({
    companyId: row.id,
    legalName: name,
    // Left to the RPC's `coalesce` (stored value kept) — see the docblock.
    companyType: undefined,
    country: row.country && isKnownCountryCode(row.country) ? row.country : undefined,
    registrationCode: row.registrationCode ?? undefined,
    address: row.address ?? undefined,
    website: row.website ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    contactPhone: row.contactPhone ?? undefined,
    requesterRole: row.requesterRole ?? undefined,
    // A pending review request survives the rename (see the docblock).
    submit: row.verificationStatus === "pending_verification",
  });
  if (saved.kind !== "ok") {
    switch (saved.kind) {
      case "needs-migration":
        return { ok: false, code: "needs_migration" };
      case "invalid":
      case "invalid-country":
        return { ok: false, code: "invalid" };
      case "duplicate-company":
        return { ok: false, code: "duplicate_company" };
      case "not-owner":
        return { ok: false, code: "not_authorized" };
      default:
        return { ok: false, code: "error" };
    }
  }

  // The chip in the header reads the organisation name through the layout;
  // the whole tree is revalidated so the new name is what the person sees
  // on the very next render (the client form refreshes the router).
  revalidatePath("/", "layout");

  // READBACK. The receipt says what is STORED, not what was asked for.
  const after = await getOwnedCompanyById(row.id);
  const readBack = after.kind === "ok" && after.row ? storedName(after.row) : null;
  if (after.kind === "ok" && after.row && readBack !== name) {
    // The row is readable and does not carry the new name: the write did not
    // take (e.g. the company was verified in between and the lock held).
    return {
      ok: false,
      code: after.row.verificationStatus === "verified" ? "legal_name_verified" : "error",
    };
  }
  return {
    ok: true,
    organizationId: target.organizationId,
    previousName: target.currentName,
    // An unreadable readback (read error) still reports the write that the
    // canonical RPC confirmed; it never invents a different name.
    name: readBack ?? name,
    unchanged: false,
  };
}
