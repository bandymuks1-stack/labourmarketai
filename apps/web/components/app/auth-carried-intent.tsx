"use client";

import { useTranslations } from "next-intl";

import { sentenceFromReturnPath } from "@/lib/marketing/public-entry";

/**
 * WHAT YOU ASKED FOR IS STILL HERE (owner window 11 §21).
 *
 * The landing already carries the visitor's own sentence through
 * authentication — `?next=/dashboard?say=<sentence>`, resolved after login by
 * the existing return-path mechanism. The owner's production walk found the
 * gap on the other side of that: the login screen showed a headline, a Google
 * button and two fields, and said nothing at all about the request that had
 * brought them there. The sentence survived; the person's knowledge that it
 * survived did not, and a request you cannot see is a request you assume is
 * gone.
 *
 * This renders that one line, from the query value the page ALREADY received.
 * No storage, no second channel, no new parameter — and nothing at all when
 * the door was opened without a sentence, which is most of the time.
 *
 * The sentence is the visitor's own text, rendered as text inside a <p>. It
 * is length-capped by `normaliseEntrySentence` and never interpolated into
 * markup, a URL or a request.
 */
export function AuthCarriedIntent({ next }: { next: string | null }) {
  const t = useTranslations("auth.carriedIntent");
  const sentence = sentenceFromReturnPath(next);
  if (!sentence) return null;
  return (
    <div
      data-testid="auth-carried-intent"
      className="rounded-md border border-brand-blue/35 bg-ink-900/60 px-3 py-2.5"
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("label")}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-text-primary">
        &bdquo;{sentence}&ldquo;
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        {t("hint")}
      </p>
    </div>
  );
}
