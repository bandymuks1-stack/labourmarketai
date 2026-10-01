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

const { resolveViewerTexts, __clearTranslationCache, isTransientProviderRefusal } = await import("./translation-read");

const lt = { id: "m1", body: "Rytoj pradedame 7 val. objekte Hoofdgracht 3.", original_language: "lt" };
const ka = { id: "m2", body: "გასაგებია, ვიქნები.", original_language: "ka" };
const en = { id: "m3", body: "Noted.", original_language: "en" };

beforeEach(() => {
  runAiAgent.mockReset();
  __clearTranslationCache();
});

describe("resolveViewerTexts", () => {
  it("without an egress grant every foreign message stays the original, with its language badge", async () => {
    runAiAgent.mockResolvedValue({ status: "needs_review", reason: "route_blocked" });
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
      state: "translated",
      unavailable: null,
      text: "Tomorrow we start at 7 at the Hoofdgracht 3 site.",
      original: lt.body,
      languageBadge: "lt",
      provider: "deepl",
    });
    // the second read on this instance is served from the cache
    await resolveViewerTexts([lt], "en", "viewer-2");
    expect(runAiAgent).toHaveBeenCalledTimes(1);
  });

  it("the viewer's own words are never sent to a provider and carry no badge", async () => {
    runAiAgent.mockResolvedValue({ status: "needs_review", reason: "route_blocked" });
    const mine = { ...lt, id: "own", author_id: "viewer-9" };
    const out = await resolveViewerTexts([mine], "en", "viewer-9");
    expect(runAiAgent).not.toHaveBeenCalled();
    expect(out.get("own")).toMatchObject({ kind: "original", text: lt.body, languageBadge: null });
  });

  it("two simultaneous renders of the same message share ONE provider call (in-flight de-duplication)", async () => {
    let release: (v: unknown) => void = () => {};
    runAiAgent.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = resolveViewerTexts([lt], "en", "viewer-10");
    const second = resolveViewerTexts([lt], "en", "viewer-11");
    await new Promise((r) => setTimeout(r, 0));
    release({
      status: "suggestion",
      agent: "translation_copy",
      provider: "libretranslate",
      model: "m",
      value: { data: { localized_copy: "Tomorrow we start at 7.", plain_language_version: null, wording_warnings: [] } },
    });
    const [a, b] = await Promise.all([first, second]);
    expect(runAiAgent).toHaveBeenCalledTimes(1);
    expect(a.get("m1")?.kind).toBe("translated");
    expect(b.get("m1")?.kind).toBe("translated");
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
    // Not cached as a rendering, but a failure is remembered for a few seconds
    // so a re-render does not re-ask the provider at once (no hammering)...
    await resolveViewerTexts([ka], "lt", "viewer-9");
    expect(runAiAgent).toHaveBeenCalledTimes(1);
    // ...and once the memo is gone a real answer may still arrive.
    __clearTranslationCache();
    await resolveViewerTexts([ka], "lt", "viewer-9");
    expect(runAiAgent).toHaveBeenCalledTimes(2);
  });

  it("a quota answer (429) opens a cooldown: no further provider calls until it ends, originals show", async () => {
    runAiAgent.mockResolvedValue({
      status: "needs_review",
      reason: "provider_error",
      detail: "gemini http 429 RESOURCE_EXHAUSTED quota",
    });
    const msgs = [lt, ka].map((m, i) => ({ ...m, id: `q${i}` }));
    const out = await resolveViewerTexts(msgs, "en", "viewer-q");
    expect(runAiAgent).toHaveBeenCalledTimes(2); // the first batch (concurrency 4) was already out
    expect(out.get("q0")?.kind).toBe("original");
    const again = await resolveViewerTexts([{ ...lt, id: "q9", body: "Kitas tekstas." }], "en", "viewer-q");
    expect(runAiAgent).toHaveBeenCalledTimes(2); // cooldown: nothing new was asked
    expect(again.get("q9")?.kind).toBe("original");
  });

  it("8. the original is never rewritten: a rendering carries the untouched body beside it", async () => {
    runAiAgent.mockResolvedValue({
      status: "suggestion", agent: "translation_copy", provider: "gemini", model: "x",
      value: { data: { localized_copy: "Supratau, būsiu.", plain_language_version: null, wording_warnings: [] } },
    });
    const out = await resolveViewerTexts([ka], "lt", "viewer-10");
    expect(out.get("m2")).toEqual({ kind: "translated", state: "translated", unavailable: null, text: "Supratau, būsiu.", original: ka.body, languageBadge: "ka", provider: "gemini" });
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
    // the context names source and target in words (codes alone left a Dutch
    // or Georgian target ambiguous under the runtime's en/lt/ru prompt hint)
    expect(input.context).toBe(
      "work message between colleagues — translate it from Українська (uk) into Deutsch (de); keep the meaning exact",
    );
    expect(opts).toMatchObject({ language: "uk", inputSource: "conversation_message" });
    expect(JSON.stringify([input, opts])).not.toMatch(/viewer-11|m9|conversation_id|profile|author/);
  });

  it("every message carries ONE explicit state, and a foreign original says WHY it is not translated", async () => {
    // declined by the gate → original_foreign / declined
    runAiAgent.mockResolvedValueOnce({ status: "needs_review", reason: "route_blocked" });
    const declined = await resolveViewerTexts([ka, en, { id: "m0", body: "?", original_language: null }], "en", "viewer-12");
    expect(declined.get("m2")).toMatchObject({ state: "original_foreign", unavailable: "declined", kind: "original" });
    expect(declined.get("m3")).toMatchObject({ state: "same_language", unavailable: null, languageBadge: null });
    // UNKNOWN is not "same language": no badge, no attempt, its own state
    expect(declined.get("m0")).toMatchObject({ state: "unknown_language", unavailable: null, languageBadge: null });
    expect(runAiAgent).toHaveBeenCalledTimes(1);

    // provider failure → failed; an echo → failed (an echo is not a translation)
    runAiAgent.mockRejectedValueOnce(new Error("boom"));
    expect((await resolveViewerTexts([ka], "lt", "viewer-13")).get("m2")).toMatchObject({ state: "original_foreign", unavailable: "failed" });
    runAiAgent.mockResolvedValueOnce({
      status: "suggestion", agent: "translation_copy", provider: "gemini", model: "x",
      value: { data: { localized_copy: ka.body, plain_language_version: null, wording_warnings: [] } },
    });
    expect((await resolveViewerTexts([ka], "lt", "viewer-14")).get("m2")).toMatchObject({ state: "original_foreign", unavailable: "failed" });

    // beyond the per-read bound → not_attempted, and the runtime is not called for it
    runAiAgent.mockResolvedValue({ status: "needs_review", reason: "route_blocked" });
    const many = Array.from({ length: 45 }, (_, i) => ({ id: `x${i}`, body: `t${i}`, original_language: "ka" }));
    const bounded = await resolveViewerTexts(many, "lt", "viewer-15");
    expect(bounded.get("x0")).toMatchObject({ state: "original_foreign", unavailable: "not_attempted" });
    expect(bounded.get("x44")).toMatchObject({ state: "original_foreign", unavailable: "declined" });
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
    // Started, not awaited, since 2026-09-28 (each message streams behind its
    // own Suspense boundary) — the call still follows the RLS read.
    const resolve = page.indexOf("= resolveViewerTexts(");
    expect(rlsRead).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(rlsRead);
  });
});

/**
 * Production walk 2026-09-28 (LT ↔ RU synthetic pair): Gemini answered
 * "503 UNAVAILABLE — high demand" in 0.7–2.6 s, and every such answer was
 * filed as a gate refusal ("declined"), which also stopped the rest of the
 * thread. A busy provider now gets ONE short retry, and a failure never
 * stops the other messages; the original stays canonical throughout.
 */
describe("a busy provider is retried once and never stops the thread", () => {
  const busy = { status: "needs_review", reason: "provider_error", detail: "gemini http 503 — UNAVAILABLE: high demand" };
  const ok = (text: string) => ({
    status: "suggestion", agent: "translation_copy", provider: "gemini", model: "x",
    value: { data: { localized_copy: text, plain_language_version: null, wording_warnings: [] } },
  });

  it("503 then success → translated, with the original beside it", async () => {
    runAiAgent.mockResolvedValueOnce(busy).mockResolvedValueOnce(ok("Понял, буду."));
    const out = await resolveViewerTexts([lt], "ru", "viewer-busy-1");
    expect(out.get("m1")).toMatchObject({ kind: "translated", text: "Понял, буду.", original: lt.body });
    expect(runAiAgent).toHaveBeenCalledTimes(2);
  });

  it("503 twice → failed (not declined); a timeout → failed; the next message is still attempted", async () => {
    runAiAgent
      .mockResolvedValueOnce(busy)
      .mockResolvedValueOnce(busy)
      .mockResolvedValueOnce({ status: "needs_review", reason: "timeout", detail: "policy latency ceiling 15000ms exceeded" });
    const out = await resolveViewerTexts([lt], "ru", "viewer-busy-2");
    expect(out.get("m1")).toMatchObject({ kind: "original", text: lt.body, unavailable: "failed" });
    expect(runAiAgent).toHaveBeenCalledTimes(2);
    const timedOut = await resolveViewerTexts([ka], "ru", "viewer-busy-3");
    expect(timedOut.get("m2")).toMatchObject({ kind: "original", unavailable: "failed" });
    expect(runAiAgent).toHaveBeenCalledTimes(3); // a timeout is not retried here
  });

  it("only load answers count as busy", () => {
    expect(isTransientProviderRefusal("provider_error", "gemini http 503 — UNAVAILABLE")).toBe(true);
    expect(isTransientProviderRefusal("provider_error", "gemini http 429 RESOURCE_EXHAUSTED")).toBe(true);
    expect(isTransientProviderRefusal("provider_error", "gemini http 400 INVALID_ARGUMENT")).toBe(false);
    expect(isTransientProviderRefusal("timeout", "503")).toBe(false);
  });
});
