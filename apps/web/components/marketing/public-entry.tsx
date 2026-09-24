"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
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
export const EXAMPLE_KEYS = [
  "hire",
  "work",
  "internship",
  // Window 6 (2026-09-06, gap G-D1): a professional worker, a service need
  // and a service offer — the same live routing, no pre-answer. Each reading
  // is pinned per locale in lib/marketing/public-entry.test.ts.
  "professional",
  "needService",
  "offerService",
  // ── Window 11 (2026-09-07, owner §16/§18): the examples must span the
  //    GRAPH, not one edge of it. Every sentence above is a person or a
  //    company looking for the other — which is exactly the reading §16 says
  //    a visitor leaves with ("job board + worker profile + work journal").
  //    These four are the directions that reading has no room for, and each
  //    lands on a capability that already exists:
  //      offerCapacity — an organisation with SPARE CAPACITY (supply)
  //      brigade       — a TEAM wanted for a site (measured 2026-09-07: this
  //                      classified as the person LOOKING FOR WORK — the
  //                      demand/supply inversion, on the landing)
  //      logWork       — real work recorded (the evidence spine)
  //      verifyWork    — who can verify it (the verification chain)
  "offerCapacity",
  "brigade",
  "logWork",
  "verifyWork",
] as const;

export type EntryExampleKey = (typeof EXAMPLE_KEYS)[number];

/**
 * FOUR BY DEFAULT, ALL TEN ONE TAP AWAY (owner directive 2026-09-23, landing
 * §22 "fix the story, not CSS").
 *
 * Ten chips of equal weight were the only interactive mass on the first
 * screen, and they arrived before the page had said what it is. The owner
 * explicitly superseded the #1609 §18 reading that all ten must be visible by
 * default; what §18 protects — the BREADTH of the graph — is kept, because
 * the catalogue still holds all ten sentences in every locale and every one
 * stays reachable from the "more examples" control.
 *
 * The default four are one per direction a first-time visitor most often
 * means: someone hiring, someone looking for work, an organisation with
 * spare people, and real work being recorded. They are not a ranking of the
 * other six. `hire` stays FIRST because both CI landing specs click the
 * first chip and assert the need-workers reading.
 */
export const DEFAULT_EXAMPLE_KEYS = [
  "hire",
  "work",
  "offerCapacity",
  "logWork",
] as const satisfies readonly EntryExampleKey[];

/** The chips the entry MOUNTS: the default four, or all ten with the default
 *  four still first (so opening the rest never moves a chip already seen). */
export function visibleExampleKeys(showAll: boolean): readonly EntryExampleKey[] {
  if (!showAll) return DEFAULT_EXAMPLE_KEYS;
  const defaults: readonly EntryExampleKey[] = DEFAULT_EXAMPLE_KEYS;
  return [...defaults, ...EXAMPLE_KEYS.filter((key) => !defaults.includes(key))];
}

/**
 * One tracked landing CTA. The wrapper hears the anchor's click in the
 * capture phase (pointer AND keyboard activation both dispatch `click` on the
 * anchor), so the funnel event fires without the link primitive growing a
 * telemetry prop. The entry's own doors and the landing's primary actions
 * (`landing-primary-actions.tsx`, a server component) share this ONE
 * wrapper, so every landing CTA reports the same bounded shape.
 */
export function LandingCtaCapture({
  surface,
  ctaId,
  intent,
  testId,
  children,
}: {
  readonly surface: "landing_entry" | "landing_hero" | "landing_close";
  readonly ctaId: string;
  readonly intent?: FirstRunIntent;
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      data-testid={testId}
      data-cta-id={ctaId}
      className="inline-flex"
      onClickCapture={() =>
        trackFunnel(FUNNEL_EVENTS.ctaClicked, {
          surface,
          cta_id: ctaId,
          intent,
        })
      }
    >
      {children}
    </span>
  );
}

export function PublicEntry({ supply }: { readonly supply: EntrySupply | null }) {
  const t = useTranslations("landing.entry");
  const locale = useLocale();
  const inputId = useId();
  const questionId = useId();
  const examplesId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  /** The first chip the "more examples" control mounts — focus lands there,
   *  because the control itself unmounts once it has done its job. */
  const firstMoreRef = useRef<HTMLButtonElement>(null);

  const [draft, setDraft] = useState("");
  const [reading, setReading] = useState<PublicEntryReading | null>(null);
  /** The chip answer to the one question, when the router could not read. */
  const [chosen, setChosen] = useState<FirstRunIntent | null>(null);
  /** All ten examples mounted? Four until the visitor asks for more. */
  const [showAllExamples, setShowAllExamples] = useState(false);

  useEffect(() => {
    if (showAllExamples) firstMoreRef.current?.focus();
  }, [showAllExamples]);

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

  /** One of the two real doors, reported through the shared capture. */
  const door = (kind: EntryDoor) => (
    <LandingCtaCapture
      testId={`entry-${kind}`}
      surface="landing_entry"
      ctaId={`entry_${kind}`}
      intent={family ?? undefined}
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
    </LandingCtaCapture>
  );

  const examples = visibleExampleKeys(showAllExamples);
  const firstMoreKey = visibleExampleKeys(true)[DEFAULT_EXAMPLE_KEYS.length];

  return (
    // The entry claimed 768px of a 1904px viewport — 40% — leaving the wide
    // desktop composition half empty (owner §4). It widens only from `xl`,
    // where the room actually exists; below that the 3xl measure is what keeps
    // the sentence readable, so narrow layouts are untouched.
    <section
      data-testid="public-entry"
      aria-label={t("label")}
      className="max-w-3xl xl:max-w-5xl"
    >
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
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-brand-blue px-4 text-support font-semibold text-text-on-brand transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("submit")}
            </button>
          </div>
        </form>

        {/* ── Examples — routed live when tapped, never pre-answered ──────
               TEN sentences, all reachable, FOUR mounted by default (owner
               directive 2026-09-23, see DEFAULT_EXAMPLE_KEYS): each is a
               different DIRECTION of the graph, which is the whole answer to
               §16 (a visitor reading only "job + worker + hire" leaves
               believing this is a job board), so none is dropped — the other
               six are MOUNTED by the "more examples" control, never hidden
               with CSS, because tests/e2e/landing-mobile-overflow.spec.ts
               asserts a real box for every chip that exists.
               ── THE CHIP SAYS THE TOPIC; THE FIELD SAYS THE SENTENCE ──────
               (owner window 11 §18 + §19, 2026-09-07)

               Ten full sentences as chips measured 523px at 375px — 64% of the
               viewport — and pushed the entry below the fold. Two wrong answers
               were tried and rejected before this one:

                 · a horizontally scrolling strip (shipped, reverted same day in
                   #1607): 48px tall and eight of ten chips outside the
                   viewport. Hiding breadth is not a density fix, and the e2e
                   overflow spec said so correctly.
                 · dropping examples: that removes directions, which is the §16
                   problem it was meant to solve.

               The chip now carries a SHORT PLAIN-LANGUAGE topic — "Reikia
               darbuotojų", "Turime laisvų žmonių", "Užrašyti atliktą darbą" —
               and tapping it writes the FULL example sentence into the field,
               visibly, then routes that sentence live. Breadth is entirely
               preserved (all ten, all widths, nothing behind a gesture) at
               roughly a third of the height, and the interaction now TEACHES
               the front door: you watch a topic become a sentence you could
               have typed yourself.

               The labels are ordinary speech, never the product's vocabulary:
               no SUPPLY, no DEMAND, no "capacity", no "evidence" (§18). */}
        <div id={examplesId} className="flex flex-wrap items-center gap-1.5">
          <span className="text-meta text-text-muted">{t("examplesLabel")}</span>
          {examples.map((key) => {
            const example = t(`examples.${key}`);
            return (
              <button
                key={key}
                ref={key === firstMoreKey ? firstMoreRef : undefined}
                type="button"
                data-testid="entry-example"
                // The routed sentence is what the button is FOR, so it is the
                // accessible name — a screen-reader user hears the same thing
                // the field is about to be filled with, not the short topic.
                aria-label={example}
                title={example}
                onClick={() => {
                  setDraft(example);
                  ask(example);
                }}
                // COMPACT WRAPPING, not fewer chips (owner correction,
                // 2026-09-09). MEASURED on the built app: at 320px the ten
                // chips took TEN rows and 494px — 68.6% of the viewport — and
                // at 390px eight rows / 46.7%. The examples are meant to be
                // secondary; they were the page.
                //
                // Capping each chip at half the row makes them wrap two-up
                // below `sm`. Every chip that is MOUNTED renders at every
                // width, which is what tests/e2e/landing-mobile-overflow.spec.ts
                // depends on — that spec asserts a non-null bounding box for
                // every chip, so `display:none` disclosure would fail it; the
                // rest are mounted on demand instead (2026-09-23), and a
                // horizontal scroll strip was already tried and reverted
                // (#1607).
                //
                // THE LABEL WRAPS; IT IS NEVER CUT (owner directive
                // 2026-09-24, landing verified at 375px). The half-row cap
                // used to be paired with `truncate`, and on a 375px phone
                // three of the four default chips rendered as "Reikia
                // darbuo…", "Turime laisvų …", "Užrašyti atlikt…" — the
                // visitor could not read the example the chip exists to show.
                // A screen reader was fine (the sentence is the accessible
                // name); a sighted visitor was not. So the label now wraps to
                // a second line inside the same half-row cap: same density,
                // every word visible. `overflow-wrap:anywhere` is the last
                // resort for one word wider than a 320px chip; it never
                // fires at 375px with the current catalogues (pinned in
                // lib/guards/landing-375-polish.test.ts).
                className="min-h-11 max-w-[calc(50%-0.375rem)] rounded-full border border-ink-500 px-3 py-1.5 text-support font-medium leading-snug text-text-secondary [overflow-wrap:anywhere] transition-colors hover:border-brand-champagne hover:text-brand-champagne sm:max-w-none"
              >
                {t(`exampleLabels.${key}`)}
              </button>
            );
          })}
          {/* The rest of the graph, one tap away. Quieter than a chip on
              purpose: it is a way to see more, not a fifth thing to choose. */}
          {showAllExamples ? null : (
            <button
              type="button"
              data-testid="entry-more-examples"
              aria-expanded={false}
              aria-controls={examplesId}
              onClick={() => setShowAllExamples(true)}
              className="min-h-11 rounded-full px-3 text-support font-medium text-text-muted underline-offset-4 transition-colors hover:text-text-primary hover:underline"
            >
              {t("moreExamples")}
            </button>
          )}
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
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
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
              {/* A person looking for WORK can look at real open jobs right
                  now, without an account: the public board is anonymous by
                  design. Offering only "create an account" to "Ieškau darbo"
                  sent that visitor through a sign-up to see what the board
                  already shows anyone. */}
              {family === "work" ? (
                <LandingCtaCapture
                  testId="entry-jobs"
                  surface="landing_entry"
                  ctaId="entry_jobs"
                  intent={family}
                >
                  <Link
                    href="/jobs"
                    className={cn(buttonLinkClassName("secondary"), "gap-1.5 rounded-full")}
                  >
                    {t("browseJobs")}
                  </Link>
                </LandingCtaCapture>
              ) : null}
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
