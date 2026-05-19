import Link from "next/link";
import { LandingHero } from "@/components/landing/LandingHero";
import { CompanyPlayerCard } from "@/components/company/CompanyPlayerCard";
import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { MatchResult } from "@/components/matches/MatchResult";
import { CtaButton } from "@/components/ui/CtaButton";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Wordmark } from "@/components/ui/Wordmark";
import { site } from "@/config/site";
import { scoreMatch } from "@/lib/matching";
import {
  sampleCompanies,
  sampleHiringNeeds,
  sampleProfiles,
} from "@/lib/sample-data";

const PILLARS = [
  {
    k: "People",
    d: "One profile per person, projected into a player card with skills, signal and availability.",
  },
  {
    k: "Companies",
    d: "Companies carry the same card system — identity, signal and open needs in one frame.",
  },
  {
    k: "Roles",
    d: "Hiring needs are first-class. Seats, engagement and must-haves, anchored to a company.",
  },
  {
    k: "Matching",
    d: "Transparent, deterministic fit. Skill overlap, availability and location — no black box.",
  },
];

export default function Home() {
  const match = scoreMatch(sampleHiringNeeds[0], sampleProfiles[0]);

  return (
    <div className="arena flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm text-fg-dim transition hover:text-fg"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="cta cta-primary px-4 py-2 text-sm"
          >
            Create profile
          </Link>
        </nav>
      </header>

      <LandingHero />

      {/* The system */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="One connected system"
          title={
            <>
              Not a job board.
              <br />A <span className="grad-text">living market.</span>
            </>
          }
          lead="People, companies, roles and matching are the same fabric. The player card is the thread that runs through all of it."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <div
              key={p.k}
              className="glass glass-hover p-6"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="text-3xl font-bold grad-text">
                0{i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{p.k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                {p.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Same card, every context */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          align="center"
          eyebrow="One card · reused everywhere"
          title="The same player card carries the whole journey"
          lead="Discovery, matching and hiring all render the identical canonical card. Build it once, see it everywhere."
        />
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <div>
            <p className="mb-3 text-center text-[0.7rem] uppercase tracking-[0.2em] text-fg-mute">
              In discover
            </p>
            <DiscoverCard profile={sampleProfiles[1]} />
          </div>
          <div>
            <p className="mb-3 text-center text-[0.7rem] uppercase tracking-[0.2em] text-fg-mute">
              In matching
            </p>
            <MatchResult profile={sampleProfiles[0]} match={match} />
          </div>
          <div>
            <p className="mb-3 text-center text-[0.7rem] uppercase tracking-[0.2em] text-fg-mute">
              As a company
            </p>
            <CompanyPlayerCard company={sampleCompanies[0]} />
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="glass relative overflow-hidden p-10 text-center sm:p-16">
          <div
            aria-hidden
            className="grad-soft absolute inset-0 -z-10"
          />
          <h2 className="display mx-auto max-w-2xl text-4xl">
            Step onto the <span className="grad-text">draft floor.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-fg-dim">
            Build your profile, discover talent, and explore deterministic
            matches — all on one connected board.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaButton href="/register">Create profile</CtaButton>
            <CtaButton href="/app/discover" kind="ghost">
              Find workers
            </CtaButton>
            <CtaButton href="/app/matches" kind="ghost">
              Explore matches
            </CtaButton>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="divider mb-6" />
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-fg-mute">
          <Wordmark />
          <p>
            {site.name} — {site.tagline}. Foundation v1 · structure &amp;
            visual system.
          </p>
        </div>
      </footer>
    </div>
  );
}
