import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner contract 2026-09-04 §5.5 — ONE backbone, never a second write path.
 * The worker document file has two entries (the documents page form redirects
 * with a notice; the chat action returns it) that MUST share one core: same
 * ownership check, same canonical path, same register RPC, same rollback.
 */
const src = readFileSync(
  join(process.cwd(), "lib/documents/document-file-actions.ts"),
  "utf8",
);

function body(fnName: string): string {
  const start = src.indexOf(fnName + "(");
  expect(start, fnName + " exists").toBeGreaterThan(-1);
  const rest = src.slice(start);
  const next = rest.slice(1).search(/\n(?:export )?async function /);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("worker document file: one write path", () => {
  it("both entries run the shared core", () => {
    const page = body("export async function uploadWorkerDocumentFileAction");
    const chat = body("export async function uploadWorkerDocumentFileForChatAction");
    expect(page).toContain("await uploadWorkerDocumentFileCore(formData)");
    expect(chat).toContain("await uploadWorkerDocumentFileCore(formData)");
    // page contract redirects; chat contract returns the notice
    expect(page).toContain("finish(locale, notice)");
    expect(chat).toContain("return { notice }");
    expect(chat).not.toContain("finish(");
    expect(chat).not.toContain("redirect(");
  });

  it("only the core touches the worker scope of uploadAndRegister", () => {
    // call sites only (the option type declares `scope: "worker" | "organization"`)
    const workerScopeCalls = src.split('scope: "worker",').length - 1;
    expect(workerScopeCalls).toBe(1);
    const core = body("async function uploadWorkerDocumentFileCore");
    expect(core).toContain('scope: "worker"');
    expect(core).toContain('.from("workers")');
    expect(core).toContain('.eq("profile_id", user.id)');
    expect(core).toContain("buildWorkerDocumentFilePath(");
    expect(core).toContain("nextDocumentFileVersion(");
  });

  it("the core is internal — not a server action reachable from the client", () => {
    expect(src).not.toContain("export async function uploadWorkerDocumentFileCore");
  });
});
