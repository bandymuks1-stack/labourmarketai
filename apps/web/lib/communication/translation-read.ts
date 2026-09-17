import "server-only";

import { runAiAgent } from "@/lib/ai/run-agent-server";
import { rateLimit } from "@/lib/security/rate-limit";

import { needsTranslation, resolveViewerText, type ViewerText } from "./translation";

/**
 * MULTILINGUAL WORK COMMUNICATION — the READ side (owner P0, 2026-09-17).
 *
 * Renders a conversation in the VIEWER's language without a second message
 * model, a second translation model or a stored translation:
 *
 *   author writes in own language → `conversation_messages.body` +
 *   `original_language` (stamped by the ONE send action) → this resolver
 *   asks the EXISTING AI runtime to translate the body for the viewer's
 *   locale → the viewer reads the translation with the original one tap
 *   away → the viewer replies in their own language → the author reads that
 *   reply the same way.
 *
 * WHAT GUARDS IT. `runAiAgent("translation_copy")` routes the task
 * `translate_message` through `lib/ai/runtime`: the translation provider first when the operator
 * enabled it (the provider's enable flag + its key), the LLM tier otherwise,
 * and ALWAYS through the data-egress gate — a message is SENSITIVE_FREE_TEXT,
 * so no external provider receives it unless `AI_EGRESS_GRANTS` carries an
 * owner grant scoped to `translate_message`. Without the grant the outcome is
 * not a suggestion, the run is audited as blocked in `ai_runs`, and the viewer
 * sees the original with a language badge. Nothing here can fabricate.
 *
 * WHAT BOUNDS IT. Per page load at most `MAX_PER_READ` messages are
 * translated (the newest first — a thread's tail is what a person is reading);
 * per viewer a rate cap holds a chat from becoming a batch API; a small
 * in-process cache keyed by message id + body + target locale means a thread
 * re-opened on the same instance costs nothing. Doctrine §2 keeps the
 * translation OUT of the database: it is a rendering, not a record.
 *
 * AUTHORITY is unchanged: the caller passes messages it already read under
 * the conversation's RLS (participants only); this module reads nothing.
 */

export interface TranslatableMessage {
  readonly id: string;
  readonly body: string;
  readonly original_language?: string | null;
}

const MAX_PER_READ = 40;
const RATE = { limit: 120, windowMs: 60 * 60 * 1000 } as const;
const CACHE_MAX = 2000;
const AI_LOCALES = new Set(["en", "lt", "ru"]);

type Cached = { readonly text: string; readonly provider: string } | null;
const cache = new Map<string, Cached>();

function cacheKey(m: TranslatableMessage, target: string): string {
  // The body is part of the key so an edited message never serves a stale
  // rendering; ids are uuids, so the key stays bounded.
  return `${m.id}:${target}:${m.body.length}:${hash(m.body)}`;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function remember(key: string, value: Cached): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** One message → one runtime call, or the cache. Never throws. */
async function translateOne(
  m: TranslatableMessage,
  viewerLocale: string,
): Promise<Cached> {
  const key = cacheKey(m, viewerLocale);
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const outcome = await runAiAgent(
      "translation_copy",
      {
        canonicalMessage: m.body.slice(0, 8000),
        locale: viewerLocale,
        context: "work message between colleagues",
      },
      {
        locale: AI_LOCALES.has(viewerLocale) ? (viewerLocale as "en" | "lt" | "ru") : "en",
        language: m.original_language ?? undefined,
        // A LABEL for the audit row — never the text, never the people.
        inputSource: "conversation_message",
        maxOutputTokens: 600,
      },
    );
    if (outcome.status !== "suggestion") {
      // Blocked by the egress gate, disabled, or sent for review: the
      // original stands. Not cached — a grant can arrive at any time.
      return null;
    }
    const text = (outcome.value as { data?: { localized_copy?: unknown } }).data?.localized_copy;
    const value: Cached =
      typeof text === "string" && text.trim().length > 0
        ? { text: text.trim(), provider: outcome.provider }
        : null;
    if (value) remember(key, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * The whole thread for one viewer. Returns one `ViewerText` per message, in
 * the input order; messages already in the viewer's language, and anything
 * beyond the bounds above, come back as the original.
 */
export async function resolveViewerTexts(
  messages: readonly TranslatableMessage[],
  viewerLocale: string,
  viewerId: string,
): Promise<ReadonlyMap<string, ViewerText>> {
  const out = new Map<string, ViewerText>();
  const original = (m: TranslatableMessage, translation: Cached = null) =>
    resolveViewerText({
      body: m.body,
      originalLanguage: m.original_language ?? null,
      viewerLocale,
      translation,
    });

  const candidates = messages.filter((m) =>
    needsTranslation({ body: m.body, originalLanguage: m.original_language ?? null, viewerLocale }),
  );
  // Newest first: the tail of the thread is what the reader is looking at.
  const chosen = candidates.slice(-MAX_PER_READ);
  const chosenIds = new Set(chosen.map((m) => m.id));

  for (const m of messages) {
    if (!chosenIds.has(m.id)) out.set(m.id, original(m));
  }

  // Cached renderings cost nothing and are not rate-limited.
  const uncached: TranslatableMessage[] = [];
  for (const m of chosen) {
    const key = cacheKey(m, viewerLocale);
    if (cache.has(key)) out.set(m.id, original(m, cache.get(key) ?? null));
    else uncached.push(m);
  }
  if (uncached.length === 0) return out;

  const limited = rateLimit({ name: "message_translation", key: viewerId, ...RATE });
  if (limited.limited) {
    for (const m of uncached) out.set(m.id, original(m));
    return out;
  }

  // A few at a time: a thread of forty foreign messages must not open forty
  // vendor calls at once.
  const CONCURRENCY = 4;
  for (let i = 0; i < uncached.length; i += CONCURRENCY) {
    const batch = uncached.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((m) => translateOne(m, viewerLocale)));
    batch.forEach((m, j) => out.set(m.id, original(m, results[j])));
    // The gate said no once; it will say no to the rest of this read too.
    if (results.every((r) => r === null)) {
      for (const m of uncached.slice(i + CONCURRENCY)) out.set(m.id, original(m));
      break;
    }
  }
  return out;
}

/** Test seam: forget every cached rendering. */
export function __clearTranslationCache(): void {
  cache.clear();
}
