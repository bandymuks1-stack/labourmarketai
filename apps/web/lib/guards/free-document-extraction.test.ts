import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * READING A DOCUMENT IS FREE, AND MAY NEVER BECOME A PAID GATE.
 *
 * ── OWNER REQUIREMENT, 2026-09-27
 *
 * "LabourMarket.ai PRIVALO turėti nemokamą bazinį dokumentų/CV extraction kelią.
 * Mokamas AI provideris gali būti naudojamas vėliau kaip papildomas enrichment
 * sluoksnis... failo perskaitymas ir bazinės informacijos išėmimas negali būti
 * blokuojamas vien todėl, kad nėra apmokėto AI call."
 *
 * ── WHAT THE AUDIT FOUND, AND THE ONE CORRECTION IT CARRIES
 *
 * The requirement is ALREADY MET, and the 16 production `extract_cv` rows with
 * `blocked_reason = cost_unpriced` are NOT the file reader being blocked. They
 * are the OPTIONAL enrichment being honestly refused and logged:
 *
 *   `AGENT_TASK_TYPES.worker_profile = "extract_cv"` (task-routing.ts), and the
 *   only caller is `lib/profile/cv-ai-structuring-actions.ts`, whose input is a
 *   `bio` STRING — free text that has ALREADY been extracted. It never touches
 *   the file.
 *
 * THE FREE PATH that actually reads documents is separate and AI-free:
 *
 *   upload → `/api/cv/extract` → `lib/cv/extract.ts`
 *     PDF via `unpdf` (pure-JS pdf.js), DOCX via `mammoth` (pure-JS), TXT direct
 *   → `lib/cv/structured-parse.ts` (PURE, deterministic; full-precision dates —
 *     strictly MORE than the AI path, which proposes bare years)
 *   → the per-item human confirm in the review panel
 *   → `lib/profile/cv-section-import-actions.ts` → the CANONICAL tables.
 *
 * So a person whose AI enrichment is refused still gets a real result. This
 * guard exists so that stays true: the cheapest way to break the requirement is
 * for somebody to "simplify" the two paths into one that happens to need a paid
 * call.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

/** Every module on the FREE path, from HTTP boundary to canonical proposal. */
const FREE_PATH = [
  "app/api/cv/extract/route.ts",
  "lib/cv/extract.ts",
  "lib/cv/structured-parse.ts",
] as const;

describe("the free document-extraction path", () => {
  it("exists, end to end", () => {
    for (const rel of FREE_PATH) {
      expect(existsSync(join(WEB, rel)), `${rel} must exist`).toBe(true);
    }
  });

  it("never reaches the AI runtime — not one module on it", () => {
    // THE CORE OF THE OWNER REQUIREMENT. If any of these ever imports the AI
    // runtime, reading a document can start depending on a priced model.
    for (const rel of FREE_PATH) {
      const src = read(rel);
      for (const forbidden of [
        'from "@/lib/ai/',
        "runAiAgent",
        "AI_EGRESS_GRANTS",
        "pricingForModel",
        "cost_unpriced",
      ]) {
        expect(src, `${rel} must not depend on ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  it("reads real formats with free, local parsers", () => {
    const extract = read("lib/cv/extract.ts");
    // The formats are honest: a format "works" only when a real parser returns
    // text (PLATFORM_DOCTRINE §7 — no fake support).
    expect(extract).toMatch(/unpdf/);
    expect(extract).toMatch(/mammoth/);
    expect(extract).toMatch(/"pdf" \| "docx" \| "txt"/);
    // And those parsers are REAL dependencies, not aspirational imports.
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    for (const dep of ["unpdf", "mammoth"]) {
      expect(pkg.dependencies?.[dep], `${dep} must be a dependency`).toBeTruthy();
    }
    // No paid third-party document SaaS crept in to read a CV.
    const src = FREE_PATH.map(read).join("\n");
    for (const saas of ["textract", "documentai", "form-recognizer", "azure", "aws-sdk"]) {
      expect(src.toLowerCase(), `no paid SaaS (${saas}) to read a file`).not.toContain(
        saas,
      );
    }
  });

  it("the deterministic parser stays PURE — no IO, no server-only", () => {
    // Purity is what makes it free and testable: it works on text already in
    // hand, so it cannot acquire a network cost later.
    const parse = read("lib/cv/structured-parse.ts");
    expect(parse).not.toContain('"server-only"');
    expect(parse).not.toContain("createClient");
    expect(parse).not.toMatch(/\bfetch\(/);
  });
});

describe("the paid layer is enrichment, never a gate", () => {
  const action = "lib/profile/cv-ai-structuring-actions.ts";

  it("it works on already-extracted TEXT, never on the file", () => {
    const src = read(action);
    // Its input is a bio string. If it ever took a file/buffer, the paid layer
    // would have moved onto the reading path.
    expect(src).toMatch(/bio/);
    for (const fileish of ["arrayBuffer", "File", "Buffer.from", "formData"]) {
      expect(src, `the paid layer must not handle ${fileish}`).not.toContain(
        fileish,
      );
    }
  });

  it("every refusal degrades to the deterministic result, never to an error", () => {
    const src = read(action);
    // `cost_unpriced` arrives as a non-suggestion outcome. That, an anonymous
    // caller, a rate limit and a thrown runtime error must ALL end the same way:
    // `off` — the review panel then shows the deterministic proposals alone.
    expect(src).toMatch(/if \(outcome\.status !== "suggestion"\) return \{ status: "off" \}/);
    expect(src).toMatch(/catch[\s\S]{0,300}return \{ status: "off" \}/);
    // It must never throw a gate at the person.
    expect(src).not.toMatch(/throw new Error\((?!.*never)/);
  });

  it("both proposal kinds land in the SAME review panel — one flow, not two", () => {
    // §8 of the owner instruction: extraction must not create a second CV
    // system. The deterministic and enriched proposals share one shape and one
    // human confirm, so a person never meets two competing CV imports.
    const src = read(action);
    expect(src).toContain("@/lib/cv/structured-parse");
    const review = read("components/app/cv-import-section-review.tsx");
    expect(review).toContain("@/lib/cv/structured-parse");
  });
});

describe("the free path is REACHABLE, not merely present", () => {
  // The defect class this product keeps hitting: the capability exists and no
  // person can get to it (the calendar, #1881). Presence is not reachability.
  it("the CV flow uploads to the free route and parses deterministically", () => {
    const flow = read("components/app/conversation/worker-cv-flow.tsx");
    expect(flow).toContain("@/lib/cv/structured-parse");
    const upload = read("components/app/cv-import-upload.tsx");
    expect(upload).toMatch(/api\/cv\/extract/);
  });

  it("confirmed proposals reach the canonical tables, not a CV-only store", () => {
    const importActions = read("lib/profile/cv-section-import-actions.ts");
    expect(importActions).toContain("@/lib/cv/structured-parse");
    // A dedicated parallel CV identity store would be the §8 violation.
    expect(importActions).not.toMatch(/from\s+"cv_profile"|cv_identity/);
  });
});
