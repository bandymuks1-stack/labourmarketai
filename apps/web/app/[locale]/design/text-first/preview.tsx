"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { BottomNav } from "@/components/app/bottom-nav";
import { NotificationPanel } from "@/components/app/notification-panel";
import { RoleSwitcher } from "@/components/app/role-switcher";
import { TextFirstComposer } from "@/components/app/text-first-composer";
import { CvInputPanel } from "@/components/app/cv-input-panel";
import { JournalEntryComposer } from "@/components/app/journal-entry-composer";
import { ProfileTextFirstFlow } from "@/components/app/profile-text-first-flow";
import { DetectedSuggestionCard } from "@/components/app/detected-suggestion-card";
import { DetectedSuggestionList } from "@/components/app/detected-suggestion-list";
import { MobileSheet } from "@/components/ui/MobileSheet";
import { Button } from "@/components/ui/Button";
import { AuthProvider } from "@/lib/auth/context";

/**
 * Mobile preview surface — mounts the new components with mock data so the
 * team can capture screenshots without authenticating against Supabase. Every
 * component here uses the production import path; no design fork. Submit
 * actions (createJournalEntry / save skills) are wrapped so they no-op in
 * preview and never hit the network.
 */
export function TextFirstPreview() {
  const t = useTranslations("structuring.buckets");
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <AuthProvider
      initial={{
        user: { id: "preview-user", email: "preview@labourmarket.ai" },
        profile: { full_name: "Preview", email: "preview@labourmarket.ai" },
        activeRole: "worker",
        roles: ["worker", "company", "agency", "customer"],
        notifications: [],
      }}
    >
      <div className="relative min-h-screen bg-ink-900 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <AmbientGlow />
        {/* Auth header mock — same chrome the dashboard layout renders, so the
            mobile screenshots show the real notification + role-switcher UI. */}
        <header
          data-testid="preview-header"
          className="sticky top-0 z-30 border-b border-ink-600/60 bg-ink-900/85 backdrop-blur-md"
        >
          <div className="mx-auto flex h-14 max-w-container items-center gap-3 px-4">
            <span className="font-display text-lg font-bold tracking-tightest text-text-primary">
              labourmarket<span className="text-gradient-accent">.ai</span>
            </span>
            <span className="ml-auto flex items-center gap-2">
              <NotificationPanel />
              <RoleSwitcher />
            </span>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex max-w-container flex-col gap-8 px-4 py-6">
          <section data-testid="preview-text-first" className="flex flex-col gap-4">
            <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
              Profile / Skills — text-first
            </h1>
            <ProfileTextFirstFlow
              manualSlot={
                <div className="card-border p-4 text-sm text-text-secondary">
                  Manual skill picker would render here (kept as the secondary
                  path — never shown first).
                </div>
              }
            />
          </section>

          <section data-testid="preview-journal" className="flex flex-col gap-4">
            <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
              Work Journal — text-first
            </h1>
            <JournalEntryComposer
              engagements={[
                {
                  id: "preview-engagement",
                  label: "Pavyzdys UAB · darbuotojas",
                  isPrimary: true,
                },
              ]}
              directions={[
                { slug: "tiler", name: "Plytelių klojėjas" },
                { slug: "drywaller", name: "Gipso kartono montuotojas" },
              ]}
              workerSkills={[
                { slug: "drywall", name: "Gipso kartono montavimas" },
                { slug: "ceiling-systems", name: "Pakabinamų lubų montavimas" },
              ]}
            />
          </section>

          <section data-testid="preview-bare" className="flex flex-col gap-4">
            <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
              Stand-alone parts
            </h1>
            <TextFirstComposer
              title="Papasakokite, ką mokate"
              helper="Stand-alone composer — used by Profile / Skills."
              placeholder="Pvz.: 8 metus dirbau vidaus apdailoje…"
              submitLabel="Pasiūlykite struktūrą"
              manualLabel="Pridėti rankiniu būdu"
              onSubmit={() => undefined}
              onManual={() => undefined}
            />
            <CvInputPanel onPasteSubmit={() => undefined} />
            <DetectedSuggestionList title={t("skills")} count={2}>
              <DetectedSuggestionCard
                label="Gipso kartono montavimas"
                status="pending"
                onConfirm={() => undefined}
                onDiscard={() => undefined}
              />
              <DetectedSuggestionCard
                label="Pakabinamų lubų montavimas"
                status="confirmed"
                onConfirm={() => undefined}
                onDiscard={() => undefined}
              />
            </DetectedSuggestionList>
          </section>

          <section data-testid="preview-sheet" className="flex flex-col gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
              Mobile sheet
            </h1>
            <Button type="button" onClick={() => setSheetOpen(true)}>
              Open mobile sheet
            </Button>
            <MobileSheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              title="Pranešimai"
            >
              <p className="text-sm text-text-secondary">
                Sheet body — on phones the notification panel slides up like
                this instead of covering the hero.
              </p>
            </MobileSheet>
          </section>
        </main>

        <BottomNav />
      </div>
    </AuthProvider>
  );
}
