import "server-only";

import type { WorkCardValues } from "@/lib/worker/work-card";
import type { WorkCardNext, WorkCardState } from "@/lib/worker/work-card-state";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { getWorkerCoreRow } from "@/lib/data/worker-core";
import {
  getOwnCompany,
  type CompanyReadResult,
} from "@/lib/company/company-setup";
import { getSessionProfile } from "@/lib/auth/session-profile";
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
 * manager-confirmed), so the person block shows real COUNTS only — never a
 * fabricated 0–100 competence score and no percentage meter of any kind.
 */

export type BlockStatus = "ready" | "empty" | "unavailable";
export type Availability = "available" | "busy" | "unavailable";
export type HandoverStage =
  | "preparation"
  | "in_progress"
  | "handover_declared"
  | "closed";

/* W3 row 1: `PersonVM` and `loadPerson` are GONE, and with them this module's
   reads of the player card, the avatar and the worker core row. The hub's
   person block was a second, lesser rendering of the canonical player card;
   the card is now the `player-card` RESULT, which reads the same canonical
   model directly. `WorkEditorVM` moved to `@/lib/worker/work-card` — it was
   always a work-card view model, and it only lived here because the editor
   was folded into this block. */

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
  /** Real project id — the card's stat tiles deep-link into this project
   *  (detail / operations / gallery). Null only in the empty state. */
  id: string | null;
  name: string | null;
  city: string | null;
  country: string | null;
  handoverStatus: HandoverStage | null;
  photos: number;
  assigned: number;
  ready: number;
}

export interface PremiumHubViewModel {
  company: CompanyVM;
  market: MarketVM;
  project: ProjectVM;
  allReady: boolean;
}

async function loadCompany(
  sharedCompanyRead?: Promise<CompanyReadResult>,
): Promise<CompanyVM> {
  const base: CompanyVM = {
    status: "empty",
    name: null,
    country: null,
    members: 0,
    projects: 0,
    invitations: 0,
  };

  // Wagon 2 (nav performance): when the caller (dashboard overview) already
  // holds a live company read, reuse THAT promise instead of re-calling
  // getOwnCompany(). getOwnCompany stays deliberately UNCACHED — this is
  // promise sharing within one render, not caching.
  const res = await (sharedCompanyRead ?? getOwnCompany());
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
    id: null,
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
    id: p.id,
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
export async function getPremiumHubViewModel(opts?: {
  /** Reuse the caller's in-flight getOwnCompany() read (Wagon 2). */
  companyRead?: Promise<CompanyReadResult>;
}): Promise<PremiumHubViewModel> {
  const [company, market, project] = await Promise.all([
    loadCompany(opts?.companyRead),
    loadMarket(),
    loadProject(),
  ]);

  const allReady = [company, market, project].every(
    (b) => b.status === "ready",
  );

  return { company, market, project, allReady };
}
