import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/company/resolve-organization-id", () => ({
  resolveOrganizationIdForCompany: async () => "org-1",
}));

import { insertProjectForCompany } from "./create-project-core";

/**
 * A project with a place carries its COUNTRY (owner decision 2026-11-12,
 * Swedish employer audit J-1). Every project used to be created with
 * `projects.country` NULL: no create path asked for it, so a Swedish site read
 * as nowhere. The rule lives in the ONE core every interface inserts through
 * (web create route, inline create, chat, MCP project.create_*): a place
 * without a resolvable ISO country is refused before any write, a typed value
 * that is not a country is refused, and a project with no place may stay
 * without one. Nothing is guessed and existing rows are not touched.
 */
function fakeSupabase() {
  const inserted: Record<string, unknown>[] = [];
  const supabase = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "p-1" }, error: null }) }) };
      },
    }),
  };
  return { supabase: supabase as never, inserted };
}

describe("the project create core and the country", () => {
  it.each([
    ["a city with no country", { city: "Göteborg", country: null }],
    ["a city with a non-country", { city: "Göteborg", country: "Narnia" }],
    ["a non-country even without a city", { city: null, country: "XX" }],
  ])("%s is refused before any write", async (_label, place) => {
    const { supabase, inserted } = fakeSupabase();
    const r = await insertProjectForCompany(supabase, "c-1", { title: "Harbour site", ...place });
    expect(r).toEqual({ ok: false, reason: "country_required" });
    expect(inserted).toHaveLength(0);
  });

  it("a code or a name is stored as the ISO code", async () => {
    for (const country of ["SE", "se", "Sweden"]) {
      const { supabase, inserted } = fakeSupabase();
      const r = await insertProjectForCompany(supabase, "c-1", { title: "Harbour site", city: "Göteborg", country });
      expect(r).toEqual({ ok: true, id: "p-1" });
      expect(inserted[0]).toMatchObject({ city: "Göteborg", country: "SE" });
    }
  });

  it("a project with no place may stay without a country (nothing is guessed)", async () => {
    const { supabase, inserted } = fakeSupabase();
    const r = await insertProjectForCompany(supabase, "c-1", { title: "Office tasks", city: null });
    expect(r).toEqual({ ok: true, id: "p-1" });
    expect(inserted[0]).toMatchObject({ city: null, country: null });
  });
});

describe("every create interface carries the country to the core", () => {
  const WEB = join(__dirname, "..", "..");
  const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");

  it("the inline create action and the dedicated route pass it and name the refusal", () => {
    const inline = read("lib", "projects", "actions.ts");
    expect(inline).toContain("insertProjectForCompany(supabase, companyId, { title, city, country })");
    expect(inline).toContain('if (created.reason === "country_required") return { ok: false, code: "country_required" };');
    const route = read("lib", "company", "project-context-actions.ts");
    expect(route).toMatch(/city: location,\s*country,/);
    expect(route).toContain('if (created.reason === "country_required") return { ok: false, code: "country_required" };');
  });

  it("both web forms offer the ISO list and say why a create was refused", () => {
    const form = read("components", "app", "project-context-create-form.tsx");
    expect(form).toContain('data-testid="project-country-select"');
    expect(form).toContain("countryOptionsForLocale(locale)");
    expect(form).toContain('t("errorCountry")');
    const inline = read("components", "app", "project-assignment-manager.tsx");
    expect(inline).toContain('data-testid="project-create-country"');
    expect(inline).toContain("l.countryRequired");
  });

  it("chat and MCP pass it; the MCP draft names it as missing instead of minting a token", () => {
    expect(read("lib", "conversation", "company-executors.ts")).toContain('country: input.country ?? ""');
    expect(read("lib", "conversation", "company-forms.ts")).toContain('labelKey: "conversation.forms.fields.projectCountry"');
    const mcp = read("lib", "capabilities", "employer-operations-capabilities.ts");
    expect(mcp).toContain('missing: ["country"]');
    const draft = mcp.slice(mcp.indexOf('id: "project.create_draft"'));
    expect(draft.indexOf("const missing = projectCountryMissing(draft);")).toBeLessThan(draft.indexOf("mintCapabilityConfirmation("));
    expect(mcp).toContain("country: (n.country as string | null) ?? null,");
  });

  it("every catalog names the field and the refusal", () => {
    for (const l of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const m = JSON.parse(read("messages", `${l}.json`));
      expect(m.companyOps.createProject.countryLabel, l).toBeTruthy();
      expect(m.companyOps.createProject.errorCountry, l).toBeTruthy();
      expect(m.projects.create.countryLabel, l).toBeTruthy();
      expect(m.projects.create.errorCountry, l).toBeTruthy();
      expect(m.conversation.forms.fields.projectCountry, l).toBeTruthy();
    }
  });
});
