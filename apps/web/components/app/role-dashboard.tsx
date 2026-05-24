import { Link } from "@/lib/i18n/navigation";

/**
 * Shared dashboard shell for role-context pages (company / agency /
 * buyer). Each role-specific route imports this and passes its own
 * copy keys + first-action description; all three pages share the
 * same shape so future role additions are a one-file change.
 *
 * Honesty rules:
 *
 *   - Pilot disclaimer is ALWAYS rendered above the first-action card.
 *   - First action is a PLACEHOLDER card describing what the next pilot
 *     iteration will deliver. It does NOT pretend to be a live feature
 *     yet. The pilot doctrine forbids fake matching / fake claims; the
 *     draft persistence + matching layer is the explicit follow-up
 *     work.
 *   - "Profile & capabilities" link routes back to
 *     `/dashboard/profile` — the universal CV/capability surface a
 *     role-context dashboard is NOT meant to replace.
 */
export function RoleDashboard({
  eyebrow,
  title,
  subtitle,
  pilotDisclaimer,
  firstActionTitle,
  firstActionBody,
  firstActionStatus,
  profileLinkLabel,
  testId,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  pilotDisclaimer: string;
  firstActionTitle: string;
  firstActionBody: string;
  firstActionStatus: string;
  profileLinkLabel: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {title}
        </h1>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </header>

      <section
        className="card-border flex flex-col gap-2 p-4"
        data-testid={`${testId}-pilot-disclaimer`}
      >
        <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          PILOT
        </p>
        <p className="text-sm text-text-secondary">{pilotDisclaimer}</p>
      </section>

      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid={`${testId}-first-action`}
      >
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {firstActionTitle}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-label text-state-warning">
            {firstActionStatus}
          </span>
        </header>
        <p className="text-sm text-text-secondary">{firstActionBody}</p>
      </section>

      <Link
        href="/dashboard/profile"
        className="self-start text-sm text-brand-blue hover:underline"
        data-testid={`${testId}-profile-link`}
      >
        {profileLinkLabel} →
      </Link>
    </div>
  );
}
