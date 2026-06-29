import { getTranslations } from "next-intl/server";

import type { WorkCardData } from "@/lib/worker/work-card";
import { deriveWorkCardState, type WorkDim } from "@/lib/worker/work-card-state";
import { WorkCardEditor, type WorkCardLabels } from "./work-card-editor";
import { EmployerPreview } from "./employer-preview";
import { AvatarDisplay } from "./avatar-display";
import { ReadinessRing } from "./readiness-ring";
import type { ReadinessLevel } from "@/lib/player-card/readiness";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * "Mano darbo kortelė" — the first authenticated dashboard surface, rebuilt to the
 * landing-level PREMIUM Player Card visual system (PR560 v3). It reuses the exact
 * scouting chrome the public landing cards use — `card-border bg-card-glow`, tier
 * corner accents, the circular readiness gauge (ReadinessRing, the honest twin of
 * the landing OVRRing) and premium stat tiles — so the dashboard card reads as the
 * same product family, not a settings panel.
 *
 * It answers, in one control-room module:
 *   1. Kas aš čia esu?        → dominant avatar + name + profession/role
 *   2. Ką sistema žino?       → readiness ring + real stat tiles + "known" chips
 *   3. Ko trūksta?            → "missing" chips (honest gaps)
 *   4. Kokie 1–3 veiksmai?    → best next steps (≤ 3, existing targets only)
 *   5. Kas įvyksta paspaudus? → each action opens an existing working surface
 *
 * Honest by construction: every value is the worker's REAL saved data; the pure
 * engine in lib/worker/work-card-state decides clear/missing/next, and the ring is
 * a real signal COUNT (met/total), never a fabricated rating/match. The inline
 * WorkCardEditor and the employer preview are preserved. Nothing here changes the
 * journal, routes, auth or any data model.
 */

/** Missing dimensions whose fill action lives on another page (the engine's HREF
 *  map). Inline dims (availability/location/pay) are handled by WorkCardEditor. */
const PAGE_TARGET: Partial<Record<WorkDim, string>> = {
  work: "/dashboard/profile",
  evidence: "/dashboard/journal",
};

/** Level → premium accent (NOT gold: gold stays the reserved trust accent). The
 *  shape matches the landing card; the palette stays honest. */
const LEVEL_TOP: Record<ReadinessLevel, string> = {
  ready: "border-t-brand-cyan/50",
  building: "border-t-brand-blue/40",
  start: "border-t-ink-500",
};
const LEVEL_CORNER: Record<ReadinessLevel, string> = {
  ready: "border-brand-cyan/50",
  building: "border-brand-blue/40",
  start: "border-ink-500",
};
const LEVEL_BADGE: Record<ReadinessLevel, string> = {
  ready: "border-brand-cyan/40 text-brand-cyan",
  building: "border-brand-blue/40 text-brand-blue",
  start: "border-ink-500 text-text-muted",
};

function StatTile({
  value,
  label,
  testid,
}: {
  value: string;
  label: string;
  testid: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid={testid}
    >
      <span className="font-mono text-2xl font-bold tracking-tightest text-text-primary tabular-nums">
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </span>
    </div>
  );
}

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
  const tp = await getTranslations("playerCard");

  const derived = deriveWorkCardState(data.signals, Date.now());
  const { state, clear, missing, next } = derived;
  const total = clear.length + missing.length;

  // Honest readiness: a real count of saved dimensions → the same 3-band level the
  // Player Card readiness ring uses elsewhere. Never a rating, never a match.
  const fraction = total > 0 ? clear.length / total : 0;
  const level: ReadinessLevel =
    fraction >= 0.8 ? "ready" : fraction >= 0.4 ? "building" : "start";
  const levelLabel =
    level === "ready"
      ? tp("readiness.levelReady")
      : level === "building"
        ? tp("readiness.levelBuilding")
        : tp("readiness.levelStart");

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
      className={cn(
        // Premium scouting chrome shared with the landing Player Card: glow frame,
        // hover lift, level-driven top border. Not a flat settings panel.
        "card-border bg-card-glow glow-hover rise-in relative flex flex-col gap-5 overflow-hidden border-t-2 p-5 transition-shadow hover:shadow-card-hover sm:p-6",
        LEVEL_TOP[level],
      )}
      data-testid="work-card"
      data-state={state}
      data-readiness-level={level}
    >
      {/* Tier corner accents — the landing card's signature scouting frame. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-2 top-2 h-5 w-5 rounded-tl-md border-l-2 border-t-2",
          LEVEL_CORNER[level],
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-2 right-2 h-5 w-5 rounded-br-md border-b-2 border-r-2",
          LEVEL_CORNER[level],
        )}
      />

      {/* Top band: card identity eyebrow + honest readiness-level badge. */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-label text-text-secondary">
          {tw("eyebrow")}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label",
            LEVEL_BADGE[level],
          )}
          data-testid="work-card-level"
        >
          {levelLabel}
        </span>
      </div>

      {/* 1 — IDENTITY HERO: dominant avatar + strong name/role + readiness ring. */}
      <header
        className="flex items-center justify-between gap-3 sm:gap-4"
        data-testid="work-card-identity"
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {/* Dominant player portrait — canonical AvatarDisplay inside a premium
              scouting ring frame. */}
          <div className="shrink-0 rounded-full p-0.5 ring-2 ring-brand-blue/25">
            <AvatarDisplay
              signedUrl={avatarUrl}
              displayName={data.name}
              alt={data.name}
              size="lg"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
              {t("greeting", { name: data.name })}
            </h1>
            {data.professionName ? (
              <span
                className="truncate font-mono text-[11px] uppercase tracking-label text-brand-cyan"
                data-testid="work-card-role"
              >
                {data.professionName}
                {data.signals.skillsCount > 0
                  ? ` · ${tw("value.skills", { n: data.signals.skillsCount })}`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>
        {/* Readiness ring — the SAME premium gauge as the landing card, honest
            met/total signal count (never a score/match). */}
        <div className="shrink-0" data-testid="work-card-readiness">
          <ReadinessRing
            met={clear.length}
            total={total}
            level={level}
            levelLabel={levelLabel}
            size="md"
          />
        </div>
      </header>

      <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
        {intro}
      </p>

      {/* 2a — Real stat tiles (premium player-card stats, real counts only). */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          testid="work-card-stat-skills"
          value={String(data.signals.skillsCount)}
          label={tp("skillsLabel")}
        />
        <StatTile
          testid="work-card-stat-records"
          value={String(data.signals.evidenceCount)}
          label={tp("evidenceLabel")}
        />
        <StatTile
          testid="work-card-stat-readiness"
          value={`${clear.length}/${total}`}
          label={tp("readiness.label")}
        />
      </div>

      {/* 2b — KNOWN: what the system already knows (real saved dimensions). */}
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
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-state-success/30 bg-state-success/5 px-2.5 py-1 text-[11px] text-text-secondary"
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
                className="inline-flex items-center gap-1 rounded-md border border-brand-orange/30 bg-brand-orange/5 px-2.5 py-1 text-[11px] text-brand-orange"
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
