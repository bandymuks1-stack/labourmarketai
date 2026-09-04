import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/**
 * Prod walk 2026-09-05: E2E Worker Two — assigned to the chat-created
 * project, active engagement — typed "mano projektai" and was told "you are
 * in the personal space, no company projects here". A worker's projects are
 * the ones they are ASSIGNED to (owner contract §11, from the person's
 * side); the chat now answers with them from the SAME read the worker's
 * project page uses, and keeps the honest workspace line only when there
 * is no assignment at all.
 */
describe("a worker's \"my projects\" are their assignments", () => {
  it("the read is the worker project page's read, use-server, typed in its contract", () => {
    const src = read("lib/conversation/worker-projects.ts");
    expect(src.startsWith('"use server";')).toBe(true);
    expect(src).toContain('import { listWorkerProjects } from "@/lib/projects/worker-project-access";');
    expect(src).not.toMatch(/\.from\(|\.rpc\(/);
    expect(src).not.toMatch(/^export (interface|type|const) /m);
    expect(read("lib/conversation/worker-projects-contract.ts")).toContain("export type WorkerProjectsChatResult");
  });

  it("the chat lists the assignments with an open chip to the worker project page, and only falls back when there are none", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    const fn = chat.slice(chat.indexOf("const startProjects = useCallback"), chat.indexOf("const startProjects = useCallback") + 6000);
    const branch = fn.slice(fn.indexOf('if (res.kind === "no-company-context") {'), fn.indexOf('if (res.kind === "blocked") {'));
    expect(branch).toContain("loadWorkerProjectsForChat()");
    expect(branch).toContain("id: `link:/dashboard/projects/${pr.projectId}`");
    expect(branch).toContain('if (mine.kind !== "ok") {');
    expect(branch).toContain("assistant(labels.projectsNoCompany);");
  });

  it("copy exists in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const chat = JSON.parse(read(`messages/${locale}.json`)).conversation.chat as Record<string, string>;
      for (const key of ["workerProjectsIntro", "workerProjectsEnded", "chipOpenProjectPrefix"]) expect(chat[key], `${locale}.${key}`).toBeTypeOf("string");
      expect(chat.workerProjectsIntro).toContain("{count}");
    }
  });
});
