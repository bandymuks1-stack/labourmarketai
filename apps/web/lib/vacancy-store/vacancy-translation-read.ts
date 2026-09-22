import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { runAiAgent } from "@/lib/ai/run-agent-server";
import { rateLimit } from "@/lib/security/rate-limit";

import type { StoredPublicVacancyV1, VacancyLocaleTranslationV1 } from "./vacancy-read";
import { redactContactData, restoreRedactions } from "./vacancy-redaction";
import {
  recordTranslationConsumed,
  translationAllowance,
  type TranslationAllowanceV1,
} from "./vacancy-translation-entitlement";

/**
 * FOREIGN-LANGUAGE VACANCIES — the read side.
 *
 * OWNER DECISION 2026-09-22 (VACANCY TRANSLATION POLICY) REPLACED THE RULE
 * THIS MODULE USED TO IMPLEMENT. The previous version translated the board
 * AUTOMATICALLY: every signed-in reader's render sent up to twenty foreign
 * titles to a provider. The owner has retired that assumption — "Do not
 * silently send every vacancy through an external translation provider",
 * and explicitly: do NOT automatically translate the ~103k external
 * advertisement bodies.
 *
 * So there are now TWO paths, and only one of them can cost anything:
 *
 *   READ (free, automatic, anonymous-safe) — {@link storedVacancyTitles}.
 *   Returns renderings that ALREADY exist beside the original. No vendor,
 *   no entitlement, no rate limit, no viewer identity. This is what the
 *   board uses, so a reader still benefits from every rendering anyone has
 *   already paid for, and a crawler can never cause a call.
 *
 *   TRANSLATE (explicit, metered) — {@link translateVacancyOnDemand}. Runs
 *   ONLY when a person has actively asked for THIS advertisement in THEIR
 *   language ("Versti į lietuvių kalbą"). Entitlement-gated, charged only
 *   on a usable result, never charged twice for the same unchanged ad.
 *
 * WHAT NEVER CHANGES, from the previous contract:
 *
 *   ORIGINAL = FACT. `title_raw` / `description_raw` / `source_language` are
 *   the publisher's words with provenance. Nothing here writes to them.
 *
 *   TRANSLATION = DERIVED. A rendering for ONE target locale, stored BESIDE
 *   the original in `public_vacancies.translations[<locale>]` with its
 *   source hash, provider, model and time (migration 20260922150000), so an
 *   ad is translated ONCE per locale and a re-imported revision (new
 *   `content_hash`) makes the rendering stale, which the reader treats as
 *   absent rather than passing it off as current.
 *
 *   THE EGRESS GATE IS UNTOUCHED. `runAiAgent("vacancy_translation")` routes
 *   `translate_vacancy` through `lib/ai/runtime`, where the task is classed
 *   `SENSITIVE_FREE_TEXT`. The owner refused to reclassify it as PUBLIC —
 *   "public source content does not automatically authorize unrestricted
 *   third-party AI transmission" — so an external provider receives it ONLY
 *   under a grant in `AI_EGRESS_GRANTS` naming this task. No such grant
 *   exists today: every run is refused, audited as blocked, nothing is
 *   charged, and the reader keeps the publisher's own words with the
 *   advertisement's language named. That is the honest failure the owner
 *   asked for, and this module owns no provider, no key and no decision
 *   about either.
 *
 *   WHAT TRAVELS, if a grant ever exists. Four fields (title, description,
 *   two locale codes), and the text is REDACTED first: e-mail addresses,
 *   phone numbers and URLs become opaque tokens (`vacancy-redaction.ts`)
 *   and are restored from the PUBLISHER'S OWN characters afterwards, so
 *   contact data never leaves while the reader still sees it. A rendering
 *   that lost or invented a token is refused rather than shown.
 *
 *   WHAT IS CHECKED BEFORE A RENDERING IS ACCEPTED. A non-empty title that
 *   actually differs from the input; every digit run of the original present
 *   in the rendering (numbers, pay, dates and headcounts are contractual
 *   facts and a rendering that loses one is refused, never shown); every
 *   redaction token restored. A refused rendering is recorded as
 *   `needs_review` so the next reader does not pay for it again, the
 *   original stands, and NOTHING is charged.
 *
 * Doctrine §2 for USER content ("no translation columns") does not apply:
 * this is a public advertisement the platform mirrors, and the vacancy row
 * has carried a translation stage since its first migration.
 */

/** Per viewer, explicit translation requests per hour. A second bound under
 *  the entitlement: the allowance limits how MANY ads a person may have
 *  rendered, this limits how FAST, so a scripted client cannot burn a whole
 *  allowance (or a provider's rate budget) in one second. */
const RATE = { limit: 20, windowMs: 60 * 60 * 1000 } as const;

const AI_LOCALES = new Set(["en", "lt", "ru"]);

/** A stored rendering that is still valid for this row and locale. */
export function storedTranslationFor(
  v: Pick<StoredPublicVacancyV1, "translations" | "contentHash">,
  locale: string,
): VacancyLocaleTranslationV1 | null {
  const entry = v.translations[locale];
  if (!entry || entry.sourceHash !== v.contentHash) return null;
  return entry;
}

/** Whether a rendering is meaningful at all: the ad is not already in the
 *  reader's language. An ad with an unknown source language is left as it is
 *  (guessing a language is how a Norwegian ad gets "translated from Swedish"). */
export function needsVacancyTranslation(
  v: Pick<StoredPublicVacancyV1, "sourceLanguage">,
  locale: string,
): boolean {
  const source = v.sourceLanguage.toLowerCase().slice(0, 2);
  return source.length === 2 && source !== locale.toLowerCase().slice(0, 2);
}

/** Every run of digits in the original must survive the rendering — pay,
 *  dates, headcounts and hours are contractual facts. Order-insensitive so a
 *  reordered clause still passes; a LOST or CHANGED number does not. */
export function digitsPreserved(original: string, rendered: string): boolean {
  // A figure may be grouped with a space, a dot or a comma ("35 000",
  // "1.234,50", "1 234.50"); the comparison is on the digits themselves.
  const runs = (s: string) => (s.match(/\d+(?:[ .,]\d+)*/g) ?? []).map((r) => r.replace(/[ .,]/g, ""));
  const want = runs(original);
  if (want.length === 0) return true;
  const have = new Map<string, number>();
  for (const r of runs(rendered)) have.set(r, (have.get(r) ?? 0) + 1);
  for (const r of want) {
    const n = have.get(r) ?? 0;
    if (n === 0) return false;
    have.set(r, n - 1);
  }
  return true;
}

/**
 * THE FREE PATH. Renderings that already exist, for the ads on this screen.
 *
 * Pure read of what is stored. No viewer, no entitlement, no vendor and no
 * rate limit — nothing here can cost money or leave the building, which is
 * why the board may call it for anonymous readers and crawlers alike.
 *
 * Returns a map store id → rendering for ads whose stored rendering is
 * CURRENT (source hash matches) and `available`. Everything else is absent
 * and the caller renders the publisher's original, named as the original.
 */
export function storedVacancyTitles(
  vacancies: readonly StoredPublicVacancyV1[],
  viewerLocale: string,
): ReadonlyMap<string, VacancyLocaleTranslationV1> {
  const out = new Map<string, VacancyLocaleTranslationV1>();
  for (const v of vacancies) {
    if (!v.storeId || !needsVacancyTranslation(v, viewerLocale)) continue;
    const stored = storedTranslationFor(v, viewerLocale);
    if (stored && stored.status === "available" && stored.title) out.set(v.storeId, stored);
  }
  return out;
}

type Item = { readonly id: string; readonly title: string | null; readonly description: string | null };

/** One runtime call. Never throws; a refused/blocked run yields null and
 *  nothing is persisted or charged (a provider can arrive later). */
async function translateOne(
  item: { id: string; title: string; description?: string },
  sourceLocale: string,
  targetLocale: string,
): Promise<{ readonly item: Item; readonly provider: string; readonly model: string } | null> {
  try {
    const outcome = await runAiAgent(
      "vacancy_translation",
      { sourceLocale, targetLocale, items: [item] },
      {
        locale: AI_LOCALES.has(targetLocale) ? (targetLocale as "en" | "lt" | "ru") : "en",
        language: sourceLocale,
        // A LABEL for the audit row — never the text.
        inputSource: "public_vacancy",
        maxOutputTokens: item.description ? 6000 : 1500,
      },
    );
    if (outcome.status !== "suggestion") return null;
    const data = (outcome.value as { data?: { items?: unknown } }).data;
    const raw = Array.isArray(data?.items) ? (data!.items as unknown[]) : [];
    const first = raw.find(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === "object" && (r as Record<string, unknown>).id === item.id,
    );
    if (!first) return null;
    return {
      item: {
        id: item.id,
        title:
          typeof first.title === "string" && first.title.trim() ? first.title.trim() : null,
        description:
          typeof first.description === "string" && first.description.trim()
            ? first.description.trim()
            : null,
      },
      provider: outcome.provider,
      model: outcome.model,
    };
  } catch {
    return null;
  }
}

/** Persist a rendering BESIDE the original. Service role, because the
 *  authenticated grant is SELECT-only by design (ingestion is a trusted
 *  server job, and so is this). Best-effort: a failed write costs one more
 *  vendor call on a later request, never a wrong screen. */
async function persist(
  storeId: string,
  locale: string,
  entry: VacancyLocaleTranslationV1,
): Promise<void> {
  try {
    const admin = createAdminClient();
    // `translations || {locale: entry}` — one locale replaced, the rest kept.
    // Fetch-merge-write is the only shape PostgREST offers without an RPC,
    // and a lost race between two locales costs one re-translation, not a
    // wrong screen.
    const { data } = await admin
      .from("public_vacancies")
      .select("translations")
      .eq("id", storeId)
      .maybeSingle();
    const current =
      data && typeof data.translations === "object" && data.translations && !Array.isArray(data.translations)
        ? (data.translations as Record<string, unknown>)
        : {};
    await admin
      .from("public_vacancies")
      .update({ translations: { ...current, [locale]: entry } as Json })
      .eq("id", storeId);
  } catch {
    // Best-effort by design (see above).
  }
}

/**
 * The outcome of an explicit translation request. Every branch keeps the
 * advertisement readable — the original never goes away, so the worst case
 * is a person who reads the publisher's own words with the language named.
 */
export type TranslateOnDemandResultV1 =
  /** A rendering the reader can read. `charged` says whether this request
   *  spent allowance (false for a cache hit — rule 2). */
  | {
      readonly kind: "ready";
      readonly translation: VacancyLocaleTranslationV1;
      readonly charged: boolean;
      readonly allowance: TranslationAllowanceV1 | null;
    }
  /** The ad is already in the reader's language, or has no known language. */
  | { readonly kind: "not_needed" }
  /** The allowance is spent. The ad stays readable; the surface explains. */
  | { readonly kind: "over_allowance"; readonly allowance: TranslationAllowanceV1 }
  /**
   * No usable rendering, and NOTHING was charged.
   *   `no_provider` — refused by the egress gate or no provider configured.
   *                   This is today's production state, and it is honest.
   *   `refused`     — a rendering came back but failed the digit/redaction
   *                   checks, or was refused earlier and recorded as such.
   *   `rate_limited`— too many requests from this person this hour.
   */
  | {
      readonly kind: "unavailable";
      readonly reason: "no_provider" | "refused" | "rate_limited";
      readonly allowance: TranslationAllowanceV1 | null;
    };

/**
 * THE METERED PATH. ONE advertisement, because ONE person asked for it.
 *
 * Order matters and is deliberate:
 *   1. is a rendering even meaningful?      → `not_needed`, nothing spent
 *   2. does one already exist?              → `ready`, NOT charged (rule 2)
 *   3. was one already refused for this ad? → `unavailable`, not charged
 *   4. does the reader have allowance?      → `over_allowance`, nothing sent
 *   5. rate limit                           → `unavailable`, nothing sent
 *   6. run, then CHECK the rendering        → refused ⇒ not charged
 *   7. accepted ⇒ persist beside the original, THEN record consumption
 *
 * Steps 2–5 all return before any text leaves the building, so an exhausted
 * or rate-limited reader never causes an egress attempt at all.
 */
export async function translateVacancyOnDemand(
  v: StoredPublicVacancyV1,
  viewerLocale: string,
): Promise<TranslateOnDemandResultV1> {
  if (!v.storeId || !needsVacancyTranslation(v, viewerLocale)) return { kind: "not_needed" };

  // 2. Already rendered for this locale at this exact source text: free.
  const stored = storedTranslationFor(v, viewerLocale);
  if (stored?.status === "available" && stored.title) {
    // A stored title with no description is still a partial answer for a
    // board card, but a person who opened the ad asked for the BODY. Only
    // treat it as complete when the ad has no body to render.
    const bodyNeeded = v.descriptionRaw.trim().length > 0;
    if (!bodyNeeded || stored.description) {
      return { kind: "ready", translation: stored, charged: false, allowance: null };
    }
  }
  // 3. Refused before — do not pay to be refused again.
  if (stored && stored.status !== "available") {
    return { kind: "unavailable", reason: "refused", allowance: null };
  }

  // 4. THE ENTITLEMENT, and with it the reader's identity — resolved from
  // the SESSION inside the gate, never passed in. A signed-out reader is
  // `allowed: false` with no profile, so the branch below covers both "not
  // signed in" and "nothing left" without this module ever handling an id
  // it did not verify.
  const allowance = await translationAllowance();
  if (!allowance.allowed || !allowance.profileId) {
    return { kind: "over_allowance", allowance };
  }
  const profileId = allowance.profileId;

  // 5. Pace, so an allowance cannot be drained in one burst.
  if (rateLimit({ name: "vacancy_translation", key: profileId, ...RATE }).limited) {
    return { kind: "unavailable", reason: "rate_limited", allowance };
  }

  const sourceLocale = v.sourceLanguage.toLowerCase().slice(0, 2);
  // MINIMISATION: contact data is replaced by opaque tokens before the call
  // and restored from the publisher's own characters after it. The checks
  // below therefore run against the REDACTED source — the same text the
  // provider saw — so a phone number's digits cannot make the digit check
  // pass or fail by accident.
  const title = redactContactData(v.titleRaw);
  const description = redactContactData(v.descriptionRaw.slice(0, 12_000));
  const result = await translateOne(
    { id: "v0", title: title.text, ...(description.text ? { description: description.text } : {}) },
    sourceLocale,
    viewerLocale,
  );
  // 6a. Refused by the egress gate / no provider / vendor failure. This is
  // production today. Nothing is stored (a grant can arrive later) and
  // nothing is charged.
  if (!result) return { kind: "unavailable", reason: "no_provider", allowance };

  const item = result.item;
  const restoredTitle = item.title === null ? null : restoreRedactions(item.title, title.tokens);
  const restoredDescription =
    item.description === null ? null : restoreRedactions(item.description, description.tokens);
  const titleOk =
    item.title !== null &&
    item.title !== title.text &&
    digitsPreserved(title.text, item.title) &&
    restoredTitle?.ok === true;
  const bodyNeeded = description.text.trim().length > 0;
  const descriptionOk =
    !bodyNeeded ||
    (item.description !== null &&
      item.description !== description.text &&
      digitsPreserved(description.text, item.description) &&
      restoredDescription?.ok === true);

  const accepted = titleOk && descriptionOk;
  const entry: VacancyLocaleTranslationV1 = {
    status: accepted ? "available" : "needs_review",
    title: accepted && restoredTitle?.ok ? restoredTitle.text : null,
    description:
      accepted && bodyNeeded && restoredDescription?.ok ? restoredDescription.text : null,
    sourceLanguage: sourceLocale,
    sourceHash: v.contentHash,
    provider: result.provider,
    model: result.model,
    generatedAt: new Date().toISOString(),
  };
  // Stored either way: an accepted rendering so nobody pays for it twice, a
  // refused one so nobody pays to be refused twice. Awaited, not
  // fire-and-forget: a serverless request may be frozen the moment the
  // response is sent, and an unawaited write would then be lost.
  await persist(v.storeId, viewerLocale, entry);

  // 6b. A rendering came back but failed the honesty checks. The vendor was
  // engaged (its cost is on the money ledger, which is a separate fact) but
  // the READER got nothing usable, so the allowance is NOT spent — owner
  // rule: "failed/refused translation must not consume allowance".
  if (!accepted) return { kind: "unavailable", reason: "refused", allowance };

  // 7. Usable. Now — and only now — the allowance is spent.
  await recordTranslationConsumed({
    profileId,
    storeId: v.storeId,
    targetLocale: viewerLocale,
    sourceHash: v.contentHash,
    sourceLanguage: sourceLocale,
    planKey: allowance.planKey,
    provider: result.provider,
  });
  return {
    kind: "ready",
    translation: entry,
    charged: true,
    allowance: {
      ...allowance,
      used: allowance.used + 1,
      remaining: allowance.remaining === null ? null : Math.max(0, allowance.remaining - 1),
    },
  };
}
