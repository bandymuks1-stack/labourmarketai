"use client";

import { useTranslations } from "next-intl";
import { type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export type CvSkill = { slug: string; isCore: boolean };

/**
 * CV preview — a READ MODEL of the worker's SAVED data (§7: mirrors confirmed
 * data, never editorializes or hides). It renders every saved skill and every
 * role the person holds; names resolve from JSON by slug (§2). The parent feeds
 * server-fetched saved state and refreshes it after a save, so the shown counts
 * always equal what is persisted.
 */
export function CvPreview({
  personName,
  roles,
  activeRole,
  professionSlug,
  skills,
}: {
  personName: string;
  roles: Role[];
  activeRole: Role | null;
  professionSlug: string | null;
  skills: CvSkill[];
}) {
  const t = useTranslations("cv");
  const tRole = useTranslations("auth.signup.role");
  const tProf = useTranslations("professions");
  const tSkill = useTranslations("skillNames");

  // Active role first, then the rest in the order given.
  const orderedRoles =
    activeRole && roles.includes(activeRole)
      ? [activeRole, ...roles.filter((r) => r !== activeRole)]
      : roles;

  return (
    <aside className="card-border bg-card-glow p-5 md:sticky md:top-20">
      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("title")}
      </p>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-text-muted">{t("name")}</dt>
          <dd className="text-text-primary">{personName || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-text-muted">{t("profession")}</dt>
          <dd className="text-text-primary">
            {professionSlug ? tProf(professionSlug) : "—"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-text-muted">{t("roles")}</dt>
          <dd className="flex flex-wrap gap-x-2 gap-y-0.5 text-text-primary">
            {orderedRoles.length === 0
              ? "—"
              : orderedRoles.map((r) => (
                  <span key={r}>
                    <span
                      className={cn(
                        r === activeRole && "font-semibold text-brand-orange",
                      )}
                    >
                      {tRole(r)}
                    </span>
                    {r === activeRole && (
                      <span className="ml-1 font-mono text-[9px] uppercase tracking-label text-text-muted">
                        ({t("activeTag")})
                      </span>
                    )}
                  </span>
                ))}
          </dd>
        </div>
      </dl>

      <hr className="my-4 border-ink-600" />

      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("skills")}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
          {t("savedCount", { n: skills.length })}
        </p>
      </div>
      {skills.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{t("skillsEmpty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {skills.map((s) => (
            <li
              key={s.slug}
              className="flex items-center justify-between gap-2 text-sm text-text-primary"
            >
              <span>{tSkill(s.slug)}</span>
              {/* Only the meaningful "core skill of your trade" badge is shown;
                  the internal system/seed distinction is not surfaced. */}
              {s.isCore && (
                <span className="flex-none rounded-sm px-1 font-mono text-[9px] uppercase tracking-label text-brand-orange">
                  {t("tagCore")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <hr className="my-4 border-ink-600" />

      <p className="text-xs leading-relaxed text-state-live">{t("transparency")}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">
        {t("disclaimer")}
      </p>
    </aside>
  );
}
