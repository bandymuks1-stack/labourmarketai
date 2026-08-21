"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/i18n/navigation";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * PROFESSION RECOVERY PROMPT — one dismissible invitation, for the people
 * onboarding never asked.
 *
 * Onboarding started asking what work a person does on 2026-08-21. Everybody
 * who signed up BEFORE that is past the only screen that asks: measured the
 * same day, 25 of 29 onboarded workers hold no profession. Their board cannot
 * be directed at their trade, because `subject.professionSlug` is null and the
 * profile-directed pool in `lib/opportunities/external-vacancies.ts` never
 * runs — they see the newest ads of any kind instead of ads in their work.
 *
 * ── WHY IT LIVES HERE ──────────────────────────────────────────────────────
 * On the opportunities board, not the dashboard root, because this is the
 * screen the missing answer actually degrades: the person is looking at a
 * generic list, and the prompt explains why it is generic. The signal is also
 * ALREADY on this page — `readiness.hasWorkType` is
 * `Boolean(subject.professionSlug)`, computed by the loader that already ran —
 * so showing this costs no extra query.
 *
 * ── WHAT IT DELIBERATELY IS NOT ────────────────────────────────────────────
 * Not a modal, not a redirect, not a blocking next-login step, and not a
 * second profession editor. The write surface stays the canonical one at
 * /dashboard/profile (`worker-trade-profile`), which already supports several
 * directions with an `is_primary` flag — so answering here never restricts
 * anyone to one trade.
 *
 * Nothing is inferred. A dismissal is NOT an answer: the person's profession
 * stays unknown, and the honest consequence is that their board stays generic.
 *
 * ── DISMISSAL IS DEVICE-LOCAL, ON PURPOSE ──────────────────────────────────
 * One `localStorage` key, no row, no table, no schema change — the same idiom
 * `recently-viewed-strip`, `opportunity-details-disclosure` and
 * `market-map-base` already use for a preference that is not worth a database.
 *
 * The trade-off is stated rather than hidden: dismissing on a phone does not
 * dismiss on a laptop. That is the correct failure direction for a prompt
 * whose whole purpose is to be seen once more by someone who has not answered
 * yet — and it is strictly better than inventing a table for one banner.
 *
 * It disappears PERMANENTLY the moment a profession exists, regardless of
 * dismissal, because the server simply stops rendering it: the parent only
 * mounts this when `!readiness.hasWorkType`.
 */

/** Device-local, versioned so the prompt can be re-asked later if it is ever
 *  materially rewritten. Holds "1" and nothing else — no id, no profile data. */
const DISMISS_KEY = "lm.professionRecoveryPrompt.v1.dismissed";

export interface ProfessionRecoveryPromptLabels {
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly dismiss: string;
}

export function ProfessionRecoveryPrompt({
  labels,
}: {
  readonly labels: ProfessionRecoveryPromptLabels;
}) {
  // `null` = not yet decided on the client. Rendering nothing until the first
  // effect runs keeps the server and client markup identical, so a dismissed
  // prompt never flashes on screen before it disappears.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let already = false;
    try {
      already = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage unavailable (private mode, blocked) — show the prompt */
    }
    setDismissed(already);
    // Counted only when it is genuinely on screen, so `seen` stays a real
    // denominator for `opened` and `dismissed`.
    if (!already) trackFunnel(FUNNEL_EVENTS.professionRecoveryPromptSeen);
  }, []);

  if (dismissed !== false) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable — hide for this session at least */
    }
    setDismissed(true);
    trackFunnel(FUNNEL_EVENTS.professionRecoveryPromptDismissed);
  };

  return (
    <section
      className="flex flex-col items-start gap-2 rounded-md border border-state-amber/40 bg-state-amber/10 px-4 py-3"
      data-testid="opportunities-no-work-type"
    >
      <p className="text-sm font-semibold text-text-primary">{labels.title}</p>
      <p className="text-xs leading-relaxed text-text-secondary">{labels.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/profile#work-directions"
          onClick={() => trackFunnel(FUNNEL_EVENTS.professionRecoveryPromptOpened)}
          // min-h-11 = 44px. Measured at 390px before this was added, the CTA
          // came out 28px tall — under the touch floor the visual contract
          // requires of a real action, and the primary action of a prompt aimed
          // at phone users is the last place to miss it. inline-flex so the
          // label stays centred once the box is taller than the text.
          className="inline-flex min-h-11 items-center rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80"
          data-testid="opportunities-no-work-type-cta"
        >
          {labels.cta} →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          // min-h-11 = the 44px touch target the visual contract requires of a
          // real action; a dismiss nobody can hit on a phone is a trap.
          className="min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
          data-testid="opportunities-no-work-type-dismiss"
        >
          {labels.dismiss}
        </button>
      </div>
    </section>
  );
}
