"use client";

import { useTranslations } from "next-intl";
import { type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export type CvSkill = { slug: string; isCore: boolean };

/**
 * Real-time CV preview shown beside the skills picker. Pure render of what the
 * person has selected — name, role(s), profession, skills — so they SEE their
 * CV building live. No data is fetched or stored here (transparency: "all this
 * data is yours"); names render from JSON by slug (PLATFORM_DOCTRINE §2).
 */
export function CvPreview({
  personName,
  roles,
  professionSlug,
  skills,
}: {
  personName: string;
  roles: Role[];
  professionSlug: string | null;
  skills: CvSkill[];
}) {
  const t = useTranslations("cv");
  const tRole = useTranslations("auth.signup.role");
  const tProf = useTranslations("professions");
  const tSkill = useTranslations("skillNames");

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
          <dd className="text-text-primary">
            {roles.length > 0 ? roles.map((r) => tRole(r)).join(" · ") : "—"}
          </dd>
        </div>
      </dl>

      <hr className="my-4 border-ink-600" />

      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("skills")}
      </p>
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
              <span
                className={cn(
                  "flex-none rounded-sm px-1 font-mono text-[9px] uppercase tracking-label",
                  s.isCore ? "text-brand-orange" : "text-text-muted",
                )}
              >
                {s.isCore ? t("tagCore") : t("tagSystem")}
              </span>
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
