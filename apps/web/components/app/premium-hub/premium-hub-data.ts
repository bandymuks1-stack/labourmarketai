import "server-only";

import type { WorkCardValues } from "@/lib/worker/work-card";
import type { WorkCardNext, WorkCardState } from "@/lib/worker/work-card-state";
import { createClient } from "@/lib/supabase/server";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { getOwnAvailability } from "@/lib/market-map/owner-readiness";
import { getOwnCompany } from "@/lib/company/company-setup";
import {
  listActiveCompanyWorkers,
  listCompanyWorkerInvitations,
} from "@/lib/company/company-workers";
import { getCompanyProjectContext } from "@/lib/company/project-context";
import {
  listOwnPreferredLocations,
  listOwnDemandLocations,
  getOwnLoginConsent,
} from "@/lib/market-map/capture";
import { listManagedProjects } from "@/lib/projects/projects";
import { getProjectOperations } from "@/lib/projects/operations";
import { getProjectGallery } from "@/lib/journal/project-gallery";
import { getHandoverPassport } from "@/lib/projects/handover-passport";

/**
 * Premium Hub read-model (real-data wiring v1). Assembles the four hub blocks
 * from EXISTING RLS-scoped server helpers only — every value is the caller's own
 * data (or a real 0), never a fabricated number. No fixtures, no service-role,
 * no external map provider.
 *
 * Each block reports one of three honest states:
 *   ready       — real data exists → render it.
 *   empty       — authenticated but this area is not set up yet → honest empty
 *                 state + a direct next action.
 *   unavailable — the underlying feature/migration can't be read right now →
 *                 neutral "not available" note (never a fake number, never an
 *                 error dump).
 *
 * The skill model is status-based (self_declared → journal-supported →
 * manager-confirmed), so the person block shows real COUNTS + a transparent
 * profile-completeness ratio, never a fabricated 0–100 competence score.
 */

export type BlockStatus = "ready" | "empty" | "unavailable";
export type Availability = "available" | "busy" | "unavailable";
export type HandoverStage =
  | "preparation"
  | "in_progress"
  | "handover_declared"
  | "closed";

/** The worker's state-aware next action + inline availability editor, folded
 *  from the former WorkCard into the hub person block. Derived on the dashboard
 *  page from the real `getWorkerCard` read (worker branch only); undefined for
 *  non-worker roles. `WorkCardEditor` renders it (real save/confirm RPCs). */
export interface WorkEditorVM {
  state: WorkCardState;
  /** The single best next action ({ dim, href, whyKey }) from
   *  deriveWorkCardState — href is null when the action is an inline card edit. */
  next: WorkCardNext;
  values: WorkCardValues;
}

export interface PersonVM {
  status: BlockStatus;
  name: string | null;
  professionSlug: string | null;
  roleFallback: string | null;
  avatarUrl: string | null;
  locationCountry: string | null;
  availability: Availability | null;
  skillsDeclared: number;
  journalSupportedSkills: number;
  evidenceEntries: number;
  /** Transparent met/total ratio over real profile fields (not a skill score). */
  completenessPct: number;
}

export interface CompanyVM {
  status: BlockStatus;
  name: string | null;
  country: string | null;
  members: number;
  projects: number;
  invitations: number;
}

export interface MarketVM {
  status: BlockStatus;
  preferred: number;
  needs: number;
  loginConsented: boolean;
  total: number;
}

export interface ProjectVM {
  status: BlockStatus;
  name: string | null;
  city: string | null;
  country: string | null;
  handoverStatus: HandoverStage | null;
  photos: number;
  assigned: number;
  ready: number;
}

export interface PremiumHubViewModel {
  person: PersonVM;
  company: CompanyVM;
  market: MarketVM;
  project: ProjectVM;
  allReady: boolean;
}

async function loadPerson(): Promise<PersonVM> {
  const base: PersonVM = {
    status: "empty",
    name: null,
    professionSlug: null,
    roleFallback: null,
    avatarUrl: null,
    locationCountry: null,
    availability: null,
    skillsDeclared: 0,
    journalSupportedSkills: 0,
    evidenceEntries: 0,
    completenessPct: 0,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...base, status: "unavailable" };

  const [playerCard, avatar, availability, profileRes] = await Promise.all([
    getWorkerPlayerCard(),
    getOwnAvatar(),
    getOwnAvailability(),
    supabase
      .from("profiles")
      .select("full_name, email, active_role, country")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileRes.data as {
    full_name: string | null;
    email: string | null;
    active_role: string | null;
    country: string | null;
  } | null;

  const name =
    profile?.full_name?.trim() ||
    playerCard?.displayName?.trim() ||
    (profile?.email ? profile.email.split("@")[0] : "") ||
    (user.email ? user.email.split("@")[0] : "") ||
    null;

  const professionSlug = playerCard?.professionSlug ?? null;
  const skillsDeclared = playerCard?.skillsDeclared ?? 0;
  const journalSupportedSkills = playerCard?.journalSupportedSkills ?? 0;
  const evidenceEntries = playerCard?.evidenceEntries ?? 0;
  const avatarUrl = avatar.signedUrl;
  const locationCountry = profile?.country ?? availability.currentCountry ?? null;
  const availabilityState: Availability | null =
    availability.state === "available" ||
    availability.state === "busy" ||
    availability.state === "unavailable"
      ? availability.state
      : null;

  // Transparent completeness: fraction of real profile fields present.
  const checks = [
    !!name,
    !!professionSlug,
    skillsDeclared + journalSupportedSkills > 0,
    evidenceEntries > 0,
    !!avatarUrl,
    availabilityState !== null,
  ];
  const completenessPct = Math.round(
    (checks.filter(Boolean).length / checks.length) * 100,
  );

  // "Empty" only when the account has nothing meaningful yet (brand-new).
  const hasAny =
    !!profile?.full_name ||
    !!professionSlug ||
    skillsDeclared > 0 ||
    journalSupportedSkills > 0 ||
    evidenceEntries > 0 ||
    !!avatarUrl;

  return {
    status: hasAny ? "ready" : "empty",
    name,
    professionSlug,
    roleFallback: profile?.active_role ?? null,
    avatarUrl,
    locationCountry,
    availability: availabilityState,
    skillsDeclared,
    journalSupportedSkills,
    evidenceEntries,
    completenessPct,
  };
}

async function loadCompany(): Promise<CompanyVM> {
  const base: CompanyVM = {
    status: "empty",
    name: null,
    country: null,
    members: 0,
    projects: 0,
    invitations: 0,
  };

  const res = await getOwnCompany();
  if (res.kind !== "ok") return { ...base, status: "unavailable" };
  if (!res.row) return base; // empty — no company yet
  const row = res.row;

  const [workersRes, projectCtx, invitesRes] = await Promise.all([
    listActiveCompanyWorkers(row.id),
    getCompanyProjectContext(row.id),
    listCompanyWorkerInvitations(row.id),
  ]);

  const members = workersRes.kind === "ok" ? workersRes.rows.length : 0;
  const invitations =
    invitesRes.kind === "ok"
      ? invitesRes.rows.filter((r) => r.status === "pending").length
      : 0;

  return {
    status: "ready",
    name: row.displayName?.trim() || row.legalName?.trim() || null,
    country: row.country ?? null,
    members,
    projects: projectCtx.projects,
    invitations,
  };
}

async function loadMarket(): Promise<MarketVM> {
  const [preferred, demand, login] = await Promise.all([
    listOwnPreferredLocations(),
    listOwnDemandLocations(),
    getOwnLoginConsent(),
  ]);

  const preferredN = preferred.length;
  const needs = demand.length;
  const loginConsented = login?.consentStatus === "consented";
  const total = preferredN + needs + (loginConsented ? 1 : 0);

  return {
    status: total > 0 ? "ready" : "empty",
    preferred: preferredN,
    needs,
    loginConsented,
    total,
  };
}

const HANDOVER_STAGES: readonly HandoverStage[] = [
  "preparation",
  "in_progress",
  "handover_declared",
  "closed",
];

async function loadProject(): Promise<ProjectVM> {
  const base: ProjectVM = {
    status: "empty",
    name: null,
    city: null,
    country: null,
    handoverStatus: null,
    photos: 0,
    assigned: 0,
    ready: 0,
  };

  const projects = await listManagedProjects();
  if (projects.length === 0) return base; // empty — no project yet
  const p = projects[0]; // listManagedProjects orders by created_at desc

  const [ops, gallery, handover] = await Promise.all([
    getProjectOperations(p.id),
    getProjectGallery(p.id),
    getHandoverPassport(p.id),
  ]);

  const declared =
    handover.applied && handover.declaredStatus ? handover.declaredStatus : null;
  const handoverStatus =
    declared && (HANDOVER_STAGES as readonly string[]).includes(declared)
      ? (declared as HandoverStage)
      : null;

  return {
    status: "ready",
    name: p.title ?? null,
    city: p.city ?? ops?.project.city ?? null,
    country: ops?.project.country ?? null,
    handoverStatus,
    photos: gallery.photos.length,
    assigned: ops?.counters.totalAssigned ?? 0,
    ready: ops?.counters.ready ?? 0,
  };
}

/** One normalized view model for the whole hub. Blocks load in parallel. */
export async function getPremiumHubViewModel(): Promise<PremiumHubViewModel> {
  const [person, company, market, project] = await Promise.all([
    loadPerson(),
    loadCompany(),
    loadMarket(),
    loadProject(),
  ]);

  const allReady = [person, company, market, project].every(
    (b) => b.status === "ready",
  );

  return { person, company, market, project, allReady };
}
