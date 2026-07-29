"use client";

import { useLocale, useTranslations } from "next-intl";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type EngagementCard = {
  id: string;
  orgName: string;
  relationship: string;
  startedAt: string | null;
  endedAt: string | null;
  title: string | null;
  isPrimary: boolean;
};

export type SkillDot = {
  slug: string;
  name: string;
  bin: string;
  isCore: boolean;
  /** Manager-confirmed: a real verified Work Proof (keystone). */
  verified?: boolean;
  /** Stored verification provenance: self_declared | work_journal | manager_confirmed. */
  source?: string;
};

// Confidence bin → dot colour (§15). Literal bin name maps to literal colour.
const BIN_DOT: Record<string, string> = {
  red: "bg-state-danger",
  green: "bg-state-success",
  yellow: "bg-state-warning",
};

// Profession/skill icon slugs the M1 registry recognises (icons live in a
// slug registry per §10). Rendered as a neutral lucide outline icon (no
// emoji); a richer asset set is M3.
const PROFESSION_ICON_SLUGS = new Set<string>(["icon.tile"]);

/**
 * CV view — engagement-context cards (§8.1, current first). Each card is one
 * person↔organization relationship. The verified/declared skill list (with
 * confidence dots + the profession icon) renders under the primary engagement;
 * M1 has no entry↔skill link, so skills attach at the worker+profession level
 * rather than per engagement (per-engagement attribution is M2).
 */
export function CvEngagementCards({
  cards,
  skills,
  professionIconSlug,
}: {
  cards: EngagementCard[];
  skills: SkillDot[];
  professionIconSlug: string | null;
}) {
  const t = useTranslations("journal.cv");
  const tRel = useTranslations("relationshipTypes");
  const locale = useLocale();

  if (cards.length === 0) return null;

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(locale, { year: "numeric", month: "short" }) : null;
  const hasProfIcon = professionIconSlug
    ? PROFESSION_ICON_SLUGS.has(professionIconSlug)
    : false;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-text-primary">
        {t("title")}
      </h2>
      <ul className="flex flex-col gap-3">
        {cards.map((c) => {
          const start = fmt(c.startedAt);
          const end = c.endedAt ? fmt(c.endedAt) : t("present");
          return (
            <li key={c.id} className="card-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-sm font-semibold text-text-primary">
                    {hasProfIcon && (
                      <Wrench
                        aria-hidden
                        strokeWidth={1.75}
                        className="mr-1.5 inline h-3.5 w-3.5 text-text-muted"
                      />
                    )}
                    {c.orgName}
                  </p>
                  <p className="mt-0.5 text-meta text-text-secondary">
                    {tRel(c.relationship)}
                    {c.title ? ` · ${c.title}` : ""}
                  </p>
                </div>
                {c.isPrimary && (
                  <span className="flex-none rounded-sm px-1 font-mono text-meta uppercase tracking-label text-brand-orange">
                    {t("primary")}
                  </span>
                )}
              </div>
              {start && (
                <p className="mt-1 font-mono text-meta uppercase tracking-label text-text-muted">
                  {start} — {end}
                </p>
              )}

              {/* Skills render under the primary engagement (M1 simplification). */}
              {c.isPrimary && skills.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-ink-600 pt-3">
                  {skills.map((s) => (
                    <li
                      key={s.slug}
                      className="flex items-center justify-between gap-2 text-sm text-text-primary"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn(
                            "inline-block size-2 flex-none rounded-full",
                            BIN_DOT[s.bin] ?? "bg-ink-500",
                          )}
                        />
                        {s.name}
                      </span>
                      <span className="flex flex-none items-center gap-1.5">
                        {/* The moment of truth: a declared skill becomes a real
                            verified Work Proof once a manager confirms it. */}
                        {(() => {
                          const confirmed =
                            s.verified || s.source === "manager_confirmed";
                          const journal =
                            !confirmed && s.source === "work_journal";
                          return (
                            <span
                              className={cn(
                                "rounded-full border px-1.5 py-0.5 font-mono text-meta uppercase tracking-label",
                                confirmed
                                  ? "verified-pop border-state-success/40 bg-state-success/10 text-state-success"
                                  : journal
                                    ? "border-brand-blue/40 text-brand-blue"
                                    : "border-ink-500 text-text-muted",
                              )}
                              data-testid={`skill-state-${s.slug}`}
                            >
                              {confirmed
                                ? `✓ ${t("verified")}`
                                : journal
                                  ? t("journalBacked")
                                  : t("declared")}
                            </span>
                          );
                        })()}
                        {s.isCore && (
                          <span className="rounded-sm px-1 font-mono text-meta uppercase tracking-label text-brand-orange">
                            {t("primary")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
