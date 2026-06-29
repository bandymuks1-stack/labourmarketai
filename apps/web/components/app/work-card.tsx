import { getTranslations } from "next-intl/server";

import type { WorkCardData } from "@/lib/worker/work-card";
import { deriveWorkCardState, type WorkDim } from "@/lib/worker/work-card-state";
import { WorkCardEditor, type WorkCardLabels } from "./work-card-editor";
import { EmployerPreview } from "./employer-preview";
import { AvatarDisplay } from "./avatar-display";
import { Link } from "@/lib/i18n/navigation";

/**
 * "Mano darbo kortelė" — the dashboard worker entry, rebuilt as a compact PREMIUM
 * Player Card module (PR-D1R). It answers, in one control-room panel:
 *
 *   1. Kas aš čia esu?        → identity band (avatar + name + profession/role)
 *   2. Ką sistema žino?       → "known" signal chips (real saved dimensions)
 *   3. Ko trūksta?            → "missing" chips (real unsaved dimensions)
 *   4. Kokie 1–3 veiksmai?    → best next steps (≤ 3 actions, existing targets)
 *   5. Kas įvyksta paspaudus? → each action opens an existing working surface
 *
 * Honest by construction: every value is the worker's REAL saved data; the pure
 * engine in lib/worker/work-card-state decides clear/missing/next. No score, no
 * match, no fabricated value, no fake action. The single best next action + the
 * inline editor (WorkCardEditor) and the employer preview are preserved.
 *
 * Page-target actions reuse the engine's own HREF map (work → profile, evidence →
 * journal); the inline dimensions (availability / location / pay) are edited in the
 * existing WorkCardEditor below. Nothing here changes the journal, routes, auth or
 * any data model.
 */

/** Missing dimensions whose fill action lives on another page (the engine's HREF
 *  map). Inline dims (availability/location/pay) are handled by WorkCardEditor. */
const PAGE_TARGET: Partial<Record<WorkDim, string>> = {
  work: "/dashboard/profile",
  evidence: "/dashboard/journal",
};

export async function WorkCard({
  data,
  avatarUrl = null,
}: {
  data: WorkCardData;
  /** Owner's consented avatar signed URL (existing getOwnAvatar read). When
   *  absent, the canonical AvatarDisplay shows the honest initials monogram. */
  avatarUrl?: string | null;
}) {
  const t = await getTranslations("auth.dashboard");
  const tw = await getTranslations("auth.dashboard.workCard");

  const derived = deriveWorkCardState(data.signals, Date.now());
  const { state, clear, missing, next } = derived;
  const total = clear.length + missing.length;

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

  // A "known" chip carries the saved value when it is short (location / pay) or a
  // count (skills / evidence); otherwise just the dimension label. Real data only.
  const knownChipValue: Record<WorkDim, string> = {
    work: data.professionName ?? tw("dim.work.label"),
    availability: availabilityText || tw("dim.availability.label"),
    location: locationText || tw("dim.location.label"),
    pay: payText || tw("dim.pay.label"),
    evidence: tw("value.entries", { n: data.signals.evidenceCount }),
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

  // Best next steps (max 3): the engine's single primary action (rendered by the
  // inline WorkCardEditor) + up to 2 secondary links to EXISTING page targets for
  // other missing dimensions. Never more than three, never a dead target.
  const secondary = missing
    .filter((d) => d !== next.dim && PAGE_TARGET[d])
    .slice(0, 2);

  return (
    <section
      className="card-border relative flex flex-col gap-5 overflow-hidden bg-ink-900/40 p-6 sm:p-7"
      data-testid="work-card"
      data-state={state}
    >
      {/* Premium accent rail — design-language only (no random gradient). */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-violet"
      />

      {/* 1 — IDENTITY BAND: who am I here (avatar + name + role) + readiness. */}
      <header className="flex flex-col gap-3" data-testid="work-card-identity">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {tw("eyebrow")}
        </span>
        <div className="flex items-center gap-3 sm:gap-4">
          <AvatarDisplay
            signedUrl={avatarUrl}
            displayName={data.name}
            alt={data.name}
            size="lg"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="truncate font-display text-xl font-bold tracking-tightest text-text-primary sm:text-2xl">
              {t("greeting", { name: data.name })}
            </h1>
            {data.professionName ? (
              <span
                className="truncate font-mono text-[10px] uppercase tracking-label text-brand-cyan"
                data-testid="work-card-role"
              >
                {data.professionName}
                {data.signals.skillsCount > 0
                  ? ` · ${tw("value.skills", { n: data.signals.skillsCount })}`
                  : ""}
              </span>
            ) : null}
          </div>
          {/* Readiness — real count of saved dimensions, never a score/match. */}
          <span
            className="shrink-0 rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-text-secondary"
            data-testid="work-card-readiness"
            aria-label={tw("clearTitle")}
          >
            <span className="text-state-success">{clear.length}</span>
            <span className="text-text-muted">/{total}</span>
          </span>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {intro}
        </p>
      </header>

      {/* 2 — KNOWN: what the system already knows (real saved dimensions). */}
      {clear.length > 0 && (
        <div
          className="flex flex-col gap-2 border-t border-ink-600 pt-4"
          data-testid="work-card-known"
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-state-success">
            {tw("clearTitle")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {clear.map((d) => (
              <span
                key={d}
                data-testid={`work-card-known-${d}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-state-success/30 bg-state-success/5 px-2.5 py-1 text-[11px] text-text-secondary"
              >
                <span aria-hidden className="text-state-success">
                  ✓
                </span>
                <span className="truncate">{knownChipValue[d]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3 — MISSING: what blocks a stronger Player Card (real gaps). */}
      {missing.length > 0 && (
        <div
          className="flex flex-col gap-2 border-t border-ink-600 pt-4"
          data-testid="work-card-missing"
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
            {tw("missingTitle")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((dim) => (
              <span
                key={dim}
                data-testid={`work-card-missing-${dim}`}
                // Honest "what's missing" copy on the chip (tooltip + a11y); the
                // chip stays compact with the short dimension label.
                title={tw(`dim.${dim}.missing`)}
                aria-label={tw(`dim.${dim}.missing`)}
                className="inline-flex items-center gap-1 rounded-full border border-brand-orange/30 bg-brand-orange/5 px-2.5 py-1 text-[11px] text-brand-orange"
              >
                <span aria-hidden>+</span>
                {tw(`dim.${dim}.label`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4 — BEST NEXT STEPS (max 3): primary inline action + up to 2 links. */}
      <div
        className="flex flex-col gap-3 border-t border-ink-600 pt-4"
        data-testid="work-card-actions"
      >
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {tw("nextEyebrow")}
        </span>
        <WorkCardEditor
          state={state}
          nextHref={next.href}
          values={data.values}
          labels={editorLabels}
        />
        {secondary.map((d) => (
          <Link
            key={d}
            href={PAGE_TARGET[d] as "/dashboard"}
            data-testid={`work-card-next-${d}`}
            className="flex min-h-[2.75rem] items-center justify-between gap-3 rounded-md border border-ink-500 bg-ink-800/40 px-4 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
          >
            <span className="truncate font-medium">{tw(`next.${d}`)}</span>
            <span aria-hidden className="shrink-0 text-text-muted">
              →
            </span>
          </Link>
        ))}
      </div>

      {/* "Taip jus galėtų matyti darbdavys" — read-only mirror of the worker's OWN
          saved data; the value of completing the card made tangible. Secondary
          (collapsed). Not a match/score/claim that anyone is looking. */}
      {clear.length > 0 && (
        <div className="border-t border-ink-600 pt-4">
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
