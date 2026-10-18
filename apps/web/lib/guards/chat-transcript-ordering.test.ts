import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Chat continuity.
 *
 * 2026-10-12: turns typed before the thread finished loading were never
 * persisted, and a question and its answer appended concurrently could open
 * two threads → appends were put on ONE ordered chain.
 *
 * 2026-10-14 (P0, production evidence): the append was still a SERVER ACTION,
 * and Next.js runs a page's server actions one at a time — the append queued
 * behind the chat's other actions, so a message sent shortly before the page
 * was closed was never written (the prod walk's Alfa question and its answer:
 * no row at all). Appends now go through a keepalive fetch to a route that
 * runs beside that queue and survives unload, and the SERVER resolves the
 * (person, workspace) thread, so an append never waits for the client load.
 */
const web = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(web, ...p), "utf8");
const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
const core = read("lib", "assistant", "transcript.ts");
const route = read("app", "api", "assistant", "transcript", "route.ts");
const sameOriginHelper = read("lib", "http", "same-origin-request.ts");
const client = read("lib", "assistant", "transcript-client.ts");

describe("chat transcript writes survive the page and stay ordered", () => {
  it("appends go through a keepalive fetch to the transcript route, not a server action", () => {
    expect(client).toMatch(/fetch\("\/api\/assistant\/transcript",\s*\{[\s\S]{0,80}keepalive: true/);
    expect(chat).toMatch(/import \{ postTranscriptTurn \} from "@\/lib\/assistant\/transcript-client"/);
    expect(chat).not.toMatch(/appendAssistantTurn/);
  });
  it("each append still waits for the previous one (question before answer)", () => {
    expect(chat).toMatch(/tr\.chain = tr\.chain\s*\.then\(async \(\) => \{\s*const saved = await postTranscriptTurn\(/);
  });
  it("an append no longer waits for the thread load", () => {
    expect(chat).not.toMatch(/transcriptRef\.current\.chain = loading/);
    expect(chat).not.toMatch(/if \(!tr\.enabled\) return;/);
  });
  it("the server resolves the (person, workspace) thread; a client id is only a hint", () => {
    expect(core).toMatch(/const workspaceId = await threadWorkspaceId\(\);/);
    expect(core).toMatch(/if \(input\.conversationId\) \{/);
    expect(core).toMatch(/\.order\("updated_at", \{ ascending: false \}\)[\s\S]{0,60}\.limit\(1\)/);
  });
  it("the route reuses the one writer and refuses cross-site writes", () => {
    expect(route).toMatch(/import \{ appendAssistantTurn \} from "@\/lib\/assistant\/transcript"/);
    // 2026-10-17: the same-origin judgement lives in lib/http/same-origin-request.ts and compares the
    // browser's Origin with the request's PUBLIC host (requestPublicOrigin), never with req.url -
    // behind the VPS proxy req.url is the bind host 0.0.0.0:3000 and every browser write was 403.
    expect(route).toMatch(/import \{ isSameOriginRequest \} from "@\/lib\/http\/same-origin-request"/);
    expect(route).toMatch(/if \(!isSameOriginRequest\(req\)\) return NextResponse\.json\(\{ saved: false \}, \{ status: 403 \}\)/);
    expect(route).not.toMatch(/new URL\(req\.url\)/);
    expect(sameOriginHelper).toMatch(/requestPublicOrigin\(req\)/);
    expect(sameOriginHelper).not.toMatch(/new URL\(req\.url\)\.host/);
    expect(route).toMatch(/keepalive/);
  });
  it("a design preview never writes", () => {
    expect(chat).toMatch(/if \(script \|\| !text\.trim\(\)\) return;/);
  });
});
