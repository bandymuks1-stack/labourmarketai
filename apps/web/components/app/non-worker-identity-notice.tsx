import { Link } from "@/lib/i18n/navigation";

import type { NonWorkerIdentityNotice as Notice } from "@/lib/profile/non-worker-identity";

/**
 * W7-S5b — THE one honest state the person profile renders when the signed-in
 * account has no person (worker) identity.
 *
 * Follows the `EmployerContextNotice` precedent (W8 slice 1): the person must
 * be told WHICH identity they are viewing with, WHY the person sections are
 * absent, WHERE the organisation's information lives, and WHAT would change
 * it — otherwise 13 silently missing blocks read as breakage. The reason is
 * exposed as a machine-readable `data-reason`; the person sees localized
 * sentences, never an internal state name.
 *
 * Presentational only: callers pass already-localized strings. This component
 * explains an absence — it must never fabricate worker data, render worker
 * sections, or imply a person identity exists.
 */
export function NonWorkerIdentityNotice({
  reason,
  presentation,
  labels,
}: {
  reason: Extract<Notice, { kind: "visible" }>["reason"];
  presentation: Extract<Notice, { kind: "visible" }>["presentation"];
  labels: {
    title: string;
    /** The variant matching `presentation` — the page passes the right one. */
    body: string;
    companyProfileHint: string;
    companyProfileLink: string;
    addIdentityHint: string;
  };
}) {
  return (
    <section
      data-testid="profile-identity-context-notice"
      data-reason={reason}
      data-presentation={presentation}
      className="flex flex-col gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3"
    >
      <p className="text-sm font-semibold text-text-primary">{labels.title}</p>
      <p className="text-xs leading-relaxed text-text-secondary">
        {labels.body}
      </p>
      {/* The company pointer renders only when an organisation identity
          actually exists — a link to a company profile the account does not
          have would be a dead control. */}
      {reason === "organization-only" ? (
        <p className="text-xs leading-relaxed text-text-secondary">
          {labels.companyProfileHint}{" "}
          <Link
            href={"/dashboard/company" as "/dashboard"}
            className="inline-flex min-h-11 items-center font-medium text-brand-blue underline-offset-2 hover:underline"
            data-testid="profile-identity-company-link"
          >
            {labels.companyProfileLink} →
          </Link>
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-text-secondary">
        {labels.addIdentityHint}
      </p>
    </section>
  );
}
