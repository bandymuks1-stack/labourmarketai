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

const USES = [
  "A CV that stays current",
  "A skill signal companies can read",
  "Proof from real work",
  "A fit surface for the right roles",
];

export default function Home() {
  const candidate = sampleProfiles[0];
  const company = sampleCompanies[0];
  const match = scoreMatch(sampleHiringNeeds[0], candidate);

  return (
    <div className="arena flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line/40 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-fg-dim transition hover:text-fg"
            >
              Sign in
            </Link>
            <Link href="/register" className="cta cta-primary cta-sm">
              Create profile
            </Link>
          </nav>
        </div>
      </header>

      <LandingHero />

      {/* WORK IN PIECES → CONNECTED */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Why this matters</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">
            Work lives in pieces.{" "}
            <span className="grad-text">We connect it.</span>
          </h2>
        </div>

        <div className="stage scout-frame relative mt-10 grid items-center gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_auto_1fr]">
          <div aria-hidden className="netglow" />
          <div className="flex flex-wrap justify-center gap-2 opacity-50 lg:justify-end">
            {["CV", "Work history", "Proof", "Skills", "Availability"].map(
              (frag) => (
                <span
                  key={frag}
                  className="rounded-full border border-line/60 px-3 py-1.5 text-xs text-fg-mute"
                >
                  {frag}
                </span>
              ),
            )}
          </div>

          <div
            aria-hidden
            className="netline mx-auto h-px w-24 lg:h-16 lg:w-px lg:rotate-0"
          />

          <div className="mx-auto flex items-center gap-3 rounded-full border border-cyan/40 bg-ink-2/80 px-5 py-3 lg:mx-0">
            <span aria-hidden className="live-dot blue" />
            <span className="text-sm font-semibold">
              One connected market
            </span>
          </div>
        </div>
      </section>

      {/* ONE PROFILE, MANY USES */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[360px_1fr]">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">One profile</span>
              <StatusChip tone="muted">Example</StatusChip>
            </div>
            <ProfilePlayerCard profile={candidate} />
          </div>
          <div>
            <h2 className="display text-3xl sm:text-4xl">
              Build it once.{" "}
              <span className="grad-text">Useful everywhere.</span>
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-fg-dim">
              The same profile becomes what the market needs to trust you — no
              ten disconnected copies.
            </p>
            <ul className="mt-7 space-y-3">
              {USES.map((u) => (
                <li
                  key={u}
                  className="flex items-center gap-3 text-base text-fg"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full bg-accent-draft"
                  />
                  {u}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* WORKER · MARKET · COMPANY — ONE LAYER */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">One connected market</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">
            Workers, companies and the market —{" "}
            <span className="grad-text">one layer.</span>
          </h2>
        </div>

        <div className="stage scout-frame relative mt-10 overflow-hidden p-5 sm:p-8">
          <div aria-hidden className="netglow" />
          <div className="grid gap-5 lg:grid-cols-3">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  Worker
                </span>
                <StatusChip tone="positive" dot>
                  Open
                </StatusChip>
              </div>
              <ProfilePlayerCard profile={candidate} />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  Market
                </span>
                <StatusChip tone="info" dot>
                  Fit in plain words
                </StatusChip>
              </div>
              <MatchResult profile={candidate} match={match} />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  Company
                </span>
                <StatusChip tone="muted">Example</StatusChip>
              </div>
              <CompanyPlayerCard company={company} />
            </div>
          </div>
        </div>
      </section>

      {/* CLOSE */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="stage sweep scout-frame relative overflow-hidden p-10 text-center sm:p-16">
          <div aria-hidden className="halo" />
          <h2 className="display mx-auto max-w-3xl text-4xl sm:text-6xl">
            Put your work on the{" "}
            <span className="grad-text">map.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-sm text-fg-dim sm:text-base">
            One profile. One connected market. Built once, seen everywhere.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <CtaButton href="/register">Create your profile</CtaButton>
            <Link
              href="/app/discover"
              className="text-sm font-medium text-fg-dim transition hover:text-fg"
            >
              Explore the market <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6">
        <div className="divider mb-6" />
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-fg-mute">
          <Wordmark />
          <p>One profile. One connected market.</p>
        </div>
      </footer>
    </div>
  );
}
