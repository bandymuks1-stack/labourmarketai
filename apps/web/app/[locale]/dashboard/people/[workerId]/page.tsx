import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BadgeCheck,
  CalendarDays,
  MapPin,
  NotebookPen,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { MessageButton } from "@/components/app/message-button";
import { anonymizedWorkerLabel } from "@/lib/visibility/worker-profile-visibility";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Role-aware person detail page (F2 / RC2).
 *
 * Production finding: the company team section showed people but there was NO
 * way to open anyone — no person route existed in the whole app. This page is
 * the single permitted destination for a person row.
 *
 * Permission model — fail-closed at the DATABASE:
 *   `workers` / `worker_skills` select RLS is `can_view_worker(id)` (self,
 *   admin, consented discoverability, or an ACTIVE work relationship —
 *   migration 20260711130000). If the session may not view the person the
 *   query returns nothing and the page renders the honest restricted state.
 *
 * Contact rule: no email / phone / private narrative is ever selected here
 * (owner rule: worker contact stays hidden; contact happens through the
 * permission-gated MessageButton flow).
 */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ locale: string; workerId: string }>;
}) {
  const { locale, workerId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("people");
  const tSkillNames = await getTranslations("skillNames");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  if (!UUID_RE.test(workerId)) {
    return <RestrictedState t={t} />;
  }

  // RLS does the permission work: no relation / no consent → zero rows.
  const { data: worker } = await supabase
    .from("workers")
    .select(
      "id, profile_id, display_name, headline, experience_years, current_location_country, availability_status, available_from",
    )
    .eq("id", workerId)
    .maybeSingle();

  if (!worker) {
    return <RestrictedState t={t} />;
  }

  // Own row → the canonical self surface, not a duplicate person view.
  if (worker.profile_id === user.id) {
    redirect(`/${locale}/dashboard/profile`);
  }

  const { data: skillRows } = await supabase
    .from("worker_skills")
    .select("skill_id, verified, source, skills ( slug, name_lt, name_en )")
    .eq("worker_id", workerId);

  type SkillRow = {
    skill_id: string;
    verified: boolean | null;
    source: string | null;
    skills: { slug: string | null; name_lt: string | null; name_en: string | null } | null;
  };
  const skills = ((skillRows ?? []) as unknown as SkillRow[]).map((r) => {
    const slug = r.skills?.slug ?? null;
    const label =
      slug && tSkillNames.has(slug)
        ? tSkillNames(slug)
        : (locale === "en" ? r.skills?.name_en : r.skills?.name_lt) ??
          r.skills?.name_lt ??
          r.skills?.name_en ??
          null;
    const state: "verified" | "work" | "declared" = r.verified
      ? "verified"
      : r.source === "work_journal"
        ? "work"
        : "declared";
    return { id: r.skill_id, label, state };
  });
  const shown = skills.filter((s) => s.label);

  const name =
    (worker.display_name as string | null)?.trim() ||
    anonymizedWorkerLabel(worker.id as string);
  const available =
    (worker.availability_status as string | null) === "available";

  const stateChip = (state: "verified" | "work" | "declared") => {
    if (state === "verified")
      return {
        cls: "border-state-success/40 bg-state-success/10 text-state-success",
        label: t("skillVerified"),
      };
    if (state === "work")
      return {
        cls: "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan",
        label: t("skillWorkBacked"),
      };
    return {
      cls: "border-ink-500 bg-ink-800 text-text-secondary",
      label: t("skillDeclared"),
    };
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-testid="person-page">
      <header className="flex flex-col gap-3">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-ink-500 bg-ink-700 font-display text-lg font-bold text-text-primary"
          >
            {name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? "")
              .join("") || "•"}
          </span>
          <div className="min-w-0">
            <h1
              className="font-display text-2xl font-bold tracking-tightest text-text-primary"
              data-testid="person-name"
            >
              {name}
            </h1>
            {worker.headline ? (
              <p className="text-sm text-text-secondary">
                {worker.headline as string}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {available ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-state-success/40 bg-state-success/10 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-state-success">
              {t("available")}
            </span>
          ) : null}
          {worker.available_from ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {t("availableFrom", { date: worker.available_from as string })}
            </span>
          ) : null}
          {worker.current_location_country ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
              <MapPin className="h-3 w-3" aria-hidden />
              {worker.current_location_country as string}
            </span>
          ) : null}
          {typeof worker.experience_years === "number" &&
          worker.experience_years > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
              {t("experienceYears", { n: worker.experience_years })}
            </span>
          ) : null}
        </div>
        <div>
          <MessageButton
            profileId={worker.profile_id as string | null}
            labelKey="messageWorker"
          />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {t("skillsTitle")} · {shown.length}
        </h2>
        {shown.length === 0 ? (
          <p className="card-border p-4 text-sm text-text-secondary">
            {t("skillsEmpty")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {shown.map((s) => {
              const chip = stateChip(s.state);
              return (
                <li
                  key={s.id}
                  className="card-border flex items-center gap-2 px-3 py-2"
                  data-testid="person-skill"
                >
                  <span className="text-sm text-text-primary">{s.label}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-label ${chip.cls}`}
                  >
                    {chip.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="inline-flex items-center gap-2 text-[11px] leading-relaxed text-text-muted">
          <NotebookPen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("skillsLegend")}
        </p>
      </section>
    </div>
  );
}

async function RestrictedState({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"people">>>;
}) {
  return (
    <div
      className="flex max-w-2xl flex-col gap-4"
      data-testid="person-restricted"
    >
      <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {t("restrictedTitle")}
      </h1>
      <p className="card-border p-4 text-sm leading-relaxed text-text-secondary">
        {t("restrictedBody")}
      </p>
    </div>
  );
}
