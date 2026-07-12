"use server";

import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSafeReturnPath, isSafeReturnPath } from "@/lib/auth/redirect";

export type Role = "worker" | "company" | "agency" | "customer";

const ONBOARDING_ROLES = new Set<Role>([
  "worker",
  "company",
  "agency",
  "customer",
]);

const ROLE_ORDER: Role[] = ["worker", "company", "agency", "customer"];

/** Finish the first onboarding — person-first, multi-role. `roles` is a
 *  comma-separated list (1–4); the first in canonical order becomes the
 *  primary (active workspace) via `complete_onboarding`, and each extra is
 *  added via `add_role`. Both RPCs upsert `profile_roles` + the role's entity
 *  row (`workers` | `companies` | `agencies`) idempotently (0006/0007).
 *  Falls back to a single `role` field for backward compatibility. */
export async function completeOnboarding(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rawRoles = String(formData.get("roles") ?? formData.get("role") ?? "");
  const roles = [
    ...new Set(rawRoles.split(",").map((r) => r.trim()).filter(Boolean)),
  ] as Role[];
  if (roles.length === 0 || roles.some((r) => !ONBOARDING_ROLES.has(r))) {
    throw new Error(`Invalid onboarding roles: ${rawRoles}`);
  }
  const primary = ROLE_ORDER.find((r) => roles.includes(r)) as Role;
  const extras = roles.filter((r) => r !== primary);

  const display_name = String(formData.get("display_name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt");

  // First-login bootstrap resilience (auth-owner-access-bootstrap-p0): ensure
  // the caller's OWN profile shell exists before the RPC. handle_new_user
  // (migration 0001) normally creates it on signup, but if that trigger did not
  // run for a Google OAuth user, complete_onboarding's UPDATE would affect zero
  // rows and the user would loop back to /onboarding forever. Idempotent +
  // RLS-safe (profiles_insert allows id = auth.uid(); ON CONFLICT DO NOTHING
  // never overwrites an existing row). No DB migration, no fake data — only the
  // user's own shell, exactly what the trigger provides.
  const { error: ensureProfileErr } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email ?? null, locale },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (ensureProfileErr) {
    console.error("[completeOnboarding] ensure profile row failed", {
      code: ensureProfileErr.code,
      message: ensureProfileErr.message,
    });
  }

  // company/agency entity rows seed a draft name from role_data.name.
  const roleData = (r: Role): Record<string, string> =>
    (r === "company" || r === "agency") && display_name
      ? { name: `${display_name} UAB` }
      : {};

  const { error } = await supabase.rpc("complete_onboarding", {
    p_role: primary,
    // RPC nullif()s empty strings; pass the (possibly empty) string rather
    // than null to match the generated arg types. p_profession_id is optional
    // (SQL default null) so it's omitted.
    p_display_name: display_name,
    p_country: country,
    p_role_data: roleData(primary),
  });
  if (error) {
    console.error("[completeOnboarding] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`complete_onboarding RPC failed: ${error.message}`);
  }

  // Additional roles. add_role flips active_role to the role it adds, so we
  // reset active_role back to the chosen primary afterwards.
  for (const r of extras) {
    const { error: e } = await supabase.rpc("add_role", {
      p_role: r,
      p_role_data: roleData(r),
    });
    if (e) {
      console.error("[completeOnboarding] add_role failed", {
        role: r,
        message: e.message,
      });
      throw new Error(`add_role RPC failed: ${e.message}`);
    }
  }
  if (extras.length > 0) {
    await supabase
      .from("profiles")
      .update({ active_role: primary })
      .eq("id", user.id);
  }

  revalidatePath(`/${locale}/dashboard`);
  // Deep-link continuity (core-network area B): a safe ?next= carried
  // through login -> onboarding (e.g. an invitation link) wins over the
  // role dashboard, so an invited new user lands back on the invitation.
  const nextRaw = formData.get("next");
  if (typeof nextRaw === "string" && isSafeReturnPath(nextRaw)) {
    redirect(getSafeReturnPath(nextRaw, locale));
  }
  // Role-aware first-login destination. A company/agency/customer who
  // just picked their primary role should land on THEIR workspace, not
  // the generic /dashboard cockpit (which surfaces worker-shaped
  // prompts like "Profession / Skills / Journal"). Workers stay on
  // the generic /dashboard which already is the worker cockpit.
  const ROLE_DASHBOARD: Record<Role, string> = {
    worker: `/${locale}/dashboard`,
    company: `/${locale}/dashboard/company`,
    agency: `/${locale}/dashboard/agency`,
    customer: `/${locale}/dashboard/buyer`,
  };
  redirect(ROLE_DASHBOARD[primary]);
}

/** Switch the workspace the user is currently looking at. */
export async function switchActiveRole(role: Role): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // sanity: the role must already be one the user holds
  const { data: held } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("profile_id", user.id)
    .eq("role", role)
    .maybeSingle();
  if (!held) throw new Error("Role not held by user");

  // Preserve admin across workspace switches. Before overwriting
  // active_role, if the user is currently admin via active_role
  // (the legacy single-source signal) we MUST persist an admin row
  // in profile_roles so the app-level admin gate (dashboard layout,
  // requireSuperadmin) keeps recognising them after the switch.
  // Idempotent: a conflict on (profile_id, role) is a no-op. We do
  // NOT touch profiles.is_admin or any other column. The DB-level
  // RLS helper `public.is_admin()` still reads only active_role and
  // is documented as a follow-up migration.
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  if (currentProfile?.active_role === "admin") {
    await supabase
      .from("profile_roles")
      .upsert(
        { profile_id: user.id, role: "admin" },
        { onConflict: "profile_id,role" },
      );
  }

  await supabase
    .from("profiles")
    .update({ active_role: role })
    .eq("id", user.id);

  revalidatePath("/", "layout");
}

/** Add an additional role to the user's catalogue and switch into it.
 *  Atomic: catalogue upsert + role-specific entity row creation
 *  (`workers` | `companies` | `agencies`) happen in one transaction via
 *  the `public.add_role` RPC (migration 0007). Idempotent on retry. */
export async function addRole(role: Role, formData?: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!ONBOARDING_ROLES.has(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  const role_data: Record<string, string> = {};
  if (formData) {
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") role_data[k] = v.trim();
    }
  }

  const { error } = await supabase.rpc("add_role", {
    p_role: role,
    p_role_data: role_data,
  });
  if (error) {
    console.error("[addRole] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`add_role RPC failed: ${error.message}`);
  }

  revalidatePath("/", "layout");
}
