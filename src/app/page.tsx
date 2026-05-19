import Link from "next/link";
import { CompanyPlayerCard } from "@/components/company/CompanyPlayerCard";
import { LandingHero } from "@/components/landing/LandingHero";
import { ModuleTile } from "@/components/landing/ModuleTile";
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

const DISCONNECT = [
  "Your CV sits apart from the real work you have done",
  "Your work journal lives nowhere a company can see",
  "Conversations happen far from the decisions",
  "Skills are claimed, rarely proven",
  "Teams are invisible until it is too late",
  "Companies guess instead of seeing",
  "Projects float, disconnected from people",
];

const LAYERS = [
  { glyph: "◆", label: "One profile", hint: "Who you are, in one place" },
  { glyph: "▤", label: "One work-evidence layer", hint: "Proof, not claims" },
  { glyph: "⬡", label: "One team & project context", hint: "Where work happens" },
  { glyph: "◈", label: "One communication layer", hint: "Talk, close to the call" },
  { glyph: "▣", label: "One company & HR layer", hint: "Needs in context" },
  { glyph: "✦", label: "One opportunity layer", hint: "Fit, surfaced" },
];

const USES = [
  { glyph: "▤", label: "CV", hint: "Always current" },
  { glyph: "◆", label: "Public work identity", hint: "How the market sees you" },
  { glyph: "⬢", label: "Skill signal", hint: "Strength at a glance" },
  { glyph: "▰", label: "Work journal evidence", hint: "Real, journaled work" },
  { glyph: "✦", label: "Readiness", hint: "How prepared you are" },
  { glyph: "◈", label: "Availability", hint: "Open, engaged or not" },
  { glyph: "⬡", label: "Trust layer", hint: "Verified and earned" },
  { glyph: "◇", label: "Opportunity surface", hint: "Roles that fit you" },
  { glyph: "▣", label: "Team & company input", hint: "A decision companies can trust" },
];

const WORKER_SIDE = [
  "Show your value, not just a CV",
  "Prove skills with real work",
  "Keep your work history with you",
  "Signal readiness and availability",
  "Reach opportunities that fit",
];

const COMPANY_SIDE = [
  "See people, not paperwork",
  "Form teams and frame projects",
  "Communicate close to the decision",
  "Hold HR and customer needs in context",
  "Decide faster, with trust",
];

export default function Home() {
  const candidate = sampleProfiles[0];
  const company = sampleCompanies[0];
  const match = scoreMatch(sampleHiringNeeds[0], candidate);

  return (
    <div className="arena flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-fg-dim transition hover:text-fg"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="cta cta-primary cta-sm"
          >
            Create profile
          </Link>
        </nav>
      </header>

      <LandingHero />

      {/* WHY THIS EXISTS — the disconnect, then the connected layer */}
      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="eyebrow">Why this exists</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">
            Today the market is{" "}
            <span className="grad-text">disconnected.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-dim">
            Work, proof, people and decisions live in separate places.
            labourmarket.ai puts them on one connected layer.
          </p>
        </div>

        <div className="scout-frame relative mt-8 overflow-hidden">
          <div aria-hidden className="netglow" />
          <div className="grid lg:grid-cols-2">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-mute">
                The disconnect
              </p>
              <ul className="mt-4 space-y-3">
                {DISCONNECT.map((d) => (
                  <li
                    key={d}
                    className="flex items-start gap-3 text-sm text-fg-dim"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-mute"
                    />
                    {d}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-line/60 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-mute">
                  The labourmarket.ai layer
                </p>
                <span aria-hidden className="live-dot" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {LAYERS.map((l) => (
                  <ModuleTile
                    key={l.label}
                    glyph={l.glyph}
                    label={l.label}
                    hint={l.hint}
                    tone="info"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ONE PROFILE, MANY USES */}
      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="eyebrow">Profile integrity</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">
            One profile.{" "}
            <span className="grad-text">Many uses.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-dim">
            The same profile becomes everything the market needs to trust you
            — without you maintaining ten disconnected copies.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[360px_1fr]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">The one profile</span>
              <StatusChip tone="muted">Example</StatusChip>
            </div>
            <ProfilePlayerCard profile={candidate} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {USES.map((u) => (
              <ModuleTile
                key={u.label}
                glyph={u.glyph}
                label={u.label}
                hint={u.hint}
                tone="neutral"
              />
            ))}
          </div>
        </div>
      </section>

      {/* BOTH SIDES + MARKET LAYER, CONNECTED */}
      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
        <div className="text-center">
          <p className="eyebrow">One connected market</p>
          <h2 className="display mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl">
            Workers, companies and the market —{" "}
            <span className="grad-text">on one layer.</span>
          </h2>
        </div>

        <div className="scout-frame relative mt-10 overflow-hidden p-5 sm:p-7">
          <div aria-hidden className="netglow" />
          <div className="grid items-stretch gap-5 lg:grid-cols-3">
            <div className="flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  The worker
                </span>
                <StatusChip tone="muted">Example</StatusChip>
              </div>
              <ProfilePlayerCard profile={candidate} />
              <ul className="mt-4 space-y-2">
                {WORKER_SIDE.map((w) => (
                  <li
                    key={w}
                    className="flex items-center gap-2.5 text-sm text-fg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-signal-green" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  The market
                </span>
                <StatusChip tone="info" dot>
                  Fit in plain words
                </StatusChip>
              </div>
              <MatchResult profile={candidate} match={match} />
              <div className="mt-4 flex flex-wrap gap-1.5">
                <StatusChip tone="gold" dot>
                  Trust
                </StatusChip>
                <StatusChip tone="positive" dot>
                  Demand
                </StatusChip>
                <StatusChip tone="info" dot>
                  Signals
                </StatusChip>
                <StatusChip tone="muted">Status</StatusChip>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.18em] text-fg-mute">
                  The company
                </span>
                <StatusChip tone="muted">Example</StatusChip>
              </div>
              <CompanyPlayerCard company={company} />
              <ul className="mt-4 space-y-2">
                {COMPANY_SIDE.map((c) => (
                  <li
                    key={c}
                    className="flex items-center gap-2.5 text-sm text-fg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-signal-blue" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT TO DO NEXT */}
      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
        <div className="scout-frame relative overflow-hidden p-8 text-center sm:p-14">
          <div aria-hidden className="spotlight" />
          <h2 className="display mx-auto max-w-3xl text-3xl sm:text-5xl">
            Put your work on the{" "}
            <span className="grad-text">map.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-fg-dim sm:text-base">
            One profile, one connected market. Build it once and let the market
            see what you can really do.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <CtaButton href="/register">Create your profile</CtaButton>
            <CtaButton href="/app/discover" kind="ghost">
              Explore the market
            </CtaButton>
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
