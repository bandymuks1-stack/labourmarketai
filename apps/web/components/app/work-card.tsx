import { getTranslations } from "next-intl/server";

import type { WorkCardData } from "@/lib/worker/work-card";
import { deriveWorkCardState, type WorkDim } from "@/lib/worker/work-card-state";
import { WorkCardEditor, type WorkCardLabels } from "./work-card-editor";
import { EmployerPreview } from "./employer-preview";
import { cn } from "@/lib/utils";

/**
 * "Mano darbo kortelė" (slice work-card-state-aware-v1) — the state-aware
 * worker entry. Every login shows the same continuity, not repeated onboarding:
 *
 *   new       → a short guided path to create the card.
 *   returning → the saved card summary (what is clear / what is missing) + ONE
 *               best next action + why it helps.
 *   stale     → a small "Ar tai vis dar galioja?" confirmation, never a restart.
 *
 * Honest by construction: the dimension values are the worker's REAL saved data
 * (existing public.workers columns + profession/skill/journal counts). No score,
 * no match, no fabricated value; the pure engine in lib/worker/work-card-state
 * decides the state and the single next action.
 */
export async function WorkCard({ data }: { data: WorkCardData }) {
  const t = await getTranslations("auth.dashboard");
  const tw = await getTranslations("auth.dashboard.workCard");

  const derived = deriveWorkCardState(data.signals, Date.now());
  const { state, clear, missing, next } = derived;

  // ── Human-readable value for each saved dimension (real data only) ──
  const v = data.values;
  const availabilityText = (() => {
    const parts: string[] = [];
    if (v.availabilityStatus)
      parts.push(tw(`editor.availabilityOption.${v.availabilityStatus}`));
    if (v.availableFrom) parts.push(tw("value.from", { date: v.availableFrom }));
    return parts.join(" · ");
  })();
  const locationText = [
    v.locationCountry,
    ...v.preferredCountries.filter((c) => c !== v.locationCountry),
  ]
    .filter(Boolean)
    .join(", ");
  const payText = (() => {
    if (v.salaryMin != null && v.salaryMax != null)
      return tw("value.payRange", { min: v.salaryMin, max: v.salaryMax });
    if (v.salaryMin != null) return tw("value.payFrom", { min: v.salaryMin });
    if (v.salaryMax != null) return tw("value.payTo", { max: v.salaryMax });
    return "";
  })();

  const dimValue: Record<WorkDim, string> = {
    work: data.professionName
      ? `${data.professionName} · ${tw("value.skills", { n: data.signals.skillsCount })}`
      : "",
    availability: availabilityText,
    location: locationText,
    pay: payText,
    evidence: tw("value.entries", { n: data.signals.evidenceCount }),
  };

  const Row = ({ dim }: { dim: WorkDim }) => {
    const ok = clear.includes(dim);
    return (
      <div
        className="flex items-start justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/40 p-3"
        data-testid={`work-card-dim-${dim}`}
        data-clear={ok ? "yes" : "no"}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {tw(`dim.${dim}.label`)}
          </span>
          <span
            className={cn(
              "text-sm leading-snug",
              ok ? "text-text-primary" : "text-text-muted",
            )}
          >
            {ok ? dimValue[dim] || tw("value.set") : tw(`dim.${dim}.missing`)}
          </span>
        </div>
        <span
          aria-hidden
          className={cn(
            "mt-0.5 shrink-0 font-mono text-[11px]",
            ok ? "text-state-success" : "text-text-muted",
          )}
        >
          {ok ? "✓" : "·"}
        </span>
      </div>
    );
  };

  const editorLabels: WorkCardLabels = {
    nextEyebrow: tw("nextEyebrow"),
    nextLabel: tw(`next.${next.dim}`),
    why: tw(next.whyKey),
    staleTitle: tw("stale.title"),
    staleBody: tw("stale.body"),
    yes: tw("stale.yes"),
    change: tw("stale.change"),
    staleSaved: tw("stale.saved"),
    editorOpen: tw("editor.open"),
    editorTitle: tw("editor.title"),
    availabilityLabel: tw("editor.availabilityLabel"),
    availabilityOptionAvailable: tw("editor.availabilityOption.available"),
    availabilityOptionBusy: tw("editor.availabilityOption.busy"),
    availabilityOptionUnavailable: tw("editor.availabilityOption.unavailable"),
    availabilityOptionNone: tw("editor.availabilityOption.none"),
    availableFromLabel: tw("editor.availableFromLabel"),
    locationLabel: tw("editor.locationLabel"),
    locationHint: tw("editor.locationHint"),
    preferredLabel: tw("editor.preferredLabel"),
    preferredHint: tw("editor.preferredHint"),
    salaryMinLabel: tw("editor.salaryMinLabel"),
    salaryMaxLabel: tw("editor.salaryMaxLabel"),
    save: tw("editor.save"),
    saving: tw("editor.saving"),
    saved: tw("editor.saved"),
    errorMsg: tw("editor.error"),
    needsMigration: tw("editor.needsMigration"),
  };

  const intro =
    state === "new"
      ? tw("intro.new")
      : state === "stale"
        ? tw("intro.stale")
        : tw("intro.returning");

  return (
    <section
      className="card-border flex flex-col gap-5 p-6 sm:p-7"
      data-testid="work-card"
      data-state={state}
    >
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {tw("eyebrow")}
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("greeting", { name: data.name })}
        </h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-secondary">
          {intro}
        </p>
      </header>

      {/* Snapshot of the five dimensions — what is clear, what is missing.
          This doubles as the guided checklist for a new card. */}
      <div className="flex flex-col gap-3">
        {clear.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="work-card-clear">
            <p className="font-mono text-[10px] uppercase tracking-label text-state-success">
              {tw("clearTitle")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {clear.map((d) => (
                <Row key={d} dim={d} />
              ))}
            </div>
          </div>
        )}
        {missing.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="work-card-missing">
            <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
              {tw("missingTitle")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {missing.map((d) => (
                <Row key={d} dim={d} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* One clear next step (+ why), the stale confirmation, and the
          secondary/collapsed editor — all interactive, all real. */}
      <div className="flex flex-col gap-2 border-t border-ink-600 pt-5">
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {tw("nextEyebrow")}
        </span>
        <WorkCardEditor
          state={state}
          nextHref={next.href}
          values={data.values}
          labels={editorLabels}
        />
      </div>

      {/* "Taip jus galėtų matyti darbdavys" — read-only mirror of the worker's
          OWN saved data, so the value of completing the card is tangible. Only
          shown once there is something real to preview. Not a match/score/claim
          that anyone is looking. Secondary (a collapsed toggle). */}
      {clear.length > 0 && (
        <div className="border-t border-ink-600 pt-5">
          <EmployerPreview
            rows={(["work", "availability", "location", "pay", "evidence"] as WorkDim[]).map(
              (d) => ({
                label: tw(`dim.${d}.label`),
                value: dimValue[d] || null,
              }),
            )}
            labels={{
              toggle: tw("employerPreview.toggle"),
              title: tw("employerPreview.title"),
              intro: tw("employerPreview.intro"),
              notSet: tw("employerPreview.notSet"),
              unverifiedNote: tw("employerPreview.unverifiedNote"),
            }}
          />
        </div>
      )}
    </section>
  );
}
