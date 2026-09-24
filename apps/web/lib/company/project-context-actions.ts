"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isEmployerContextFailure,
  requireEmployerCompany,
} from "@/lib/company/employer-company-context";
import { insertProjectForCompany } from "@/lib/projects/create-project-core";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";

/**
 * First safe company-side project/client CREATE flow (v1).
 *
 * Creates a REAL project context record (and, optionally, one client record)
 * scoped to the caller's own company. No journal linking, no worker assignment,
 * no fake/seed data, no service_role, no outbound, no AI.
 *
 * Security model (defence in depth):
 *   - authorization derives from the ACTIVE WORKSPACE (M-P0-3):
 *     requireEmployerCompany() resolves the membership-validated workspace's
 *     company server-side. A worker-only, unauthenticated or personal-context
 *     caller fails closed → rejected. The company_id is taken from that
 *     server-side result, NEVER from client input.
 *   - the insert itself is still gated by RLS `projects_insert`
 *     (`owns_company(company_id) or is_admin()`), so cross-tenant create is
 *     impossible even if this layer were bypassed. The optional client insert is
 *     gated by `project_clients` RLS (`can_manage_project`). Normal Supabase
 *     client only — no service_role.
 */

export type CreateProjectContextState =
  | { ok: true }
  | {
      ok: false;
      /** `not_authorized` = the organization is real and the person is in it,
       *  but creating projects is not theirs to do here — refused by the
       *  capability matrix (a member) or by the row-level policy (a manager,
       *  42501: `projects_insert` is still `owns_company`, owner/admin only).
       *  Named, so the form can say who can grant it (SEP-7). */
      code: "no_company" | "not_authorized" | "invalid_name" | "error";
      message?: string;
    };

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

  // Authorization — company-side only, resolved server-side. M-P0-3: the
  // project is created in the ACTIVE workspace's company (membership-validated
  // per request); Personal / stale / revoked workspaces fail closed. RLS
  // `projects_insert` (`owns_company(company_id) or is_admin()`) still gates
  // the row itself, so a wrong id here can only fail, never cross a tenant.
  const company = await requireEmployerCompany();
  if (!company.ok) {
    return isEmployerContextFailure(company.reason)
      ? { ok: false, code: "error" }
      : { ok: false, code: "no_company" };
  }
  // §11 capability matrix: project creation is operational governance. A
  // member IS in a company workspace — the refusal is about their role, not
  // a missing company, so it is named as such.
  if (!hasOrganizationCapability(company.role, "manage-projects")) {
    return { ok: false, code: "not_authorized" };
  }

  const supabase = await createClient();

  // Rebuild W5: BOTH project-create entry points insert through the ONE core
  // (validation + W10 org binding + insert shape live in exactly one place).
  const created = await insertProjectForCompany(supabase, company.companyId, {
    title: name,
    city: location,
  });
  if (!created.ok) {
    if (created.reason === "invalid_title") return { ok: false, code: "invalid_name" };
    // 42501: the row-level policy refused the insert. `projects_insert` is
    // `owns_company(company_id)` — the creator or an active owner/admin
    // membership — so a MANAGER the matrix lets create projects is refused
    // by the database until the owner widens the policy
    // (`manages_organization`). The reason surfaces as itself, never as a
    // generic "could not create" (capability matrix P1, 2026-09-23).
    if (created.code === "42501") return { ok: false, code: "not_authorized" };
    return { ok: false, code: "error", message: created.message };
  }
  const project = { id: created.id };

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
