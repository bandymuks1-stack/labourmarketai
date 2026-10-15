import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "home-server.ts"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("home loader — authorization boundary", () => {
  it("reads only under the caller's own session: no admin client, no service role, no privileged read", () => {
    expect(code).not.toMatch(/createAdminClient|service_role|SERVICE_ROLE|supabaseAdmin|admin\(/i);
  });

  it("no reader takes an identity argument, so another identity's home cannot be requested", () => {
    // Every exported loader is a zero-argument cached function.
    for (const name of ["loadHomeProjects", "loadHomeEvents", "loadHomeWaiting", "loadHomeRunning", "loadHomeBecause", "loadHomeOutside"]) {
      expect(code, name).toContain(`export const ${name} = cache(async ()`);
    }
  });

  it("a failed read becomes null (UNKNOWN), never an empty array", () => {
    const catches = code.match(/catch \{\s*return null;\s*\}/g) ?? [];
    expect(catches.length).toBe(2);
    expect(code).toMatch(/result\.status !== "ok"\) return null/);
    expect(code).toMatch(/feed\.kind === "ready" \? feed\.events : null/);
  });

  it("uses the ONE honest project reader, not the lossy one", () => {
    expect(code).toMatch(/listWorkerProjectsResult/);
    expect(code).not.toMatch(/listWorkerProjects\(/);
  });
});
