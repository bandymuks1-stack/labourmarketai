import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The transcription image must contain every module server.mjs imports.
 * 2026-10-06: server.mjs began importing ./upload-auth.mjs (signed browser
 * upload tokens) while the Dockerfile still copied only server.mjs - the built
 * image would have crashed on start (ERR_MODULE_NOT_FOUND) and voice would have
 * been silently dead in production while every unit test passed.
 */
const DIR = join(__dirname, "..", "..", "..", "..", "services", "transcribe");
const server = readFileSync(join(DIR, "server.mjs"), "utf8").replace(/\r/g, "");
const docker = readFileSync(join(DIR, "Dockerfile"), "utf8").replace(/\r/g, "");

describe("transcribe image contents", () => {
  const relative = [...server.matchAll(/from\s+"(\.\/[^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ""));

  it("server.mjs has relative imports to check (the guard is not vacuous)", () => {
    expect(relative).toContain("upload-auth.mjs");
  });

  it("the Dockerfile COPYs server.mjs and every relative module it imports into /app", () => {
    const copies = docker
      .split("\n")
      .filter((l) => /^COPY\s/.test(l) && !/--from=/.test(l))
      .join(" ");
    for (const f of ["server.mjs", ...relative]) {
      expect(copies, `Dockerfile must COPY ${f}`).toContain(f);
    }
  });
});
