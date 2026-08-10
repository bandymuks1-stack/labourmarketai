"use server";

import "server-only";

/**
 * VACANCY SOURCE OPERATOR ACTIONS — the human-triggered invocation surface.
 *
 * There is NO scheduler in this repo (nothing runs on a timer, by doctrine),
 * so every import run is a deliberate operator act on the admin page. That is
 * the correct shape for this stage of the product: the owner asked for
 * evidence-then-activation, and a dry run someone chose to press is evidence
 * with a name attached.
 *
 * Both actions are superadmin-gated with the SAME check the admin pages use,
 * evaluated FIRST — a server action is an HTTP endpoint whatever the page
 * around it looks like, and it authenticates itself or it is a hole. On top:
 *   - a dry run can be requested by any admin at any time — it writes nothing
 *     anywhere, so it is exactly as safe as reading;
 *   - a PERSIST run additionally re-checks that the runtime switch is open, so
 *     even an admin cannot import past a closed kill switch. The switch is the
 *     owner's lever; this surface never overrides it.
 *
 * Tagged returns, never throws: the page renders the outcome honestly and a
 * failure is a state, not a crash screen.
 */
import { revalidatePath } from "next/cache";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVacancyProvider } from "@/lib/vacancy-sources/vacancy-provider-registry";
import type { VacancyImportChannel } from "@/lib/vacancy-sources/vacancy-contract";
import {
  runVacancyIngestionSession,
  type VacancyIngestionSessionResultV1,
} from "./vacancy-ingestion";

export type VacancyRunActionResult =
  | { readonly kind: "ok"; readonly session: VacancyIngestionSessionResultV1 }
  | {
      readonly kind: "refused";
      readonly reason:
        | "not_admin"
        | "unknown_provider"
        | "unknown_channel"
        | "switch_closed";
    };

const CHANNELS: readonly VacancyImportChannel[] = ["snapshot", "stream", "links"];

async function runAction(
  providerKey: string,
  channel: string,
  mode: "dry_run" | "persist",
): Promise<VacancyRunActionResult> {
  if (!(await isSuperadmin())) return { kind: "refused", reason: "not_admin" };

  const provider = getVacancyProvider(providerKey);
  if (!provider) return { kind: "refused", reason: "unknown_provider" };
  if (!CHANNELS.includes(channel as VacancyImportChannel)) {
    return { kind: "refused", reason: "unknown_channel" };
  }

  const client = createAdminClient();
  const session = await runVacancyIngestionSession(client, provider, {
    channel: channel as VacancyImportChannel,
    mode,
    // The one place a clock enters the run. Server action = server clock.
    nowIso: new Date().toISOString(),
  });

  revalidatePath("/[locale]/dashboard/admin/vacancy-sources", "page");
  return { kind: "ok", session };
}

/** Fetch + parse + validate + count; writes NOTHING anywhere. */
export async function runVacancyDryRunAction(
  providerKey: string,
  channel: string,
): Promise<VacancyRunActionResult> {
  return runAction(providerKey, channel, "dry_run");
}

/**
 * The real import. Still refused unless BOTH owner gates are open (governance
 * activation + env switch) — the runner and importer enforce that; this
 * action adds nothing that could bypass them.
 */
export async function runVacancyPersistAction(
  providerKey: string,
  channel: string,
): Promise<VacancyRunActionResult> {
  return runAction(providerKey, channel, "persist");
}
