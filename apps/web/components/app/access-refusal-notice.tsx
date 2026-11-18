import { Link } from "@/lib/i18n/navigation";

/**
 * The one honest line a person gets when a link asked for a space their
 * account does not hold.
 *
 * Until now the refusal carried its reason in the URL (`?notice=…`) and
 * nothing read it: the person was bounced to the canonical home with no
 * explanation at all, which reads as "the link was broken" rather than "that
 * space is not yours yet". Measured 2026-09-22 on the local production build —
 * zero explanatory copy on the destination, for every refused route.
 *
 * Follows the `EmployerContextNotice` / `NonWorkerIdentityNotice` precedent:
 * presentational only, already-localized strings passed in, the machine
 * reason exposed as `data-reason` for tests while the person reads a sentence.
 * The internal token (`needs_company_role`) never reaches the DOM text.
 *
 * It points at `/dashboard/start`, the Activity Setup Hub — the real surface
 * where an identity is added. Not a fabricated control: if that route ever
 * stops being the place roles begin, the link must move with it.
 */
export function AccessRefusalNotice({
  reason,
  labels,
}: {
  /** The refused reason — a machine value, rendered only as an attribute. */
  reason: string;
  /** `setupCta` is null when there is no honest place to send the person —
   *  operator access is granted out of band, so a setup link would be a
   *  control that cannot do what it promises. */
  labels: { body: string; setupCta: string | null };
}) {
  return (
    <div
      data-testid="access-refusal-notice"
      data-reason={reason}
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink-600/60 bg-ink-800/60 px-3 py-2 text-xs leading-relaxed text-text-secondary sm:px-12"
    >
      <span>{labels.body}</span>
      {labels.setupCta ? (
        <Link
          href={"/dashboard/start" as "/dashboard"}
          className="font-medium text-brand-blue underline-offset-2 hover:underline"
          data-testid="access-refusal-notice-setup"
        >
          {labels.setupCta} →
        </Link>
      ) : null}
    </div>
  );
}
