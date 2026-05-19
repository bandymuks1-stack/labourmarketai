/**
 * LandingHero — an emotional product reveal.
 *
 * Sells the feeling first: one connected labour market, made visible. Short
 * copy, one dominant scene. It reuses the shared SystemScene (which reuses the
 * shared ProfilePlayerCard / StatusChip) — no second profile or card concept,
 * no job-board reduction, no invented numbers.
 */
import Link from "next/link";
import { SystemScene } from "@/components/landing/SystemScene";

export function LandingHero() {
  return (
    <section className="relative px-5 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center rise">
          <span className="eyebrow">One living labour market</span>

          <h1 className="display mt-5 text-[2.5rem] leading-[1.03] sm:text-6xl lg:text-7xl">
            The labour market,
            <br />
            <span className="grad-text">finally visible.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-fg-dim sm:text-lg">
            One profile — your work, proof, teams and the companies that need
            them — connected into one market.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
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
        </div>

        <div
          className="mt-12 rise sm:mt-16"
          style={{ animationDelay: "0.12s" }}
        >
          <SystemScene />
        </div>
      </div>
    </section>
  );
}
