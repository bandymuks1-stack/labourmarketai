import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { JobDemandCard, type JobDemandCardEntity } from "@/components/visual/job-demand-card";
import { VisualOsShell, type VisualOsCounts } from "@/components/visual/visual-os-shell";
import { WorkerCard, type WorkerCardEntity } from "@/components/visual/worker-card";
import { VISUAL_TOKENS } from "@/lib/visual/tokens";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";

/**
 * Visual Dashboard OS — real route, not just a primitive demo.
 * Composes the sidebar shell + status strip + worker grid + job
 * grid + direction strip into the first surface that reads as a
 * dashboard OS rather than a stand-alone preview.
 *
 * This page is the integration point for slice 1 + slice 2 + the
 * new shell. It supersedes the /[locale]/dashboard/talent preview
 * route (which stays available for direct primitive review).
 *
 * Honesty rules (CLAUDE doctrine §7 + DEMO_TO_REAL_DATA_POLICY):
 *   - Every preview entity carries the literal "Sample · " prefix.
 *   - All hasPhoto:false → geometric monogram fallback only.
 *   - All ownerApprovedBy:null → honest "owner-approved laukia".
 *   - Status strip counts are honest "0 · Preview" placeholders
 *     until the data wiring slice ships.
 *   - Banner reads "Owner-review preview · Visual Dashboard OS".
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
  {
    id: "sample-w-004",
    displayName: "Sample · Rita G.",
    roleLabel: "Dažytoja",
    region: "Šiauliai",
    topSkills: ["interjeras", "fasadai"],
    evidenceCount: 5,
    hasPhoto: false,
    lastActiveBucket: "recent",
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

const SAMPLE_COUNTS: VisualOsCounts = {
  // All zero on purpose — these become real counts once the data
  // wiring slice lands. Showing "0 · Preview" is honest; inventing
  // a fake "12 workers online" would not be.
  workersOpen: 0,
  jobsOpen: 0,
  agenciesOnboarded: 0,
  evidenceItems: 0,
};

const DIRECTION_STRIP_ITEMS: ReadonlyArray<{
  readonly id: string;
  readonly labelLt: string;
  readonly labelEn: string;
  readonly bodyLt: string;
  readonly bodyEn: string;
}> = [
  {
    id: "premium-scouting",
    labelLt: "Premium kortelių žodynas",
    labelEn: "Premium card vocabulary",
    bodyLt: "Worker + Job demand kortelės naudoja vieną žodyną — VISUAL_TOKENS modulis.",
    bodyEn: "Worker + Job demand cards share one vocabulary — the VISUAL_TOKENS module.",
  },
  {
    id: "honest-fallback",
    labelLt: "Sąžiningi placeholderiai",
    labelEn: "Honest placeholders",
    bodyLt: "Nesintezuojame veidų, nesugalvojame įrodymų, nepatvirtinam tai, ko savininkas dar nepatvirtino.",
    bodyEn: "No synthesised faces, no invented evidence, no verification the owner hasn't approved.",
  },
  {
    id: "lucide-icons",
    labelLt: "Lucide ikonų šeima",
    labelEn: "Lucide icon family",
    bodyLt: "Vienoda ikonų šeima visam OS sluoksniui — centralizuota lib/visual/tokens.ts.",
    bodyEn: "One icon family across the OS layer — centralised in lib/visual/tokens.ts.",
  },
];

export default async function VisualOsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Admin links (e.g. the project-truth shortcut below) must be INVISIBLE
  // to non-admins, not just blocked on direct navigation. Derive the
  // dual admin signal (active_role OR a profile_roles 'admin' row) — the
  // same gate the dashboard layout uses — and render the admin shortcut
  // only when it is true.
  const [profileRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("active_role").eq("id", user.id).single(),
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
  ]);
  const isAdmin = deriveIsAdmin({
    activeRole: profileRes.data?.active_role ?? null,
    profileRoles: rolesRes.data ?? [],
  });

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  return (
    <div className="flex flex-col gap-6" data-testid="visual-os-page">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          {label(
            "VIZUALINIS PLANAS · NE FUNKCIJOS KELIAS",
            "VISUAL PLAN · NOT A FEATURE PATH",
          )}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Vizualinė OS · vizualinis planas", "Visual OS · visual plan")}
        </h1>
        <p className="text-sm text-text-secondary">
          {label(
            "Šis puslapis yra dizaino / navigacijos sluoksnis, ne užbaigta funkcija. Realūs darbo, agentūros ir įmonės keliai gyvena kitur — žiūrėk realių kelių juostą žemiau.",
            "This page is a design / navigation layer, not a completed function. The real worker, agency, and company paths live elsewhere — see the real-paths strip below.",
          )}
        </p>
        <div
          className="card-border flex flex-col gap-2 p-3"
          data-testid="visual-os-real-paths"
        >
          <p className="text-xs font-semibold text-text-primary">
            {label("Realūs keliai:", "Real paths:")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={"/dashboard/start" as "/dashboard"}
              className="rounded-md border border-brand-blue px-3 py-1 text-xs text-brand-blue hover:bg-brand-blue/10"
              data-testid="visual-os-cta-start"
            >
              {label(
                "→ Veiklos pradžia (/dashboard/start)",
                "→ Activity start (/dashboard/start)",
              )}
            </Link>
            {isAdmin ? (
              <Link
                href={"/dashboard/admin/project-truth" as "/dashboard"}
                className="rounded-md border border-ink-500 px-3 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
                data-testid="visual-os-cta-project-truth"
              >
                {label(
                  "→ Admin / projekto tiesa",
                  "→ Admin / project truth",
                )}
              </Link>
            ) : null}
          </div>
        </div>
        <div
          className="card-border inline-flex w-fit items-center gap-2 px-3 py-1 text-xs"
          data-testid="visual-os-preview-banner"
        >
          <span>{label(
            "Žemiau matomos kortelės naudoja Sample · pavyzdinius duomenis — tai dizaino kryptis, ne tikri įrašai.",
            "Cards below use Sample · placeholder data — direction, not real records.",
          )}</span>
        </div>
      </header>

      <VisualOsShell activeSection="overview" locale={uiLocale} counts={SAMPLE_COUNTS}>
        <section
          className={`flex flex-col gap-4 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-6`}
          data-testid="visual-os-workers-section"
        >
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Talentai (slice 1 · PR #88)", "Talent (slice 1 · PR #88)")}
            </h2>
            <p className="text-sm text-text-secondary">
              {label(
                "Premium kortelės su monogramos atsargine reprezentacija — niekada nesintezuojame veido.",
                "Premium cards with monogram fallback — the page never synthesises a face.",
              )}
            </p>
          </header>
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4"
            role="list"
            aria-label={label("Pavyzdinės darbuotojų kortelės", "Sample worker cards")}
          >
            {SAMPLE_WORKERS.map((w) => (
              <WorkerCard key={w.id} worker={w} />
            ))}
          </div>
        </section>

        <section
          className={`flex flex-col gap-4 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-6`}
          data-testid="visual-os-jobs-section"
        >
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Darbo paklausa (slice 2 · PR #89)", "Job demand (slice 2 · PR #89)")}
            </h2>
            <p className="text-sm text-text-secondary">
              {label(
                "Pramonės kortelės su savininko patvirtinimo žyma. Kol nepatvirtinta — sąžininga „owner-approved laukia“.",
                "Industry cards with the owner-approved stamp. Until approved the honest fallback reads “owner-approved laukia”.",
              )}
            </p>
          </header>
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="list"
            aria-label={label("Pavyzdinės darbo paklausos kortelės", "Sample job demand cards")}
          >
            {SAMPLE_JOBS.map((j) => (
              <JobDemandCard key={j.id} job={j} />
            ))}
          </div>
        </section>

        <section
          className={`flex flex-col gap-4 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-6`}
          data-testid="visual-os-agency-link-section"
        >
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label(
                "Agentūros / įmonės korta (slice 4)",
                "Agency / company card (slice 4)",
              )}
            </h2>
            <p className="text-sm text-text-secondary">
              {label(
                "Atskiras paviršius paaiškina agentūros dalyvavimo taisykles: matomi tik savi darbuotojai, kandidatų paieška kaip paslauga, ankstyvo dalyvio prioriteto peržiūra.",
                "A dedicated surface explains how an agency participates: own workers only by default, candidate search as a service, early contributor priority review.",
              )}
            </p>
          </header>
          <Link
            href={"/dashboard/visual-os/agency" as "/dashboard"}
            className={`inline-flex w-fit items-center gap-2 rounded-full ${VISUAL_TOKENS.chipSurface} px-3 py-1 text-xs font-medium ${VISUAL_TOKENS.chipText} hover:underline`}
            data-testid="visual-os-agency-card-link"
          >
            {label(
              "Atidaryti agentūros / įmonės kortą →",
              "Open agency / company card →",
            )}
          </Link>
        </section>

        <section
          className={`flex flex-col gap-4 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-6`}
          data-testid="visual-os-directions-section"
        >
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {label("Kryptys", "Directions")}
            </h2>
            <p className="text-sm text-text-secondary">
              {label(
                "Trys vizualinio žodyno taisyklės, kurios riša visą OS sluoksnį.",
                "Three vocabulary rules that tie the OS layer together.",
              )}
            </p>
          </header>
          <ul
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            role="list"
            aria-label={label("Vizualinio žodyno kryptys", "Visual vocabulary directions")}
          >
            {DIRECTION_STRIP_ITEMS.map((d) => (
              <li
                key={d.id}
                className={`flex flex-col gap-1 ${VISUAL_TOKENS.cardRadius} ${VISUAL_TOKENS.chipSurface} p-4`}
              >
                <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {label(d.labelLt, d.labelEn)}
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {label(d.bodyLt, d.bodyEn)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </VisualOsShell>

      <footer className="flex flex-col gap-1 text-xs text-text-secondary">
        <p>
          {label(
            "Sąžiningas preview · Be sintetinių veidų · Be sugalvotų skaičių · Status juostos skaičiai bus tikri po data-wiring slice.",
            "Honest preview · No synthesised faces · No invented numbers · Status strip becomes real after the data-wiring slice.",
          )}
        </p>
      </footer>
    </div>
  );
}
