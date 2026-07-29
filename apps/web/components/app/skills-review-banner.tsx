import { ClipboardCheck } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

/**
 * Honest "some skills need review" banner. Shown only when real data says so
 * (declared skills not yet backed by work-journal evidence / unclassified
 * free-label claims). It NEVER says "verified" — the message is explicitly
 * "needs review", and the count comes from deriveSkillEvidence (real saved
 * data), never a fabricated number. Hidden entirely when nothing needs review.
 */
export function SkillsReviewBanner({
  count,
  title,
  body,
  cta,
  href = "/dashboard/profile#profile-edit",
}: {
  readonly count: number;
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly href?: string;
}) {
  if (count <= 0) return null;
  return (
    <section
      className="flex flex-col gap-2 rounded-card border border-state-warning/40 bg-state-warning/5 p-4"
      data-testid="skills-review-banner"
    >
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
        <ClipboardCheck
          className="h-4 w-4 text-state-warning"
          strokeWidth={1.75}
          aria-hidden
        />
        {title}
        <span
          className="rounded-sm border border-state-warning/40 bg-state-warning/10 px-1.5 py-0.5 font-mono text-meta text-state-warning"
          data-testid="skills-review-banner-count"
        >
          {count}
        </span>
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary">{body}</p>
      <Link
        href={href as "/dashboard"}
        className="self-start text-sm font-semibold text-brand-blue hover:underline"
        data-testid="skills-review-banner-cta"
      >
        {cta} →
      </Link>
    </section>
  );
}
