"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  entryDoorHref,
  readPublicEntry,
  PUBLIC_ENTRY_MAX_CHARS,
  type EntryDoor,
  type PublicEntryReading,
} from "@/lib/marketing/public-entry";
import type { FirstRunIntent } from "@/lib/onboarding/first-run-intent";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { trackFunnel } from "@/lib/telemetry/task";
import { cn } from "@/lib/utils";

/**
 * THE PUBLIC ENTRY — the first screen understands a real sentence.
 *
 * Frozen design contract 2026-09-05, package P1. The visitor types what they
 * need in their own words; the SAME deterministic router the authenticated
 * conversation dispatches through reads it (read-only, through
 * `lib/marketing/public-entry.ts`); the page says what it understood in
 * ordinary human words and opens the two real doors — create an account or
 * log in — with the sentence carried in `?next=` so it arrives at the
 * conversation root after auth through the existing return-path mechanism.
 *
 * WHAT THIS IS NOT. Not a scripted scenario, not a worked example on the
 * visitor's topic, not a copy of the chat component, not a second intent
 * vocabulary. When the router cannot read the sentence the page asks ONE
 * question with exactly two chips — work / hire, the first-run families
 * onboarding itself asks about — and says so instead of answering a question
 * nobody asked.
 *
 * NUMBERS. The line under the field prints the public counts the page
 * already resolved from the ONE canonical market reader; when that reader
 * could not answer, the line is omitted — never a stale constant.
 *
 * TELEMETRY. One `landing_intent` event per reading, through the anon-insert
 * path: the routed intent id (or "unrecognised" / "chip"), the family and
 * the resolution. The sentence is never recorded.
 */

export type EntrySupply = {
  readonly vacancies: number;
  readonly employers: number;
  readonly refreshedAt: string | null;
};

/** The two chips of the one question. The FIRST-RUN families onboarding
 *  asks about — not a new taxonomy. */
const QUESTION_CHIPS = ["work", "hire"] as const satisfies readonly FirstRunIntent[];

/** The example sentences under the field, keyed for i18n. Each is routed
 *  LIVE through the same router when tapped — nothing here is pre-answered. */
const EXAMPLE_KEYS = [
  "hire",
  "work",
  "internship",
  // Window 6 (2026-09-06, gap G-D1): a professional worker, a service need
  // and a service offer — the same live routing, no pre-answer. Each reading
  // is pinned per locale in lib/marketing/public-entry.test.ts.
  "professional",
  "needService",
  "offerService",
] as const;

export function PublicEntry({ supply }: { readonly supply: EntrySupply | null }) {
  const t = useTranslations("landing.entry");
  const locale = useLocale();
  const inputId = useId();
  const questionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState("");
  const [reading, setReading] = useState<PublicEntryReading | null>(null);
  /** The chip answer to the one question, when the router could not read. */
  const [chosen, setChosen] = useState<FirstRunIntent | null>(null);

  const ask = useCallback((text: string) => {
    const next = readPublicEntry(text);
    setChosen(null);
    if (next.kind === "empty") {
      setReading(null);
      inputRef.current?.focus();
      return;
    }
    setReading(next);
    // Never the sentence: the routed id, the family, the resolution.
    trackFunnel(FUNNEL_EVENTS.landingIntent, {
      surface: "landing_entry",
      step: next.kind === "recognised" ? next.intent : "unrecognised",
      intent: next.kind === "recognised" ? next.family : undefined,
      resolution: "deterministic",
    });
  }, []);

  const choose = useCallback((family: FirstRunIntent) => {
    setChosen(family);
    trackFunnel(FUNNEL_EVENTS.landingIntent, {
      surface: "landing_entry",
      step: "chip",
      intent: family,
    });
  }, []);

  const sentence =
    reading && reading.kind !== "empty" ? reading.sentence : "";
  const family: FirstRunIntent | null =
    reading?.kind === "recognised" ? reading.family : chosen;

  /** What was understood, in the visitor's language: a line for the exact
   *  intent when the catalogue has one, else the line for its family. */
  const understanding: string | null = (() => {
    if (reading?.kind === "recognised") {
      const key = `understood.${reading.intent}`;
      return t.has(key) ? t(key) : t(`family.${reading.family}`);
    }
    if (reading?.kind === "unrecognised" && chosen) return t(`family.${chosen}`);
    return null;
  })();

  const numbers = new Intl.NumberFormat(locale);
  const refreshedAt = supply?.refreshedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(supply.refreshedAt),
      )
    : null;

  /** One of the two real doors. The wrapper hears the anchor's click in the
   *  capture phase (pointer AND keyboard activation both dispatch `click` on
   *  the anchor), so the funnel event fires without the link primitive
   *  growing a telemetry prop. */
  const door = (kind: EntryDoor) => (
    <span
      data-testid={`entry-${kind}`}
      className="inline-flex"
      onClickCapture={() =>
        trackFunnel(FUNNEL_EVENTS.ctaClicked, {
          surface: "landing_entry",
          cta_id: `entry_${kind}`,
          intent: family ?? undefined,
        })
      }
    >
      <AuthCtaLink
        relPath={entryDoorHref(locale, kind, sentence)}
        className={cn(
          buttonLinkClassName(kind === "signup" ? "primary" : "secondary"),
          "gap-1.5 rounded-full",
        )}
      >
        {t(kind)}
        {kind === "signup" ? <ArrowRight className="size-3.5 shrink-0" aria-hidden /> : null}
      </AuthCtaLink>
    </span>
  );

  return (
    <section data-testid="public-entry" aria-label={t("label")} className="max-w-3xl">
      <Card className="flex flex-col gap-4">
        {/* ── The sentence ─────────────────────────────────────────────── */}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <label
            htmlFor={inputId}
            className="font-mono text-meta uppercase tracking-label text-text-muted"
          >
            {t("label")}
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              id={inputId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("placeholder")}
              maxLength={PUBLIC_ENTRY_MAX_CHARS}
              autoComplete="off"
              enterKeyHint="send"
              data-testid="entry-input"
              // `w-0` IS LOAD-BEARING: an <input> without an explicit width
              // carries a ~205px intrinsic min-content that `min-w-0` does not
              // remove, and at 320px that dragged the whole landing past the
              // viewport (measured 2026-08-09; proven by
              // tests/e2e/landing-mobile-overflow.spec.ts). `flex-1` still
              // grows the field to fill the row.
              className="min-h-11 w-0 min-w-0 flex-1 rounded-full border border-ink-500 bg-ink-900/60 px-4 text-basis text-text-primary placeholder:text-text-muted focus:border-brand-blue"
            />
            <button
              type="submit"
              data-testid="entry-submit"
              // Nothing typed = nothing to read: the control says so instead
              // of answering an empty submit. The reading itself is
              // synchronous (the router is pure and local), so there is no
              // pending state to invent.
              disabled={draft.trim().length === 0}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-brand-blue px-4 text-support font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("submit")}
            </button>
          </div>
        </form>

        {/* ── Examples — routed live when tapped, never pre-answered ────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-meta text-text-muted">{t("examplesLabel")}</span>
          {EXAMPLE_KEYS.map((key) => {
            const example = t(`examples.${key}`);
            return (
              <button
                key={key}
                type="button"
                data-testid="entry-example"
                onClick={() => {
                  setDraft(example);
                  ask(example);
                }}
                className="min-h-11 rounded-full border border-ink-500 px-3 text-support font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue"
              >
                {example}
              </button>
            );
          })}
        </div>

        {/* ── What was understood ──────────────────────────────────────── */}
        {understanding ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="entry-understanding"
            data-intent={reading?.kind === "recognised" ? reading.intent : `chip:${chosen}`}
            className="rounded-card border border-brand-blue/35 bg-ink-900/70 p-3.5"
          >
            <p className="font-mono text-meta uppercase tracking-label text-brand-cyan">
              {t("understoodLabel")}
            </p>
            <p className="mt-1 text-meta text-text-muted">&bdquo;{sentence}&ldquo;</p>
            <p className="mt-2 font-display text-card-title font-semibold text-text-primary">
              {understanding}
            </p>
            <p className="mt-3 border-t border-ink-600 pt-2.5 text-basis text-text-secondary">
              {t("nextHint")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {door("signup")}
              {door("login")}
            </div>
          </div>
        ) : null}

        {/* ── The one question, two chips — when the router could not read */}
        {reading?.kind === "unrecognised" && !chosen ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="entry-question"
            className="rounded-card border border-state-amber/40 bg-ink-900/70 p-3.5"
          >
            <p id={questionId} className="text-basis text-text-primary">
              {t("unrecognised")}
            </p>
            <div role="group" aria-labelledby={questionId} className="mt-2.5 flex flex-wrap gap-2">
              {QUESTION_CHIPS.map((fam) => (
                <button
                  key={fam}
                  type="button"
                  data-testid="entry-chip"
                  data-family={fam}
                  onClick={() => choose(fam)}
                  className="min-h-11 rounded-full border border-ink-500 px-4 text-support font-semibold text-text-primary transition-colors hover:border-brand-blue hover:text-brand-blue"
                >
                  {t(`chips.${fam}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── Public numbers — from the canonical reader, or nothing ───── */}
        {supply ? (
          <p data-testid="entry-numbers" className="font-mono text-meta text-text-muted">
            {t("numbers", {
              vacancies: numbers.format(supply.vacancies),
              employers: numbers.format(supply.employers),
            })}
            {refreshedAt ? ` · ${t("refreshed", { date: refreshedAt })}` : ""}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
