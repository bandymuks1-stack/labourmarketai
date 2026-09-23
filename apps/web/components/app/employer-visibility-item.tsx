import { Eye, EyeOff, HelpCircle } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import {
  EMPLOYER_VISIBILITY_HREF,
  type EmployerVisibility,
} from "@/lib/privacy/employer-visibility";

/**
 * "MATOMAS DARBDAVIAMS · Įjungta / Išjungta / Nežinoma" — the readiness item
 * the profile hub and the opportunities board share (capability matrix P0,
 * 2026-09-23). ONE component, so the two surfaces cannot say different things
 * about the same consent.
 *
 * It is a DOOR, not a switch: one tap opens the consent's canonical home
 * (`/dashboard/privacy#visibility`), where the person reads the full versioned
 * text and decides with two equal buttons. Nothing here grants, withdraws or
 * pre-selects anything.
 *
 * A CHOICE, NOT A DEFICIENCY. Consent must be freely given, so OFF is rendered
 * neutrally — never as an amber "missing" step or a "complete your profile"
 * nag. ON carries the success tone because it is a fact the person set.
 *
 * SEP-7: UNKNOWN (a failed or unavailable read) has its own icon, its own word
 * and a dashed border — it never borrows OFF's appearance. The state is never
 * colour-only: an icon shape and a visible state word carry it too.
 *
 * Presentational and hook-free: rendered from server components with labels
 * the caller resolved (`employerVisibilityItemLabels`).
 */

export interface EmployerVisibilityItemLabels {
  readonly title: string;
  readonly state: Readonly<Record<EmployerVisibility, string>>;
  readonly hint: Readonly<Record<EmployerVisibility, string>>;
}

/** Resolve the labels from a translator over `privacyConsent.employerVisibility`. */
export function employerVisibilityItemLabels(
  t: (key: string) => string,
): EmployerVisibilityItemLabels {
  return {
    title: t("title"),
    state: { on: t("state.on"), off: t("state.off"), unknown: t("state.unknown") },
    hint: { on: t("hint.on"), off: t("hint.off"), unknown: t("hint.unknown") },
  };
}

const TONE: Readonly<Record<EmployerVisibility, string>> = {
  on: "border-state-success/40",
  off: "border-border-subtle",
  unknown: "border-dashed border-ink-500",
};

const STATE_TONE: Readonly<Record<EmployerVisibility, string>> = {
  on: "text-state-success",
  off: "text-text-primary",
  unknown: "text-text-muted",
};

export function EmployerVisibilityItem({
  visibility,
  labels,
  testId,
}: {
  visibility: EmployerVisibility;
  labels: EmployerVisibilityItemLabels;
  testId: string;
}) {
  const Icon = visibility === "on" ? Eye : visibility === "off" ? EyeOff : HelpCircle;
  return (
    <Link
      href={EMPLOYER_VISIBILITY_HREF as "/dashboard"}
      data-testid={testId}
      data-visibility={visibility}
      className={`flex min-h-11 items-start gap-3 rounded-md border p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${TONE[visibility]}`}
    >
      <Icon
        className={`mt-0.5 h-5 w-5 shrink-0 ${STATE_TONE[visibility]}`}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-text-primary">
          {labels.title}
          {" · "}
          <span className={STATE_TONE[visibility]} data-testid={`${testId}-state`}>
            {labels.state[visibility]}
          </span>
        </span>
        <span className="text-xs leading-relaxed text-text-secondary">
          {labels.hint[visibility]}
        </span>
      </span>
      <span aria-hidden className="mt-0.5 text-text-muted">
        →
      </span>
    </Link>
  );
}
