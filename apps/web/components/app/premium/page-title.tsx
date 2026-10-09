import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Accented } from "./grammar";

/**
 * THE PAGE TITLE — the h1 of every signed-in route, in the premium grammar's
 * rhythm (display face, tight tracking, ONE accent word). It replaces seven
 * hand-copied h1 class strings that had drifted across text-2xl, text-3xl and
 * text-title.
 *
 * The accent is applied to the LAST word of a multi-word, translated title, so
 * no locale needs new copy and no title is ever altered — only styled. A
 * one-word title stays plain: an accent on the only word is decoration.
 * Non-string children (a title with markup) are rendered untouched.
 */
export function PageTitle({
  children,
  className,
  plain,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** A name, not a sentence (person, project, organization): never accented. */
  readonly plain?: boolean;
}) {
  return (
    <h1
      className={cn(
        "font-display text-[clamp(1.75rem,3.4vw,2.35rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-text-primary",
        className,
      )}
    >
      {typeof children === "string" && !plain ? <Accented text={accentLastWord(children)} /> : children}
    </h1>
  );
}

/** "My projects" -> "My *projects*". Exported for the unit test. */
export function accentLastWord(title: string): string {
  const clean = title.replace(/\*/g, "");
  const trimmed = clean.trim();
  const i = trimmed.lastIndexOf(" ");
  if (i <= 0) return clean;
  return `${trimmed.slice(0, i)} *${trimmed.slice(i + 1)}*`;
}
