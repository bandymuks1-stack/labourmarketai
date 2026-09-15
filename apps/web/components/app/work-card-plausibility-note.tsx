"use client";

import { useEffect, useState } from "react";

import { Link } from "@/lib/i18n/navigation";
import { Button, pillLinkClassName } from "@/components/ui/Button";

/**
 * One sentence per work-card plausibility check (`deriveWorkCardChecks`),
 * shown beside the value it is about — on the card editor and on the CV
 * screen (never on the printout). Non-blocking by construction: the only
 * write this component can cause is the person opening the editor and
 * saving a corrected value themselves.
 *
 * "Keep as is" is the person's confirmation that the figure means what it
 * says. No column records that, so the kept check's fingerprint lives in
 * THIS browser only (localStorage, best-effort) — a per-viewer convenience,
 * not truth: a changed value is a new fingerprint and is asked about again;
 * another device asks once more. Nothing is invented and nothing is stored
 * about the person on the server for it.
 */

const STORAGE_KEY = "lm.work-card-checks.kept";
const KEEP_LIMIT = 50;

export interface WorkCardCheckItem {
  /** From `WorkCardCheck.fingerprint` — the check plus its exact values. */
  fingerprint: string;
  /** Pre-localised sentence (server resolves i18n). */
  text: string;
}

const btnQuiet =
  "inline-flex min-h-11 items-center rounded-full px-3.5 text-support text-text-muted underline-offset-2 hover:text-text-primary hover:underline";

export function WorkCardPlausibilityNote({
  items,
  eyebrow,
  keepLabel,
  correctLabel,
  correctHref,
  onCorrect,
  className,
}: {
  items: WorkCardCheckItem[];
  eyebrow: string;
  keepLabel: string;
  correctLabel: string;
  /** Route to the editor when it lives on another page … */
  correctHref?: string;
  /** … or an inline opener when the editor is right here. Wins over href. */
  onCorrect?: () => void;
  className?: string;
}) {
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setKept(new Set(parsed.filter((x): x is string => typeof x === "string")));
        }
      }
    } catch {
      // storage unavailable — every check is simply shown
    }
    setReady(true);
  }, []);

  const keep = (fingerprint: string) => {
    const next = new Set(kept);
    next.add(fingerprint);
    setKept(next);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...next].slice(-KEEP_LIMIT)),
      );
    } catch {
      // best-effort only
    }
  };

  const visible = items.filter((i) => !kept.has(i.fingerprint));
  if (!ready || visible.length === 0) return null;

  return (
    <aside
      role="note"
      data-testid="work-card-checks"
      className={`flex flex-col gap-3 rounded-card border border-dashed border-brand-orange/60 bg-ink-800 p-3 print:hidden ${className ?? ""}`}
    >
      <span className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {eyebrow}
      </span>
      {visible.map((i) => (
        <div
          key={i.fingerprint}
          className="flex flex-col gap-2"
          data-testid="work-card-check"
        >
          <p className="text-sm leading-relaxed text-text-secondary">{i.text}</p>
          <div className="flex flex-wrap items-center gap-2">
            {onCorrect ? (
              <Button
                type="button"
                variant="pill"
                onClick={onCorrect}
                data-testid="work-card-check-correct"
              >
                {correctLabel}
              </Button>
            ) : correctHref ? (
              <Link
                href={correctHref}
                className={pillLinkClassName}
                data-testid="work-card-check-correct"
              >
                {correctLabel}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => keep(i.fingerprint)}
              className={btnQuiet}
              data-testid="work-card-check-keep"
            >
              {keepLabel}
            </button>
          </div>
        </div>
      ))}
    </aside>
  );
}
