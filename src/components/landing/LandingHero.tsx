/**
 * LandingHero — the opening scene of the work-market arena.
 *
 * Premium scouting / draft framing: a real work profile staged like a scouted
 * candidate card. It reuses the shared ProfilePlayerCard and StatusChip
 * components — no bespoke card art, no duplicate logic. All signals shown are
 * real attributes of the example profile, never invented market numbers.
 */
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { CtaButton } from "@/components/ui/CtaButton";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StatusChip } from "@/components/ui/StatusChip";
import { landingCtas } from "@/config/site";
import { profileToPlayerCard } from "@/lib/player-card";
import { sampleProfiles } from "@/lib/sample-data";

const VALUE_POINTS = [
  "Build one work profile",
  "Get scouted by companies",
  "See the fit, act fast",
];

export function LandingHero() {
  const candidate = sampleProfiles[0];
  const card = profileToPlayerCard(candidate);
  const tierLabel = card.tier[0].toUpperCase() + card.tier.slice(1);

  return (
    <section className="relative px-6 pb-16 pt-10">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left — what it is, why it matters */}
        <div className="rise">
          <Eyebrow>The work-market arena</Eyebrow>

          <h1 className="display mt-5 text-5xl sm:text-6xl xl:text-[4.25rem]">
            Real skills.
            <br />
            <span className="grad-text">Scouted</span> like talent.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-dim">
            labourmarket.ai turns your work profile into a card scouts read at
            a glance — your skills, your availability, your fit. Companies and
            agencies scout, compare and reach the right people. Workers get
            found for what they can actually do.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {landingCtas.map((cta) => (
              <CtaButton key={cta.href} href={cta.href} kind={cta.kind}>
                {cta.label}
              </CtaButton>
            ))}
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2">
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

        {/* Right — the scout board */}
        <div className="relative">
          <div aria-hidden className="spotlight" />

          {/* an example scout search, in a company's words */}
          <div
            aria-hidden
            className="mb-5 flex items-center gap-3 rounded-full border border-line/60 bg-fg/[0.03] px-4 py-2.5 text-sm"
          >
            <span className="text-fg-mute">⌕</span>
            <span className="text-fg-dim">
              welders · Rotterdam · available
            </span>
            <span className="ml-auto text-[0.7rem] uppercase tracking-wider text-fg-mute">
              scout search
            </span>
          </div>

          <div className="scout-frame mx-auto w-full max-w-sm p-4 sm:p-5">
            <div className="tier-bar mb-4" />
            <div
              className="rise rotate-[-2deg]"
              style={{ animationDelay: "0.08s" }}
            >
              <ProfilePlayerCard profile={candidate} />
            </div>

            <div className="signal-rail mt-5">
              <StatusChip tone="gold" dot>
                {tierLabel} tier
              </StatusChip>
              <StatusChip tone="positive" dot>
                Open to work
              </StatusChip>
              <StatusChip tone="info" dot>
                {candidate.experienceYears} yrs experience
              </StatusChip>
              <StatusChip tone="silver" dot>
                {candidate.verified ? "Verified" : "Unverified"}
              </StatusChip>
            </div>

            <p className="mt-4 text-center text-xs text-fg-mute">
              One work profile, read like a scouted card.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
