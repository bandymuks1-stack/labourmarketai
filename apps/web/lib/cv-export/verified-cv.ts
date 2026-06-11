import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  supportedSkillIds,
  type EntrySkillLinkRow,
} from "@/lib/journal/journal-entry-skills";
import { listProfileSkillClaims } from "@/lib/profile/profile-skill-claims";
import {
  getOwnTrustSignals,
  type OwnTrustSignals,
} from "@/lib/profile/trust-signals";
import { groupCvSkillTiers, type CvSkillTiers } from "./skill-tiers";

/**
 * Verified CV export (S3.5) — the worker's OWN portable, honest history.
 *
 * Every number/label is read under the worker's own RLS from canonical
 * tables; nothing is invented and nothing renders as confirmed without a
 * real manager confirmation (see skill-tiers.ts). Privacy is default-closed:
 * the confirmed-proof list carries the confirmer's ROLE only — never the
 * confirmer's name or id — and no employer data beyond the project title the
 * worker's own entry already links to.
 *
 * Taxonomy names stay the existing curated slug→JSON set; when the ESCO
 * canonical layer (#286) is applied, the page swaps to ESCO preferred labels
 * with no change here (slugs are returned, the page translates).
 */

export type VerifiedCvProofRow = {
  /** Date of the confirmation (the legally meaningful act). */
  confirmedAt: string;
  /** Date of the underlying work entry. */
  entryDate: string;
  /** Project title the worker's own entry links to, if any. */
  projectTitle: string | null;
  /** Confirmer's relationship ROLE (manager / owner / external_manager) —
   *  deliberately never the person's name (default-closed, §4). */
  confirmerRole: string;
};

export type VerifiedCvData = {
  personName: string;
  professionSlugs: { slug: string; isPrimary: boolean }[];
  /** Catalogued worker skills, grouped by honest tier (slugs). */
  tiers: CvSkillTiers;
  /** Free-label self-declared claims — ALWAYS the declared tier. */
  declaredClaims: string[];
  signals: OwnTrustSignals;
  proof: VerifiedCvProofRow[];
};

export type VerifiedCvResult =
  | { ok: true; cv: VerifiedCvData }
  | { ok: false; code: "not_authenticated" | "no_worker" };

export async function buildVerifiedCv(): Promise<VerifiedCvResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { ok: false, code: "no_worker" };
  const workerId = worker.id;

  const [profileRes, wpRes, wsRes, linkRes, claims, signals, entriesRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
      supabase
        .from("worker_professions")
        .select("is_primary, professions(slug)")
        .eq("worker_id", workerId)
        .order("is_primary", { ascending: false }),
      supabase
        .from("worker_skills")
        .select("skill_id, verified, source, skills(slug)")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("journal_entry_skills")
        .select("journal_entry_id, skill_id")
        .eq("worker_id", workerId),
      listProfileSkillClaims(),
      getOwnTrustSignals(workerId),
      supabase
        .from("journal_entries")
        .select("id, created_at, project_id")
        .eq("worker_id", workerId),
    ]);

  const personName =
    profileRes.data?.full_name ??
    (profileRes.data?.email ? profileRes.data.email.split("@")[0] : "—");

  const professionSlugs = (wpRes.data ?? [])
    .map((r) => {
      const slug = (r.professions as { slug: string | null } | null)?.slug;
      return slug ? { slug, isPrimary: r.is_primary === true } : null;
    })
    .filter((p): p is { slug: string; isPrimary: boolean } => p !== null);

  // Durable journal→skill links — graceful empty set if not readable.
  const durableSupported = linkRes.error
    ? new Set<string>()
    : supportedSkillIds((linkRes.data ?? []) as EntrySkillLinkRow[]);

  const tiers = groupCvSkillTiers(
    (wsRes.data ?? [])
      .map((r) => {
        const slug = (r.skills as { slug: string | null } | null)?.slug;
        return slug
          ? {
              slug,
              verified: r.verified === true,
              source: (r.source as string | null) ?? "self_declared",
              journalSupported: r.skill_id
                ? durableSupported.has(r.skill_id)
                : false,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );

  const declaredClaims = claims.map((c) => c.normalized_label);

  // Confirmed Work Proof — REAL confirmations only (action 'confirm' or an
  // approved review), one row per entry (latest confirmation), role only.
  const entries = entriesRes.data ?? [];
  const entryById = new Map(
    entries.map((e) => [
      e.id,
      { createdAt: e.created_at, projectId: (e.project_id as string | null) ?? null },
    ]),
  );
  const proof: VerifiedCvProofRow[] = [];
  if (entries.length > 0) {
    const { data: confs } = await supabase
      .from("journal_entry_confirmations")
      .select("entry_id, confirmer_role, created_at, confirmation_scope")
      .in("entry_id", entries.map((e) => e.id))
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    const projectIds = new Set<string>();
    const confirmedRows: {
      entryId: string;
      confirmedAt: string;
      confirmerRole: string;
    }[] = [];
    for (const c of confs ?? []) {
      const scope = c.confirmation_scope as {
        action?: string;
        decision?: string;
      } | null;
      const isConfirm =
        scope?.action === "confirm" || scope?.decision === "approved";
      if (!isConfirm || seen.has(c.entry_id)) continue;
      seen.add(c.entry_id);
      confirmedRows.push({
        entryId: c.entry_id,
        confirmedAt: c.created_at,
        confirmerRole: c.confirmer_role,
      });
      const pid = entryById.get(c.entry_id)?.projectId;
      if (pid) projectIds.add(pid);
    }

    // Project titles the worker's own entries link to — graceful null when
    // not linked or not readable under the worker's RLS.
    const projectTitleById = new Map<string, string | null>();
    if (projectIds.size > 0) {
      const { data: projRows } = await supabase
        .from("projects")
        .select("id, title")
        .in("id", [...projectIds]);
      for (const p of projRows ?? []) {
        projectTitleById.set(p.id, (p.title as string | null) ?? null);
      }
    }

    for (const row of confirmedRows) {
      const entry = entryById.get(row.entryId);
      const pid = entry?.projectId ?? null;
      proof.push({
        confirmedAt: row.confirmedAt,
        entryDate: entry?.createdAt ?? row.confirmedAt,
        projectTitle: pid ? (projectTitleById.get(pid) ?? null) : null,
        confirmerRole: row.confirmerRole,
      });
    }
    proof.sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1));
  }

  return {
    ok: true,
    cv: { personName, professionSlugs, tiers, declaredClaims, signals, proof },
  };
}
