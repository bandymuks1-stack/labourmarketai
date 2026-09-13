import { getTranslations } from "next-intl/server";

import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import type { GrowthDirection } from "@/lib/journal/growth-reading";
import {
  deriveTodayGrowth,
  deriveTodayOpenItems,
  deriveTodayWork,
  type TodayOpenItem,
} from "@/lib/today/today-model";
import { TODAY_STATIONS, type TodayStationId } from "@/lib/today/today-route";
import { loadTodayGrowth, loadTodayWorkIntelligence } from "@/lib/today/today-server";

const stationHref = (id: TodayStationId): string =>
  TODAY_STATIONS.find((s) => s.id === id)!.href;

/**
 * ŠIANDIEN · today's recorded work, open items, one growth sentence.
 *
 * ONE journal read (`loadTodayWorkIntelligence`, request-cached) feeds all
 * three; the growth reading is derived over the same model. Copy for the
 * plausibility checks is the journal's own (`journal.intelligence.checks`),
 * so a check reads the same here and on the journal page — one truth.
 *
 * UNKNOWN ≠ ZERO: a null read renders "could not read", with the journal
 * link still offered; an EMPTY day renders "nothing recorded today".
 * "Tuščia = tvarkinga" (design system §A.8): with no open item the open
 * block is simply absent.
 */
export async function TodayWorkSection({ locale }: { locale: ActiveLocale }) {
  const [t, tJournal, tUnits, tSkill, tProf, wi, growth] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("journal.intelligence"),
    getTranslations("productivityUnits"),
    getTranslations("skillNames"),
    getTranslations("professions"),
    loadTodayWorkIntelligence(),
    loadTodayGrowth(),
  ]);
  const fmtHours = (h: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const fmtPct = (share: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
  const skillName = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const professionName = (id: string) => (tProf.has(id) ? tProf(id) : id);
  const unitName = (slug: string) => (tUnits.has(slug) ? tUnits(slug) : slug);

  const work = deriveTodayWork(wi);
  const open = deriveTodayOpenItems(wi);
  const growthLine = deriveTodayGrowth(growth);

  const openItemText = (item: TodayOpenItem): string => {
    switch (item.kind) {
      case "untimed":
        return t("open.untimed", { n: item.entries });
      case "unlabelled":
        return t("open.unlabelled", { n: item.entries });
      case "check": {
        const c = item.check;
        return (
          tJournal(`checks.${c.code}`, {
            hours: fmtHours(c.hours),
            day: c.day,
            entries: c.entryIds.length,
            title: c.title ?? tJournal("checks.untitled"),
            ignored: c.ignored ? `${fmtHours(c.ignored.value)} ${unitName(c.ignored.unit)}` : "",
          }) +
          (c.organizationHours > 0
            ? ` ${tJournal("checks.organizationHours", { hours: fmtHours(c.organizationHours) })}`
            : "")
        );
      }
    }
  };

  const growthText = (d: GrowthDirection): string => {
    switch (d.kind) {
      case "core_strength":
        return t("growth.core_strength", {
          skill: skillName(d.slug),
          hours: fmtHours(d.why.attributedHours),
          percent: fmtPct(d.why.share),
        });
      case "growing":
        return t("growth.growing", { skill: skillName(d.slug), hours: fmtHours(d.why.attributedHours) });
      case "underused":
        return t("growth.underused", { skill: skillName(d.slug), days: d.why.dormantDays });
      case "self_stated":
        return t("growth.self_stated", { skill: skillName(d.slug) });
      case "adjacent_opportunity":
        return t("growth.adjacent_opportunity", {
          profession: professionName(d.professionId),
          shared: d.why.sharedCount,
          total: d.why.sharedSkills.length + d.why.missingSkills.length,
        });
    }
  };

  return (
    <>
      {/* TODAY · THIS WEEK — the model's own period figures. */}
      <section
        aria-labelledby="today-work-title"
        data-testid="today-work"
        data-state={work.kind}
        className="flex flex-col gap-2"
      >
        <h2 id="today-work-title" className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("work.title")}
        </h2>
        {work.kind === "known" ? (
          <>
            <p className="text-body text-text-primary" data-testid="today-work-today">
              {work.today.entries === 0
                ? t("work.none")
                : t("work.today", { hours: fmtHours(work.today.hours), entries: work.today.entries })}
            </p>
            {work.today.untimed > 0 && (
              <p className="text-support text-text-secondary" data-testid="today-work-untimed">
                {t("work.untimed", { n: work.today.untimed })}
              </p>
            )}
            <p className="text-support text-text-secondary" data-testid="today-work-week">
              {t("work.week", { hours: fmtHours(work.week.hours), entries: work.week.entries })}
            </p>
            {work.truncated && (
              <p className="text-meta text-text-muted" data-testid="today-work-truncated">
                {t("work.truncated")}
              </p>
            )}
          </>
        ) : (
          <p className="text-support text-text-secondary" data-testid="today-work-unknown">
            {t("work.unknown")}
          </p>
        )}
        <StationLink href="/dashboard/journal" testId="today-work-open">
          {t("stations.journal")}
        </StationLink>
      </section>

      {/* OPEN ITEMS — one line each, each a door to the journal. */}
      {open.kind === "known" && open.items.length > 0 && (
        <section
          aria-labelledby="today-open-title"
          data-testid="today-open"
          className="flex flex-col gap-2"
        >
          <h2 id="today-open-title" className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("open.title")}
          </h2>
          <ul className="flex flex-col">
            {open.items.map((item, i) => (
              <li key={item.kind === "check" ? item.check.key : `${item.kind}-${i}`}>
                <Link
                  href="/dashboard/journal"
                  data-testid={`today-open-${item.kind}`}
                  className="inline-flex min-h-11 items-center text-support text-text-primary underline-offset-4 hover:text-brand-blue hover:underline"
                >
                  {openItemText(item)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open.kind === "unknown" && work.kind === "known" && (
        <p className="text-support text-text-secondary" data-testid="today-open-unknown">
          {t("open.unknown")}
        </p>
      )}

      {/* ONE GROWTH SENTENCE — a reading of the person's own rows, said so. */}
      <section
        aria-labelledby="today-growth-title"
        data-testid="today-growth"
        data-state={growthLine.kind}
        className="flex flex-col gap-2"
      >
        <h2 id="today-growth-title" className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("growth.title")}
        </h2>
        {growthLine.kind === "direction" ? (
          <>
            <p className="text-body text-text-primary" data-kind={growthLine.direction.kind}>
              {growthText(growthLine.direction)}
            </p>
            <p className="text-meta text-text-muted">{t("growth.derived")}</p>
          </>
        ) : (
          <p className="text-support text-text-secondary">
            {growthLine.kind === "insufficient"
              ? t("growth.insufficient")
              : growthLine.kind === "none"
                ? t("growth.none")
                : t("growth.unknown")}
          </p>
        )}
        {/* "Mano veikla skaičiais" — the station lane F builds
            (`/dashboard/journal/numbers`); its address comes from the ONE
            station table so this file never spells a route of its own. */}
        <StationLink href={stationHref("numbers")} testId="today-growth-open">
          {t("stations.numbers")}
        </StationLink>
      </section>
    </>
  );
}

/** A secondary action is a text link, never a button (IA §5.1) — with the
 *  44 px tap floor kept. */
function StationLink({
  href,
  testId,
  children,
}: {
  href: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as "/dashboard"}
      data-testid={testId}
      className="inline-flex min-h-11 items-center self-start text-support font-medium text-brand-blue underline-offset-4 hover:underline"
    >
      {children} →
    </Link>
  );
}
