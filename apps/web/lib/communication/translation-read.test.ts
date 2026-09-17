import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Multilingual work communication — the read resolver's honesty, proven by
 * executing it against a faked runtime:
 *   · gate refuses (no owner grant)  → the ORIGINAL, badge, nothing cached
 *   · provider answers                → 'translated', ORIGINAL kept beside it
 *   · provider echoes the original    → the ORIGINAL (an echo is not a translation)
 *   · same language as the viewer     → untouched, the runtime never called
 *   · a second read on this instance  → served from the cache, no second run
 */

vi.mock("server-only", () => ({}));
const runAiAgent = vi.fn();
vi.mock("@/lib/ai/run-agent-server", () => ({ runAiAgent: (...a: unknown[]) => runAiAgent(...a) }));

const { resolveViewerTexts, __clearTranslationCache } = await import("./translation-read");

const lt = { id: "m1", body: "Rytoj pradedame 7 val. objekte Hoofdgracht 3.", original_language: "lt" };
const ka = { id: "m2", body: "გასაგებია, ვიქნები.", original_language: "ka" };
const en = { id: "m3", body: "Noted.", original_language: "en" };

beforeEach(() => {
  runAiAgent.mockReset();
  __clearTranslationCache();
});

describe("resolveViewerTexts", () => {
  it("without an egress grant every foreign message stays the original, with its language badge", async () => {
    runAiAgent.mockResolvedValue({ status: "needs_review", reason: "egress_blocked" });
    const out = await resolveViewerTexts([lt, ka, en], "en", "viewer-1");
    expect(out.get("m1")).toMatchObject({ kind: "original", text: lt.body, languageBadge: "lt", provider: null });
    expect(out.get("m2")).toMatchObject({ kind: "original", text: ka.body, languageBadge: "ka" });
    expect(out.get("m3")).toMatchObject({ kind: "original", languageBadge: null });
    // the same-language message never reaches the runtime
    expect(runAiAgent).toHaveBeenCalledTimes(2);
    expect(runAiAgent.mock.calls[0][0]).toBe("translation_copy");
    expect(runAiAgent.mock.calls[0][2]).toMatchObject({ inputSource: "conversation_message" });
  });

  it("a provider's translation is rendered as 'translated' with the original kept beside it", async () => {
    runAiAgent.mockResolvedValue({
      status: "suggestion",
      agent: "translation_copy",
      provider: "deepl",
      model: "deepl",
      value: { data: { localized_copy: "Tomorrow we start at 7 at the Hoofdgracht 3 site.", plain_language_version: null, wording_warnings: [] } },
    });
    const out = await resolveViewerTexts([lt], "en", "viewer-2");
    expect(out.get("m1")).toEqual({
      kind: "translated",
      text: "Tomorrow we start at 7 at the Hoofdgracht 3 site.",
      original: lt.body,
      languageBadge: "lt",
      provider: "deepl",
    });
    // the second read on this instance is served from the cache
    await resolveViewerTexts([lt], "en", "viewer-2");
    expect(runAiAgent).toHaveBeenCalledTimes(1);
  });

  it("an echo of the original is not a translation", async () => {
    runAiAgent.mockResolvedValue({
      status: "suggestion",
      agent: "translation_copy",
      provider: "gemini",
      model: "x",
      value: { data: { localized_copy: lt.body, plain_language_version: null, wording_warnings: [] } },
    });
    const out = await resolveViewerTexts([lt], "en", "viewer-3");
    expect(out.get("m1")?.kind).toBe("original");
    expect(out.get("m1")?.text).toBe(lt.body);
  });

  it("the viewer's locale decides the target: the same thread renders per reader", async () => {
    runAiAgent.mockImplementation(async (_agent: string, input: { locale: string }) => ({
      status: "suggestion",
      agent: "translation_copy",
      provider: "deepl",
      model: "deepl",
      value: { data: { localized_copy: `[${input.locale}] ${"translation"}`, plain_language_version: null, wording_warnings: [] } },
    }));
    const forRu = await resolveViewerTexts([lt], "ru", "viewer-4");
    const forNl = await resolveViewerTexts([lt], "nl", "viewer-5");
    expect(forRu.get("m1")?.text).toBe("[ru] translation");
    expect(forNl.get("m1")?.text).toBe("[nl] translation");
    // and the author reads their own words untouched
    const forLt = await resolveViewerTexts([lt], "lt", "viewer-6");
    expect(forLt.get("m1")).toMatchObject({ kind: "original", languageBadge: null });
  });
});

/**
 * RED-2 (owner approval 2026-09-17, Gemini only) — the read side's contract
 * once the gate is open: every failure class still lands on the original with
 * its badge; the resolver never reads or writes a row itself, so it can never
 * become a way to read (or alter) a message the viewer was not already shown.
 */
describe("RED-2 — safe fallback and authority, with the gate open", () => {
  it("9. provider error → original + badge, never empty; a thrown runtime → the same", async () => {
    runAiAgent.mockResolvedValueOnce({ status: "needs_review", reason: "http_error", detail: "gemini http 503" });
    const errored = await resolveViewerTexts([ka], "lt", "viewer-7");
    expect(errored.get("m2")).toMatchObject({ kind: "original", text: ka.body, languageBadge: "ka", provider: null });
    expect(errored.get("m2")?.text.length).toBeGreaterThan(0);

    runAiAgent.mockRejectedValueOnce(new Error("runtime exploded"));
    const thrown = await resolveViewerTexts([ka], "lt", "viewer-8");
    expect(thrown.get("m2")).toMatchObject({ kind: "original", text: ka.body, languageBadge: "ka" });
  });

  it("empty or whitespace output → original + badge, and nothing is cached", async () => {
    runAiAgent.mockResolvedValue({
      status: "suggestion", agent: "translation_copy", provider: "gemini", model: "x",
      value: { data: { localized_copy: "   ", plain_language_version: null, wording_warnings: [] } },
    });
    const out = await resolveViewerTexts([ka], "lt", "viewer-9");
    expect(out.get("m2")).toMatchObject({ kind: "original", text: ka.body, languageBadge: "ka" });
    await resolveViewerTexts([ka], "lt", "viewer-9");
    expect(runAiAgent).toHaveBeenCalledTimes(2); // not cached: a real answer may still arrive
  });

  it("8. the original is never rewritten: a rendering carries the untouched body beside it", async () => {
    runAiAgent.mockResolvedValue({
      status: "suggestion", agent: "translation_copy", provider: "gemini", model: "x",
      value: { data: { localized_copy: "Supratau, būsiu.", plain_language_version: null, wording_warnings: [] } },
    });
    const out = await resolveViewerTexts([ka], "lt", "viewer-10");
    expect(out.get("m2")).toEqual({ kind: "translated", text: "Supratau, būsiu.", original: ka.body, languageBadge: "ka", provider: "gemini" });
    expect(ka.body).toBe("გასაგებია, ვიქნები."); // the input object is not mutated either
  });

  it("the payload that leaves is the minimal one: body (bounded), target locale, fixed context, source language — no ids, no names", async () => {
    runAiAgent.mockResolvedValue({ status: "needs_review", reason: "x" });
    const long = { id: "m9", body: "ы".repeat(9000), original_language: "uk" };
    await resolveViewerTexts([long], "de", "viewer-11");
    const [agent, input, opts] = runAiAgent.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>];
    expect(agent).toBe("translation_copy");
    expect(Object.keys(input).sort()).toEqual(["canonicalMessage", "context", "locale"]);
    expect((input.canonicalMessage as string).length).toBe(8000);
    expect(input.locale).toBe("de");
    expect(input.context).toBe("work message between colleagues");
    expect(opts).toMatchObject({ language: "uk", inputSource: "conversation_message" });
    expect(JSON.stringify([input, opts])).not.toMatch(/viewer-11|m9|conversation_id|profile|author/);
  });

  it("7. authority before egress: the resolver reads and writes NOTHING — the RLS-scoped page read is the only door", () => {
    const resolver = readFileSync(join(__dirname, "translation-read.ts"), "utf8");
    expect(resolver).not.toMatch(/@\/lib\/supabase|createClient|createAdminClient|\.from\(|\.insert\(|\.update\(|\.upsert\(/);
    const page = readFileSync(
      join(__dirname, "..", "..", "app", "[locale]", "dashboard", "communication", "[conversationId]", "page.tsx"),
      "utf8",
    );
    // the messages handed to the resolver come from the user-session client
    // (RLS: participants only), and the read precedes the resolver call
    expect(page).toContain("const supabase = await createClient();");
    expect(page).not.toContain("createAdminClient");
    const rlsRead = page.indexOf('.from("conversation_messages")');
    const resolve = page.indexOf("await resolveViewerTexts(");
    expect(rlsRead).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(rlsRead);
  });
});
