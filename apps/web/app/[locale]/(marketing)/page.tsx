import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Placeholder } from "@/components/ui/Placeholder";
import { Sparkline } from "@/components/ui/Sparkline";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";
import { DemoChip } from "@/components/app/demo-chip";
import { LiveClock } from "@/components/app/live-clock";
import { LiveMap } from "@/components/app/live-map";
import { LiveTicker } from "@/components/app/live-ticker";
import { MarketCounters } from "@/components/app/market-counters";
import { MicroActivityFeed } from "@/components/app/micro-activity-feed";
import { DraftBoard } from "@/components/marketing/draft-board";
import { MarketPulse } from "@/components/marketing/market-pulse";
import { PlayerCardShowcase } from "@/components/marketing/player-card-showcase";

// Deterministic sample series — governed as market.*.series placeholders
// (the caption under each carries the visible PLACEHOLDER marker).
const SPARK = {
  demand: [4, 6, 5, 8, 7, 11, 10, 14, 13, 17],
  workers: [9, 8, 10, 9, 12, 11, 13, 12, 14, 15],
  competition: [6, 7, 6, 9, 8, 7, 9, 8, 10, 9],
};

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("hero");
  const tr = await getTranslations("trusted");
  const sec = await getTranslations("secondary");
  const mk = await getTranslations("market");
  const tj = await getTranslations("journey");

  // Landing↔app journey band — the same stage rail the user meets inside the
  // cockpit after signup (visual continuity). Honest product explanation of the
  // real flow; no fake metrics, no fake matching (DEMO_TO_REAL_DATA_POLICY).
  const journeyStages = [tj("s1"), tj("s2"), tj("s3"), tj("s4")];

  const shortcuts = [
    "findWork",
    "myProjects",
    "timesheets",
    "documents",
    "certificates",
    "payslips",
  ] as const;

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="grid items-start gap-12 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-[11px] uppercase tracking-label text-text-secondary">
            <span className="live-dot" aria-hidden />
            {t("chip")}
          </p>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.04] tracking-tightest sm:text-7xl">
            {t("headline")}
            <br />
            <span className="text-gradient-accent">{t("headlineAccent")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
            {t("subcopy")}
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <Link href="/auth/signup">
              <Button>{t("ctaPrimary")} →</Button>
            </Link>
            <p className="text-xs text-text-muted">
              {t("businessNote")}{" "}
              <WaitlistModal
                trigger={t("businessLink")}
                source="hero_business_link"
              />
            </p>
          </div>

          <div className="mt-12">
            <MarketCounters />
            <div className="mt-6">
              <MicroActivityFeed />
            </div>
          </div>

          <div className="mt-12">
            <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
              {tr("title")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Placeholder key={i} id={`partners.logo.${i + 1}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Hero right — live mission-control map (5b.2) */}
        <div className="relative">
          <div className="relative mb-5 flex items-start justify-between gap-4">
            <DemoChip />
            <LiveClock />
          </div>
          <LiveMap />
        </div>
      </section>

      {/* ── Live ticker (full-width hero strip) ──────────────────────── */}
      <div className="mt-10">
        <LiveTicker />
      </div>

      {/* ── Journey band — same action rail as the in-app cockpit ─────── */}
      <section className="mt-16">
        <div className="card-border wow-card p-6 sm:p-10">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
            <span className="live-dot" aria-hidden />
            {tj("eyebrow")}
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
            {tj("title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {tj("subcopy")}
          </p>

          <ol className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0">
            {journeyStages.map((label, i) => (
              <li
                key={label}
                className="flex flex-1 items-center gap-3 sm:flex-col sm:items-center sm:gap-0"
              >
                <div className="flex items-center gap-3 sm:w-full sm:gap-0">
                  <span
                    className={`hidden h-0.5 flex-1 rounded-full sm:block ${i === 0 ? "bg-transparent" : "stage-line"}`}
                  />
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold ${
                      i === 0
                        ? "stage-current border-brand-orange bg-brand-orange/15 text-brand-orange"
                        : "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`hidden h-0.5 flex-1 rounded-full sm:block ${i === journeyStages.length - 1 ? "bg-transparent" : "stage-line"}`}
                  />
                </div>
                <span className="font-display text-sm font-semibold text-text-primary sm:mt-2 sm:text-center">
                  {label}
                </span>
              </li>
            ))}
          </ol>

          <Link href="/auth/signup" className="mt-8 inline-block">
            <Button>{t("ctaPrimary")} →</Button>
          </Link>
        </div>
      </section>

      {/* ── Player card showcase (5b.3) ──────────────────────────────── */}
      <PlayerCardShowcase />

      {/* ── Draft Board (5b.4) ───────────────────────────────────────── */}
      <DraftBoard />

      {/* ── Market Pulse (5b.4) ──────────────────────────────────────── */}
      <MarketPulse />

      {/* ── Second row ───────────────────────────────────────────────── */}
      <section className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Card label={sec("team.label")}>
          <p className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            <Placeholder id="team.onsite.count" />
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-label text-text-muted">
            {sec("team.onSite")}
          </p>
          <p className="mt-4 text-sm text-text-secondary">
            <Placeholder id="team.onsite.roles" />
          </p>
        </Card>

        <Card label={sec("comm.label")}>
          <ul className="flex flex-col gap-3 text-sm text-text-secondary">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <Placeholder id={`comm.thread.${n}`} />
              </li>
            ))}
          </ul>
        </Card>

        <Card label={sec("companies.label")}>
          <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {sec("companies.main")}
          </p>
          <p className="mt-1 text-sm text-text-primary">
            <Placeholder id="companies.main_contractor" />
          </p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-label text-text-muted">
            {sec("companies.subs")}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm text-text-secondary">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <Placeholder id={`companies.subcontractor.${n}`} />
              </li>
            ))}
          </ul>
        </Card>

        <Card label={sec("shortcuts.label")}>
          <div className="grid grid-cols-2 gap-2">
            {shortcuts.map((k) => (
              <span
                key={k}
                className="rounded-md border border-ink-500 px-3 py-2 text-xs text-text-secondary"
              >
                {sec(`shortcuts.${k}`)}
              </span>
            ))}
          </div>
        </Card>
      </section>

      {/* ── Market intelligence ──────────────────────────────────────── */}
      <section className="mt-16">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {mk("label")}
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-4">
          {(["demand", "workers", "competition"] as const).map((k) => (
            <Card key={k}>
              <p className="text-sm text-text-secondary">{mk(k)}</p>
              <div className="mt-3">
                <Sparkline points={SPARK[k]} className="h-10 w-full" />
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
                <Placeholder id={`market.${k}.series`} />
              </p>
            </Card>
          ))}
          <Card>
            <p className="text-sm text-text-secondary">{mk("topSkills")}</p>
            <p className="mt-3 text-sm leading-relaxed text-text-primary">
              <Placeholder id="market.top_skills" />
            </p>
            <a
              href="#"
              className="mt-4 inline-block font-mono text-[11px] uppercase tracking-label text-brand-blue"
            >
              {mk("cta")} →
            </a>
          </Card>
        </div>
      </section>

      {/* ── Testimonial ──────────────────────────────────────────────── */}
      <section className="mt-16">
        <blockquote className="mx-auto max-w-3xl text-center font-display text-xl font-medium leading-relaxed text-text-secondary">
          “<Placeholder id="testimonial.featured" />”
        </blockquote>
      </section>
    </div>
  );
}
