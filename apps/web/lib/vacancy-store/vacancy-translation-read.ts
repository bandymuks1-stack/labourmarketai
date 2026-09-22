import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { runAiAgent } from "@/lib/ai/run-agent-server";
import { VACANCY_TRANSLATION_MAX_ITEMS } from "@/lib/ai/registry/agents/vacancy-translation";
import { rateLimit } from "@/lib/security/rate-limit";

import type { StoredPublicVacancyV1, VacancyLocaleTranslationV1 } from "./vacancy-read";

/**
 * FOREIGN-LANGUAGE VACANCIES IN THE READER'S LOCALE — the read side
 * (owner P0, 2026-09-22 §9).
 *
 * The contract, restated where it is enforced:
 *
 *   ORIGINAL = FACT. `title_raw` / `description_raw` / `source_language` are
 *   the publisher's words with provenance. Nothing here writes to them.
 *
 *   TRANSLATION = DERIVED. A rendering for ONE target locale, stored BESIDE
 *   the original in `public_vacancies.translations[<locale>]` with its
 *   source hash, provider, model and time (migration 20260922150000), so an
 *   ad is translated ONCE per locale — never again per page view, never for
 *   a crawler — and a re-imported revision (new `content_hash`) makes the
 *   rendering stale, which the reader treats as absent.
 *
 * WHO TRIGGERS A RENDERING. A signed-in person looking at a bounded set of
 * ads: the board's ≤20 titles (ONE batched runtime call), or the body of
 * the ONE ad they opened. Anonymous readers get whatever is already stored
 * and never cause a vendor call — the public `/jobs/[id]` page is crawlable,
 * and a crawler must not be able to run up a translation bill.
 *
 * WHAT GUARDS IT. `runAiAgent("vacancy_translation")` routes the task
 * `translate_vacancy` through `lib/ai/runtime`: the free-first provider
 * chain, the cost ceiling, the audit row in `ai_runs`. The task is classed
 * `PUBLIC` (the argument is the field list in `TASK_POLICIES` — the text is
 * a public advertisement, and the payload carries no employer identity, no
 * URL, no coordinates, no LabourMarket person), so it needs no egress grant.
 *
 * WHAT IS CHECKED BEFORE A RENDERING IS ACCEPTED. Same id set back; a
 * non-empty title; every digit run of the original present in the rendering
 * (numbers, pay, dates and headcounts are contractual facts and a rendering
 * that loses one is refused, never shown). A refused item is recorded as
 * `needs_review` so the next read does not pay for it again, and the
 * original stands.
 *
 * Doctrine §2 for USER content ("no translation columns") does not apply:
 * this is a public advertisement the platform mirrors, and the vacancy row
 * has carried a translation stage since its first migration.
 */

/** Titles per board render: the board caps at 20 external cards. */
const MAX_TITLES_PER_READ = VACANCY_TRANSLATION_MAX_ITEMS;
/** Per viewer, batched title calls + single description calls per hour. */
const RATE = { limit: 60, windowMs: 60 * 60 * 1000 } as const;
/** In-process memory of what this instance already resolved (either way),
 *  keyed by store id + locale + content hash. Bounded. */
const CACHE_MAX = 5000;
const cache = new Map<string, VacancyLocaleTranslationV1 | null>();

const AI_LOCALES = new Set(["en", "lt", "ru"]);

function remember(key: string, value: VacancyLocaleTranslationV1 | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function cacheKey(v: StoredPublicVacancyV1, locale: string): string {
  return `${v.storeId}:${locale}:${v.contentHash}`;
}

/** A stored rendering that is still valid for this row and locale. */
export function storedTranslationFor(
  v: Pick<StoredPublicVacancyV1, "translations" | "contentHash">,
  locale: string,
): VacancyLocaleTranslationV1 | null {
  const entry = v.translations[locale];
  if (!entry || entry.sourceHash !== v.contentHash) return null;
  return entry;
}

/** Whether a rendering is needed at all: the ad is not already in the
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

type Item = { readonly id: string; readonly title: string | null; readonly description: string | null };

/** One batched runtime call. Never throws; a refused/blocked run yields no
 *  items and nothing is persisted (a provider can arrive later). */
async function translateBatch(
  items: readonly { id: string; title: string; description?: string }[],
  sourceLocale: string,
  targetLocale: string,
): Promise<{ readonly items: readonly Item[]; readonly provider: string; readonly model: string } | null> {
  try {
    const outcome = await runAiAgent(
      "vacancy_translation",
      { sourceLocale, targetLocale, items },
      {
        locale: AI_LOCALES.has(targetLocale) ? (targetLocale as "en" | "lt" | "ru") : "en",
        language: sourceLocale,
        // A LABEL for the audit row — never the text.
        inputSource: "public_vacancy",
        maxOutputTokens: items.some((i) => i.description) ? 6000 : 1500,
      },
    );
    if (outcome.status !== "suggestion") return null;
    const data = (outcome.value as { data?: { items?: unknown } }).data;
    const raw = Array.isArray(data?.items) ? (data!.items as unknown[]) : [];
    const out: Item[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const e = r as Record<string, unknown>;
      if (typeof e.id !== "string") continue;
      out.push({
        id: e.id,
        title: typeof e.title === "string" && e.title.trim() ? e.title.trim() : null,
        description:
          typeof e.description === "string" && e.description.trim() ? e.description.trim() : null,
      });
    }
    return { items: out, provider: outcome.provider, model: outcome.model };
  } catch {
    return null;
  }
}

/** Persist a rendering BESIDE the original. Service role, because the
 *  authenticated grant is SELECT-only by design (ingestion is a trusted
 *  server job, and so is this). Best-effort: a failed write costs one more
 *  vendor call on the next instance, never a wrong screen. */
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
 * The board's titles, for one signed-in reader. Returns a map store id →
 * rendering (only for ads that needed and got one). Ads already stored,
 * already in the reader's language, beyond the bound, rate-limited or
 * refused come back absent — the caller renders the original for those.
 */
export async function resolveVacancyTitles(
  vacancies: readonly StoredPublicVacancyV1[],
  viewerLocale: string,
  viewerId: string,
): Promise<ReadonlyMap<string, VacancyLocaleTranslationV1>> {
  const out = new Map<string, VacancyLocaleTranslationV1>();
  const pending: StoredPublicVacancyV1[] = [];

  for (const v of vacancies) {
    if (!v.storeId || !needsVacancyTranslation(v, viewerLocale)) continue;
    const stored = storedTranslationFor(v, viewerLocale);
    if (stored) {
      if (stored.status === "available" && stored.title) out.set(v.storeId, stored);
      continue; // stored (even as needs_review/failed) = never asked again
    }
    const key = cacheKey(v, viewerLocale);
    if (cache.has(key)) {
      const c = cache.get(key);
      if (c && c.status === "available" && c.title) out.set(v.storeId, c);
      continue;
    }
    pending.push(v);
  }
  if (pending.length === 0) return out;

  // One batch per render, per source language (a batch names ONE source).
  const limited = rateLimit({ name: "vacancy_translation", key: viewerId, ...RATE });
  if (limited.limited) return out;

  const bySource = new Map<string, StoredPublicVacancyV1[]>();
  for (const v of pending.slice(0, MAX_TITLES_PER_READ)) {
    const src = v.sourceLanguage.toLowerCase().slice(0, 2);
    bySource.set(src, [...(bySource.get(src) ?? []), v]);
  }

  const writes: Promise<void>[] = [];
  for (const [sourceLocale, group] of bySource) {
    const byId = new Map(group.map((v, i) => [`v${i}`, v] as const));
    const result = await translateBatch(
      [...byId].map(([id, v]) => ({ id, title: v.titleRaw })),
      sourceLocale,
      viewerLocale,
    );
    if (!result) continue; // refused / disabled: not cached, a provider can arrive
    const generatedAt = new Date().toISOString();
    const returned = new Map(result.items.map((i) => [i.id, i] as const));
    for (const [id, v] of byId) {
      const item = returned.get(id);
      const ok =
        item?.title !== null &&
        item?.title !== undefined &&
        item.title !== v.titleRaw &&
        digitsPreserved(v.titleRaw, item.title);
      const entry: VacancyLocaleTranslationV1 = {
        status: ok ? "available" : "needs_review",
        title: ok ? item!.title : null,
        description: null,
        sourceLanguage: sourceLocale,
        sourceHash: v.contentHash,
        provider: result.provider,
        model: result.model,
        generatedAt,
      };
      remember(cacheKey(v, viewerLocale), entry);
      if (ok) out.set(v.storeId!, entry);
      writes.push(persist(v.storeId!, viewerLocale, entry));
    }
  }
  // Awaited, not fire-and-forget: a serverless request may be frozen the
  // moment the response is sent, and an unawaited write would then be lost.
  await Promise.all(writes);
  return out;
}

/**
 * The body of ONE ad the signed-in reader opened. Returns the full rendering
 * (title + description) or null when the original must stand.
 */
export async function resolveVacancyDescription(
  v: StoredPublicVacancyV1,
  viewerLocale: string,
  viewerId: string,
): Promise<VacancyLocaleTranslationV1 | null> {
  if (!v.storeId || !needsVacancyTranslation(v, viewerLocale)) return null;
  const stored = storedTranslationFor(v, viewerLocale);
  if (stored?.status === "available" && stored.description) return stored;
  if (stored && stored.status !== "available") return null; // refused before
  if (v.descriptionRaw.trim().length === 0) return stored;

  const limited = rateLimit({ name: "vacancy_translation", key: viewerId, ...RATE });
  if (limited.limited) return stored;

  const sourceLocale = v.sourceLanguage.toLowerCase().slice(0, 2);
  const result = await translateBatch(
    [{ id: "v0", title: v.titleRaw, description: v.descriptionRaw.slice(0, 12_000) }],
    sourceLocale,
    viewerLocale,
  );
  const item = result?.items.find((i) => i.id === "v0");
  if (!result || !item) return stored;

  const titleOk =
    item.title !== null && item.title !== v.titleRaw && digitsPreserved(v.titleRaw, item.title);
  const descriptionOk =
    item.description !== null &&
    item.description !== v.descriptionRaw &&
    digitsPreserved(v.descriptionRaw, item.description);
  const entry: VacancyLocaleTranslationV1 = {
    status: titleOk ? "available" : "needs_review",
    title: titleOk ? item.title : (stored?.title ?? null),
    description: titleOk && descriptionOk ? item.description : null,
    sourceLanguage: sourceLocale,
    sourceHash: v.contentHash,
    provider: result.provider,
    model: result.model,
    generatedAt: new Date().toISOString(),
  };
  remember(cacheKey(v, viewerLocale), entry);
  await persist(v.storeId, viewerLocale, entry);
  return entry.status === "available" ? entry : null;
}
