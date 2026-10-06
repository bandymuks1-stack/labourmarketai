/**
 * WORKER ACTIVATION — the one place that knows how an inbound-worker campaign
 * link travels through registration (2026-10-06).
 *
 * THE LINK. A worker who wrote to Nonstop looking for work is sent
 *   /{locale}/for-workers?utm_source=nonstop&utm_medium=email
 *     &utm_campaign=worker-inbound-2026-09&utm_content=ns-inbound-<12 hex>
 * The 12 hex are the referral envelope's `external_reference` (the idempotency
 * key of `receive_external_referral_v1`), so `utm_content` is the join key
 * between the campaign link and the referral row.
 *
 * THE GAP THIS CLOSES. First-touch attribution lives in `localStorage` on ONE
 * device and is never overwritten, so (a) an earlier organic visit hid the
 * campaign, (b) a different browser or device lost it, and (c) nothing joined
 * `utm_content` to the referral. This module lets the signup CTA carry the
 * reference in the URL itself — as `utm_*` on the signup URL (read into
 * `auth.users.raw_user_meta_data`) AND as `referral` inside `next`, which the
 * existing safe-return mechanism already carries through e-mail confirmation,
 * OAuth and onboarding to the first authenticated screen.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It grants no consent, prefills no consent
 * and no legal work country, and never implies that registering is agreement
 * to anything. It only decides WHERE a person who arrived this way lands next
 * (the existing /dashboard/privacy screen, where every consent and the supply
 * declaration are the person's own explicit act) and WHICH reference to record
 * as "registered". Pure module: no IO, safe on client and server.
 */

/** The registered source slug (lib/invitations/external-sources.ts). */
export const INBOUND_REFERRAL_SOURCE_SLUG = "nonstop" as const;

/** `ns-inbound-` + the 12 hex of the Message-ID hash. Nothing else is accepted. */
const CONTENT_TAG_RE = /^ns-inbound-([0-9a-f]{12})$/;
const CAMPAIGN_RE = /^worker-inbound-[a-z0-9-]{1,40}$/;
const MEDIUM_RE = /^[a-z0-9_-]{1,40}$/;

/** The existing screen that holds every consent and the supply declaration. */
export const WORKER_ACTIVATION_PATH = "/dashboard/privacy" as const;

/** Value of `activation` that switches the next-step panel on. */
export const WORKER_ACTIVATION_FLAG = "worker" as const;

export interface InboundReferral {
  readonly sourceSlug: typeof INBOUND_REFERRAL_SOURCE_SLUG;
  /** `ns-inbound-<12 hex>` — what travels in `utm_content` / `referral`. */
  readonly contentTag: string;
  /** The 12 hex — the referral envelope's `external_reference`. */
  readonly reference: string;
  readonly campaign: string | null;
  readonly medium: string | null;
}

interface ParamReader {
  get(name: string): string | null;
}

/** Validate a bare `ns-inbound-<12 hex>` tag (as carried by `referral`). */
export function parseContentTag(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  return CONTENT_TAG_RE.test(raw) ? raw : null;
}

/** The 12 hex reference of a valid content tag, else null. */
export function referenceOfContentTag(raw: string | null | undefined): string | null {
  const tag = parseContentTag(raw);
  return tag ? (CONTENT_TAG_RE.exec(tag)?.[1] ?? null) : null;
}

/**
 * Read the inbound-worker campaign from URL params. Every field is validated
 * against a closed shape; anything else yields `null` (fall back to the normal
 * signup — an unrecognised link is never an error and never a guess).
 */
export function parseInboundReferral(params: ParamReader): InboundReferral | null {
  if (params.get("utm_source") !== INBOUND_REFERRAL_SOURCE_SLUG) return null;
  const contentTag = parseContentTag(params.get("utm_content"));
  if (!contentTag) return null;
  const reference = referenceOfContentTag(contentTag);
  if (!reference) return null;
  const campaignRaw = params.get("utm_campaign");
  const mediumRaw = params.get("utm_medium");
  return {
    sourceSlug: INBOUND_REFERRAL_SOURCE_SLUG,
    contentTag,
    reference,
    campaign: campaignRaw && CAMPAIGN_RE.test(campaignRaw) ? campaignRaw : null,
    medium: mediumRaw && MEDIUM_RE.test(mediumRaw) ? mediumRaw : null,
  };
}

/** The `utm_*` pairs that go on the signup URL / into signup metadata. */
export function inboundUtmPairs(ref: InboundReferral): Array<[string, string]> {
  const pairs: Array<[string, string]> = [["utm_source", ref.sourceSlug]];
  if (ref.medium) pairs.push(["utm_medium", ref.medium]);
  if (ref.campaign) pairs.push(["utm_campaign", ref.campaign]);
  pairs.push(["utm_content", ref.contentTag]);
  return pairs;
}

/** The same pairs as a plain object (signup metadata; every value is already
 *  inside the sanitiser's 120-char bound). */
export function inboundAttributionMetadata(ref: InboundReferral): Record<string, string> {
  return Object.fromEntries(inboundUtmPairs(ref));
}

/**
 * `next` for a worker who arrived through the campaign: the existing privacy
 * screen, with the next-step panel switched on and the reference carried so
 * the first authenticated render can record "registered". Locale-less on
 * purpose — `getSafeReturnPath` prefixes the landing locale.
 */
export function buildActivationNext(ref: InboundReferral | null): string {
  const q = new URLSearchParams({ activation: WORKER_ACTIVATION_FLAG });
  if (ref) q.set("referral", ref.contentTag);
  return `${WORKER_ACTIVATION_PATH}?${q.toString()}`;
}

/**
 * The signup URL the `/for-workers` CTA should point at for this visit.
 * Returns `null` when the visit carries no (valid) campaign, so callers keep
 * the plain `/auth/signup`.
 */
export function buildActivationSignupHref(search: string): string | null {
  const ref = parseInboundReferral(new URLSearchParams(search));
  if (!ref) return null;
  const q = new URLSearchParams();
  q.set("next", buildActivationNext(ref));
  for (const [k, v] of inboundUtmPairs(ref)) q.set(k, v);
  return `/auth/signup?${q.toString()}`;
}
