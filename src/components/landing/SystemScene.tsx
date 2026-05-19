/**
 * SystemScene — the connected labour-market command surface.
 *
 * A composed product-world scene (not an equal-weight grid): one dominant
 * worker profile, a live project, and the connected team / communication /
 * company / market signals around it. Reuses the shared ProfilePlayerCard and
 * StatusChip — never a second profile / card / communication concept. Every
 * value is the example dataset shown as a clearly-labelled product preview;
 * no invented market numbers.
 */
import { ModuleTile } from "@/components/landing/ModuleTile";
import { ProjectCard } from "@/components/landing/ProjectCard";
import { TeamCluster } from "@/components/landing/TeamCluster";
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { profileToPlayerCard } from "@/lib/player-card";
import { sampleProfiles } from "@/lib/sample-data";

const PATH = ["Worker", "Project", "Team", "Company", "Market"];

export function SystemScene() {
  const candidate = sampleProfiles[0];
  const card = profileToPlayerCard(candidate);
  const tier = card.tier[0].toUpperCase() + card.tier.slice(1);

  return (
    <div className="stage sweep scene-grid scout-frame relative p-4 sm:p-6">
      <div aria-hidden className="halo" />
      <div aria-hidden className="netglow" />

      <div className="relative z-[2] mb-5 flex items-center justify-between gap-3">
        <span className="eyebrow">Connected labour market</span>
        <StatusChip tone="muted">Product preview · example</StatusChip>
      </div>

      <div className="relative z-[2] grid gap-4 lg:grid-cols-12">
        {/* dominant worker profile */}
        <div className="lg:col-span-5">
          <div className="core breathe overflow-hidden rounded-[var(--radius-xl)]">
            <ProfilePlayerCard profile={candidate} />
          </div>
          <div className="module mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-fg-mute">
                Profile readiness
              </span>
              <span className="tabular-nums text-fg-dim">
                {candidate.signalScore}/100
              </span>
            </div>
            <div className="mt-2 bar" aria-hidden>
              <i style={{ width: `${candidate.signalScore}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusChip tone="positive" dot>
                Open to work
              </StatusChip>
              <StatusChip tone="silver" dot>
                Verified
              </StatusChip>
              <StatusChip tone="gold" dot>
                {tier} tier
              </StatusChip>
            </div>
          </div>
        </div>

        {/* connected work + signals */}
        <div className="grid gap-4 lg:col-span-7 lg:content-start">
          <ProjectCard
            title="Renovation Works"
            place="Amsterdam · field crew"
            progress={70}
            state="On track"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TeamCluster />
            <ModuleTile
              glyph="◈"
              label="Communication"
              sub="One thread, in context"
              tone="neutral"
              status="Open"
            />
            <ModuleTile
              glyph="▣"
              label="Company & HR"
              sub="Northforge · scouting"
              tone="info"
              status="Hiring"
            />
            <ModuleTile
              glyph="◆"
              label="Market signal"
              sub="Demand & fit"
              tone="gold"
              live
            />
          </div>
        </div>
      </div>

      {/* the connection path */}
      <div className="relative z-[2] mt-6">
        <div aria-hidden className="connect mb-3 h-px w-full" />
        <ol className="flex flex-wrap items-center gap-2">
          {PATH.map((n, i) => (
            <li key={n} className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-line/70 bg-fg/[0.03] px-3 py-1 text-[0.72rem] text-fg-dim">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-accent-draft"
                />
                {n}
              </span>
              {i < PATH.length - 1 ? (
                <span aria-hidden className="text-fg-mute">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
