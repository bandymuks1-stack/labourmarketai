/**
 * REPROCESS UNSENT PARTNER REFERRALS (owner order 2026-10-27, P0 e-mail).
 *
 * Partner referrals (Nonstop) stored while no e-mail provider was configured
 * were never e-mailed (`delivery_status = 'not_sent'`), and nothing retries
 * them. This is the ONE path that may: a fresh link per person, through the
 * existing ledgered provider, under the owner's rules —
 *
 *   - only pending, never-delivered, consented, NOT expired partner referrals
 *     (the database function `reissue_external_referral_v1` re-checks each);
 *   - never a synthetic address, never a person who already has an account
 *     (a "join the platform" mail to a member is wrong);
 *   - one mail per address: duplicates collapse onto the newest referral;
 *   - a DRY RUN by default — counts only, nothing rotated, nothing sent;
 *   - a control test first (`onlyInvitationId`), then at most `MAX_PER_RUN`
 *     per run; a bulk run is the owner's separate approval, not this code's;
 *   - no provider configured → refuse before rotating any token.
 *
 * Pure apart from the injected dependencies, so every decision is testable
 * without a network or a database; the server caller wires the real ones.
 */

export const MAX_PER_RUN = 20;

const SYNTHETIC_ADDRESS = /(^qa\.|@labourmarket\.ai$|@example\.(com|org|net|test)$|\.test$|\+qa@|synthetic)/i;

export type ReferralRow = {
  readonly id: string;
  readonly invitedEmail: string | null;
  readonly locale: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly status: string;
  readonly deliveryStatus: string;
  readonly consentGiven: boolean;
  readonly externalSource: string | null;
};

export type ExclusionReason =
  | "not_partner_referral"
  | "not_pending"
  | "already_sent"
  | "no_consent"
  | "expired"
  | "no_address"
  | "synthetic_address"
  | "has_account"
  | "duplicate_address";

export type Selection = {
  readonly eligible: readonly ReferralRow[];
  readonly excluded: Readonly<Partial<Record<ExclusionReason, number>>>;
};

/** Which rows may receive a fresh link, and why every other one may not. */
export function selectReprocessCandidates(
  rows: readonly ReferralRow[],
  input: { readonly now: Date; readonly existingAccountEmails: ReadonlySet<string> },
): Selection {
  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const skip = (r: ExclusionReason) => {
    excluded[r] = (excluded[r] ?? 0) + 1;
  };
  const newestByAddress = new Map<string, ReferralRow>();
  for (const row of rows) {
    const address = row.invitedEmail?.trim().toLowerCase() ?? "";
    if (!row.externalSource) skip("not_partner_referral");
    else if (row.status !== "pending") skip("not_pending");
    else if (row.deliveryStatus === "sent") skip("already_sent");
    else if (!row.consentGiven) skip("no_consent");
    else if (!row.expiresAt || new Date(row.expiresAt) <= input.now) skip("expired");
    else if (!address) skip("no_address");
    else if (SYNTHETIC_ADDRESS.test(address)) skip("synthetic_address");
    else if (input.existingAccountEmails.has(address)) skip("has_account");
    else {
      const seen = newestByAddress.get(address);
      if (!seen) newestByAddress.set(address, row);
      else {
        skip("duplicate_address");
        if (row.createdAt > seen.createdAt) newestByAddress.set(address, row);
      }
    }
  }
  const eligible = [...newestByAddress.values()].sort((a, b) =>
    (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""),
  );
  return { eligible, excluded };
}

export type ReprocessDeps = {
  readonly emailConfigured: () => boolean;
  readonly mintToken: () => { token: string; hash: string };
  /** `reissue_external_referral_v1` — returns 'ok' or the refusal. */
  readonly reissue: (invitationId: string, tokenHash: string) => Promise<string>;
  readonly buildLink: (locale: string, token: string) => string;
  /** Sends ONE invitation mail in `locale`; true only on a provider ack. */
  readonly send: (to: string, locale: string, link: string) => Promise<boolean>;
  /** `mark_external_referral_delivery_v1`. */
  readonly mark: (invitationId: string, outcome: "sent" | "delivery_failed") => Promise<void>;
  readonly resolveLocale: (locale: string | null) => string;
};

export type ReprocessOptions = {
  /** Default true: report only. */
  readonly dryRun?: boolean;
  /** The control test: exactly this one referral, nothing else. */
  readonly onlyInvitationId?: string;
  readonly limit?: number;
};

export type ReprocessReport = {
  readonly outcome: "dry_run" | "done" | "email_not_configured" | "not_eligible";
  readonly eligible: number;
  readonly excluded: Selection["excluded"];
  readonly attempted: number;
  readonly sent: number;
  readonly failed: number;
  readonly refused: Readonly<Record<string, number>>;
};

export async function reprocessExternalReferrals(
  selection: Selection,
  options: ReprocessOptions,
  deps: ReprocessDeps,
): Promise<ReprocessReport> {
  const dryRun = options.dryRun !== false;
  const pool = options.onlyInvitationId
    ? selection.eligible.filter((r) => r.id === options.onlyInvitationId)
    : selection.eligible;
  const limit = options.onlyInvitationId ? 1 : Math.max(0, Math.min(options.limit ?? MAX_PER_RUN, MAX_PER_RUN));
  const batch = pool.slice(0, limit);
  const base = { eligible: selection.eligible.length, excluded: selection.excluded };
  const empty = { attempted: 0, sent: 0, failed: 0, refused: {} };

  if (options.onlyInvitationId && batch.length === 0) return { outcome: "not_eligible", ...base, ...empty };
  if (dryRun) return { outcome: "dry_run", ...base, ...empty, attempted: batch.length };
  // Refuse BEFORE any token is rotated: a rotation without a mail would only
  // invalidate a link nobody holds and spend one of the three reissues.
  if (!deps.emailConfigured()) return { outcome: "email_not_configured", ...base, ...empty };

  let sent = 0;
  let failed = 0;
  const refused: Record<string, number> = {};
  for (const row of batch) {
    const { token, hash } = deps.mintToken();
    const verdict = await deps.reissue(row.id, hash);
    if (verdict !== "ok") {
      refused[verdict] = (refused[verdict] ?? 0) + 1;
      continue;
    }
    const locale = deps.resolveLocale(row.locale);
    let ok = false;
    try {
      ok = await deps.send(row.invitedEmail!.trim(), locale, deps.buildLink(locale, token));
    } catch {
      ok = false;
    }
    await deps.mark(row.id, ok ? "sent" : "delivery_failed");
    if (ok) sent += 1;
    else failed += 1;
  }
  return { outcome: "done", ...base, attempted: batch.length, sent, failed, refused };
}
