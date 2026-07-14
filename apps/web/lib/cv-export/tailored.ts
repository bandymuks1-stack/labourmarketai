import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { deriveNeedSkills } from "@/lib/market/need-skills";
import { computeContextFit, type FitBasis } from "@/lib/market/fit";

/**
 * Tailored CV mode (Full CV System v1) — /cv?need=<customer_request_id>.
 *
 * READ-ONLY reuse of the existing worker-visibility pipeline: the need comes
 * from the SAME gated SECURITY DEFINER RPC the opportunity board uses
 * (`list_open_demand_for_workers`) — a worker can tailor ONLY against demand
 * they can already see there. The requirement set is derived from the row's
 * role text through the SAME deterministic pipeline
 * (lib/market/need-skills.deriveNeedSkills), and the fit is the SAME §19
 * engine (lib/market/fit.computeContextFit) — one matching truth, computed at
 * read time, never persisted.
 *
 * Honest fallbacks (the page falls back to the STANDARD CV with a visible
 * note — tailoring never fabricates a match):
 *   - RPC absent / need id not in the worker-visible list → "not-visible";
 *   - the need's text derives no skill requirement set → "no-structure"
 *     (§19: an unstructured need shows NO percentage, ever).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface TailoredNeedContext {
  kind: "ok";
  needId: string;
  /** The need's own role text — shown so the reader knows what the CV was
   *  tailored against. */
  roleText: string | null;
  fit: FitBasis;
  matchedSlugs: ReadonlySet<string>;
}

export type TailoredNeedResult =
  | TailoredNeedContext
  | { kind: "not-visible" }
  | { kind: "no-structure" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadTailoredNeed(
  needIdRaw: string,
  subjectSkills: readonly { slug: string; verified: boolean }[],
): Promise<TailoredNeedResult> {
  const needId = needIdRaw.trim();
  if (!UUID_RE.test(needId)) return { kind: "not-visible" };

  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase).rpc(
      "list_open_demand_for_workers",
    );
    if (error || !Array.isArray(data)) return { kind: "not-visible" };
    const row = (data as Record<string, unknown>[]).find(
      (r) => String(r.id) === needId,
    );
    if (!row) return { kind: "not-visible" };

    const roleText = (row.role_text as string | null) ?? null;
    const derived = deriveNeedSkills({
      roleOrWorkType: (roleText ?? "").replace(/[_-]+/g, " "),
    });
    const fit = computeContextFit(
      derived.skillSlugs,
      subjectSkills.map((s) => ({ uri: s.slug, verified: s.verified })),
    );
    if (!fit) return { kind: "no-structure" };

    return {
      kind: "ok",
      needId,
      roleText,
      fit,
      matchedSlugs: new Set(fit.matchedUris),
    };
  } catch {
    // RPC not applied / transient failure → honest standard-CV fallback.
    return { kind: "not-visible" };
  }
}
