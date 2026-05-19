/**
 * LandingHero — the opening scene.
 *
 * Human, work-market framing: a worker getting discovered by companies that
 * are searching right now. It reuses the real worker card (no bespoke card
 * art, no duplicate logic) but wraps it in a scouting scene so it reads as a
 * person and an opportunity, not a UI object.
 */
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { CtaButton } from "@/components/ui/CtaButton";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { landingCtas } from "@/config/site";
import { sampleProfiles } from "@/lib/sample-data";

const SCOUTS = ["NF", "PL", "AX", "RV"];

const VALUE_POINTS = [
  "Show your real skills",
  "Get discovered by companies",
  "Find work that actually fits",
];

export function LandingHero() {
  return (
    <section className="relative px-6 pb-16 pt-10">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left — the human promise */}
        <div className="rise">
          <Eyebrow>For workers and companies</Eyebrow>

          <h1 className="display mt-5 text-5xl sm:text-6xl xl:text-[4.25rem]">
            Show what you can do.
            <br />
            <span className="grad-text">Get found by companies</span> hiring
            now.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-dim">
            Create your work profile in minutes, put your real skills front and
            center, and become visible to companies actively searching. Hiring?
            Find suitable workers, see who fits, and contact the right people
            faster.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {landingCtas.map((cta) => (
              <CtaButton key={cta.href} href={cta.href} kind={cta.kind}>
                {cta.label}
              </CtaButton>
            ))}
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {VALUE_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 text-sm text-fg-dim"
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-cyan/15 text-[0.6rem] text-cyan">
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Right — the scouting scene */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-12 -z-10 rounded-full bg-cyan/10 blur-3xl"
          />

          {/* live search, in the companies' words */}
          <div
            aria-hidden
            className="mb-5 flex items-center gap-3 rounded-full border border-line/60 bg-fg/[0.03] px-4 py-2.5 text-sm"
          >
            <span className="text-fg-mute">⌕</span>
            <span className="text-fg-dim">
              welders · Rotterdam · available now
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wider text-cyan">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
              searching
            </span>
          </div>

          <div className="relative mx-auto w-full max-w-sm rise" style={{ animationDelay: "0.08s" }}>
            {/* floating, human signals around the person */}
            <div
              aria-hidden
              className="absolute -right-3 -top-3 z-30 rounded-full border border-cyan/40 bg-ink-2/90 px-3 py-1.5 text-xs font-medium text-fg shadow-[0_10px_30px_-12px_rgba(75,227,255,0.6)]"
            >
              👁 Viewed by 4 companies
            </div>
            <div
              aria-hidden
              className="absolute -bottom-3 -left-3 z-30 rounded-full border border-emerald/30 bg-ink-2/90 px-3 py-1.5 text-xs font-medium text-fg"
            >
              Open to work · replies fast
            </div>

            <div className="rotate-[-2deg]">
              <ProfilePlayerCard profile={sampleProfiles[0]} />
            </div>
          </div>

          {/* who is looking, right now */}
          <div className="mt-7 flex items-center justify-center gap-3">
            <div className="flex -space-x-2">
              {SCOUTS.map((s, i) => (
                <span
                  key={s}
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-full border border-line bg-ink-2 text-[0.65rem] font-semibold text-fg-dim"
                  style={{ zIndex: SCOUTS.length - i }}
                >
                  {s}
                </span>
              ))}
            </div>
            <span className="text-xs text-fg-mute">
              Companies scouting talent right now
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
