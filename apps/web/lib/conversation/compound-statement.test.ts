import { describe, expect, it } from "vitest";

import {
  readCompoundStatement,
  COMPOUND_FACT_LABEL_CODE,
  type CompoundFactKind,
} from "./compound-statement";

const OWNER_SENTENCE = "Esu suvirintojas, 8 metus dirbu MIG/MAG, turiu VCA.";

function kindsOf(text: string): CompoundFactKind[] {
  return [...new Set(readCompoundStatement(text).facts.map((f) => f.kind))];
}

/**
 * OWNER P0 2026-09-22 §1 — the measured defect and its four facts.
 *
 * "Esu suvirintojas, 8 metus dirbu MIG/MAG, turiu VCA." routed ENTIRELY to
 * add-document, because "turiu VCA" outscored everything else. The owner
 * named the four things that sentence states; this file is that list, made
 * executable.
 */
describe("the owner's sentence decomposes into all four facts", () => {
  const reading = readCompoundStatement(OWNER_SENTENCE);

  it("is recognised as compound", () => {
    expect(reading.isCompound).toBe(true);
  });

  it("profession / work direction: suvirintojas", () => {
    const f = reading.facts.find((x) => x.kind === "profession");
    expect(f?.statedAs).toBe("Suvirintojas");
    expect(f?.canonicalSlug).toBe("welder");
  });

  it("experience claim: 8 years", () => {
    const f = reading.facts.find((x) => x.kind === "experience");
    expect(f?.years).toBe(8);
  });

  it("skill / process claim: MIG/MAG", () => {
    const slugs = reading.facts.filter((f) => f.kind === "skill").map((f) => f.canonicalSlug);
    expect(slugs).toContain("mig-mag-welding");
  });

  it("credential claim: VCA", () => {
    const f = reading.facts.find((x) => x.kind === "credential");
    expect(f?.canonicalSlug).toBe("health_safety_card");
  });
});

/**
 * THE RULE THE OWNER WROTE IN CAPITALS. "Do NOT automatically mark VCA as
 * verified merely because the user said they have it. Self-declared fact ≠
 * evidence-backed credential."
 */
describe("a sentence is a claim, never evidence", () => {
  it("every fact from every sentence is self_declared", () => {
    for (const s of [
      OWNER_SENTENCE,
      "Turiu VCA",
      "Esu suvirintojas",
      "I have VCA and 10 years of welding",
    ]) {
      for (const f of readCompoundStatement(s).facts) {
        expect(f.evidence, `${s} / ${f.kind}`).toBe("self_declared");
      }
    }
  });

  it("the credential says it still needs a document to become evidence", () => {
    const f = readCompoundStatement(OWNER_SENTENCE).facts.find((x) => x.kind === "credential");
    expect(f?.needsDocumentForEvidence).toBe(true);
  });

  /**
   * A TYPE-LEVEL GUARANTEE, asserted on source because that is where it is
   * enforceable: `evidence` has ONE member, so no branch can promote a
   * sentence into verified state by accident or by a later edit.
   */
  it("there is no code path that could write any other evidence value", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "lib/conversation/compound-statement.ts"), "utf8");
    expect(src).toContain('readonly evidence: "self_declared";');
    expect(src).not.toMatch(/evidence:\s*"(verified|confirmed|attested|manager_confirmed)"/);
  });
});

/**
 * NOTHING IS INVENTED. The composer owns no vocabulary, so a fact exists
 * only because an existing canonical reader found it in the text.
 */
describe("no skill, profession or credential is invented", () => {
  it("every fact carries the person's own words", () => {
    for (const f of readCompoundStatement(OWNER_SENTENCE).facts) {
      expect(f.statedAs.trim().length, f.kind).toBeGreaterThan(0);
    }
  });

  it("a sentence stating nothing recognisable yields nothing", () => {
    const r = readCompoundStatement("Labas, kaip sekasi?");
    expect(r.facts).toEqual([]);
    expect(r.isCompound).toBe(false);
  });

  it("empty and whitespace input are not compound", () => {
    expect(readCompoundStatement("").isCompound).toBe(false);
    expect(readCompoundStatement("   ").isCompound).toBe(false);
  });

  /**
   * ONE FACT IS NOT A COMPOUND STATEMENT. Single-intent sentences must stay
   * on the routes that already answer them correctly — hijacking those would
   * be a regression dressed as a feature.
   */
  it("a bare credential sentence is NOT compound, so add-document still owns it", () => {
    const r = readCompoundStatement("Turiu VCA");
    expect(kindsOf("Turiu VCA")).toEqual(["credential"]);
    expect(r.isCompound).toBe(false);
  });

  it("a bare profession sentence is NOT compound", () => {
    expect(readCompoundStatement("Esu suvirintojas").isCompound).toBe(false);
  });

  it("the legacy duplicate extractor is not revived", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "lib/conversation/compound-statement.ts"), "utf8");
    // `extract-profile-suggestions` was removed from the profile flow as a
    // proven duplicate system; a mention in prose is fine, an import is not.
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).not.toMatch(/extractProfileSuggestions/);
  });
});

/**
 * SERVED LOCALES — "where the parser/router supports them" (the owner's own
 * qualifier). This is a MEASUREMENT, not an aspiration: it records exactly
 * how far each locale gets today, so a future extension has a baseline and a
 * regression has a tripwire.
 *
 * Measured 2026-09-22:
 *   lt  profession + experience + skill + credential   (full)
 *   en  skill + credential                             (no LT-style copula)
 *   de/pl/ru/nl  credential only
 *
 * `readProfessionStatement` is Lithuanian-first by construction (nominative
 * and instrumental suffix classes); `recognizeSkills` covers LT/EN needles;
 * `guessDocumentType` is code-based and therefore locale-neutral.
 */
describe("served locales, measured honestly", () => {
  it("Lithuanian decomposes fully", () => {
    expect(kindsOf(OWNER_SENTENCE).sort()).toEqual([
      "credential",
      "experience",
      "profession",
      "skill",
    ]);
  });

  it("English reaches skill + credential and is still compound", () => {
    const en = "I am a welder, 8 years of MIG/MAG, I have VCA";
    expect(kindsOf(en).sort()).toEqual(["credential", "skill"]);
    expect(readCompoundStatement(en).isCompound).toBe(true);
  });

  it.each([
    ["de", "Ich bin Schweißer, 8 Jahre MIG/MAG, ich habe VCA"],
    ["pl", "Jestem spawaczem, 8 lat MIG/MAG, mam VCA"],
    ["ru", "Я сварщик, 8 лет MIG/MAG, у меня есть VCA"],
    ["nl", "Ik ben lasser, 8 jaar MIG/MAG, ik heb VCA"],
  ])("%s recognises the credential (the profession reader is LT-first today)", (_loc, s) => {
    const f = readCompoundStatement(s).facts.find((x) => x.kind === "credential");
    expect(f?.canonicalSlug).toBe("health_safety_card");
  });
});

describe("no technical kind reaches a screen", () => {
  it("every kind has an i18n code", () => {
    for (const [kind, code] of Object.entries(COMPOUND_FACT_LABEL_CODE)) {
      expect(code, kind).toMatch(/^compoundStatement\.kind\./);
    }
  });
});

/**
 * THE WIRING. Decomposition that nothing consults is a library, not a fix.
 */
describe("the chat consults the composer before the single-route dispatch", () => {
  const read = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("node:path") as typeof import("node:path");
    return readFileSync(
      join(process.cwd(), "components/app/conversation/chat/conversation-chat.tsx"),
      "utf8",
    );
  };

  it("the compound check runs BEFORE dispatchIntent", () => {
    const src = read();
    const check = src.indexOf("const compound = readCompoundStatement(text);");
    const dispatch = src.indexOf("dispatchIntent(intent, handlers, withTyping, fallback);");
    expect(check).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(-1);
    expect(check).toBeLessThan(dispatch);
  });

  it("it is person-only, so a company space keeps its existing routes", () => {
    const src = read();
    const at = src.indexOf("const compound = readCompoundStatement(text);");
    const before = src.slice(Math.max(0, at - 400), at);
    expect(before).toContain('identity === "person"');
  });

  /**
   * NOTHING IS PERSISTED BY THE CONFIRMATION. The presenter may only open
   * existing surfaces — a direct write here would be the second store the
   * owner forbade.
   */
  it("the presenter writes nothing and reuses existing chips", () => {
    const src = read();
    const body = src.slice(
      src.indexOf("const presentCompoundStatement = useCallback("),
      src.indexOf("const startAddDocument = useCallback("),
    );
    expect(body).toContain("link:/dashboard/profile");
    expect(body).toContain("f:worker.add-work-history");
    // The SAME add-document chip format the projects answer already uses.
    expect(body).toMatch(/add-document:\$\{credentialSlug\}/);
    // No direct persistence from the confirmation itself.
    expect(body).not.toMatch(/supabase|\.from\(|Action\(|fetch\(/);
  });

  it("the credential line is rendered as a claim, in copy", () => {
    const src = read();
    const body = src.slice(
      src.indexOf("const presentCompoundStatement = useCallback("),
      src.indexOf("const startAddDocument = useCallback("),
    );
    expect(body).toContain("compoundStatement.lineCredential");
    expect(body).toContain("compoundStatement.selfDeclared");
  });
});
