import { beforeEach, describe, expect, it, vi } from "vitest";

import { locales } from "@/lib/i18n/config";

/**
 * MULTILINGUAL COMMUNICATION — the FULL language matrix, proven generically.
 *
 * The owner contract is language-agnostic: for ARBITRARY supported locales A
 * and B, an author writes A → the original (text + language A) is preserved →
 * a viewer in B reads a B-rendering when the egress-gated runtime produces one,
 * else the original with an A badge → a reply in B is preserved the same way.
 *
 * These are NOT N×N bespoke tests: one parameterized loop over the canonical
 * `locales` set drives the pure resolver against a faked runtime, so the proof
 * is of the MECHANISM, not of any one pair. The DB-layer round trip
 * (original_language preserved per author, participant-only) is proven
 * separately in tests/e2e/chat-visibility-rls.spec.ts; the resolver honesty
 * edges (echo, cache, gate refusal) in translation-read.test.ts.
 */

vi.mock("server-only", () => ({}));
const runAiAgent = vi.fn();
vi.mock("@/lib/ai/run-agent-server", () => ({ runAiAgent: (...a: unknown[]) => runAiAgent(...a) }));

const { resolveViewerTexts, __clearTranslationCache } = await import("./translation-read");

const SET = [...locales];
// A provider that "translates" by tagging the target locale — deterministic,
// language-agnostic, and always DIFFERENT from the original so it is accepted.
function fakeProvider() {
  runAiAgent.mockImplementation(async (_agent: string, payload: unknown) => {
    const target = (payload as { locale: string }).locale;
    return {
      status: "suggestion",
      agent: "translation_copy",
      provider: "fake",
      model: "fake",
      value: { data: { localized_copy: `[${target}] rendered`, plain_language_version: null, wording_warnings: [] } },
    };
  });
}
function blockedProvider() {
  runAiAgent.mockResolvedValue({ status: "needs_review", reason: "egress_blocked" });
}

beforeEach(() => {
  runAiAgent.mockReset();
  __clearTranslationCache();
});

const msg = (author: string) => ({ id: `m-${author}`, body: `orig-${author}`, original_language: author });

describe("author-side preservation — every canonical locale", () => {
  for (const author of SET) {
    it(`an author writing ${author}: original kept; same-locale viewer never triggers a translation`, async () => {
      blockedProvider();
      // Viewer shares the author's locale → resolver must not call the runtime.
      const same = await resolveViewerTexts([msg(author)], author, `v-${author}`);
      expect(same.get(`m-${author}`)).toMatchObject({ kind: "original", text: `orig-${author}`, languageBadge: null });
      expect(runAiAgent).not.toHaveBeenCalled();
    });
  }
});

describe("generic A→B rendering and B→A reply — no pair hardcoded", () => {
  // Sample cross pairs across the whole set (each locale as A with the next as
  // B, wrapping) so every locale is exercised on both sides without N×N.
  for (let i = 0; i < SET.length; i += 1) {
    const A = SET[i];
    const B = SET[(i + 1) % SET.length];
    it(`${A} → ${B}: viewer B gets a B-rendering, the ${A} original kept beside it`, async () => {
      fakeProvider();
      const out = await resolveViewerTexts([msg(A)], B, `v-${B}`);
      expect(out.get(`m-${A}`)).toEqual({
        kind: "translated",
        text: `[${B}] rendered`,
        original: `orig-${A}`,
        languageBadge: A,
        provider: "fake",
      });
    });

    it(`${B} → ${A} reply: symmetric — viewer A gets an A-rendering, the ${B} original kept`, async () => {
      fakeProvider();
      const out = await resolveViewerTexts([msg(B)], A, `v-${A}`);
      expect(out.get(`m-${B}`)).toMatchObject({ kind: "translated", text: `[${A}] rendered`, original: `orig-${B}`, languageBadge: B });
    });
  }
});

describe("multi-participant A / B / C — each reads in their own locale", () => {
  it("one thread, three viewer locales: each gets their own rendering; all keep the original", async () => {
    fakeProvider();
    const [A, B, C] = [SET[0], SET[1], SET[2]];
    // Two messages: one authored by A, one reply authored by C.
    const thread = [
      { id: "t1", body: "orig-A", original_language: A },
      { id: "t2", body: "orig-C", original_language: C },
    ];

    const asA = await resolveViewerTexts(thread, A, "vA");
    const asB = await resolveViewerTexts(thread, B, "vB");
    const asC = await resolveViewerTexts(thread, C, "vC");

    // Viewer A: own message original; C's message rendered in A.
    expect(asA.get("t1")).toMatchObject({ kind: "original", text: "orig-A" });
    expect(asA.get("t2")).toMatchObject({ kind: "translated", text: `[${A}] rendered`, original: "orig-C", languageBadge: C });
    // Viewer B: both foreign → both rendered in B, originals kept.
    expect(asB.get("t1")).toMatchObject({ kind: "translated", text: `[${B}] rendered`, original: "orig-A", languageBadge: A });
    expect(asB.get("t2")).toMatchObject({ kind: "translated", text: `[${B}] rendered`, original: "orig-C", languageBadge: C });
    // Viewer C: A's message rendered in C; own message original.
    expect(asC.get("t1")).toMatchObject({ kind: "translated", text: `[${C}] rendered`, original: "orig-A", languageBadge: A });
    expect(asC.get("t2")).toMatchObject({ kind: "original", text: "orig-C" });
  });
});

describe("safe fallback — no provider, nothing lost", () => {
  for (const author of SET.slice(0, 4)) {
    const viewer = SET[(SET.indexOf(author) + 3) % SET.length];
    it(`${author} → ${viewer} with the gate closed: original + ${author} badge, never empty, never fabricated`, async () => {
      blockedProvider();
      const out = await resolveViewerTexts([msg(author)], viewer, `v-${viewer}`);
      const vt = out.get(`m-${author}`)!;
      expect(vt.kind).toBe("original");
      expect(vt.text).toBe(`orig-${author}`);
      expect(vt.original).toBe(`orig-${author}`);
      expect(vt.languageBadge).toBe(author);
      expect(vt.provider).toBeNull();
      expect(vt.text.length).toBeGreaterThan(0);
    });
  }
});
