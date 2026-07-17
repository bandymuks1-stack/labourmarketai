import { getTranslations } from "next-intl/server";
import { UserRound, MapPin } from "lucide-react";

import { AvatarDisplay } from "@/components/app/avatar-display";
import { WorkCardEditor, type WorkCardLabels } from "@/components/app/work-card-editor";
import type { PersonVM, WorkEditorVM } from "./premium-hub-data";
import {
  HubEmptyState,
  HubPanel,
  HubProgress,
  HubStat,
  HubUnavailable,
  HubZoneLink,
} from "./premium-hub-primitives";

/** Block A — Asmens kortelė. Real identity + availability + a transparent
 *  profile-completeness ratio + real skill/evidence COUNTS (never a fabricated
 *  0–100 skill score).
 *
 *  When a `workEditor` is supplied (worker branch only), this block also carries
 *  the state-aware next action + inline availability/location/pay editor folded
 *  from the former WorkCard — the ONE canonical worker identity/card area on
 *  /dashboard (no duplicate WorkCard). The editor still writes via the real
 *  save/confirm RPCs and keeps its own `firstActionCardClicked` telemetry. */
export async function PremiumHubPersonCard({
  person,
  workEditor,
}: {
  person: PersonVM;
  workEditor?: WorkEditorVM;
}) {
  const t = await getTranslations("premiumHub");

  if (person.status === "unavailable") {
    return (
      <HubPanel eyebrow={t("person.title")} icon={UserRound} testid="premium-hub-person">
        <HubUnavailable message={t("unavailable")} />
      </HubPanel>
    );
  }

  // Non-worker empty (no folded editor) → the honest generic empty state. A
  // worker always gets the identity + editor path (its state-aware next action
  // is the "start" affordance), so it never falls through to this.
  if (person.status === "empty" && !workEditor) {
    return (
      <HubPanel eyebrow={t("person.title")} icon={UserRound} testid="premium-hub-person">
        <HubEmptyState
          icon={UserRound}
          title={t("person.empty.title")}
          body={t("person.empty.body")}
          ctaLabel={t("person.empty.cta")}
          href="/dashboard/profile"
        />
      </HubPanel>
    );
  }

  const tProf = await getTranslations("professions");
  const tRole = await getTranslations("auth.signup.role");
  const professionLabel = person.professionSlug ? tProf(person.professionSlug) : null;
  const roleLabel = person.roleFallback ? tRole(person.roleFallback) : null;
  const subtitle = professionLabel ?? roleLabel;
  const name = person.name ?? "";
  const showDetails = person.status === "ready";

  const AVAIL_TONE: Record<NonNullable<PersonVM["availability"]>, string> = {
    available: "border-state-success/40 bg-state-success/5 text-state-success",
    busy: "border-state-warning/40 bg-state-warning/5 text-state-warning",
    unavailable: "border-ink-500 bg-ink-800/60 text-text-muted",
  };

  // Worker next action + inline editor (folded from WorkCard). Server resolves
  // the editor copy; the client WorkCardEditor owns the interaction + RPC saves.
  let editorSection: React.ReactNode = null;
  if (workEditor) {
    const tw = await getTranslations("auth.dashboard.workCard");
    const labels: WorkCardLabels = {
      nextEyebrow: tw("nextEyebrow"),
      nextLabel: tw(`next.${workEditor.next.dim}`),
      why: tw(workEditor.next.whyKey),
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
    editorSection = (
      <div
        className="flex flex-col gap-3 border-t border-ink-600 pt-4"
        data-testid="premium-hub-person-next"
      >
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {tw("nextEyebrow")}
        </span>
        <WorkCardEditor
          state={workEditor.state}
          nextHref={workEditor.next.href}
          values={workEditor.values}
          labels={labels}
        />
      </div>
    );
  }

  return (
    <HubPanel eyebrow={t("person.title")} icon={UserRound} testid="premium-hub-person">
      {/* Identity header = the door to the profile/CV space (interaction
          contract: a header that looks like the entrance IS the entrance). */}
      <HubZoneLink
        href="/dashboard/profile"
        ariaLabel={t("person.openProfile")}
        testid="hub-person-profile-link"
      >
        <div className="flex items-center gap-4">
          <AvatarDisplay signedUrl={person.avatarUrl} displayName={name} alt={name} />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate font-display text-lg font-bold tracking-tightest text-text-primary">
              {name}
            </h2>
            {subtitle ? (
              <p className="truncate text-sm text-text-secondary">{subtitle}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {person.locationCountry ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
                  <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                  {person.locationCountry}
                </span>
              ) : null}
              {person.availability ? (
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label ${AVAIL_TONE[person.availability]}`}
                >
                  {person.availability === "available" ? (
                    <span className="live-dot" aria-hidden />
                  ) : null}
                  {t(`person.availability.${person.availability}`)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </HubZoneLink>

      {showDetails ? (
        <>
          {/* Every stat tile is a real door to the exact section it counts. */}
          <div className="grid grid-cols-3 gap-3">
            <HubStat
              value={person.skillsDeclared}
              label={t("person.stats.skills")}
              href="/dashboard/profile#profile-edit"
              openHint={t("openHint")}
              testid="hub-person-stat-skills"
            />
            <HubStat
              value={person.journalSupportedSkills}
              label={t("person.stats.supported")}
              href="/dashboard/profile#capabilities"
              openHint={t("openHint")}
              testid="hub-person-stat-supported"
            />
            <HubStat
              value={person.evidenceEntries}
              label={t("person.stats.entries")}
              href="/dashboard/journal#journal-entries"
              openHint={t("openHint")}
              testid="hub-person-stat-entries"
            />
          </div>
          {/* RC3 skills truth: one plain-language line explaining what the
              two skill numbers mean — never internal "signal" vocabulary. */}
          <p
            className="text-[11px] leading-relaxed text-text-muted"
            data-testid="hub-person-stats-legend"
          >
            {t("person.stats.legend")}
          </p>
        </>
      ) : null}

      {editorSection}
    </HubPanel>
  );
}
