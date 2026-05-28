import { Activity, Compass, Hammer, LayoutGrid, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { VISUAL_TOKENS } from "@/lib/visual/tokens";

/**
 * Visual Dashboard OS shell — sidebar + content header + main slot.
 * Pure presentational; no fetch, no auth, no state. Consumes
 * VISUAL_TOKENS so the shell reads as one product with the
 * worker / job demand cards shipped in PR #88 / #89.
 *
 * Honesty rules:
 *   - All counts shown in the sidebar / status strip are passed in
 *     as props by the page server component (which sources them
 *     from real data or honest "0 · Preview" placeholders).
 *   - The shell never invents numbers; if a count is undefined the
 *     pill renders an em-dash "—".
 */

export interface VisualOsCounts {
  readonly workersOpen?: number;
  readonly jobsOpen?: number;
  readonly agenciesOnboarded?: number;
  readonly evidenceItems?: number;
}

const SIDEBAR_ITEMS = [
  { id: "overview", labelLt: "Apžvalga", labelEn: "Overview", Icon: LayoutGrid },
  { id: "talent", labelLt: "Talentai", labelEn: "Talent", Icon: Sparkles },
  { id: "demand", labelLt: "Paklausa", labelEn: "Demand", Icon: Hammer },
  { id: "trust", labelLt: "Pasitikėjimas", labelEn: "Trust", Icon: ShieldCheck },
  { id: "signals", labelLt: "Signalai", labelEn: "Signals", Icon: Activity },
  { id: "directions", labelLt: "Kryptys", labelEn: "Directions", Icon: Compass },
] as const;

export type VisualOsSectionId = (typeof SIDEBAR_ITEMS)[number]["id"];

function formatCount(n: number | undefined): string {
  if (typeof n !== "number") return "—";
  return n.toString();
}

export function VisualOsShell({
  activeSection,
  locale,
  counts,
  children,
}: {
  readonly activeSection: VisualOsSectionId;
  readonly locale: "lt" | "en";
  readonly counts: VisualOsCounts;
  readonly children: ReactNode;
}) {
  const label = (lt: string, en: string) => (locale === "lt" ? lt : en);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]" data-testid="visual-os-shell">
      <aside
        className={`flex flex-col gap-2 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-4`}
        aria-label={label("Vizualios OS šoninis meniu", "Visual OS sidebar")}
        data-testid="visual-os-sidebar"
      >
        <header className="flex flex-col gap-1 px-1 pb-2">
          <span className="text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {label("Vizualinė OS", "Visual OS")}
          </span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {label("Preview · pavyzdiniai duomenys", "Preview · sample data")}
          </span>
        </header>
        <nav className="flex flex-col gap-1" aria-label={label("Sekcijos", "Sections")}>
          {SIDEBAR_ITEMS.map(({ id, labelLt, labelEn, Icon }) => {
            const isActive = id === activeSection;
            return (
              <div
                key={id}
                aria-current={isActive ? "page" : undefined}
                data-testid={`visual-os-section-${id}`}
                className={
                  isActive
                    ? `flex items-center gap-2 rounded-xl ${VISUAL_TOKENS.chipSurface} px-3 py-2 text-sm font-medium ${VISUAL_TOKENS.chipText}`
                    : "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400"
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{label(labelLt, labelEn)}</span>
              </div>
            );
          })}
        </nav>
        <footer className="mt-auto flex flex-col gap-2 pt-4 text-xs text-zinc-500 dark:text-zinc-500">
          <p>{label("Šoninis meniu yra preview chrome. Tikras roteris ateina su slice 5.", "Sidebar is preview chrome. Real router lands with slice 5.")}</p>
        </footer>
      </aside>

      <section className="flex flex-col gap-6" data-testid="visual-os-main">
        <StatusStrip locale={locale} counts={counts} />
        {children}
      </section>
    </div>
  );
}

function StatusStrip({
  locale,
  counts,
}: {
  readonly locale: "lt" | "en";
  readonly counts: VisualOsCounts;
}) {
  const label = (lt: string, en: string) => (locale === "lt" ? lt : en);
  const pills: ReadonlyArray<{ readonly id: string; readonly label: string; readonly value: string }> = [
    { id: "workers", label: label("Atviri darbuotojai", "Open workers"), value: formatCount(counts.workersOpen) },
    { id: "jobs", label: label("Atviri darbai", "Open demand"), value: formatCount(counts.jobsOpen) },
    { id: "agencies", label: label("Įdarbinimo agentūros", "Agencies onboarded"), value: formatCount(counts.agenciesOnboarded) },
    { id: "evidence", label: label("Įrodymų vienetai", "Evidence items"), value: formatCount(counts.evidenceItems) },
  ];
  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-4`}
      data-testid="visual-os-status-strip"
    >
      {pills.map((p) => (
        <div key={p.id} className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{p.label}</span>
          <span className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
