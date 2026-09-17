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
