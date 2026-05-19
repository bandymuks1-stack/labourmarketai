/**
 * SystemScene — the connected labour-market layer, staged.
 *
 * A landing-only composition: the one worker profile card at the centre with
 * the connected layers around it (work evidence, team, project, communication,
 * company, HR & customers, action centre, opportunities) and the relationship
 * path through the market. It reuses the shared ProfilePlayerCard and
 * StatusChip — it never defines a second profile / card / communication
 * concept. The readiness value is the example profile's own signal, shown as
 * a clearly-labelled product preview, never a market claim.
 */
import { ModuleTile } from "@/components/landing/ModuleTile";
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { profileToPlayerCard } from "@/lib/player-card";
import { sampleProfiles } from "@/lib/sample-data";

const PATH = [
  "Worker",
  "Profile",
  "Team",
  "Project",
  "Company",
  "Communication",
  "Opportunity",
  "Market",
];

export function SystemScene() {
  const candidate = sampleProfiles[0];
  const card = profileToPlayerCard(candidate);
  const tier = card.tier[0].toUpperCase() + card.tier.slice(1);

  return (
    <div className="scout-frame relative overflow-hidden p-4 sm:p-6">
      <div aria-hidden className="netglow" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">The labour-market operating layer</span>
        <StatusChip tone="muted">Product preview · example profile</StatusChip>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* worker anchor */}
        <div className="lg:col-span-5">
          <ProfilePlayerCard profile={candidate} />

          <div className="module mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-mute">
                Profile readiness
              </span>
              <span className="text-xs tabular-nums text-fg-dim">
                {candidate.signalScore} / 100
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

        {/* connected layers */}
        <div className="grid grid-cols-2 gap-3 lg:col-span-7 lg:grid-cols-4">
          <ModuleTile
            glyph="▤"
            label="Work evidence"
            hint="Real work, journaled and proven"
            tone="info"
            status="Building"
            live
          />
          <ModuleTile
            glyph="⬡"
            label="Team"
            hint="Who you build with"
            tone="positive"
            status="Forming"
            live
          />
          <ModuleTile
            glyph="◈"
            label="Communication"
            hint="One place to talk it through"
            tone="neutral"
            status="Open"
          />
          <ModuleTile
            glyph="◆"
            label="Opportunities"
            hint="Roles that fit, surfaced"
            tone="gold"
            status="In market"
            live
          />
          <div className="hidden lg:block">
            <ModuleTile
              glyph="▰"
              label="Active project"
              hint="Context for the work"
              tone="info"
              progress={68}
            />
          </div>
          <div className="hidden lg:block">
            <ModuleTile
              glyph="▣"
              label="Company"
              hint="Who is building, and why"
              tone="neutral"
              status="Scouting"
            />
          </div>
          <div className="hidden lg:block">
            <ModuleTile
              glyph="⬢"
              label="HR & customers"
              hint="Needs and decisions, in context"
              tone="neutral"
              status="In view"
            />
          </div>
          <div className="hidden lg:block">
            <ModuleTile
              glyph="✦"
              label="Action centre"
              hint="What matters today"
              tone="warn"
              status="3 to act"
              live
            />
          </div>
        </div>
      </div>

      {/* the path through the market */}
      <div className="mt-6">
        <div aria-hidden className="netline mb-3 h-px w-full" />
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {PATH.map((node, i) => (
            <li key={node} className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-line/70 bg-fg/[0.03] px-2.5 py-1 text-[0.72rem] text-fg-dim">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-accent-draft"
                />
                {node}
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
