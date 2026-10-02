import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { exposedCapabilities } from "@/lib/capabilities/registry";

import { toolDefsOf } from "./toolset";

describe("the file-import tool declares its file argument to the host", () => {
  const defs = toolDefsOf(exposedCapabilities());
  const tool = defs.find((d) => d.name === "evidence_import_stage_file");

  it("is published with `openai/fileParams` naming the `file` argument", () => {
    expect(tool).toBeDefined();
    expect(tool?._meta).toEqual({ "openai/fileParams": ["file"] });
  });

  it("declares all four properties of the file object, with download_url and file_id required", () => {
    const file = (tool?.inputSchema as { properties: Record<string, { properties: Record<string, unknown>; required: string[] }> }).properties.file;
    expect(Object.keys(file.properties).sort()).toEqual(["download_url", "file_id", "file_name", "mime_type"]);
    expect(file.required).toEqual(expect.arrayContaining(["download_url", "file_id"]));
  });

  it("no other tool carries host metadata (their fingerprints stay stable)", () => {
    expect(defs.filter((d) => d._meta).map((d) => d.name)).toEqual(["evidence_import_stage_file"]);
  });
});
