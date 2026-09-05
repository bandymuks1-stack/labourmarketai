import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * GAP-RESOLUTION JOURNEY — privacy and one-backbone guards (owner course
 * correction 2026-09-05). The journey MANAGER readiness gap → instruction →
 * the person's brief → exact requirement + own document state → record →
 * answer in the thread → the manager's readiness line → received → checked →
 * readiness recalculates must never give the manager access to the person's
 * documents (§4 default-closed), must reuse the existing document / evidence /
 * instruction / readiness models (no second truth), and must reach the same
 * state from the chat and from the visual surface (no chat-specific business
 * workflow, no separate executor).
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const MANAGER_SIDE = [
  "lib/conversation/project-readiness.ts",
  "lib/conversation/project-readiness-contract.ts",
  "lib/projects/operations.ts",
  "lib/projects/operations-derive.ts",
];
const WORKER_DOCUMENT_TRUTH = /worker_documents|document_files|listMyDocuments|getWorkerDocumentCentre|getWorkerDocumentFiles/;

describe("the manager never reads the person's documents to complete the journey", () => {
  it("the manager-side readiness reads name no worker-document table or reader", () => {
    for (const rel of MANAGER_SIDE) expect(read(rel), rel).not.toMatch(WORKER_DOCUMENT_TRUTH);
  });

  it("the instruction-replies read is participant-scoped: the caller's own instructions, the thread's other participant, messages only — no document, no profile scan", () => {
    const INS = read("lib/instructions/instructions.ts");
    const fn = INS.slice(INS.indexOf("export async function listProjectInstructionReplies"));
    expect(fn).toMatch(/\.eq\("author_id", user\.id\)/);
    expect(fn).toMatch(/\.from\("conversation_participants"\)/);
    expect(fn).not.toMatch(WORKER_DOCUMENT_TRUTH);
    expect(fn).not.toMatch(/\.from\("profiles"\)|\.from\("workers"\)/);
    expect(fn).not.toMatch(/createAdminClient|service_role/);
    expect(fn).toMatch(/const supabase = await createClient\(\);/);
  });

  it("worker documents stay default-closed in the schema this journey relies on (owner + admin select; no manager grant)", () => {
    const MIG = readFileSync(join(WEB, "..", "..", "supabase", "migrations", "20260610170000_worker_documents_readiness.sql"), "utf8");
    const policy = MIG.slice(MIG.indexOf("create policy worker_documents_select"), MIG.indexOf("drop policy if exists worker_document_events_select"));
    expect(policy).toMatch(/w\.profile_id = auth\.uid\(\)/);
    expect(policy).toMatch(/public\.is_admin\(\)/);
    expect(policy).not.toMatch(/manages_organization|can_manage_project|using \(true\)/);
  });

  it("the person-side asks read is the only bridge, and it is the PERSON's own rows + own documents (no cross-scope read)", () => {
    const ACCESS = read("lib/projects/worker-project-access.ts");
    const fn = ACCESS.slice(ACCESS.indexOf("export async function listOwnReadinessItems"), ACCESS.indexOf("export interface OwnProjectAsks"));
    expect(fn).toMatch(/\.eq\("worker_id", workerId\)/);
    const own = ACCESS.slice(ACCESS.indexOf("export async function loadOwnProjectAsks"));
    expect(own).toMatch(/const workerId = await getOwnWorkerId\(\);/);
    expect(own).toContain("listMyDocuments()");
    expect(own).not.toMatch(/createAdminClient|service_role/);
  });
});

describe("one backbone: chat and visual surfaces share the reads and the writes", () => {
  const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
  const PAGE = read("app/[locale]/dashboard/instructions/page.tsx");
  const READ = read("lib/conversation/worker-projects.ts");

  it("the person's asks come from ONE domain read in both the chat and the instructions page", () => {
    expect(READ).toContain("loadOwnProjectAsks(activeIds)");
    expect(PAGE).toContain("loadOwnProjectAsks(read.instructions.map((i) => i.projectId)");
    expect(read("lib/conversation/worker-projects-contract.ts")).not.toMatch(/\.from\(|\.rpc\(/);
  });

  it("recording the document is the SAME add-document flow / the SAME documents page; answering is the SAME confirm-then-sendMessage reply; nothing new writes", () => {
    expect(CHAT).toMatch(/startAddDocument\("", \{ typeSlug: chipType, thenReply: chipConversation \? askReplyThreadsRef\.current\.get\(chipConversation\) : undefined \}\)/);
    expect(read("components/app/instruction-project-asks.tsx")).toMatch(/href="\/dashboard\/documents"/);
    expect(CHAT).toMatch(/pushEmbed\(<ChatMessageReply threads=\{\[thenReply\]\} locale=\{locale\} \/>\)/);
    expect(read("components/app/conversation/chat-message-reply.tsx")).toContain('import { sendMessage } from "@/lib/communication/actions";');
  });

  it("the manager's received AND checked steps are the ONE readiness executor (`company.set-readiness-item`), no separate executor", () => {
    const got = CHAT.slice(CHAT.indexOf('chip.id.startsWith("ready-got:")'), CHAT.indexOf('chip.id.startsWith("ready-checked:")'));
    const checked = CHAT.slice(CHAT.indexOf('chip.id.startsWith("ready-checked:")'), CHAT.indexOf('chip.id.startsWith("ready-ask:")'));
    expect(got).toMatch(/"company\.set-readiness-item",\s*\{ projectId, workerProfileId, itemKey, label: item\.label, status: "received" \}/);
    expect(checked).toMatch(/"company\.set-readiness-item",\s*\{ projectId, workerProfileId, itemKey, label: item\.label, status: "checked" \}/);
    expect(checked).toMatch(/w\?\.itemsReceived\.find\(\(i\) => i\.key === itemKey\)/);
    const EXEC = read("lib/conversation/company-executors.ts");
    expect(EXEC.split('"company.set-readiness-item": async').length).toBe(2);
    expect(read("lib/conversation/company-schemas.ts")).toMatch(/status: z\.enum\(\["needed", "missing", "received", "checked", "not_required"\]\)/);
  });

  it("readiness recalculates from the SAME rows: the chat re-reads after every write; the operations centre derives checked/total from the same table", () => {
    expect(CHAT).toMatch(/runReadinessWrite = useCallback/);
    expect(read("lib/conversation/project-readiness.ts")).toContain("deriveReadinessRatio(w.readinessItems)");
    expect(read("lib/projects/operations.ts")).toMatch(/\.from\("project_worker_readiness_items"\)/);
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const chat = JSON.parse(read(`messages/${locale}.json`)).conversation.chat as Record<string, string>;
      expect(chat.readinessCheckedChip, locale).toContain("{label}");
      expect(chat.readinessCheckedDone, locale).toContain("{name}");
    }
  });
});
