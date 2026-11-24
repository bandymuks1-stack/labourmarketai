/**
 * APPROVED EXTERNAL REFERRAL SOURCES — the registry (universal network v1).
 *
 * An external source is a system that brings a person into LabourMarket.ai
 * on the strength of that person's explicit consent: a partner's careers
 * intake today, an approved staffing partner tomorrow. Every source rides
 * the SAME contract (`external-referral-contract.ts`), the SAME door
 * (`app/api/referrals/external/v1`) and the SAME canonical invitation row.
 * Nothing about a source is special-cased anywhere else in the product —
 * the slug below is the only place its name appears in code.
 *
 * WHAT A REGISTRY ENTRY IS
 *   - `slug`: what `invitations.external_source_slug` stores (`^[a-z0-9_-]{2,40}$`,
 *     mirrored by the DB CHECK).
 *   - `tokenEnv`: the environment variable holding this source's OWN machine
 *     secret. One secret per source, never shared: a leaked partner secret
 *     rotates that partner, not every partner.
 *   - `consentVersion`: the exact consent-notice version this source must
 *     present. The envelope's `consent.version` must equal it; the DB
 *     re-checks. Bump here when the partner's notice wording changes and the
 *     old version is no longer acceptable.
 *   - `controller`: who collected the consent (the data controller named in
 *     the notice the person saw).
 *   - `referredPersonIsWorker`: the partner's consent notice is about the
 *     person's OWN job search, so onboarding may skip the role question for a
 *     `join_platform` referral from this source when the person arrives
 *     WITHOUT the link (2026-10-27). A new partner defaults to `false`: the
 *     question stays until someone reads that partner's notice.
 *
 * A source without a configured secret is NOT live: the door answers 401
 * `not_configured` for it. Adding a slug here enables nothing by itself.
 *
 * Pure data. No IO.
 */
export interface ExternalReferralSource {
  readonly slug: string;
  readonly displayName: string;
  readonly tokenEnv: string;
  readonly consentVersion: string;
  readonly controller: string;
  readonly referredPersonIsWorker: boolean;
}

export const EXTERNAL_REFERRAL_SOURCES: readonly ExternalReferralSource[] = [
  {
    slug: "nonstop",
    displayName: "Nonstop Group",
    tokenEnv: "EXTERNAL_REFERRAL_TOKEN_NONSTOP",
    // `BROADER_SEARCH_CONSENT_VERSION` in the partner's careers intake.
    consentVersion: "worker-broader-search-v1",
    controller: "UAB Nonstop Group",
    referredPersonIsWorker: true,
  },
] as const;

export const EXTERNAL_SOURCE_SLUG_RX = /^[a-z0-9_-]{2,40}$/;

export function findExternalReferralSource(
  slug: string | null | undefined,
): ExternalReferralSource | null {
  const s = (slug ?? "").trim();
  if (!EXTERNAL_SOURCE_SLUG_RX.test(s)) return null;
  return EXTERNAL_REFERRAL_SOURCES.find((x) => x.slug === s) ?? null;
}
