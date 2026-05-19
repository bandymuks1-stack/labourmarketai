import type { Metadata } from "next";
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SAMPLE_NOTICE, sampleProfiles } from "@/lib/sample-data";

export const metadata: Metadata = { title: "Profile" };

/**
 * The ONE profile route. Every user has exactly one profile and it lives
 * here. There is no second profile area and no separate avatar surface — the
 * player card on this page is the same canonical card used everywhere else.
 */
export default function ProfilePage() {
  const profile = sampleProfiles[0];

  return (
    <>
      <PageHeader
        eyebrow="One canonical profile"
        title="Your profile"
        lead="This is the single source of truth for who you are. The player card is derived from it — never edited separately."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div>
          <div className="mb-3 flex justify-end">
            <span className="chip">{SAMPLE_NOTICE}</span>
          </div>
          <ProfilePlayerCard profile={profile} />
        </div>

        <div className="space-y-4">
          <div className="glass p-6">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-dim">
              {profile.bio}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="glass p-6">
              <h3 className="eyebrow">Skills</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <span key={s} className="chip">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="glass p-6">
              <h3 className="eyebrow">Languages</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.languages.map((l) => (
                  <span key={l} className="chip">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="glass flex items-center justify-between p-6">
            <div>
              <h3 className="eyebrow">Edit</h3>
              <p className="mt-2 text-sm text-fg-dim">
                Profile editing is structured here and wired in a later slice.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="cta cta-ghost opacity-60"
            >
              Edit profile
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
