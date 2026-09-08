import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/**
 * Readback truth (owner contract 2026-09-04 §7): after "Priskirta projektui."
 * the project panel must show the assignment. Prod walk on `f49cc972`: the
 * chat re-opened the SAME project after the write, the address did not
 * change, the detail effect did not re-run, and the panel said "Priskirta 0"
 * beside the success line. The opener now stamps a fresh `pr` token and the
 * detail re-reads when it changes.
 */
describe("the project panel re-reads after a write that re-opens the same project", () => {
  it("openProjectResult stamps a fresh token into the address", () => {
    const hook = read("components/app/workspace/use-result-param.ts");
    const opener = hook.slice(hook.indexOf("openProjectResult: useCallback("), hook.indexOf("selectInteraction: useCallback("));
    expect(opener).toContain('result: "project"');
    expect(opener).toContain("pr: Date.now().toString(36)");
  });

  it("the detail effect depends on that stamp, read from the live search params", () => {
    const panel = read("components/app/workspace/project-result.tsx");
    expect(panel).toContain('import { useSearchParams } from "next/navigation";');
    expect(panel).toContain('const refreshStamp = searchParams?.get("pr") ?? null;');
    expect(panel).toContain("}, [projectId, attempt, refreshStamp]);");
  });

  it("the chat still re-opens the project through the ONE opener after an assignment", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    const assign = chat.slice(chat.indexOf("const runAssignWorker = useCallback("), chat.indexOf("const runOfferDecision = useCallback("));
    expect(assign).toContain("selectProjectRef.current(projectId);");
    expect(chat).toContain("selectProjectRef.current = openProjectResult;");
  });
});
