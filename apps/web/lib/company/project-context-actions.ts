"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnCompany } from "@/lib/company/company-workers";
import { resolveOrganizationIdForCompany } from "@/lib/company/resolve-organization-id";

/**
 * First safe company-side project/client CREATE flow (v1).
 *
 * Creates a REAL project context record (and, optionally, one client record)
 * scoped to the caller's own company. No journal linking, no worker assignment,
 * no fake/seed data, no service_role, no outbound, no AI.
 *
 * Security model (defence in depth):
 *   - authorization is the existing "owns a company" check — getOwnCompany()
 *     resolves the company where profile_id = auth.uid() (the OWNER). A
 *     worker-only or unauthenticated caller resolves to null → rejected. The
 *     company_id is taken from that server-side result, NEVER from client input.
 *   - the insert itself is still gated by RLS `projects_insert`
 *     (`owns_company(company_id) or is_admin()`), so cross-tenant create is
 *     impossible even if this layer were bypassed. The optional client insert is
 *     gated by `project_clients` RLS (`can_manage_project`). Normal Supabase
 *     client only — no service_role.
 */

export type CreateProjectContextState =
  | { ok: true }
  | { ok: false; code: "no_company" | "invalid_name" | "error"; message?: string };

const NAME_MIN = 2;
const NAME_MAX = 120;
const FIELD_MAX = 200;

export async function createProjectContextAction(
  _prev: CreateProjectContextState | null,
  formData: FormData,
): Promise<CreateProjectContextState> {
  const locale = String(formData.get("locale") ?? "lt");
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim().slice(0, FIELD_MAX) || null;
  const clientName =
    String(formData.get("client_name") ?? "").trim().slice(0, FIELD_MAX) || null;

  // Server-side validation: a real project name is required.
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, code: "invalid_name" };
  }

  // Authorization — company-side only, resolved server-side.
  const company = await getOwnCompany();
  if (!company) return { ok: false, code: "no_company" };

  const supabase = await createClient();

  // W10: bind the canonical organization at creation so the project is never
  // left org-less (the stale state the W10 backfill corrected).
  const organizationId = await resolveOrganizationIdForCompany(supabase, company.id);

  // Insert the project context (RLS double-enforces owns_company(company_id)).
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      company_id: company.id,
      organization_id: organizationId,
      title: name,
      city: location,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !project?.id) {
    return { ok: false, code: "error", message: error?.message };
  }

  // Optional client record, linked to the just-created project. project_clients
  // is not in the generated Database type yet — cast (RLS still enforces
  // can_manage_project). Best-effort: a client failure does not roll back the
  // project; the owner can add a client later. No fake fallback row is written.
  if (clientName) {
    const { error: clientError } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    })
      .from("project_clients")
      .insert({ project_id: project.id, name: clientName });
    if (clientError) {
      // Surface honestly but keep the created project; no silent fabrication.
      revalidatePath(`/${locale}/dashboard/company`);
      return { ok: false, code: "error", message: clientError.message };
    }
  }

  revalidatePath(`/${locale}/dashboard/company`);
  return { ok: true };
}
