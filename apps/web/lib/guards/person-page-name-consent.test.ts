import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Owner directive 2026-10-18: a worker reached through the employer-visibility
 * consent is anonymous by default; the name needs a real working relationship
 * (or the worker's own per-organization disclosure). The `workers` row is
 * readable through that consent, so the person page must not treat "the row
 * came back" as permission to print the name.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

describe("person page — name only with a working relationship", () => {
  const page = read("app/[locale]/dashboard/people/[workerId]/page.tsx");
  // Executable code only: the helper's header comment explains the consent it must NOT rely on.
  const helper = read("lib/visibility/worker-identity-visibility.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("the page derives the shown name through the relationship check", () => {
    expect(page).toContain('from "@/lib/visibility/worker-identity-visibility"');
    expect(page).toMatch(/const nameVisible = await viewerHasWorkerRelation\(/);
    expect(page).toMatch(/nameVisible \? \(worker\.display_name as string \| null\)\?\.trim\(\) : null/);
    expect(page).toMatch(/anonymizedWorkerLabel\(worker\.id as string\)/);
  });

  it("the relationship check uses only relationship-scoped reads, never discoverability", () => {
    expect(helper).toContain('rpc("caller_manages_worker"');
    expect(helper).toContain('.from("engagement_contexts")');
    expect(helper).toContain('.from("project_worker_assignments")');
    expect(helper).toContain('.from("company_workers")');
  });

  it("an engagement counts only when its relationship type grants worker visibility", () => {
    // student / intern enrolment must not disclose the name (20260827210000 least privilege).
    expect(helper).toContain('relationship_types!inner(grants_worker_visibility)');
    expect(helper).toContain('.eq("relationship_types.grants_worker_visibility", true)');
    expect(helper).not.toMatch(/worker_profile_discoverable|can_view_worker|profile_discoverability/);
  });

  it("fails closed: any error means no relationship", () => {
    expect(helper).toMatch(/catch \{\s*return false;\s*\}/);
    expect(helper).toMatch(/return false;\s*\}\s*$/);
  });
});
