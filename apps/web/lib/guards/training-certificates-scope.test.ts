import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Function 11.8 — the training certificate list (lane L, 2026-11-16).
 *
 *   1. ONE ORGANIZATION'S CONTEXT (decision 0024): the certificate read is
 *      scoped to the active organization (plus the person's own), and the
 *      worker-document half to the person's own worker records — RLS alone
 *      lets a multi-organization manager or a platform admin read more.
 *   2. NO RAW SLUG: a worker-document certificate is named through the
 *      documents' own `types.<slug>` labels, never by printing the slug.
 *   3. WHO IT IS FOR: a managed assignment row names its assignee, from the
 *      organization's existing member list.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const reads = read("lib/training/training.ts");
const ui = read("components/app/training-register.tsx");

/** The body of getCertificationRegister. */
function certificateRead(src: string): string {
  const start = src.indexOf("export async function getCertificationRegister(");
  expect(start).toBeGreaterThan(0);
  return src.slice(start);
}

describe("certificate list is scoped to the active workspace", () => {
  it("the read takes the active organization and the register passes it", () => {
    expect(reads).toMatch(/getCertificationRegister\(\s*activeOrganizationId: string \| null,?\s*\)/);
    expect(ui).toContain("await getCertificationRegister(activeOrganizationId)");
    expect(ui).not.toContain("getCertificationRegister()");
  });

  it("training certificates are filtered by organization, or the person's own", () => {
    const body = certificateRead(reads);
    expect(body).toContain("organization_id.eq.${activeOrganizationId},assignee_profile_id.eq.${user.id}");
    expect(body).toContain('.eq("assignee_profile_id", user.id)');
  });

  it("worker-document certificates are only the person's own worker records", () => {
    const body = certificateRead(reads);
    expect(body).toContain('.eq("profile_id", user.id)');
    expect(body).toContain('.in("worker_id", ownWorkerIds)');
  });

  it("NEGATIVE CONTROL: an unscoped training read is caught", () => {
    const bad = certificateRead(reads).replace(/organization_id\.eq\.[^`]*`/, "`");
    expect(bad).not.toContain("organization_id.eq.${activeOrganizationId}");
  });
});

describe("no raw document type slug is rendered", () => {
  it("the read never puts the slug into the display label", () => {
    expect(reads).not.toMatch(/label:\s*String\(r\.document_type_slug/);
    expect(reads).toContain("documentTypeSlug: slug");
  });

  it("the register names the type through documents.types", () => {
    expect(ui).toContain('const tDoc = await getTranslations("documents");');
    expect(ui).toContain("tDoc(`types.${c.documentTypeSlug}` as never)");
  });

  it("every locale has a label for each listed type", () => {
    const listed = /CERTIFICATE_DOCUMENT_TYPES = \[([^\]]+)\]/.exec(reads)?.[1] ?? "";
    const slugs = [...listed.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(slugs.length).toBeGreaterThan(0);
    const dir = join(WEB, "messages");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const msgs = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        documents: { types: Record<string, string> };
      };
      for (const slug of slugs) expect(msgs.documents.types[slug], `${f} ${slug}`).toBeTruthy();
    }
  });
});

describe("a managed assignment shows who it is for", () => {
  it("assignee names come from the existing member list of the active organization", () => {
    expect(ui).toContain('import { listOrganizationMembers } from "@/lib/company/memberships";');
    expect(ui).toContain("await listOrganizationMembers(activeOrganizationId)");
    expect(ui).toContain('data-testid="training-managed-assignee"');
    expect(ui).toContain("assigneeLabel.get(a.assigneeProfileId)");
  });
});
