import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W11 F7 guard — the project operating centre has a real product path.
 *
 * ─── WHAT F7 ACTUALLY WAS ───────────────────────────────────────────────────
 * The W1–W22 matrix carried W11 as PARTIAL on one sentence: "operations page
 * reachable only by deep link". The route was never missing and never
 * unguarded — `/dashboard/projects/[id]/operations` has shipped since control
 * room PR G. What was missing was a way for a manager to ARRIVE there from
 * the surface they actually use:
 *
 *   - the canonical chat-first `project` result let a manager pick a project
 *     and read its status, roster, stages and lifecycle — and then offered a
 *     single exit to `/dashboard/projects`, the LIST. The project identity the
 *     person had just chosen was dropped at the boundary, so the operating
 *     centre could only be re-found by walking the list again;
 *   - the stadium's own link to the centre was the LAST element on a page that
 *     renders location, communication, the confirm pulse, the day pulse, the
 *     field, the gallery and the positions note above it.
 *
 * ─── WHAT THIS GUARD PINS ───────────────────────────────────────────────────
 * Three things, all structural, none of them a claim about authority:
 *   1. the project RESULT's detail exit is project-scoped, not the bare list;
 *   2. it names the operating centre only under the server's `canManage`, and
 *      names the project route otherwise — the client never invents authority;
 *   3. the stadium's entry point is in the header, above the arena sections.
 *
 * Both destinations re-check permission on arrival (the operations page is
 * manager-role gated and then `getOperationsCentre`-gated; the project page is
 * stadium/worker-view/no-access gated), so offering a route is never itself a
 * grant. This guard deliberately does NOT assert those server gates — they
 * have their own guards — only that the PATH exists and carries the project.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const result = read("components/app/workspace/project-result.tsx");
const stadium = read("app/[locale]/dashboard/projects/[id]/page.tsx");

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

describe("W11 F7 — the project result exits to the project, not to a list", () => {
  it("builds a project-scoped operations route", () => {
    expect(result).toMatch(
      /const operationsRoute = \(projectId: string\) =>[\s\S]{0,80}\/operations/,
    );
  });

  it("the detail exit is chosen by the SERVER's canManage, both branches project-scoped", () => {
    // The exit reads p.canManage and routes to the two project-scoped
    // builders — never to FULL_ROUTE, which stays the picker's exit only.
    expect(result).toMatch(
      /p\.canManage \? operationsRoute\(p\.projectId\) : projectRoute\(p\.projectId\)/,
    );
    expect(result).toMatch(/testId=\{p\.canManage \? "project-open-operations"/);
  });

  it("the picker (no project chosen yet) still exits to the list", () => {
    // Depth 0 has no project, so the list is the only honest destination —
    // this is the case the F7 fix must NOT change.
    expect(result).toMatch(/const FULL_ROUTE = "\/dashboard\/projects";/);
    expect(result).toMatch(/<ProjectPicker[\s\S]{0,200}onOpenFull=\{onOpenFull\}/);
  });

  it("routes only — the result body still never links or pushes", () => {
    expect(result).not.toMatch(/from "next\/link"/);
    expect(result).not.toMatch(/useRouter/);
  });
});

describe("W11 F7 — the stadium's entry point is reachable without scrolling the arena", () => {
  it("the operations link lives inside the project header", () => {
    const header = stadium.slice(
      stadium.indexOf("<header"),
      stadium.indexOf("</header>"),
    );
    expect(header).not.toBe("");
    expect(header).toMatch(/data-testid="stadium-open-operations"/);
  });

  it("there is exactly ONE entry point, not a duplicated pair", () => {
    const hits = stadium.match(/data-testid="stadium-open-operations"/g) ?? [];
    expect(hits).toHaveLength(1);
  });

  it("it keeps the 44px hit area the W7-A2 pass established", () => {
    const link = stadium.slice(
      stadium.indexOf('data-testid="stadium-open-operations"') - 400,
      stadium.indexOf('data-testid="stadium-open-operations"') + 400,
    );
    expect(link).toMatch(/min-h-11/);
  });
});

describe("W11 F7 — the two new labels exist in every active locale", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale} carries projectOpenOperations + projectOpenProject`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        conversation: { results: Record<string, unknown> };
      };
      const results = messages.conversation.results;
      for (const key of ["projectOpenOperations", "projectOpenProject"]) {
        expect(typeof results[key]).toBe("string");
        expect((results[key] as string).trim()).not.toBe("");
        // An active locale may never ship the untranslated shell marker.
        expect(results[key]).not.toMatch(/^\[EN\]/);
      }
    });
  }
});
