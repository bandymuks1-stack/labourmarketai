/**
 * GUARD — cross-role security pass, owner order 2026-11-22 (decision 0033: a
 * hidden party is not identifiable through ids; machine doors reveal nothing).
 *   - marketplace discovery returns no owner or organisation id for another
 *     person's listing;
 *   - service-offering discovery returns no provider id;
 *   - the cron secret check pads before comparing (no length leak);
 *   - the waitlist answers a known address the same as a new one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

describe("security pass 2026-11-22", () => {
  it("marketplace discovery hides another publisher's ids on both paths", () => {
    const src = read("lib/marketplace/listings.ts");
    expect(src).toContain("r.isMine ? r : { ...r, ownerId: null, organizationId: null }");
    expect(src.match(/hideQaMarked\(withoutForeignIds\(rows\)/g)?.length).toBe(2);
    expect(src.indexOf("await attachActors(supabase, rows);")).toBeLessThan(src.indexOf("rows: hideQaMarked(withoutForeignIds(rows)"));
  });

  it("service-offering discovery selects and returns no provider id", () => {
    const src = read("lib/marketplace/service-requests.ts");
    const discover = src.slice(src.indexOf('.from("service_offerings")'), src.indexOf("hideQaMarked(rows, ctx.qaViewer"));
    expect(discover).not.toMatch(/provider_id, created_at|providerId:/);
    expect(read("lib/marketplace/service-requests-shared.ts")).not.toMatch(/readonly providerId: string;\n  readonly createdAt/);
  });

  it("the cron secret is compared padded, with no early return on length", () => {
    const src = read("lib/api/cron-auth.ts");
    expect(src).toContain("return constantTimeEquals(`Bearer ${secret}`, header) ? \"ok\" : \"unauthorized\";");
    expect(src).not.toMatch(/expected\.length !== given\.length/);
  });

  it("the waitlist does not reveal a known address", () => {
    expect(read("app/api/waitlist/route.ts")).not.toContain("duplicate: true");
  });
});
