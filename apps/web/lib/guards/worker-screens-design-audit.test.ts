import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WORKER SCREENS, DESIGN AUDIT 2026-11-22 (real browser, 7 languages,
 * 375/390/768/1440, light + dark). Each line pins one defect it found.
 */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

describe("phone targets are at least 44 px tall", () => {
  it("the e-mail confirmation button on the home", () => {
    expect(read("components/app/verify-email-prompt.tsx")).toMatch(/data-testid="verify-email-send"\s+className="inline-flex min-h-11 /);
  });
  it("the chat's 'show earlier conversation' button", () => {
    expect(read("components/app/conversation/chat/history-block.tsx")).toMatch(/className="inline-flex min-h-11 shrink-0 items-center rounded-lg/);
  });
  it("the 'before the final agreement' fold opens from a full-height bar", () => {
    expect(read("components/app/collaboration-checks-note.tsx")).toMatch(/<summary className="-mx-3 -my-2 cursor-pointer px-3 py-3 /);
  });
});

describe("the CV draws no empty box", () => {
  it("the document header is print-only on screen when it would hold only its eyebrow", () => {
    expect(read("app/[locale]/cv/page.tsx")).toMatch(
      /template !== "eu" && !tailoredOk && !summaryHasFigures \? "hidden print:block" : ""/,
    );
  });
});
