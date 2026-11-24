/**
 * Viewer-language resolution for user-authored messages.
 *
 * Doctrine §2: author content is stored as ORIGINAL text + ORIGINAL language;
 * translations happen on READ and are never stored. The pure resolver below
 * (`resolveViewerText`) NEVER fabricates a translation: without a translation
 * the viewer sees the ORIGINAL text, with a language badge when the message's
 * language is known and differs from the viewer's locale.
 *
 * MULTILINGUAL WORK COMMUNICATION (owner P0, 2026-09-17): the contract is
 * "each participant writes in their own language → the original is preserved
 * → every authorized recipient reads it in their preferred language". The
 * server resolver (`resolveViewerTexts`, in `translation-read.ts`) obtains a
 * translation ONLY through the existing AI runtime (`runAiAgent` →
 * `translation_copy` → task `translate_message`), which enforces the data
 * egress gate: a message is SENSITIVE_FREE_TEXT and leaves the platform only
 * under an owner-recorded grant in `lib/ai/runtime/data-egress.ts`. Without
 * that grant the runtime refuses, the run is audited as blocked, and the
 * viewer keeps the original — exactly today's behaviour. So this module can
 * only ever show a translation that a provider actually produced, never an
 * echo (`translated` requires text that differs from the original), and the
 * original is always carried beside it for the reader to open.
 */

/**
 * The explicit rendering states (owner contract §7 — translation failure
 * semantics). Every message is in exactly one:
 *   same_language     — written in the viewer's language; nothing to translate
 *   translated        — a provider produced a rendering; the original is beside it
 *   original_foreign  — written in another language and shown AS the original,
 *                       because no rendering is available (see `unavailable`)
 *   unknown_language  — the author's language was never recorded (legacy rows,
 *                       an unsupported code): shown as written, no badge, no
 *                       translation attempted — UNKNOWN is not "same language"
 */
export type ViewerTextState =
  | "same_language"
  | "translated"
  | "original_foreign"
  | "unknown_language";

/** WHY a foreign message is shown as its original. Never a fabricated reason:
 *  'declined' = the egress gate / runtime did not allow the call,
 *  'failed' = the provider errored or returned nothing usable,
 *  'rate_limited' = this viewer's translation budget for the hour is spent,
 *  'not_attempted' = beyond the per-read bound (older messages in a long thread). */
export type TranslationUnavailableReason =
  | "declined"
  | "failed"
  | "rate_limited"
  | "not_attempted";

export interface ViewerText {
  /** What to render first: the translation when one exists, else the original. */
  readonly text: string;
  /** 'original' — no translation exists; 'translated' — a provider produced one. */
  readonly kind: "original" | "translated";
  /** The explicit state (see ViewerTextState) — `kind` is its two-way summary. */
  readonly state: ViewerTextState;
  /** Set only for `original_foreign`: why no rendering is shown. */
  readonly unavailable: TranslationUnavailableReason | null;
  /** The author's language, shown as a badge when known and ≠ viewer locale. */
  readonly languageBadge: string | null;
  /** The author's words, unchanged — always present when `kind` is 'translated'. */
  readonly original: string;
  /** Which provider produced the translation (audit label), null for 'original'. */
  readonly provider: string | null;
}

export function resolveViewerText(args: {
  body: string;
  originalLanguage: string | null;
  viewerLocale: string;
  /** A translation the runtime produced for THIS viewer locale, or null. */
  translation?: { text: string; provider: string } | null;
  /** Why the runtime produced nothing (only read when `translation` is null). */
  unavailable?: TranslationUnavailableReason | null;
}): ViewerText {
  const lang = args.originalLanguage?.trim().toLowerCase() || null;
  const badge = lang && lang !== args.viewerLocale.toLowerCase() ? lang : null;
  const t = args.translation?.text.trim() ?? "";
  // A translation that is empty or merely echoes the original is not a
  // translation — the original stands, honestly.
  if (args.translation && t.length > 0 && t !== args.body.trim() && badge !== null) {
    return {
      text: t,
      kind: "translated",
      state: "translated",
      unavailable: null,
      languageBadge: badge,
      original: args.body,
      provider: args.translation.provider,
    };
  }
  const state: ViewerTextState =
    lang === null ? "unknown_language" : badge === null ? "same_language" : "original_foreign";
  return {
    text: args.body,
    kind: "original",
    state,
    // An echo or an empty answer from the provider is a failure to translate,
    // not a translation — say so rather than pretending nothing was tried.
    unavailable:
      state !== "original_foreign"
        ? null
        : args.translation
          ? "failed"
          : (args.unavailable ?? "not_attempted"),
    languageBadge: badge,
    original: args.body,
    provider: null,
  };
}

/** Whether a message needs translating for this viewer at all: the author's
 *  language is known, differs from the viewer's, and the body is non-empty. */
export function needsTranslation(args: {
  body: string;
  originalLanguage: string | null;
  viewerLocale: string;
}): boolean {
  const lang = args.originalLanguage?.trim().toLowerCase() || null;
  return (
    lang !== null &&
    lang !== args.viewerLocale.trim().toLowerCase() &&
    args.body.trim().length > 0
  );
}
