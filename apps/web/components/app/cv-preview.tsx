"use client";

import { useTranslations } from "next-intl";
import { type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export type CvSkill = { slug: string; isCore: boolean };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Work passport — a premium READ MODEL of the worker's SAVED data (§7: mirrors
 * confirmed data, never editorializes or hides). Reads like a live scouting
 * profile, not a plain list, but stays honest: self-declared skills until
 * proof-backed, no universal score (PRODUCT_CONSTITUTION §10). The parent feeds
 * server-fetched saved state and refreshes after a save.
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

  const orderedRoles =
    activeRole && roles.includes(activeRole)
      ? [activeRole, ...roles.filter((r) => r !== activeRole)]
      : roles;

  return (
    <aside className="card-border bg-card-glow relative overflow-hidden p-5 md:sticky md:top-20">
      {/* Passport header — eyebrow + a calm "profile online" signal (not data) */}
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
          <span className="live-dot signal-dot" aria-hidden />
          {t("title")}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
          {t("savedCount", { n: skills.length })}
        </p>
      </div>

      {/* Identity — avatar + name + profession */}
      <div className="mt-4 flex items-center gap-3">
        <span
          className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-brand-blue/40 bg-gradient-to-br from-brand-blue/20 to-brand-cyan/10 font-display text-lg font-bold tracking-tight text-text-primary"
          aria-hidden
        >
          {initials(personName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold tracking-tightest text-text-primary">
            {personName || "—"}
          </p>
          <p className="truncate text-sm text-text-secondary">
            {professionSlug ? tProf(professionSlug) : "—"}
          </p>
        </div>
      </div>

      {/* Roles as chips (active highlighted) */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {orderedRoles.length === 0 ? (
          <span className="text-sm text-text-muted">—</span>
        ) : (
          orderedRoles.map((r) => (
            <span
              key={r}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs",
                r === activeRole
                  ? "border-brand-orange/50 bg-brand-orange/10 text-brand-orange"
                  : "border-ink-500 bg-ink-800 text-text-secondary",
              )}
            >
              {tRole(r)}
              {r === activeRole && (
                <span className="font-mono text-[8px] uppercase tracking-label text-text-muted">
                  {t("activeTag")}
                </span>
              )}
            </span>
          ))
        )}
      </div>

      <hr className="my-4 border-ink-600" />

      {/* Capabilities */}
      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("skills")}
      </p>
      {skills.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{t("skillsEmpty")}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {/* Core chips carry the orange border + dot — the per-chip text tag
              is intentionally dropped here. The skills picker is the editing
              surface that surfaces the badge; on the read-only CV preview a
              row of "Pagrindinis · Pagrindinis · …" duplicates that signal
              and adds noise (Mobile UX §6: drop duplicate statuses). */}
          {skills.map((s) => (
            <li
              key={s.slug}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                s.isCore
                  ? "border-brand-orange/40 bg-brand-orange/5 text-text-primary"
                  : "border-ink-500 bg-ink-800 text-text-secondary",
              )}
            >
              {s.isCore && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-brand-orange"
                />
              )}
              {tSkill(s.slug)}
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
