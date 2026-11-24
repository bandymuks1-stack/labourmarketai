import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the profile id of the company owner who employs the current worker,
 * so the worker can message them. Uses the worker's own accepted invitation
 * (`company_worker_invitations.inviter_profile_id`) — RLS already scopes that
 * table to the invitee (`invited_email = my profile email`), so this reads only
 * the caller's own row. Returns null when no employer is resolvable (the
 * "Message company" button then simply does not render — no dead button).
 *
 * No new table, no new policy. Read-only.
 */
export async function getEmployerOwnerProfileId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("company_worker_invitations")
    .select("inviter_profile_id, created_at, status")
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (data ?? [])[0] as { inviter_profile_id: string | null } | undefined;
  const inviter = row?.inviter_profile_id ?? null;
  // Never resolve to self (defensive — a worker is not their own employer).
  return inviter && inviter !== user.id ? inviter : null;
}
