import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PilotRequestButton } from "@/components/app/pilot-request-button";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/** Overview tab — the WOW Public Beta "start here" surface. Honest signals only
 *  (real profession/skills/journal counts); no fake matching/metrics (PV §10,
 *  PRODUCT_CONSTITUTION §5). Non-locking by design: the active role is the
 *  current workspace, not a permanent category (§1). */
export default async function DashboardOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role, full_name, email")
    .eq("id", user.id)
    .single();

  const t = await getTranslations("auth.dashboard");
  const tw = await getTranslations("auth.dashboard.wow");
  const tRole = await getTranslations("auth.signup.role");
  const tProf = await getTranslations("professions");

  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";
  const name =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");

  // Shared header (role chip + greeting). The chip names the CURRENT workspace,
  // never a permanent label.
  const Header = (
    <header className="flex flex-col gap-2">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" aria-hidden />
        {tRole(role)}
      </span>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("greeting", { name })}
      </h1>
    </header>
  );

  // Non-locking banner — present on every role's overview.
  const StartingPoint = (
    <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 text-sm leading-relaxed text-text-secondary">
      {tw("startingPoint")}
    </p>
  );

  // ── Company / agency / customer: honest activity-start surface ──
  if (role !== "worker") {
    const intent = role === "agency" ? "partner" : "hire_workers";
    const points = [tw("activity.p1"), tw("activity.p2"), tw("activity.p3")];
    return (
      <div className="flex flex-col gap-6">
        {Header}
        {StartingPoint}
        <section className="card-border flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
              {tw("activity.earlyAccess")}
            </span>
            <h2 className="font-display text-xl font-semibold text-text-primary">
              {tw("activity.title")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {tw("activity.body")}
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-text-secondary">
                <span className="mt-1 text-brand-orange" aria-hidden>
                  →
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-600 pt-5">
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {tw("pilot.title")}
            </h3>
            <p className="mb-3 mt-1 text-sm leading-relaxed text-text-secondary">
              {tw("pilot.body")}
            </p>
            <PilotRequestButton intent={intent} />
          </div>
        </section>
      </div>
    );
  }

  // ── Worker: "start here" work-identity hub with honest next-step signals ──
  let professionName: string | null = null;
  let skillsCount = 0;
  let entriesCount = 0;
  const { data: workerRow } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (workerRow?.id) {
    const { data: wp } = await supabase
      .from("worker_professions")
      .select("professions(slug)")
      .eq("worker_id", workerRow.id)
      .eq("is_primary", true)
      .maybeSingle();
    const slug = (wp?.professions as { slug: string } | null)?.slug ?? null;
    if (slug) professionName = tProf(slug);

    const { count: sc } = await supabase
      .from("worker_skills")
      .select("*", { count: "exact", head: true })
      .eq("worker_id", workerRow.id);
    skillsCount = sc ?? 0;

    const { count: ec } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
      .eq("worker_id", workerRow.id);
    entriesCount = ec ?? 0;
  }

  const steps = [
    {
      done: !!professionName,
      title: tw("nextSteps.profession.title"),
      body: professionName
        ? tw("nextSteps.profession.bodyDone", { profession: professionName })
        : tw("nextSteps.profession.body"),
      href: "/dashboard/profile" as const,
    },
    {
      done: skillsCount > 0,
      title: tw("nextSteps.skills.title"),
      body: skillsCount > 0
        ? tw("nextSteps.skills.bodyDone", { n: skillsCount })
        : tw("nextSteps.skills.body"),
      href: "/dashboard/profile" as const,
    },
    {
      done: entriesCount > 0,
      title: tw("nextSteps.journal.title"),
      body: entriesCount > 0
        ? tw("nextSteps.journal.bodyDone", { n: entriesCount })
        : tw("nextSteps.journal.body"),
      href: "/dashboard/journal" as const,
    },
  ];

  const linkCls =
    "inline-flex items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue";

  return (
    <div className="flex flex-col gap-6">
      {Header}
      {professionName && (
        <p className="-mt-3 font-mono text-[11px] uppercase tracking-label text-text-muted">
          {professionName}
        </p>
      )}
      {StartingPoint}

      {/* Next steps — honest, computed from saved data */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {tw("nextSteps.title")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.title}>
              <Link
                href={s.href}
                className="group flex h-full flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/60 p-4 transition-colors hover:border-brand-blue"
              >
                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-label",
                    s.done
                      ? "bg-state-success/15 text-state-success"
                      : "bg-brand-orange/15 text-brand-orange",
                  )}
                >
                  {s.done ? `✓ ${tw("nextSteps.done")}` : tw("nextSteps.todo")}
                </span>
                <span className="font-display text-sm font-semibold text-text-primary">
                  {s.title}
                </span>
                <span className="text-xs leading-relaxed text-text-muted">
                  {s.body}
                </span>
                <span className="mt-auto pt-1 text-xs font-semibold text-brand-blue group-hover:text-brand-cyan">
                  {tw("nextSteps.open")} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Two strong surfaces */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card-border flex flex-col gap-2 p-6">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {tw("identity.title")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {tw("identity.body")}
          </p>
          <Link href="/dashboard/profile" className={cn(linkCls, "mt-2 self-start")}>
            {tw("identity.cta")} →
          </Link>
        </section>
        <section className="card-border flex flex-col gap-2 p-6">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {tw("journal.title")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {tw("journal.body")}
          </p>
          <Link href="/dashboard/journal" className={cn(linkCls, "mt-2 self-start")}>
            {tw("journal.cta")} →
          </Link>
        </section>
      </div>

      {/* Add another way to use the platform (non-locking, §1/§2) */}
      <section className="rounded-md border border-dashed border-ink-500 px-4 py-4">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {tw("addMore.title")}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {tw("addMore.body")}
        </p>
        <Link href="/dashboard/account" className={cn(linkCls, "mt-3 self-start")}>
          {tw("addMore.cta")} →
        </Link>
      </section>
    </div>
  );
}
