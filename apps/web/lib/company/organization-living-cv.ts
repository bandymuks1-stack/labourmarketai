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
import { readEvidenceMedia } from "@/lib/organization-evidence/evidence-media-read";
import { signEvidenceMediaUrls } from "@/lib/organization-evidence/evidence-media-serve";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (c: unknown): any => c;

async function readRosterSkills(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workerIds: readonly string[],
): Promise<{ slug: string; confirmed: boolean }[] | null> {
  if (workerIds.length === 0) return [];
  const out: { slug: string; confirmed: boolean }[] = [];
  for (let i = 0; i < workerIds.length; i += ID_CHUNK) {
    const res = await untyped(supabase)
      .from("worker_skills")
      .select("worker_id, verified, skills(slug)")
      .in("worker_id", workerIds.slice(i, i + ID_CHUNK));
    if (res.error) return null;
    for (const r of (res.data ?? []) as { verified: boolean | null; skills: { slug: string | null } | null }[]) {
      const slug = r.skills?.slug;
      if (slug) out.push({ slug, confirmed: r.verified === true });
    }
  }
  return out;
}

export async function loadOrganizationLivingCv(
  locale: string,
  organizationId: string,
  country: string | null,
): Promise<CompanyTeamProfileView | null> {
  const load = await loadCompanyWorkHistory(locale, organizationId);
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

  const [capabilities, settings, skills, media] = await Promise.all([
    readOrganizationCapabilities(load.organizationId),
    getBusinessPublicSettings(load.organizationId),
    readRosterSkills(supabase, Object.values(load.linkedWorkers)),
    readEvidenceMedia(caller, { workObjectIds: objectIds }),
  ]);

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
      rosterSize: Object.keys(load.ownPeople).length,
      history: {
        dayHours: load.history.dayHours,
        periodHours: load.history.periodHours,
        peopleCount: load.history.peopleCount,
        placesCount: load.history.places.filter((p) => p.kind !== "none").length,
        firstDate: load.history.firstDate,
        lastDate: load.history.lastDate,
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
