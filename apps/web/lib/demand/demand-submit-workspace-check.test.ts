import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A NEED IS NEVER POSTED INTO A COMPANY THE PERSON DID NOT SEE.
 *
 * The needs page renders for the active organization; a workspace switched in
 * another tab meanwhile used to move the submit silently to the new
 * organization. The form now sends the organization it was rendered for, and
 * the server REFUSES on a mismatch — the id never chooses the target.
 */
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } }) },
    rpc,
    from: () => {
      throw new Error("no table read expected before the workspace check");
    },
  }),
}));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompany: async () => ({
    ok: true,
    organizationId: "22222222-2222-4222-8222-222222222222",
    companyId: "33333333-3333-4333-8333-333333333333",
  }),
}));

describe("need submit refuses a switched workspace", () => {
  beforeEach(() => rpc.mockReset());

  it("a different expected organization writes nothing", async () => {
    const { submitDemandRequest } = await import("./demand-request");
    const r = await submitDemandRequest(
      "hire_workers",
      { description: "Need two welders" },
      { expectedOrganizationId: "44444444-4444-4444-8444-444444444444" },
    );
    expect(r).toEqual({ ok: false, code: "workspace_changed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the form sends the organization its page was rendered for", () => {
    const WEB = join(__dirname, "..", "..");
    const form = readFileSync(join(WEB, "components", "app", "demand-request-button.tsx"), "utf8");
    expect(form).toMatch(/\{ expectedOrganizationId: organizationId \}/);
    expect(form).toMatch(/res\.code === "workspace_changed"/);
    expect(form).toMatch(/data-testid="demand-workspace-changed"/);
    const page = readFileSync(
      join(WEB, "app", "[locale]", "dashboard", "company", "needs", "page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/organizationId=\{employerCtx\.kind === "ok" \? employerCtx\.organizationId : null\}/);
  });
});
