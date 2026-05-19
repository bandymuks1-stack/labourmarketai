import Link from "next/link";
import { CompanyPlayerCard } from "@/components/company/CompanyPlayerCard";
import { LandingHero } from "@/components/landing/LandingHero";
import { MatchResult } from "@/components/matches/MatchResult";
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { CtaButton } from "@/components/ui/CtaButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { Wordmark } from "@/components/ui/Wordmark";
import { scoreMatch } from "@/lib/matching";
import {
  sampleCompanies,
  sampleHiringNeeds,
  sampleProfiles,
} from "@/lib/sample-data";

const WHAT = [
  {
    n: "01",
    t: "One work profile",
    d: "Your skills, experience and availability become a card a scout can read in seconds.",
  },
  {
    n: "02",
    t: "Real scouting",
    d: "Companies and agencies search the market, shortlist and draft — like a club building a squad.",
  },
  {
    n: "03",
    t: "Clear fit",
    d: "See how strongly a person matches a role, in plain words. No guessing, no buzzwords.",
  },
];

const SIGNALS = [
  { tone: "gold" as const, label: "Tier", meaning: "Profile strength at a glance" },
  { tone: "positive" as const, label: "Open", meaning: "Available and looking" },
  { tone: "info" as const, label: "Strong fit", meaning: "High match on a role" },
  { tone: "silver" as const, label: "Verified", meaning: "Identity confirmed" },
  { tone: "warn" as const, label: "Partial fit", meaning: "Some gaps to close" },
];

const WORKER_POINTS = [
  "Build one work profile",
  "Show your real skills",
  "Get scouted by companies",
  "Find work that actually fits",
];

const COMPANY_POINTS = [
  "Search the market like a scout",
  "Compare fit clearly",
  "Reach the right people first",
];

export default function Home() {
  const candidate = sampleProfiles[0];
  const company = sampleCompanies[0];
  const match = scoreMatch(sampleHiringNeeds[0], candidate);

  return (
    <div className="arena flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm text-fg-dim transition hover:text-fg"
          >
            Sign in
          </Link>
          <Link href="/register" className="cta cta-primary px-4 py-2 text-sm">
            Create your profile
          </Link>
        </nav>
      </header>

      <LandingHero />

      {/* WHAT IT IS */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl">
            <p className="eyebrow">What this is</p>
            <h2 className="display mt-3 text-3xl sm:text-4xl">
              Not generic HR software. A{" "}
              <span className="grad-text">scouting floor</span> for real work.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-fg-dim">
            labourmarket.ai works like a draft room: people are scouted for
            what they can do, and companies build the team they need.
          </p>
        </div>

        <div className="scout-frame mt-9 overflow-hidden">
          <div className="tier-bar" />
          <div className="grid gap-px sm:grid-cols-3">
            {WHAT.map((item) => (
              <div key={item.n} className="bg-arena/40 p-7">
                <span className="text-3xl font-bold grad-text">
                  {item.n}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{item.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                  {item.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY IT MATTERS / DOES IT FIT */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <p className="eyebrow">How a match happens</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">
            From a profile to the{" "}
            <span className="grad-text">right call.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-dim">
            See who someone is, why they stand out, whether they fit — then
            make the call. The same card carries the whole decision.
          </p>
        </div>

        <div className="mt-10 grid items-center gap-5 lg:grid-cols-[1fr_auto_1fr]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Who they are</span>
              <StatusChip tone="muted">Example profile</StatusChip>
            </div>
            <ProfilePlayerCard profile={candidate} />
          </div>

          <span
            aria-hidden
            className="mx-auto hidden text-2xl text-fg-mute lg:block"
          >
            →
          </span>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Does it fit</span>
              <StatusChip tone="info" dot>
                Plain-language fit
              </StatusChip>
            </div>
            <MatchResult profile={candidate} match={match} />
          </div>
        </div>

        <div className="scout-frame mt-8 p-6">
          <p className="text-sm font-semibold">What the signals mean</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {SIGNALS.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <StatusChip tone={s.tone} dot>
                  {s.label}
                </StatusChip>
                <span className="text-xs text-fg-mute">{s.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TWO SIDES */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="text-center">
          <p className="eyebrow">Both sides of the arena</p>
          <h2 className="display mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl">
            Workers get <span className="grad-text">scouted.</span> Companies
            build squads.
          </h2>
        </div>

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-2">
          <div className="glass flex flex-col gap-7 p-7 sm:flex-row">
            <div className="w-full max-w-[18rem] shrink-0">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  The worker
                </span>
                <StatusChip tone="muted">Example</StatusChip>
              </div>
              <ProfilePlayerCard profile={candidate} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold">If you do the work</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                One profile that works for you while you work — read like a
                scouted card, not a CV lost in a pile.
              </p>
              <ul className="mt-5 space-y-2.5">
                {WORKER_POINTS.map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-2.5 text-sm text-fg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-signal-green" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <CtaButton href="/register">
                  Create your work profile
                </CtaButton>
              </div>
            </div>
          </div>

          <div className="glass flex flex-col gap-7 p-7 sm:flex-row">
            <div className="w-full max-w-[18rem] shrink-0">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  The scout
                </span>
                <StatusChip tone="muted">Example</StatusChip>
              </div>
              <CompanyPlayerCard company={company} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold">If you scout and hire</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                Work like a club building a squad: search the market, read the
                fit, and reach the right people first.
              </p>
              <ul className="mt-5 space-y-2.5">
                {COMPANY_POINTS.map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-2.5 text-sm text-fg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-signal-blue" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <CtaButton href="/app/discover" kind="ghost">
                  Find suitable workers
                </CtaButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT TO DO NEXT */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="scout-frame relative overflow-hidden p-10 text-center sm:p-14">
          <div aria-hidden className="spotlight" />
          <h2 className="display mx-auto max-w-3xl text-4xl sm:text-5xl">
            Step into the <span className="grad-text">arena.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-fg-dim">
            Build your work profile, get scouted, and reach the right people
            faster. It takes minutes to start.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaButton href="/register">Create your work profile</CtaButton>
            <CtaButton href="/app/discover" kind="ghost">
              Find suitable workers
            </CtaButton>
            <CtaButton href="/app/matches" kind="ghost">
              Compare matches
            </CtaButton>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="divider mb-6" />
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-fg-mute">
          <Wordmark />
          <p>Find work. Find workers. Faster.</p>
        </div>
      </footer>
    </div>
  );
}
