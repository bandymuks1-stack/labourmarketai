import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A capability read that FAILED must answer as a failure, never as an empty
 * list (#1314). The native app and MCP clients render `items: []` as "you
 * have no notifications" and `kind: "empty"` as "you have no projects"; both
 * reads used to flatten a failed database read into exactly those answers.
 */
const REPO = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("capability reads keep their failure", () => {
  it("notification.list reads the failure-keeping durable read", () => {
    const caps = read("lib/capabilities/domain-action-capabilities.ts");
    const at = caps.indexOf('read("notification.list"');
    expect(at).toBeGreaterThan(-1);
    const body = caps.slice(at, caps.indexOf("oneStep(", at));
    expect(body).toContain("readDurableNotifications(limit)");
    expect(body).not.toContain("getDurableNotifications(");
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toContain('if (feed.kind !== "ready") return { kind: "error" };');
  });

  it("worker.projects.list's loader turns a failed assignments read into an error", () => {
    const src = read("lib/conversation/worker-projects.ts");
    expect(src).toContain("listWorkerProjectsResult()");
    expect(src).toContain('if (read.status !== "ok") return { kind: "error" };');
  });
});
