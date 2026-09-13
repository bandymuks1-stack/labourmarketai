import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { ChecksList } from "@/components/app/work-in-numbers/checks-list";
import { CoverageNote } from "@/components/app/work-in-numbers/coverage-note";
import { DominantLead } from "@/components/app/work-in-numbers/dominant-lead";
import { GrowthKinds, type GrowthSkillDirection } from "@/components/app/work-in-numbers/growth-kinds";
import { HoursRemainder } from "@/components/app/work-in-numbers/hours-remainder";
import { OrgLedger } from "@/components/app/work-in-numbers/org-ledger";
import { PeriodNav, scopeText } from "@/components/app/work-in-numbers/period-nav";
import { SkillShareList } from "@/components/app/work-in-numbers/skill-share-list";
import { TelemetryView } from "@/components/app/telemetry-view";
import { Link } from "@/lib/i18n/navigation";
import { deriveAttributionExpectation } from "@/lib/journal/attribution-expectation";
import { deriveGrowthReading } from "@/lib/journal/growth-reading";
import { readOwnOccupationPath } from "@/lib/journal/journal-occupation-path";
import {
  dominantAnswer,
  focusPeriod,
  orgLedger,
  skillRows,
} from "@/lib/journal/work-in-numbers-view";
import {
  normalizeWorkRange,
  WORK_PERIOD_KEYS,
  type WorkPeriodKey,
} from "@/lib/journal/work-intelligence";
import {
  loadOwnPrimaryProfessionSlug,
  loadOwnWorkIntelligence,
} from "@/lib/journal/work-intelligence-read";
import { createClient } from "@/lib/supabase/server";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { formatUtcDate } from "@/lib/time/display";

/**
 * MANO VEIKLA SKAIČIAIS — the Work-in-Numbers station (target worker IA
 * 2026-09-13 §2; issue #1689 / #1724). Worker-only, server-rendered.
 *
 * Answers, first and above the fold on a phone, "Kokie įgūdžiai užima
 * didžiausią mano veiklos dalį?" — then, in this order: the period
 * selector (real links, the scope named in words beside every figure), what
 * the reads covered, the share bars per skill, the hours no skill can claim
 * and where every hour came from, the organization's own ledger BESIDE the
 * journal (never summed), the plausibility checks with the one
 * acknowledgement flow, and the growth kinds with their WHY in figures.
 *
 * Every figure comes from `loadOwnWorkIntelligence` — the same reader the
 * conversation and the Living CV answer from. A reader that returns null is
 * UNKNOWN: the station says it could not read and shows no zero (SEP-7).
 * Nothing is filtered on the client (§T); a `?period=` or `?from&to`
 * changes the server read.
 */

const MAX_STATION_SKILLS = 12;
const MAX_STATION_KINDS = 8;
const MAX_STATION_DIRECTIONS = 3;

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

export default async function WorkInNumbersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) {
  const { locale } = await params;
  const sp = (await searchParams) ?? {};
  setRequestLocale(locale);

  const periodKey: WorkPeriodKey =
    typeof sp.period === "string" &&
    (WORK_PERIOD_KEYS as readonly string[]).includes(sp.period)
      ? (sp.period as WorkPeriodKey)
      : "all";
  // An explicit window (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) becomes the
  // model's `range` row; a malformed one is refused by the model, never
  // repaired into a window nobody asked for.
  const focusRange =
    typeof sp.from === "string" && typeof sp.to === "string" && DAY_RX.test(sp.from) && DAY_RX.test(sp.to)
      ? normalizeWorkRange({ startIso: sp.from, endIso: sp.to })
      : null;

  const t = await getTranslations("journal.intelligence");
  const tTier = await getTranslations("evidenceTier");
  const tSkillName = await getTranslations("skillNames");
  const tProf = await getTranslations("professions");
  const tUnit = await getTranslations("productivityUnits");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) redirect(`/${locale}/dashboard`);

  const [wi, primaryProfessionSlug, ownPath] = await Promise.all([
    loadOwnWorkIntelligence({ focus: periodKey, focusRange }),
    loadOwnPrimaryProfessionSlug(),
    readOwnOccupationPath(supabase, worker.id).catch(() => null),
  ]);

  const safeName = (tx: (k: string) => string, ns: string) => (slug: string): string | null => {
    try {
      const v = tx(slug);
      return v && v !== slug && v !== `${ns}.${slug}` ? v : null;
    } catch {
      return null;
    }
  };
  const skillNameOf = safeName(tSkillName, "skillNames");
  const professionNameOf = safeName(tProf, "professions");
  const unitNameOf = safeName(tUnit, "productivityUnits");
  const dayLabel = (iso: string | null) =>
    iso ? (formatUtcDate(iso, locale, { month: "short", day: "numeric" }) ?? iso) : null;
  const periodHref = (key: WorkPeriodKey) => `/dashboard/journal/numbers?period=${key}`;
  const rangeHref = focusRange
    ? `/dashboard/journal/numbers?from=${focusRange.startIso}&to=${focusRange.endIso}`
    : undefined;

  // ── every row below is READ from the one model; nothing re-derived ──────
  const rowsAll = wi ? skillRows(wi, skillNameOf).filter((r) => r.name !== null) : [];
  const rows = rowsAll.slice(0, MAX_STATION_SKILLS);
  const answer = dominantAnswer(wi, rowsAll);
  const period = wi ? focusPeriod(wi) : null;
  const scope = wi ? scopeText(wi, locale, t) : t("numbers.scope.all");
  const attribution = wi ? deriveAttributionExpectation(ownPath?.iscoGroups ?? [], wi) : null;
  const growth = wi ? deriveGrowthReading(wi, { primaryProfessionSlug }) : null;
  const kindsAll = (growth?.directions ?? [])
    .filter((d): d is GrowthSkillDirection => d.kind !== "adjacent_opportunity")
    .map((d) => ({ ...d, name: skillNameOf(d.slug) }))
    .filter((d): d is typeof d & { name: string } => d.name !== null);
  const kinds = kindsAll.slice(0, MAX_STATION_KINDS);
  const directionsAll = (growth?.expand ?? [])
    .map((d) => ({
      professionId: d.professionId,
      name: professionNameOf(d.professionId),
      sharedCount: d.sharedCount,
      total: skillsForProfession(d.professionId).length,
      missingNames: d.missingSkills
        .map((s) => skillNameOf(s))
        .filter((n): n is string => n !== null)
        .slice(0, 3),
    }))
    .filter((d): d is typeof d & { name: string } => d.name !== null);
  const directions = directionsAll.slice(0, MAX_STATION_DIRECTIONS);
  const capLine = (kind: string, shown: number, total: number) =>
    total > shown ? (
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid={`wi-cap-${kind}`}
        data-shown={shown}
        data-total={total}
      >
        {t("listCap", { shown, total })}
      </p>
    ) : null;

  return (
    <div
      className="flex flex-col gap-5"
      data-testid="work-in-numbers"
      data-state={answer.kind}
      data-period={wi?.scope ?? periodKey}
    >
      <TelemetryView
        event={FUNNEL_EVENTS.journalViewed}
        metadata={{ surface: "journal", step: "numbers" }}
      />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-title font-bold tracking-tightest text-text-primary sm:text-title-lg">
          {t("numbers.stationTitle")}
        </h1>
        <p className="text-support leading-relaxed text-text-secondary">
          {t("numbers.stationSubtitle")}
        </p>
      </header>

      {/* 1 · THE ANSWER — one sentence, the scope in the same breath, the
          period's hours under it; the period selector right after so the
          person can change the window without leaving the answer */}
      <section aria-labelledby="wi-question" data-testid="wi-lead">
        <Card compact className="flex flex-col gap-4">
          <h2 id="wi-question" className="font-mono text-meta uppercase tracking-label text-text-secondary">
            {t("numbers.question")}
          </h2>
          <DominantLead answer={answer} period={period} scope={scope} locale={locale} t={t} />
          {wi ? (
            <>
              <PeriodNav wi={wi} locale={locale} t={t} href={periodHref} rangeHref={rangeHref} />
              <p className="text-meta leading-relaxed text-text-muted" data-testid="wi-scope-note">
                {t("numbers.scopeNote", { scope })}
              </p>
              <CoverageNote coverage={wi.coverage} t={t} />
            </>
          ) : null}
        </Card>
      </section>

      {wi && period && answer.kind !== "no_entries" ? (
        <>
          {/* 2 · the share bars — every skill the entries back, share desc */}
          <Card compact className="flex flex-col gap-4">
            <SkillShareList
              rows={rows}
              attributedHours={wi.attributedHours}
              periodHours={period.hours}
              periodWord={scope}
              locale={locale}
              t={t}
              tTier={tTier}
              linkHref={(slug) => `/dashboard/journal?skill=${slug}#journal-entries`}
              unitName={unitNameOf}
              dayLabel={dayLabel}
              attributionNote={attribution}
              capNote={capLine("skills", rows.length, rowsAll.length)}
              title={t("numbers.skillsTitle")}
            />
            {/* 3 · what no skill can claim, and where every hour came from */}
            <HoursRemainder wi={wi} period={period} locale={locale} t={t} />
          </Card>

          {/* 4 · the organization's ledger — beside, never summed */}
          <OrgLedger view={orgLedger(wi)} periodWord={scope} locale={locale} t={t} />

          {/* 5 · plausibility checks with the ONE acknowledgement flow */}
          {wi.checks.length > 0 ? (
            <Card compact>
              <ChecksList checks={wi.checks} locale={locale} t={t} unitName={unitNameOf} dayLabel={dayLabel} />
            </Card>
          ) : null}

          {/* 6 · growth kinds with their WHY — a reading, said to be one */}
          {growth && (kinds.length > 0 || directions.length > 0) ? (
            <Card compact className="flex flex-col gap-3" data-testid="wi-growth-station">
              <div className="flex flex-col gap-1" data-kind={growth.kind} data-limitation={growth.limitation}>
                <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {t("growthTitle")}
                </h2>
                <p className="text-meta leading-relaxed text-text-muted">{t("growthDerivedHint")}</p>
              </div>
              <GrowthKinds
                kinds={kinds}
                directions={directions}
                locale={locale}
                t={t}
                dayLabel={dayLabel}
                kindsCap={capLine("kinds", kinds.length, kindsAll.length)}
                directionsCap={capLine("directions", directions.length, directionsAll.length)}
              />
            </Card>
          ) : null}

          {/* 7 · what the figures feed — the person's own consequence */}
          <p
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-muted"
            data-testid="wi-consequence"
          >
            <span>{t("feedsCv")}</span>
            <Link href="/cv" className="inline-flex min-h-11 items-center font-medium text-brand-blue hover:underline" data-testid="wi-cv-link">
              {t("openCv")} →
            </Link>
            <Link
              href={"/dashboard/opportunities" as "/dashboard"}
              className="inline-flex min-h-11 items-center font-medium text-brand-blue hover:underline"
              data-testid="wi-opportunities-link"
            >
              {t("openOpportunities")} →
            </Link>
          </p>
        </>
      ) : null}

      <Link
        href="/dashboard/journal"
        className="inline-flex min-h-11 items-center self-start text-support font-medium text-brand-blue underline-offset-4 hover:underline"
        data-testid="wi-back-to-journal"
      >
        ← {t("numbers.backToJournal")}
      </Link>
    </div>
  );
}
