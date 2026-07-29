import { getTranslations } from "next-intl/server";
import {
  FEATURES,
  getVisibleFeatures,
  type FeatureConfig,
} from "@/lib/config/feature-availability";
import {
  ACTIVITY_TYPES,
  type ActivityType,
} from "@/lib/config/activity-types";
import {
  VISIBLE_LABOUR_MARKET_ROLES,
  type LabourMarketRole,
} from "@/lib/config/roles";
import { cn } from "@/lib/utils";

/**
 * The one-page system map. Renders the labourmarket.ai labour-market OS
 * scope across three catalogues — features, roles, activity types — and
 * groups them by availability (`active` / `preparing`). Nothing here is
 * a CTA into a stub page: this is an honest system map, not a button row.
 *
 * Catalogue-driven means every row is reflective of source state — adding
 * a future role / feature / activity row in `lib/config/*.ts` makes it
 * appear here automatically with the right state badge.
 *
 * Used by `/[locale]/vision`. Pure server component, no auth required.
 */
export async function LabourMarketOsMap() {
  const t = await getTranslations();

  // ── Group inputs ───────────────────────────────────────────────────
  const activeFeatures = FEATURES.filter((f) => f.availability === "active");
  const preparingFeatures = FEATURES.filter(
    (f) => f.availability === "preparing",
  );
  const activeRoles = VISIBLE_LABOUR_MARKET_ROLES.filter(
    (r) => r.availability === "active",
  );
  const preparingRoles = VISIBLE_LABOUR_MARKET_ROLES.filter(
    (r) => r.availability === "preparing",
  );
  const activeActivities = ACTIVITY_TYPES.filter(
    (a) => a.availability === "active",
  );
  const preparingActivities = ACTIVITY_TYPES.filter(
    (a) => a.availability === "preparing",
  );

  return (
    <div className="flex flex-col gap-12">
      {/* Workflow strip — how a person moves through the system */}
      <section
        aria-labelledby="vision-workflow"
        className="flex flex-col gap-4"
      >
        <h2
          id="vision-workflow"
          className="font-display text-xl font-bold tracking-tightest text-text-primary"
        >
          {t("vision.sections.workflow")}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(["s1", "s2", "s3", "s4", "s5", "s6"] as const).map((step, i) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-md border border-ink-600 bg-ink-800/40 p-3"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-brand-blue/40 bg-brand-blue/10 font-mono text-meta font-semibold text-brand-blue">
                {i + 1}
              </span>
              <span className="text-sm leading-snug text-text-primary">
                {t(`vision.workflowSteps.${step}`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Today live — features that already ship */}
      <section
        aria-labelledby="vision-today"
        className="flex flex-col gap-4"
      >
        <SectionHeading
          id="vision-today"
          title={t("vision.sections.today")}
          tone="active"
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeFeatures.map((f) => (
            <FeatureCard key={f.key} feature={f} kind="active" />
          ))}
        </ul>
      </section>

      {/* Roles — evolution, no lock-in */}
      <section
        aria-labelledby="vision-roles"
        className="flex flex-col gap-4"
      >
        <SectionHeading
          id="vision-roles"
          title={t("vision.sections.roles")}
          tone="neutral"
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeRoles.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
          {preparingRoles.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
        </ul>
      </section>

      {/* Activities — what the OS can record / claim / offer / track */}
      <section
        aria-labelledby="vision-activities"
        className="flex flex-col gap-4"
      >
        <SectionHeading
          id="vision-activities"
          title={t("vision.sections.activities")}
          tone="neutral"
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeActivities.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
          {preparingActivities.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
        </ul>
      </section>

      {/* Preparing features — honest catalogue */}
      <section
        aria-labelledby="vision-preparing"
        className="flex flex-col gap-4"
      >
        <SectionHeading
          id="vision-preparing"
          title={t("vision.sections.preparing")}
          tone="preparing"
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {preparingFeatures.map((f) => (
            <FeatureCard key={f.key} feature={f} kind="preparing" />
          ))}
        </ul>
      </section>

      {/* Control room — system status snapshot */}
      <ControlRoomCard />

      {/* Future layers — honest forward-looking section */}
      <section
        aria-labelledby="vision-future"
        className="flex flex-col gap-4"
      >
        <SectionHeading
          id="vision-future"
          title={t("vision.sections.future_layers")}
          tone="future"
        />
        <ul className="grid gap-3 sm:grid-cols-2">
          {(["draft", "monitor", "agent", "trust"] as const).map((id) => (
            <li
              key={id}
              className="flex items-start gap-3 rounded-md border border-dashed border-ink-500 bg-ink-800/30 p-3"
            >
              <span
                aria-hidden
                className="mt-0.5 inline-block h-2 w-2 flex-none rounded-full bg-text-muted"
              />
              <span className="text-sm leading-snug text-text-secondary">
                {t(`vision.futureLayers.${id}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-text-muted">
        {t("vision.footer")}
      </p>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────

async function FeatureCard({
  feature,
  kind,
}: {
  feature: FeatureConfig;
  kind: "active" | "preparing";
}) {
  const t = await getTranslations();
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-md border p-4 transition-colors",
        kind === "active"
          ? "border-ink-500 bg-ink-800/50"
          : "border-ink-600 bg-ink-800/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {t(feature.labelKey)}
        </h3>
        <StatusChip kind={kind} />
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t(feature.descriptionKey)}
      </p>
    </li>
  );
}

async function RoleCard({ role }: { role: LabourMarketRole }) {
  const t = await getTranslations();
  const isActive = role.availability === "active";
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-md border p-4",
        isActive
          ? "border-ink-500 bg-ink-800/50"
          : "border-ink-600 bg-ink-800/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {t(role.labelKey)}
        </h3>
        <StatusChip kind={isActive ? "active" : "preparing"} />
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t(role.descriptionKey)}
      </p>
    </li>
  );
}

async function ActivityCard({ activity }: { activity: ActivityType }) {
  const t = await getTranslations();
  const isActive = activity.availability === "active";
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border p-3",
        isActive
          ? "border-ink-500 bg-ink-800/50"
          : "border-ink-600 bg-ink-800/30",
      )}
    >
      <span className="text-sm text-text-primary">{t(activity.labelKey)}</span>
      <StatusChip kind={isActive ? "active" : "preparing"} />
    </li>
  );
}

function StatusChip({ kind }: { kind: "active" | "preparing" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label",
        kind === "active"
          ? "border-state-success/40 bg-state-success/5 text-state-success"
          : "border-state-warning/40 bg-state-warning/5 text-state-warning",
      )}
    >
      <ChipLabel kind={kind} />
    </span>
  );
}

async function ChipLabel({ kind }: { kind: "active" | "preparing" }) {
  const t = await getTranslations();
  return (
    <>
      {kind === "active"
        ? t("vision.controlRoom.todayLabel")
        : t("vision.controlRoom.preparingLabel")}
    </>
  );
}

function SectionHeading({
  id,
  title,
  tone,
}: {
  id: string;
  title: string;
  tone: "active" | "preparing" | "neutral" | "future";
}) {
  const dot =
    tone === "active"
      ? "bg-state-success"
      : tone === "preparing"
        ? "bg-state-warning"
        : tone === "future"
          ? "bg-text-muted"
          : "bg-brand-blue";
  return (
    <h2
      id={id}
      className="flex items-center gap-2 font-display text-xl font-bold tracking-tightest text-text-primary"
    >
      <span aria-hidden className={cn("h-2 w-2 rounded-full", dot)} />
      {title}
    </h2>
  );
}

async function ControlRoomCard() {
  const t = await getTranslations();
  // Rows pulled straight from i18n so the founder-facing "what's blocked"
  // signals stay one source of truth + honest. No fake metrics.
  const rows: { labelKey: string; statusKey: string; kind: "preparing" | "blocked" | "never" }[] = [
    {
      labelKey: "vision.controlRoom.ownerSmokeLabel",
      statusKey: "vision.controlRoom.ownerSmokeStatus",
      kind: "preparing",
    },
    {
      labelKey: "vision.controlRoom.pr18Label",
      statusKey: "vision.controlRoom.pr18Status",
      kind: "blocked",
    },
    {
      labelKey: "vision.controlRoom.nonWorkerLabel",
      statusKey: "vision.controlRoom.nonWorkerStatus",
      kind: "preparing",
    },
    {
      labelKey: "vision.controlRoom.fakeClaimsLabel",
      statusKey: "vision.controlRoom.fakeClaimsStatus",
      kind: "never",
    },
  ];
  // count uses derived catalogue numbers so the founder can sanity-check.
  const activeFeatureCount = getVisibleFeatures().filter(
    (f) => f.availability === "active",
  ).length;
  const preparingFeatureCount = getVisibleFeatures().filter(
    (f) => f.availability === "preparing",
  ).length;

  return (
    <section
      aria-labelledby="vision-control-room"
      className="card-border flex flex-col gap-4 p-5 sm:p-6"
    >
      <SectionHeading
        id="vision-control-room"
        title={t("vision.sections.controlRoom")}
        tone="neutral"
      />
      <dl className="grid gap-2 sm:grid-cols-2">
        <Stat
          label={t("vision.controlRoom.todayLabel")}
          value={String(activeFeatureCount)}
        />
        <Stat
          label={t("vision.controlRoom.preparingLabel")}
          value={String(preparingFeatureCount)}
        />
      </dl>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.labelKey}
            className="flex items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
          >
            <span className="text-sm text-text-primary">{t(row.labelKey)}</span>
            <span
              className={cn(
                "shrink-0 rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label",
                row.kind === "blocked"
                  ? "border-state-danger/40 bg-state-danger/5 text-state-danger"
                  : row.kind === "preparing"
                    ? "border-state-warning/40 bg-state-warning/5 text-state-warning"
                    : "border-state-success/40 bg-state-success/5 text-state-success",
              )}
            >
              {t(row.statusKey)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-600 bg-ink-800/40 p-3">
      <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-display text-xl font-bold tracking-tightest text-text-primary">
        {value}
      </dd>
    </div>
  );
}
