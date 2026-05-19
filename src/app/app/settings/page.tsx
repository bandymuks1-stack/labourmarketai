import type { Metadata } from "next";
import { ProviderButtons } from "@/components/auth/ProviderButtons";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        lead="Account, role and sign-in providers. Onboarding stays automated and self-serve — there is no gatekeeping step."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass p-6">
          <h2 className="text-lg font-semibold">Identity</h2>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-wider text-fg-mute">
                Display name
              </span>
              <input disabled className="lm-input mt-1.5" placeholder="—" />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-wider text-fg-mute">
                Role
              </span>
              <input
                disabled
                className="lm-input mt-1.5"
                placeholder="Set at /role"
              />
            </label>
            <p className="text-[0.7rem] text-fg-mute">
              Editing is structured here and wired in a later slice.
            </p>
          </div>
        </div>

        <div className="glass p-6">
          <h2 className="text-lg font-semibold">Sign-in providers</h2>
          <p className="mt-1 text-sm text-fg-dim">
            Honest provider state. Nothing claims to work before it is wired.
          </p>
          <div className="mt-5">
            <ProviderButtons />
          </div>
        </div>
      </div>
    </>
  );
}
