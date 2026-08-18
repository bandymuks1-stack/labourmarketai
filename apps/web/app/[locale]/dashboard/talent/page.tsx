import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { JobDemandCard, type JobDemandCardEntity } from "@/components/visual/job-demand-card";
import { WorkerCard, type WorkerCardEntity } from "@/components/visual/worker-card";
import { createClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/auth/superadmin";

/**
 * Talent surface preview — Sprint P0 of the Visual Information
 * System / Visual Dashboard OS direction (Agentai three-project
 * super sprint, 2026-05-28). Renders the slice 1 worker visual
 * card (PR #88) AND the slice 2 job demand visual card (PR #89)
 * side-by-side as a single owner-review surface.
 *
 * Honesty rules honoured per CLAUDE doctrine §7 (no fake AI / no
 * unlabeled fake data):
 *   - Every preview entity carries the literal "Sample" prefix
 *     in its visible name field, so the owner never confuses
 *     this surface with real worker/job data.
 *   - The page header carries a "Preview / Owner review" banner.
 *   - No photo URLs are used (hasPhoto: false everywhere) — the
 *     monogram fallback is the only avatar surface, so the page
 *     never synthesises a face.
 *   - No fake activity counts beyond a small honest range.
 *   - Owner-approved stamps are intentionally left null on the
 *     job cards so the card renders its honest, localised
 *     "awaiting owner approval" fallback.
 */

const SAMPLE_WORKERS: readonly WorkerCardEntity[] = [
  {
    id: "sample-w-001",
    displayName: "Sample · Jonas P.",
    roleLabel: "Stogdengys",
    region: "Vilnius",
    topSkills: ["stogai", "skarda", "izoliacija"],
    evidenceCount: 4,
    hasPhoto: false,
    lastActiveBucket: "active",
  },
  {
    id: "sample-w-002",
    displayName: "Sample · Marija V.",
    roleLabel: "Plytelininkė",
    region: "Kaunas",
    topSkills: ["plytelės", "santechnika", "remontas"],
    evidenceCount: 7,
    hasPhoto: false,
    lastActiveBucket: "recent",
  },
  {
    id: "sample-w-003",
    displayName: "Sample · Tomas K.",
    roleLabel: "Elektrikas",
    region: "Klaipėda",
    topSkills: ["instaliacija", "automatika"],
    evidenceCount: 2,
    hasPhoto: false,
    lastActiveBucket: "dormant",
  },
];

const SAMPLE_JOBS: readonly JobDemandCardEntity[] = [
  {
    id: "sample-j-001",
    title: "Sample · Stogo dengimas (residential)",
    industryKey: "construction",
    companyName: "Sample · UAB Rytinė statyba",
    region: "Vilnius",
    requiredSkills: ["stogai", "skarda", "saugus aukštis"],
    postedAtLabel: "Preview",
    ownerApprovedBy: null,
  },
  {
    id: "sample-j-002",
    title: "Sample · Vonios kambario remontas",
    industryKey: "trades",
    companyName: "Sample · MB Atelje",
    region: "Kaunas",
    requiredSkills: ["plytelės", "santechnika"],
    postedAtLabel: "Preview",
    ownerApprovedBy: null,
  },
  {
    id: "sample-j-003",
    title: "Sample · Cecho elektros instaliacija",
    industryKey: "manufacturing",
    companyName: "Sample · UAB Vakarų gamykla",
    region: "Klaipėda",
    requiredSkills: ["instaliacija", "automatika", "saugus darbas"],
    postedAtLabel: "Preview",
    ownerApprovedBy: null,
  },
];

export default async function TalentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Owner-review sample/preview surface — admin/owner-only (action-first IA
  // v1). requireSuperadmin redirects non-admins to the dashboard, so normal
  // users never see sample data presented as product.
  await requireSuperadmin(locale);

  // Server-side auth gate — mirrors the discover page pattern.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("auth.dashboard");
  // Localization repair v1: this surface rendered English prose and two
  // English aria-labels for every locale, and the job card's approval
  // fallback mixed English with a Lithuanian literal ("owner-approved
  // laukia"). The page is superadmin-gated, so the blast radius is the
  // owner's own screen — but a mixed-language string is a defect at any
  // audience size, and the aria-labels were unreachable for a non-English
  // screen reader.
  const tp = await getTranslations("talentPreview");

  return (
    <div className="flex flex-col gap-6" data-testid="talent-preview-page">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("tabs.discover")} · {tp("previewSuffix")}
        </h1>
        <p className="text-sm text-text-secondary">{tp("intro")}</p>
        <div
          className="card-border inline-flex w-fit items-center gap-2 px-3 py-1 text-xs"
          data-testid="talent-preview-banner"
        >
          <span>{tp("badge")}</span>
        </div>
      </header>

      <section
        className="card-border flex flex-col gap-4 p-6"
        data-testid="talent-workers-section"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {tp("workers.title")} <span className="font-normal text-text-secondary">· PR #88</span>
          </h2>
          <p className="text-sm text-text-secondary">{tp("workers.description")}</p>
        </header>
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label={tp("workers.listLabel")}
        >
          {SAMPLE_WORKERS.map((w) => (
            <WorkerCard key={w.id} worker={w} />
          ))}
        </div>
      </section>

      <section
        className="card-border flex flex-col gap-4 p-6"
        data-testid="talent-jobs-section"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {tp("jobs.title")} <span className="font-normal text-text-secondary">· PR #89</span>
          </h2>
          <p className="text-sm text-text-secondary">{tp("jobs.description")}</p>
        </header>
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label={tp("jobs.listLabel")}
        >
          {SAMPLE_JOBS.map((j) => (
            <JobDemandCard
              key={j.id}
              job={j}
              awaitingApprovalLabel={tp("jobs.awaitingOwnerApproval")}
            />
          ))}
        </div>
      </section>

      <footer className="flex flex-col gap-1 text-xs text-text-secondary">
        <p>{tp("footer")}</p>
      </footer>
    </div>
  );
}
