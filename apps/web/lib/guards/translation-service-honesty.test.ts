import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NO_PROVIDER_CONFIGURED,
  translateInstruction,
  isTranslationProviderConfigured,
  type TranslationProvider,
} from "@/lib/translation/translation-service";

/**
 * Translation safe-service-layer honesty guard
 * (slice translation-safe-service-layer-v1).
 *
 * No external provider is connected; the original is never mutated; an empty or
 * echoed "translation" is never passed off as real. Behavioural + source checks.
 */

const root = join(__dirname, "..", "..");
const moduleSrc = readFileSync(
  join(root, "lib", "translation", "translation-service.ts"),
  "utf8",
);
const repo = join(root, "..", "..");
const doc = readFileSync(
  join(repo, "docs", "audits", "translation-safe-service-layer-v1.md"),
  "utf8",
);

describe("no external provider is connected (honest unavailable)", () => {
  it("the default provider returns unavailable with no text", async () => {
    const res = await translateInstruction({
      text: "Leg de tegels",
      sourceLanguage: "nl",
      targetLanguage: "lt",
    });
    expect(res.status).toBe("unavailable");
    expect(res.translatedText).toBeNull();
    expect(res.provider).toBeNull();
  });
  it("reports no provider configured", () => {
    expect(isTranslationProviderConfigured()).toBe(false);
    expect(NO_PROVIDER_CONFIGURED.id).toBe("none");
  });
  it("the module makes no external network call (no fetch/https/provider SDK)", () => {
    const code = moduleSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/node:https|node:http\b|axios|deepl|googleapis|translate\.googleapis/i);
    expect(code).not.toMatch(/https?:\/\//);
  });
});

describe("never fakes a translation; never overwrites the original", () => {
  it("an echoed 'available' result is downgraded to needs_review", async () => {
    const echo: TranslationProvider = {
      id: "echo",
      async translate(req) {
        return {
          status: "available",
          translatedText: req.text, // echoes the original — not a real translation
          provider: "echo",
          error: null,
        };
      },
    };
    const res = await translateInstruction(
      { text: "same text", sourceLanguage: "nl", targetLanguage: "lt" },
      echo,
    );
    expect(res.status).toBe("needs_review");
    expect(res.translatedText).toBeNull();
  });
  it("an empty 'available' result is downgraded to needs_review", async () => {
    const blank: TranslationProvider = {
      id: "blank",
      async translate() {
        return { status: "available", translatedText: "   ", provider: "blank", error: null };
      },
    };
    const res = await translateInstruction(
      { text: "original", sourceLanguage: null, targetLanguage: "lt" },
      blank,
    );
    expect(res.status).toBe("needs_review");
  });
  it("a real translation passes through as available", async () => {
    const real: TranslationProvider = {
      id: "real",
      async translate() {
        return { status: "available", translatedText: "Padėkite plyteles", provider: "real", error: null };
      },
    };
    const res = await translateInstruction(
      { text: "Leg de tegels", sourceLanguage: "nl", targetLanguage: "lt" },
      real,
    );
    expect(res.status).toBe("available");
    expect(res.translatedText).toBe("Padėkite plyteles");
  });
  it("a throwing provider yields failed, not a fabricated result", async () => {
    const broken: TranslationProvider = {
      id: "broken",
      async translate() {
        throw new Error("boom");
      },
    };
    const res = await translateInstruction(
      { text: "x", sourceLanguage: null, targetLanguage: "lt" },
      broken,
      { retries: 0 },
    );
    expect(res.status).toBe("failed");
    expect(res.translatedText).toBeNull();
  });
  it("the source never assigns to req.text (original immutable)", () => {
    expect(moduleSrc).not.toMatch(/req\.text\s*=/);
  });
});

describe("design doc gates a real provider behind separate owner approval", () => {
  it("is interface/design only + names the RED gate", () => {
    expect(doc).toMatch(/INTERFACE \+ DESIGN ONLY/i);
    expect(doc).toMatch(/separate.*owner.*approv|owner-approved \(RED\)/i);
    expect(doc).toMatch(/never overwrite|no silent overwrite/i);
  });
});
