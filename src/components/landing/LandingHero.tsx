/**
 * LandingHero — the opening of the labour-market operating layer.
 *
 * Restores the completeness idea: one profile that carries CV, work evidence,
 * skills, proof, availability, team, projects and conversations into one
 * connected market. It reuses the shared SystemScene (which itself reuses the
 * shared ProfilePlayerCard / StatusChip) — no second profile or card concept,
 * no job-board reduction, no invented numbers.
 */
import Link from "next/link";
import { SystemScene } from "@/components/landing/SystemScene";
import { Eyebrow } from "@/components/ui/Eyebrow";

const FACETS = [
  "CV",
  "Work journal",
  "Skills",
  "Proof",
  "Availability",
  "Team",
  "Projects",
  "Communication",
  "Opportunities",
];

export function LandingHero() {
  return (
    <section className="relative px-5 pb-14 pt-6 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl rise">
          <Eyebrow>One profile · one connected market</Eyebrow>

          <h1 className="display mt-5 text-[2.6rem] leading-[1.02] sm:text-5xl lg:text-6xl">
            The labour market,
            <br />
            <span className="grad-text">finally visible.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-fg-dim sm:text-lg">
            Your CV, work journal, skills, proof, availability, team, projects
            and conversations — held in one profile and connected into one
            living market. Not a job board. Not generic HR software. The layer
            where work, people and companies actually meet.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="cta cta-primary w-full sm:w-auto"
            >
              Create your profile
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/app/discover"
              className="cta cta-ghost w-full sm:w-auto"
            >
              Explore the market
            </Link>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-3 gap-y-2">
            {FACETS.map((f) => (
              <li
                key={f}
                className="rounded-full border border-line/60 bg-fg/[0.03] px-2.5 py-1 text-[0.72rem] text-fg-mute"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="mt-10 rise sm:mt-12"
          style={{ animationDelay: "0.1s" }}
        >
          <SystemScene />
        </div>
      </div>
    </section>
  );
}
