"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import {
  ANALYTICS_CONSENT_EVENT,
  readAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsentChoice,
} from "@/lib/consent/analytics-consent";
import { refuseAnalytics } from "@/lib/consent/account-campaign";

/**
 * The analytics consent choice (owner decision 2026-11-03). Two surfaces, one
 * rule (lib/consent/analytics-consent.ts):
 *   - the BANNER, shown on every page until a choice exists on this device;
 *   - the CONTROL on the Cookie Policy page (linked from the footer), where
 *     the choice is changed or withdrawn at any time.
 *
 * The banner sits in the normal page flow, never fixed over the page: it
 * pushes content down instead of covering a field or a CTA on a phone
 * (tests/e2e/auth-field-touch-floor.spec.ts), and needs no z-index or
 * safe-area handling. It is compact (one sentence, a "more" link to the
 * Cookie Policy where the full text lives, both buttons in one row) so the
 * first screen keeps its own action in view at 360x740. Placement:
 *   - "top": every page except /auth/*, above the page;
 *   - "after-form": mounted by the auth layout BELOW the form, so sign-up
 *     and sign-in come first on a phone.
 *
 * Both choices are offered side by side with the SAME button style: nothing
 * is pre-selected, refusing takes exactly one press, like accepting, and
 * making no choice means no. Strings come from the server component that
 * mounts it, so no client message root is added.
 */

export type AnalyticsConsentBannerStrings = {
  /** The banner region's own accessible name. */
  readonly label: string;
  readonly text: string;
  readonly accept: string;
  readonly refuse: string;
  readonly more: string;
};

export type AnalyticsConsentControlStrings = {
  readonly title: string;
  readonly granted: string;
  readonly refused: string;
  readonly undecided: string;
  readonly allow: string;
  readonly refuse: string;
};

/** The current choice, kept in step with the other surface on the same page. */
function useConsentChoice(): { ready: boolean; choice: AnalyticsConsentChoice | null } {
  const [state, setState] = useState<{ ready: boolean; choice: AnalyticsConsentChoice | null }>({
    ready: false,
    choice: null,
  });
  useEffect(() => {
    const sync = () => setState({ ready: true, choice: readAnalyticsConsent()?.choice ?? null });
    sync();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
  }, []);
  return state;
}

/** /auth/* with or without a locale prefix: the auth layout mounts its own banner. */
const AUTH_PATH = /^\/(?:[a-z]{2}\/)?auth(?:\/|$)/;

export function isAuthPath(pathname: string | null): boolean {
  return AUTH_PATH.test(pathname ?? "");
}

export function AnalyticsConsentBanner({
  strings,
  placement = "top",
}: {
  strings: AnalyticsConsentBannerStrings;
  placement?: "top" | "after-form";
}) {
  const { ready, choice } = useConsentChoice();
  const pathname = usePathname();
  // Server render and first paint show nothing: the choice lives on the device.
  if (!ready || choice !== null) return null;
  if (placement === "top" && isAuthPath(pathname)) return null;
  return (
    <section
      role="region"
      aria-label={strings.label}
      data-testid="analytics-consent-banner"
      data-placement={placement}
      className={
        placement === "top"
          ? "border-b border-border-subtle bg-surface-1 px-4 py-2.5 sm:px-6"
          : "mt-6 rounded-md border border-border-subtle bg-surface-1 px-4 py-2.5"
      }
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm leading-snug text-text-secondary">
          {strings.text}{" "}
          <Link href="/legal/cookies" className="underline hover:text-text-primary">
            {strings.more}
          </Link>
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-auto whitespace-nowrap px-3 sm:flex-none"
            data-testid="analytics-consent-refuse"
            onClick={refuseAnalytics}
          >
            {strings.refuse}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-auto whitespace-nowrap px-3 sm:flex-none"
            data-testid="analytics-consent-accept"
            onClick={() => setAnalyticsConsent("granted")}
          >
            {strings.accept}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function AnalyticsConsentControl({ strings }: { strings: AnalyticsConsentControlStrings }) {
  const { ready, choice } = useConsentChoice();
  const status = !ready ? null : choice === "granted" ? strings.granted : choice === "refused" ? strings.refused : strings.undecided;
  return (
    <section
      id="analytics-consent"
      data-testid="analytics-consent-control"
      data-choice={choice ?? "none"}
      className="mt-8 rounded-md border border-border-subtle bg-surface-1 px-4 py-4"
    >
      <h2 className="text-sm font-semibold text-text-primary">{strings.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-text-secondary" aria-live="polite">
        {status}
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          data-testid="analytics-consent-control-refuse"
          aria-pressed={choice === "refused"}
          onClick={refuseAnalytics}
        >
          {strings.refuse}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="analytics-consent-control-allow"
          aria-pressed={choice === "granted"}
          onClick={() => setAnalyticsConsent("granted")}
        >
          {strings.allow}
        </Button>
      </div>
    </section>
  );
}
