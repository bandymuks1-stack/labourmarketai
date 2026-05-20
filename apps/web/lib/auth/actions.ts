"use server";

import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Role = "worker" | "company" | "agency" | "customer";

/** Finish the first onboarding — write role-specific data into the user's
 *  matching `profile_roles.role_data` and stamp `profiles.onboarded_at`. */
export async function completeOnboarding(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const role = String(formData.get("role") ?? "") as Role;
  const display_name = String(formData.get("display_name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt");

  // Per-role payload from the form
  const role_data: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (
      k === "role" ||
      k === "display_name" ||
      k === "country" ||
      k === "locale"
    )
      continue;
    if (typeof v === "string") role_data[k] = v.trim();
  }

  // profile core fields
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      full_name: display_name || null,
      country: country || null,
      active_role: role,
      onboarded_at: new Date().toISOString(),
      onboarded: true,
    })
    .eq("id", user.id);
  if (profErr) {
    throw new Error(`profiles update failed: ${profErr.message}`);
  }

  // upsert the role row (catalogue + role-specific blob)
  const { error: roleErr } = await supabase.from("profile_roles").upsert(
    {
      profile_id: user.id,
      role,
      is_active: true,
      role_data,
    },
    { onConflict: "profile_id,role" },
  );
  if (roleErr) {
    throw new Error(`profile_roles upsert failed: ${roleErr.message}`);
  }

  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/dashboard`);
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

  await supabase
    .from("profiles")
    .update({ active_role: role })
    .eq("id", user.id);

  revalidatePath("/", "layout");
}

/** Add an additional role to the user's catalogue and switch into it. */
export async function addRole(role: Role, formData?: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const role_data: Record<string, string> = {};
  if (formData) {
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") role_data[k] = v.trim();
    }
  }

  await supabase.from("profile_roles").upsert(
    {
      profile_id: user.id,
      role,
      is_active: true,
      role_data,
    },
    { onConflict: "profile_id,role" },
  );

  await supabase
    .from("profiles")
    .update({ active_role: role })
    .eq("id", user.id);

  revalidatePath("/", "layout");
}
