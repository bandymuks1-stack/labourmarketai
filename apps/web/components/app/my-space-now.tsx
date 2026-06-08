import { getTranslations } from "next-intl/server";

/**
 * "Aš dabar" — the calm orientation card for a logged-in person ("Mano erdvė"
 * slice my-space-human-entry-v1). Instead of an admin cockpit (steppers,
 * role/module cards, system state), the worker's space opens with one quiet
 * human summary: who they are now, what they can do, and what already proves it.
 *
 * Honest by construction: every value is a REAL count read on the dashboard
 * (profession / skills / journal entries). Empty values say so plainly; nothing
 * is fabricated, and the note states clearly that this is self-described and not
 * yet human-confirmed (PRODUCT_CONSTITUTION §7/§9 — no fake verification). The
 * card carries no primary gradient CTA and no navigation of its own; the single
 * next step stays in <DashboardNextAction> and the space switch in the page.
 */
export async function MySpaceNow({
  name,
  professionName,
  skillsCount,
  entriesCount,
}: {
  name: string;
  professionName: string | null;
  skillsCount: number;
  entriesCount: number;
}) {
  const t = await getTranslations("auth.dashboard");
  const tm = await getTranslations("auth.dashboard.mySpace");

  const rows: { label: string; value: string }[] = [
    {
      label: tm("snapshot.work"),
      value: professionName ?? tm("snapshot.workEmpty"),
    },
    {
      label: tm("snapshot.skills"),
      value:
        skillsCount > 0
          ? tm("snapshot.skillsValue", { n: skillsCount })
          : tm("snapshot.skillsEmpty"),
    },
    {
      label: tm("snapshot.proof"),
      value:
        entriesCount > 0
          ? tm("snapshot.proofValue", { n: entriesCount })
          : tm("snapshot.proofEmpty"),
    },
  ];

  return (
    <section
      className="card-border flex flex-col gap-4 p-6 sm:p-7"
      data-testid="my-space-now"
    >
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {tm("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("greeting", { name })}
        </h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-secondary">
          {tm("intro")}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/50 p-3"
          >
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {r.label}
            </dt>
            <dd className="text-sm font-medium leading-snug text-text-primary">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-[11px] leading-relaxed text-text-muted">
        {tm("unverifiedNote")}
      </p>
    </section>
  );
}
