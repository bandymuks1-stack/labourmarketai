import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner decisions 2026-11-07 (B) and 2026-11-14: the machine-to-machine internal feeds Agentai OS reads are served on
 * the private Docker network `lm-agentai-internal` only. The public vhost must answer 404 for them, like /api/cron/,
 * BEFORE the catch-all proxy location. A future vhost edit that drops one of these blocks fails here.
 */
const VHOST = readFileSync(join(__dirname, "..", "..", "..", "..", "ops", "vps", "labourmarket.ai.nginx.conf"), "utf8");

const PRIVATE_ONLY_PREFIXES = [
  "/api/cron/",
  "/api/internal/commercial-requests/",
  "/api/internal/registrations-daily/",
] as const;

describe("public vhost keeps the private-only internal routes off the internet", () => {
  it.each(PRIVATE_ONLY_PREFIXES)("%s answers 404 publicly, ahead of the proxy location", (prefix) => {
    const block = `location ^~ ${prefix} { return 404; }`;
    const at = VHOST.indexOf(block);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(VHOST.lastIndexOf("location / {"));
  });

  it("the registrations route file exists for the prefix it protects", () => {
    const route = join(__dirname, "..", "..", "app", "api", "internal", "registrations-daily", "v1", "route.ts");
    expect(readFileSync(route, "utf8")).toMatch(/authorizeSupplyFeedRequest/);
  });
});
