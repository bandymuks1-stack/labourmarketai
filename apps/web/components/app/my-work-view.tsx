import { getTranslations } from "next-intl/server";
import {
  IdCard,
  FileText,
  Award,
  ShieldCheck,
  CalendarClock,
  NotebookPen,
  ClipboardList,
  Globe2,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnAvailability, getOwnCapabilities } from "@/lib/market-map/owner-readiness";
import { getOwnMarketSignals } from "@/lib/market-map/signals";
import { getOwnDemandLocationSummary } from "@/lib/demand/demand-location";
import { buildWorldMapZones } from "@/lib/work-market/world-map";
import { getOwnAcceptedClaimCount, mergeSkillSignal } from "@/lib/signals/connected-skill-signal";
import {
  buildWorkViewBlocks,
  buildWorkViewActions,
  type BlockKey,
  type BlockTone,
} from "@/lib/dashboard/my-work-view";

/**
 * My Work View — the first authenticated cockpit. Connects the owner's real,
 * RLS-scoped signals (profile, CV/summary, skills, evidence, availability, work
 * journal, work needs) and the Labour Market World Map into one operational
 * board with prioritized next actions. Real-data-driven with honest empty/
 * concept states — no fake data, no fake parsing/verification, no guaranteed
 * matching, no living/gyvas/живой wording.
 */

const BLOCK_ICON: Record<BlockKey, typeof IdCard> = {
  profile: IdCard,
  cv: FileText,
  skills: Award,
  evidence: ShieldCheck,
  availability: CalendarClock,
  journal: NotebookPen,
  workNeeds: ClipboardList,
  worldMap: Globe2,
};

const TONE_DOT: Record<BlockTone, string> = {
  active: "bg-brand-cyan",
  supported: "bg-state-success",
  attention: "bg-state-amber",
  concept: "bg-ink-500",
};

export async function MyWorkView() {
  const t = await getTranslations("myWorkView");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The cockpit is mounted on the authed dashboard (a user is always present);
  // with no user the RLS-scoped reads return nothing → an honest EMPTY cockpit,
  // never a crash and never another user's data.
  const uid = user?.id ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, country, profile_text")
    .eq("id", uid)
    .maybeSingle();

  const { data: workerRow } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", uid)
    .maybeSingle();

  let skillCount = 0;
  let journalCount = 0;
  if (workerRow?.id) {
    const [sc, jc] = await Promise.all([
      supabase.from("worker_skills").select("*", { count: "exact", head: true }).eq("worker_id", workerRow.id),
      supabase.from("journal_entries").select("*", { count: "exact", head: true }).eq("worker_id", workerRow.id),
    ]);
    skillCount = sc.count ?? 0;
    journalCount = jc.count ?? 0;
  }

  const [availability, capabilities, signals, demandSummary, claimCount] = await Promise.all([
    getOwnAvailability(),
    getOwnCapabilities(),
    getOwnMarketSignals(),
    getOwnDemandLocationSummary(),
    getOwnAcceptedClaimCount(),
  ]);
  const sig = signals ?? [];
  const skill = mergeSkillSignal(capabilities.counts, claimCount);

  const worldZones = buildWorldMapZones({
    hasWorker: availability.hasWorker,
    hasProfileSignal: sig.some((s) => s.signalType === "profile_location"),
    skillCounts: {
      confirmed: skill.confirmed,
      suggested: skill.supported,
      selfDeclared: skill.selfDeclared,
    },
    availabilityState: availability.state,
    preferredCount: availability.preferredCountries.length,
    demandTotal: demandSummary?.total ?? 0,
    hasCompanySignal: sig.some((s) => s.signalType === "company_location"),
    hasProjectSignal: sig.some((s) => s.signalType === "project_location"),
    signalCount: sig.length,
  });
  const worldRealZones = worldZones.filter((z) => z.dataState === "real").length;

  const input = {
    hasProfile: !!(profile?.full_name || profile?.country),
    hasSummary: !!(typeof profile?.profile_text === "string" && profile.profile_text.trim().length > 0),
    hasWorker: !!workerRow?.id || availability.hasWorker,
    skillCount: skillCount + claimCount,
    skillCounts: {
      confirmed: skill.confirmed,
      suggested: skill.supported,
      selfDeclared: skill.selfDeclared,
    },
    availabilityState: availability.state,
    journalCount,
    demandTotal: demandSummary?.total ?? 0,
    worldRealZones,
    worldTotalZones: worldZones.length,
  };

  const blocks = buildWorkViewBlocks(input);
  const actions = buildWorkViewActions(input);

  return (
    <section
      className="card-border flex flex-col gap-5 p-5 sm:p-6"
      data-testid="my-work-view"
    >
      <header className="flex flex-col gap-1">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
          <span className="live-dot" aria-hidden />
          {t("eyebrow")}
        </p>
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("title")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      <ul
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="work-view-blocks"
      >
        {blocks.map((b) => {
          const Icon = BLOCK_ICON[b.key];
          return (
            <li key={b.key} data-testid={`work-block-${b.key}`} data-block-tone={b.tone}>
              <Link
                href={b.ctaHref}
                data-testid={`work-block-${b.key}-cta`}
                className="glow-hover flex h-full flex-col gap-2 rounded-xl border border-ink-500 bg-ink-800/60 p-4 transition-colors hover:border-brand-blue"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-brand-cyan" strokeWidth={1.75} aria-hidden />
                    <span className="font-display text-sm font-semibold text-text-primary">
                      {t(`block.${b.key}.name`)}
                    </span>
                  </span>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[b.tone]}`} aria-hidden />
                </div>
                <p
                  className="mt-auto text-xs leading-relaxed text-text-secondary"
                  data-testid={`work-block-${b.key}-state`}
                >
                  {t(`block.${b.key}.state.${b.stateKey}`, { count: b.metric ?? 0 })}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="rounded-xl border border-ink-500 bg-ink-800/40 p-4" data-testid="work-view-actions">
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("actionsTitle")}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {actions.map((a) =>
            a.enabled ? (
              <li key={a.key}>
                <Link
                  href={a.href}
                  data-testid={`work-action-${a.key}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-brand-blue"
                >
                  {t(`action.${a.key}`)}
                  <ArrowRight className="h-4 w-4 shrink-0 text-brand-blue" strokeWidth={2} aria-hidden />
                </Link>
              </li>
            ) : (
              <li
                key={a.key}
                data-testid={`work-action-${a.key}-disabled`}
                className="flex flex-col gap-0.5 rounded-lg border border-dashed border-ink-600 px-3 py-2 opacity-70"
              >
                <span className="text-sm font-medium text-text-secondary">{t(`action.${a.key}`)}</span>
                {a.reasonKey && (
                  <span className="text-[11px] leading-relaxed text-text-muted">{t(`reason.${a.reasonKey}`)}</span>
                )}
              </li>
            ),
          )}
        </ul>
      </section>
    </section>
  );
}