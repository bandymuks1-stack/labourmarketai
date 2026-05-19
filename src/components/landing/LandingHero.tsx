/**
 * LandingHero — cinematic first impression.
 *
 * Frames the labour market as one connected visual system and reuses the
 * canonical player cards (no bespoke hero card art) so the hero shows the
 * real product primitive, not a mockup.
 */
import { CompanyPlayerCard } from "@/components/company/CompanyPlayerCard";
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { CtaButton } from "@/components/ui/CtaButton";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { landingCtas, site } from "@/config/site";
import { sampleCompanies, sampleProfiles } from "@/lib/sample-data";

export function LandingHero() {
  return (
    <section className="relative px-6 pb-24 pt-16 sm:pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div className="rise">
          <Eyebrow>People · Companies · Roles · Matching</Eyebrow>

          <h1 className="display mt-6 text-5xl sm:text-6xl xl:text-7xl">
            The labour market,
            <br />
            <span className="grad-text">as a living system.</span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-fg-dim">
            {site.name} turns every worker, company and role into one
            connected board. Each participant is a single{" "}
            <span className="text-fg">player card</span> — the same card moves
            through discovery, matching and hiring. No scattered profiles, no
            duplicate flows.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            {landingCtas.map((cta) => (
              <CtaButton key={cta.href} href={cta.href} kind={cta.kind}>
                {cta.label}
              </CtaButton>
            ))}
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
            {[
              { k: "One", v: "profile per person" },
              { k: "One", v: "card system, reused" },
              { k: "Zero", v: "gatekeeping queues" },
            ].map((s) => (
              <div key={s.v}>
                <dt className="text-2xl font-bold grad-text">{s.k}</dt>
                <dd className="mt-1 text-xs leading-snug text-fg-mute">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-10 -z-10 rounded-full bg-cyan/10 blur-3xl"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rise sm:mt-10" style={{ animationDelay: "0.05s" }}>
              <ProfilePlayerCard profile={sampleProfiles[0]} />
            </div>
            <div className="rise" style={{ animationDelay: "0.15s" }}>
              <CompanyPlayerCard company={sampleCompanies[0]} />
            </div>
          </div>
          <p className="mt-4 text-center text-[0.7rem] uppercase tracking-[0.2em] text-fg-mute">
            The same card · everywhere · for everyone
          </p>
        </div>
      </div>
    </section>
  );
}
