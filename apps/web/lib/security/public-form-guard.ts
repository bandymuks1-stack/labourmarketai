import "server-only";

import { createHash } from "node:crypto";

import { countLinks, looksLikeAdvertising } from "@/lib/staffing/intake-advertising";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * SPAM GUARD FOR THE NO-SIGNUP COMMERCIAL FORMS (owner order 2026-11-09:
 * "Form spam protection: IMPLEMENT NOW in a separate PR, with rate limiting,
 * validation, abuse prevention and tests.").
 *
 * The public company-need form stored 5 link adverts out of 7 rows. Every
 * no-signup commercial form lands in `company_need_public_intakes` through
 * `persistPublicCompanyNeed`, so the checks live here once and both callers use
 * them: the `/company-need` form (`company-need-form-actions.ts`) and the three
 * landing request doors (`request-door-actions.ts`).
 *
 * Layers, cheapest first:
 *   1. FORM: a hidden honeypot field a person never fills, and a minimum fill
 *      time measured from when the form appeared in the browser.
 *   2. RATE: per client IP and per contact e-mail (see `publicIntakeRateLimited`).
 *   3. CONTENT: a cap on links in the free text, no link in a person's name,
 *      and the advert reading of `intake-advertising.ts` (one list of pitches,
 *      never a second one).
 *
 * ON ANY REFUSAL nothing is stored and nobody is alerted. The caller answers the
 * same generic "could not send, try again later" state whatever tripped (a
 * person caught by mistake is never told "received" for a request we dropped),
 * and the reason goes to the server log only, as a counter — never the text,
 * the e-mail, the IP or a name.
 *
 * FILL TIME IS A PLAIN CLIENT TIMESTAMP, NOT SIGNED. Both pages are static
 * markup (the company-need form fills its prefill after hydration for that
 * reason), so a server render time would be the build time; the form records
 * `Date.now()` when it appears. A bot that forges the field passes this one
 * check and still meets the honeypot, the rate limits and the content checks.
 */

/** The hidden field a person leaves empty. Same name as the doors' existing one. */
export const HONEYPOT_FIELD = "website";
/** Milliseconds since epoch at which the form appeared in the browser. */
export const STARTED_FIELD = "started";
/** Nobody reads and fills one of these forms in under three seconds. */
export const MIN_FILL_MS = 3000;
/** A clock a little ahead of ours is fine; a time well in the future is forged. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
/** A real need may carry its own site and one more link; three or more is a pitch. */
export const MAX_LINKS = 2;

export type SpamReason =
  | "honeypot"
  | "no_timestamp"
  | "too_fast"
  | "too_many_links"
  | "link_in_name"
  | "advert"
  | "rate_ip"
  | "rate_email";

/** Honeypot and fill time. `read` returns the raw form value ("" when absent). */
export function screenPublicFormTiming(read: (name: string) => string, nowMs: number = Date.now()): SpamReason | null {
  if (read(HONEYPOT_FIELD).trim() !== "") return "honeypot";
  const raw = read(STARTED_FIELD).trim();
  const started = /^\d{10,16}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isFinite(started) || started <= 0) return "no_timestamp";
  if (started - nowMs > MAX_CLOCK_SKEW_MS) return "no_timestamp";
  if (nowMs - started < MIN_FILL_MS) return "too_fast";
  return null;
}

export type IntakeContent = {
  /** Fields a person writes freely: the need, the sector or work, a city. */
  readonly freeText: readonly (string | null | undefined)[];
  /** A company or a person's name. A URL never belongs here. */
  readonly names: readonly (string | null | undefined)[];
};

const URL_IN_NAME = /https?:\/\/|\bwww\./i;

/** Links, a URL as a name, and the advert reading. */
export function screenIntakeContent(content: IntakeContent): SpamReason | null {
  if (content.names.some((n) => typeof n === "string" && URL_IN_NAME.test(n))) return "link_in_name";
  if (countLinks(...content.freeText, ...content.names) > MAX_LINKS) return "too_many_links";
  if (looksLikeAdvertising(...content.freeText, ...content.names)) return "advert";
  return null;
}

/**
 * IN-MEMORY, PER PROCESS — it resets on every deploy and is not shared between
 * instances. A persistent per-IP count would need an IP column the intake table
 * does not have (no migration in this change). The PERSISTENT brake is in the
 * database already: `submit_company_need_public_v1` (anon_write_bounds_v1,
 * applied) refuses a fourth intake per contact e-mail in 24 h and more than 30
 * intakes per hour platform-wide with errcode P0004, whoever calls it.
 *
 * The e-mail is keyed by its SHA-256, so the process never holds the address.
 */
export const PUBLIC_INTAKE_RATE = {
  ip: { limit: 3, windowMs: 15 * 60 * 1000 },
  email: { limit: 3, windowMs: 24 * 60 * 60 * 1000 },
} as const;

export function emailRateKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function publicIntakeRateLimited(input: {
  readonly ipKey: string | null;
  readonly email: string | null | undefined;
  readonly nowMs?: number;
}): SpamReason | null {
  if (input.ipKey !== null) {
    const ip = rateLimit({ name: "company-need-public-intake", key: input.ipKey, nowMs: input.nowMs, ...PUBLIC_INTAKE_RATE.ip });
    if (ip.limited) return "rate_ip";
  }
  const email = input.email?.trim();
  if (email) {
    const byEmail = rateLimit({
      name: "company-need-public-intake-email",
      key: emailRateKey(email),
      nowMs: input.nowMs,
      ...PUBLIC_INTAKE_RATE.email,
    });
    if (byEmail.limited) return "rate_email";
  }
  return null;
}

const refusals = new Map<string, number>();

/**
 * Count one refusal and log the surface, the reason and the running count for
 * this process. Never the content, the address, the IP or a name.
 */
export function recordPublicFormRefusal(surface: "company-need" | "request-door", reason: SpamReason): number {
  const key = `${surface}:${reason}`;
  const count = (refusals.get(key) ?? 0) + 1;
  refusals.set(key, count);
  console.info("[public-form-guard] refused", { surface, reason, count });
  return count;
}

/** Test-only. */
export function __resetPublicFormRefusalsForTest(): void {
  refusals.clear();
}
