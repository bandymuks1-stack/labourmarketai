import type { Metadata } from "next";
import Link from "next/link";
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { appNav } from "@/config/site";
import { SAMPLE_NOTICE, sampleProfiles } from "@/lib/sample-data";

export const metadata: Metadata = { title: "Overview" };

export default function AppOverviewPage() {
  const you = sampleProfiles[0];
  const tiles = appNav.filter(
    (item) => item.href !== "/app" && item.href !== "/app/settings",
  );

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Your board, at a glance"
        lead="A snapshot only. Every concern below has exactly one canonical home — this overview never owns the data."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Your card</span>
            <span className="chip">{SAMPLE_NOTICE}</span>
          </div>
          <ProfilePlayerCard
            profile={you}
            footer={
              <Link
                href="/app/profile"
                className="cta cta-ghost w-full justify-center py-2 text-sm"
              >
                Open profile →
              </Link>
            }
          />
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          {tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="glass glass-hover flex flex-col p-5"
            >
              <span className="text-base font-semibold">{tile.label}</span>
              <span className="mt-1 text-sm text-fg-dim">{tile.hint}</span>
              <span className="mt-6 text-sm text-cyan">Open →</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
