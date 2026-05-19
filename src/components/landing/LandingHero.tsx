/**
 * LandingHero — the premium labour-market reveal.
 *
 * Lean left column (headline / one line / CTA / honest capability strip) and
 * a dominant connected command surface on the right. Reuses the shared
 * SystemScene (which reuses the shared ProfilePlayerCard / StatusChip) — no
 * second profile or card concept, no job-board reduction, no invented numbers.
 */
import Link from "next/link";
import { SystemScene } from "@/components/landing/SystemScene";

const CAPABILITIES = ["Real work proof", "Live readiness", "Plain-language fit"];

export function LandingHero() {
  return (
    <section className="relative px-5 pb-14 pt-8 sm:px-6 sm:pt-12">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-fg/[0.03] px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-fg-mute">
            <span aria-hidden className="live-dot" />
            Labour-market operating layer
          </span>

          <h1 className="display mt-5 text-[2.6rem] leading-[1.02] sm:text-6xl xl:text-7xl">
            The labour market,
            <br />
            <span className="grad-text">alive.</span>
          </h1>

          <p className="mt-5 max-w-md text-base leading-relaxed text-fg-dim sm:text-lg">
            One profile. Work, teams, companies and opportunities — connected
            in one live layer.
          </p>
          <p className="mt-2 max-w-md text-sm text-fg-mute">
            Not a job board. Not generic HR software.
          </p>

          <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/register"
              className="cta cta-primary w-full sm:w-auto"
            >
              Create your profile
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/app/discover"
              className="text-sm font-medium text-fg-dim transition hover:text-fg"
            >
              Explore the market <span aria-hidden>→</span>
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {CAPABILITIES.map((c) => (
              <li
                key={c}
                className="flex items-center gap-2 text-xs text-fg-dim"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-signal-green"
                />
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="rise" style={{ animationDelay: "0.12s" }}>
          <SystemScene />
        </div>
      </div>
    </section>
  );
}
