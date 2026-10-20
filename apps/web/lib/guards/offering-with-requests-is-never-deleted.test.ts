import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AN OFFERING WITH REQUESTS IS HISTORY (audit 2026-10-20).
 * service_offering_requests.offering_id cascades on delete: deleting an
 * offering erased every buyer's request on it, accepted ones included. The
 * delete now refuses (fail closed) and the page says to pause it instead.
 */
const app = resolve(__dirname, "..", "..");
const lib = readFileSync(resolve(app, "lib/services/service-offerings.ts"), "utf8");
const section = readFileSync(resolve(app, "components/app/service-offerings-section.tsx"), "utf8");

describe("deleting a service offering never erases its requests", () => {
  const fn = lib.slice(lib.indexOf("export async function deleteServiceOffering"));
  it("counts the offering's requests BEFORE the delete and refuses when there are any", () => {
    const count = fn.indexOf('.from("service_offering_requests")');
    const del = fn.indexOf(".delete()");
    expect(count).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(count);
    expect(fn).toMatch(/if \(\(count \?\? 0\) > 0\) return \{ kind: "has-requests" \};/);
  });
  it("an unreadable count refuses too (fail closed)", () => {
    expect(fn).toMatch(/if \(countError\) \{[\s\S]*?return \{ kind: "error"/);
  });
  it("the page tells the provider to pause it instead", () => {
    expect(section).toMatch(/result\.kind === "has-requests"\) setError\(labels\.errorHasRequests\)/);
  });
});
