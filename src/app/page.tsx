import Link from "next/link";
import { LandingHero } from "@/components/landing/LandingHero";
import { MatchResult } from "@/components/matches/MatchResult";
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { CtaButton } from "@/components/ui/CtaButton";
import { Wordmark } from "@/components/ui/Wordmark";
import { scoreMatch } from "@/lib/matching";
import { sampleHiringNeeds, sampleProfiles } from "@/lib/sample-data";

const JOURNEY = [
  {
    n: "01",
    t: "Create your work profile",
    d: "Your skills, experience and availability — honest and quick to set up.",
  },
  {
    n: "02",
    t: "Become visible to companies",
    d: "Companies find you while they search for the people they need.",
  },
  {
    n: "03",
    t: "Compare fit clearly",
    d: "See how strongly you match each role, side by side, at a glance.",
  },
  {
    n: "04",
    t: "Contact the right people faster",
    d: "Start the conversation that actually leads to work.",
  },
];

const WORKER_POINTS = [
  "Create your work profile",
  "Show your skills",
  "Become visible to companies",
  "Find work opportunities that fit",
];

const COMPANY_POINTS = [
  "Find suitable workers",
  "Compare fit clearly",
  "Contact the right people faster",
];

export default function Home() {
  const match = scoreMatch(sampleHiringNeeds[0], sampleProfiles[0]);

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

      {/* Journey — profile → visibility → match → contact */}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="display mt-3 text-3xl sm:text-4xl">
              From your profile to the{" "}
              <span className="grad-text">right conversation</span>
            </h2>
          </div>
          <p className="max-w-sm text-sm text-fg-dim">
            Four clear steps. No noise, no guessing — just the path from
            showing your skills to getting hired.
          </p>
        </div>

        <div className="mt-9 h-px w-full bg-line/70" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map((step, i) => (
            <div
              key={step.n}
              className="glass glass-hover relative p-6"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="text-3xl font-bold grad-text">{step.n}</span>
              {i < JOURNEY.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute right-5 top-7 hidden text-fg-mute lg:block"
                >
                  →
                </span>
              ) : null}
              <h3 className="mt-4 text-lg font-semibold">{step.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                {step.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Built for both sides */}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="text-center">
          <p className="eyebrow">For workers and companies</p>
          <h2 className="display mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl">
            Built for both sides of the{" "}
            <span className="grad-text">work market</span>
          </h2>
        </div>

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-2">
          {/* Workers */}
          <div className="glass flex flex-col gap-7 p-7 sm:flex-row">
            <div className="w-full max-w-[18rem] shrink-0">
              <p className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                How a worker shows up to companies
              </p>
              <ProfilePlayerCard profile={sampleProfiles[0]} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold">If you do the work</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                Put your real skills in front of companies that are hiring —
                and let them come to you.
              </p>
              <ul className="mt-5 space-y-2.5">
                {WORKER_POINTS.map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-2.5 text-sm text-fg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
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

          {/* Companies */}
          <div className="glass flex flex-col gap-7 p-7 sm:flex-row">
            <div className="w-full max-w-[18rem] shrink-0">
              <p className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                How you compare who fits
              </p>
              <MatchResult profile={sampleProfiles[0]} match={match} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold">If you are hiring</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                Search for the people you need, see how well each one fits, and
                reach the right ones first.
              </p>
              <ul className="mt-5 space-y-2.5">
                {COMPANY_POINTS.map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-2.5 text-sm text-fg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-violet" />
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

      {/* Emotional close */}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="glass relative overflow-hidden p-10 text-center sm:p-14">
          <div aria-hidden className="grad-soft absolute inset-0 -z-10" />
          <h2 className="display mx-auto max-w-3xl text-4xl sm:text-5xl">
            Your next job — or your next{" "}
            <span className="grad-text">great hire</span> — starts now.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-fg-dim">
            Show your skills, get discovered, and reach the right people
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
