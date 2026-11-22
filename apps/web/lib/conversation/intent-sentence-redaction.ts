/**
 * WHAT AN UNCLEAR SENTENCE MAY CARRY OFF THE PLATFORM (owner decision
 * 2026-11-22, Cloudflare Workers AI for `propose_conversation_intent`).
 *
 * The model's only job is to pick ONE existing intent id for a sentence the
 * deterministic router could not read. It needs the verbs, not the people:
 * so before the sentence leaves, everything that can identify someone or
 * something private is replaced with an opaque token, and the sentence is not
 * sent at all when that cannot be done safely.
 *
 * Replaced with a token (restored only locally, never sent):
 *   - e-mail, URL, phone (the vacancy redactor's patterns, reused);
 *   - any run of 5+ digits (ids, personal codes, account and order numbers);
 *   - UUID-like and long hex ids;
 *   - every capitalised word that is not the first word (names of people,
 *     companies, places — the model never needs them to choose an action).
 *
 * Not sent at all (`null`):
 *   - longer than MAX_SENT_CHARS (a long text is content, not an intent);
 *   - more than MAX_TOKENS tokens (mostly private data);
 *   - fewer than MIN_WORDS real words left after redaction.
 *
 * This is a filter, not a proof that prose holds nothing private, which is why
 * it is paired with a task-scoped, revocable grant and metadata-only audit.
 *
 * Pure. No IO, no server-only, no provider.
 */
import { redactContactData } from "@/lib/vacancy-store/vacancy-redaction";

export const MAX_SENT_CHARS = 160;
const MAX_TOKENS = 3;
const MIN_WORDS = 2;

export interface RedactedSentence {
  /** What may leave the platform. */
  readonly text: string;
  /** token index → the person's own characters; never sent. */
  readonly tokens: readonly string[];
}

const TOKEN_RE = /\[\[(\d+)\]\]/g;

const EXTRA_PATTERNS: readonly RegExp[] = [
  // UUIDs and long hex ids
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\b[0-9a-f]{16,}\b/gi,
  // 5+ digits, optionally grouped (personal codes, account and order numbers)
  /\b\d[\d\s-]{3,}\d\b/g,
];

/** A capitalised word that is not the sentence's first word (Unicode-aware). */
const PROPER_NOUN = /(?<=[\s,;:("„«'-])\p{Lu}[\p{L}\p{M}'’.-]*/gu;

export function redactIntentSentence(input: string): RedactedSentence | null {
  const raw = String(input ?? "").trim();
  if (raw.length === 0 || raw.length > MAX_SENT_CHARS) return null;

  const first = redactContactData(raw);
  const tokens = [...first.tokens];
  const push = (m: string) => {
    tokens.push(m);
    return `[[${tokens.length - 1}]]`;
  };

  let text = first.text;
  for (const re of EXTRA_PATTERNS) {
    text = text.replace(re, (m) => (/^\[\[\d+\]\]$/.test(m) ? m : (m.replace(/\D/g, "").length >= 5 || /[a-f]/i.test(m) ? push(m) : m)));
  }
  text = text.replace(PROPER_NOUN, (m) => push(m));

  if (tokens.length > MAX_TOKENS) return null;
  const words = text
    .replace(TOKEN_RE, " ")
    .split(/\s+/)
    .filter((w) => /\p{L}{2,}/u.test(w));
  if (words.length < MIN_WORDS) return null;

  return { text, tokens };
}

/** Put the person's own characters back into a span the model copied out. */
export function restoreIntentTokens(span: string, tokens: readonly string[]): string {
  return span.replace(TOKEN_RE, (m, i: string) => tokens[Number(i)] ?? m);
}
