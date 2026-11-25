import "server-only";

import { createClient } from "@/lib/supabase/server";
import { withSessionWorkspacePointer } from "@/lib/company/active-organization";
import { getBusinessPublicSettings } from "@/lib/company/public-profile";
import {
  buildOrganizationLivingCv,
  type CompanyTeamProfileView,
} from "@/lib/company/team-profile-model";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { loadCompanyWorkHistory } from "@/lib/organization-evidence/company-work-history-read";
import { readAllPages } from "@/lib/organization-evidence/evidence-pagination";
import { readEvidenceMedia } from "@/lib/organization-evidence/evidence-media-read";
import { signEvidenceMediaUrls } from "@/lib/organization-evidence/evidence-media-serve";
import { readCrossPartyStandingStates } from "@/lib/evidence/skill-confirmation-standing-read";
import { withCrossPartyStandingConfirmation } from "@/lib/evidence/skill-confirmation-standing";

/**
 * THE ORGANIZATION'S LIVING CV, READ FOR ITS OWN MEMBERS (owner P0 2026-11-24).
 *
 * One composition of readers that already exist, all under the caller's own
 * RLS session; nothing new is stored and nothing is published:
 *
 *   identity      the organization's name (history read), its own tagline and
 *                 description (`getBusinessPublicSettings`), its country;
 *   history       `loadCompanyWorkHistory` — the ONE organization history read:
 *                 own records, records partners attribute to it as the
 *                 performer, client work kept out (decision 0033), journal and
 *                 projects as their own ledgers;
 *   capabilities  `readOrganizationCapabilities`;
 *   skills        the roster's confirmed links → `worker_skills`, as far as RLS
 *                 lets this member read them;
 *   gallery       work photos stated against the organization's places.
 *
 * Returns null when the history read is hidden or failed: the settings page
 * then shows no Living CV rather than an empty one.
 */

const ID_CHUNK = 100;
const GALLERY_READ_OBJECTS = 60;
/** The whole Projects block (the history page keeps its own preview). */
const PROJECTS_READ = 200;
/** Roster relationships that are a CURRENT team; former employees, students,
 *  graduates, candidates and other historical rows are not team capacity. */
const CURRENT_TEAM_KINDS = ["employee", "agency_worker", "subcontractor", "contractor", "trainee", "apprentice"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (c: unknown): any => c;

async function readRosterSkills(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workerIds: readonly string[],
): Promise<{ slug: string; confirmed: boolean }[] | null> {
  if (workerIds.length === 0) return [];
  const rows: { worker_id: string; skill_id: string | null; verified: boolean | null; source: string | null; slug: string }[] = [];
  for (let i = 0; i < workerIds.length; i += ID_CHUNK) {
    const res = await untyped(supabase)
      .from("worker_skills")
      .select("worker_id, skill_id, verified, source, skills(slug)")
      .in("worker_id", workerIds.slice(i, i + ID_CHUNK));
    if (res.error) return null;
    for (const r of (res.data ?? []) as {
      worker_id: string;
      skill_id: string | null;
      verified: boolean | null;
      source: string | null;
      skills: { slug: string | null } | null;
    }[]) {
      const slug = r.skills?.slug;
      if (slug) rows.push({ worker_id: r.worker_id, skill_id: r.skill_id, verified: r.verified, source: r.source, slug });
    }
  }
  // The stored flag is sticky after the confirming work is rejected,
  // corrected or deleted, and a self-confirmation is not a confirmation:
  // a skill reads confirmed only when its confirmation STANDS (the same
  // cross-party door every employer-facing read uses). Unknown is never
  // shown as confirmed.
  const standing = await readCrossPartyStandingStates(supabase, rows.map((r) => r.worker_id));
  return withCrossPartyStandingConfirmation(rows, standing).map((r) => ({ slug: r.slug, confirmed: r.verified }));
}

type CurrentTeam = { size: number; workerIds: string[] };

/**
 * Read the complete current roster once. The same bounded rows determine both
 * the team count and whose skills can describe current team capability.
 * Unknown link state/method never establishes a worker identity.
 */
async function readCurrentTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<CurrentTeam | null> {
  const read = await readAllPages<{
    id: string;
    linked_worker_id: string | null;
    link_state: string | null;
    link_method: string | null;
  }>((from, to) =>
    untyped(supabase)
      .from("organization_people")
      .select("id, linked_worker_id, link_state, link_method")
      .eq("organization_id", organizationId)
      .in("relationship_kind", [...CURRENT_TEAM_KINDS])
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (!read || read.truncated) return null;

  const workerIds = [...new Set(
    read.rows
      .filter((person) =>
        person.link_state === "linked" &&
        person.link_method === "worker_confirmed" &&
        typeof person.linked_worker_id === "string" &&
        person.linked_worker_id.length > 0,
      )
      .map((person) => person.linked_worker_id as string),
  )];
  return { size: read.rows.length, workerIds };
}

export async function loadOrganizationLivingCv(
  locale: string,
  organizationId: string,
  country: string | null,
): Promise<CompanyTeamProfileView | null> {
  const load = await loadCompanyWorkHistory(locale, organizationId, { projectLimit: PROJECTS_READ });
  if (load.kind !== "ready") return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const caller = await withSessionWorkspacePointer({ supabase, userId: user.id, locale });

  const objectIds = load.history.places
    .map((p) => p.objectId)
    .filter((id): id is string => !!id)
    .slice(0, GALLERY_READ_OBJECTS);

  const currentTeamPromise = readCurrentTeam(supabase, load.organizationId);
  const [capabilities, settings, media, currentTeam, skills] = await Promise.all([
    readOrganizationCapabilities(load.organizationId),
    getBusinessPublicSettings(load.organizationId),
    readEvidenceMedia(caller, { workObjectIds: objectIds }),
    currentTeamPromise,
    currentTeamPromise.then((team) =>
      team ? readRosterSkills(supabase, team.workerIds) : null,
    ),
  ]);
  // History remains complete and unchanged above. Its linked people include
  // former and otherwise historical relationships, so only the current roster
  // supplies identities for this current-team skill statement.
  const teamSize = currentTeam?.size ?? null;

  const photos =
    media.kind === "ok"
      ? media.media.filter((m) => m.mimeType.startsWith("image/") && m.organizationPersonId === null)
      : [];
  const urls = await signEvidenceMediaUrls(
    caller,
    photos.map((m) => m.id),
  );

  const own = settings.kind === "ok" ? settings.settings : null;
  return buildOrganizationLivingCv(
    {
      name: load.identity.legalName ?? load.organizationName,
      tagline: own?.tagline ?? null,
      description: own?.description ?? null,
      country,
    },
    {
      capabilities,
      teamSkills: skills,
      rosterSize: teamSize,
      // ONE total, every hour once (decision 0025): the business history's
      // totals. Unreadable → null (unknown), never a partial sum shown as whole.
      history: load.business
        ? {
            hours: load.business.totals.hours,
            peopleCount: load.business.totals.people,
            placesCount: load.business.totals.places,
            firstDate: load.business.totals.from,
            lastDate: load.business.totals.to,
          }
        : null,
      historyDetail: {
        business: load.business,
        identity: load.identity,
        organizationId: load.organizationId,
        organizationName: load.organizationName,
        clients: load.clients,
        performedAsSubcontractor: load.performedAsSubcontractor,
      },
      journal: load.journal,
      projects: load.projects,
      gallery: photos.map((m) => ({
        id: m.id,
        url: urls.get(m.id) ?? "",
        caption: m.caption,
        personLinked: m.organizationPersonId !== null,
      })),
      clients: load.clients.map((c) => c.name),
    },
    locale,
  );
}
