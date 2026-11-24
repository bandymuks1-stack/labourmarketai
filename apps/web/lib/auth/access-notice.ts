import {
  OPERATOR_ACCESS_NOTICE,
  ROLE_GATED_PREFIXES,
} from "@/lib/auth/role-gated-routes";
import { type Role } from "@/lib/auth/actions";

/**
 * The refusal reason, turned from an internal token into something a person
 * can read.
 *
 * `requireRoleOrRedirect` has emitted `?notice=needs_<role>_role` since the
 * audit that introduced it, and its own docstring promised "the overview
 * renders a banner explaining WHICH space the link needed". Measured on the
 * local production build 2026-09-22: NOTHING on `/lt/dashboard` read the
 * parameter. A person who opened an employer link was bounced home with the
 * reason sitting unread in their address bar — the product knew why and did
 * not say. This is the reader; `components/app/access-refusal-notice.tsx` is
 * the sentence.
 *
 * The token is INTERNAL. It is parsed against a closed set derived from the
 * gate table itself, so an unknown or hand-typed `?notice=` renders nothing
 * rather than being echoed back at the reader (doctrine §23: an internal value
 * must never surface in a box a person is about to read).
 */

/** A refusal a person can be told about: a participation role, or operator. */
export type AccessNoticeReason = Role | "operator";

/** Exactly the roles a route can be refused for — derived, never re-listed. */
const REFUSABLE_ROLES: ReadonlySet<Role> = new Set(
  ROLE_GATED_PREFIXES.flatMap((row) =>
    row.requirement.kind === "role" ? [row.requirement.role] : [],
  ),
);

/**
 * `needs_company_role` → `"company"`. Anything else → `null`, including a
 * well-formed token for a role no route actually gates.
 */
export function parseAccessNotice(
  raw: string | null | undefined,
): AccessNoticeReason | null {
  if (typeof raw !== "string") return null;
  if (raw === OPERATOR_ACCESS_NOTICE) return "operator";
  const match = /^needs_([a-z]+)_role$/.exec(raw);
  if (!match) return null;
  const role = match[1] as Role;
  return REFUSABLE_ROLES.has(role) ? role : null;
}

/**
 * The message key for a refused reason. One key per reason rather than one
 * interpolated sentence with the role NAME substituted in: "the employer
 * space", "the personal work board" and "the buyer space" are not the same
 * sentence with a word swapped, and in Lithuanian they do not even share a
 * case.
 */
export function accessNoticeMessageKey(reason: AccessNoticeReason): string {
  return `accessNotice.${reason}`;
}

/**
 * Whether the sentence may point at the Activity Setup Hub.
 *
 * Only for the participation roles: a person really can start an employer,
 * buyer or personal space there. Operator access is granted out of band
 * (`admin:grant-superadmin`), so offering a setup link would be a control that
 * cannot do what it says — the kind of dead path doctrine §7 forbids.
 */
export function accessNoticeOffersSetup(reason: AccessNoticeReason): boolean {
  return reason !== "operator";
}
