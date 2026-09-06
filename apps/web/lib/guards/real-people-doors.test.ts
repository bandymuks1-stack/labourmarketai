import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Real-user fitness walk on production, 2026-09-06 — the doors that already
 * existed but that ordinary sentences never reached. Each pin below names a
 * measured dead end and keeps the connection from quietly regressing:
 *
 *   1. A private person (an employer nowhere) saying "reikia santechniko" was
 *      answered with the not-understood menu. The service-request loop and
 *      the company-setup door both existed. Both are offered now.
 *   2. "Ką man daryti toliau?" in the COMPANY workspace answered the PERSON's
 *      profile ladder. The manager's own ladder (the employer opening brief)
 *      already existed. It answers now; nothing to report → the company hub.
 *   3. "Kas man trūksta?" repeated the same document name per country. The
 *      sentence now groups by document type through ONE pure helper.
 *   4. The service noun "paslaugos" read as a care assistant in BOTH
 *      structurers. Both mask it through the ONE exported helper.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");

function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, `anchor not found: ${start}`).toBeGreaterThan(-1);
  const j = src.indexOf(end, i);
  expect(j, `end anchor not found: ${end}`).toBeGreaterThan(i);
  return src.slice(i, j);
}

describe("1. a private person's trade need reaches the existing doors", () => {
  const handler = block(chat, "needWorkers: () => {", "needService: () =>");

  it("the non-employer branch links the service-request loop AND the company-setup door", () => {
    const tail = handler.slice(handler.lastIndexOf("} else {"));
    expect(tail).toContain('id: "link:/dashboard/service-requests"');
    expect(tail).toContain('id: "link:/dashboard/start/company"');
  });

  it("it never answers the not-understood menu for a sentence the router understood", () => {
    const tail = handler.slice(handler.lastIndexOf("} else {"));
    expect(tail).not.toMatch(/assistant\(fallbackText/);
  });

  it("the employer paths are untouched (form for the company workspace, bridge for an employer elsewhere)", () => {
    expect(handler).toMatch(/openForm\(\s*"company\.create-demand"/);
    expect(handler).toContain('id: "link:/dashboard/company#demand-intake"');
  });
});

describe("2. the company workspace's next step is the company's, not the person's", () => {
  it("nextActionSummary branches on identity", () => {
    expect(chat).toMatch(
      /nextActionSummary: \(\) =>\s*identity === "company" \? startCompanyNextStep\(\) : startProfileSummary\("next"\)/,
    );
  });

  it("startCompanyNextStep reuses the employer opening brief and falls back to the company hub — no second brief", () => {
    const fn = block(chat, "const startCompanyNextStep = useCallback(", "startProfileSummaryRef.current");
    expect(fn).toContain("loadEmployerOpeningBrief()");
    expect(fn).toContain('id: "link:/dashboard/company"');
    expect(fn).not.toMatch(/\.from\(|\.rpc\(|fetch\(/);
  });

  it("the handler map declares the new dependency", () => {
    expect(chat).toMatch(/startProfileSummary, startCompanyNextStep, startCriteria/);
  });
});

describe("3. the documents-gap sentence groups by document type", () => {
  const workflows = read("lib", "ai-workspace", "workflows.ts");
  it("documentGapSentence renders through groupMissingDocumentsByType", () => {
    const fn = block(workflows, "async function documentGapSentence(", 'return t("docsGapTail"');
    expect(fn).toContain("groupMissingDocumentsByType(gap.missing, DOCUMENT_GAP_LINE_CAP)");
    expect(fn).not.toMatch(/gap\.missing\s*\.slice\(/);
  });
});

describe("4. the service noun is masked in BOTH structurers through ONE helper", () => {
  it("structure-need exports maskServiceNoun and applies it to the work-type match", () => {
    const src = read("lib", "structuring", "structure-need.ts");
    expect(src).toContain("export function maskServiceNoun(");
    expect(src).toContain("firstMatchWithNeedle(WORK_TYPE_RULES, maskServiceNoun(roleHay))");
  });

  it("value-statement imports it (no second copy) and applies it to the work-type match", () => {
    const src = read("lib", "structuring", "value-statement.ts");
    expect(src).toMatch(/import \{[^}]*maskServiceNoun[^}]*\} from "\.\/structure-need"/);
    expect(src).toContain("firstRuleMatch(WORK_TYPE_RULES, maskServiceNoun(folded))");
    expect(src).not.toMatch(/function maskServiceNoun/);
  });
});
