import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RENDER PROOF for the Context Panel (W3).
 *
 * The workspace is behind Supabase auth, and the local authenticated stack
 * needs Docker, so this renders the REAL `ContextPanel` inside the REAL
 * `WorldStateProvider` to static markup with real Lithuanian copy — no fake
 * route, no auth bypass, no production data. It proves the properties that a
 * source-text guard cannot prove, because they are about the DOM that actually
 * comes out:
 *
 *   1. the panel is a complementary landmark, not a dialog;
 *   2. a QUIET HOME draws no panel at all — never an empty frame, never an
 *      empty column (owner production walk 2026-09-28: an empty "Tavo darbas
 *      dabar" rail took a third of the home screen);
 *   3. its markup contains no link and no navigation of any kind;
 *   4. its copy is real localized copy, not a raw key.
 *
 * The selection TRANSITION is proven separately and completely by the reducer
 * tests (`lib/world-state/world-state.test.ts`); static markup cannot dispatch.
 */

const CWD = process.cwd(); // apps/web when vitest runs
const ltPanel = (
  JSON.parse(readFileSync(join(CWD, "messages/lt.json"), "utf8")) as {
    workspace: { panel: Record<string, string> };
  }
).workspace.panel;

vi.mock("next-intl", () => {
  // require() inside a hoisted mock factory: top-level imports are not yet
  // available when the factory is hoisted.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");
  const base = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "messages/lt.json"), "utf8"),
  );
  return {
    useTranslations: (ns: string) => {
      const root = ns
        .split(".")
        .reduce<Record<string, unknown>>((o, k) => (o?.[k] ?? {}) as Record<string, unknown>, base);
      const fn = (key: string) => {
        const v = key
          .split(".")
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], root);
        return typeof v === "string" ? v : key;
      };
      fn.has = (key: string) => fn(key) !== key;
      return fn;
    },
  };
});

// The two READ entrypoints are server actions; a static render never resolves
// them, and this test is about the DOM the panel produces, not the data.
vi.mock("@/lib/world-state/context-actions", () => ({
  loadEntityContext: () => new Promise(() => {}),
  loadWorkContext: () => new Promise(() => {}),
}));

// The canonical interest control pulls the app router + server actions; it is
// not rendered in work-context mode, but the import must not explode.
vi.mock("@/components/app/worker-interest-button", () => ({
  WorkerInterestButton: () => null,
}));

// W3 row 1: the panel now reaches the canonical player card through the result
// body. The card carries the localized navigation helper, which resolves
// `next/navigation` at import time and cannot load in this static renderer.
// Stubbed at the RESULT boundary — the panel's own source is what this file
// asserts on, and it still contains no link and no router.
vi.mock("@/components/app/workspace/player-card-result", () => ({
  PlayerCardResult: () => null,
}));

// The result body is its own tested surface; here only the panel's OWN markup
// (landmark, header, copy) is asserted, so the body is stubbed.
vi.mock("@/components/app/workspace/result-body", () => ({
  ResultBody: () => null,
}));

const { ContextPanel } = await import("@/components/app/world-state/context-panel");
const { WorldStateProvider } = await import(
  "@/components/app/world-state/world-state-provider"
);

function render(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(
      WorldStateProvider,
      // `as never`: children arrive as the third argument (React's own idiom,
      // and what the lint rule requires), but `createElement`'s prop type still
      // demands them in the props object. The repo uses the same escape in
      // journal-card-render-order.test.ts.
      { avatarId: "u1" } as never,
      createElement(ContextPanel, { locale: "lt", onChip: () => {}, ...props }),
    ),
  );
}

describe("W3 render proof — a quiet home takes no room", () => {
  it("draws nothing while the home has nothing to say — no empty frame, no empty rail", () => {
    // Nothing selected, no result, the work read not yet answered: the panel
    // does not paint an empty column first and then fill it.
    expect(render()).toBe("");
  });
});

describe("W3 render proof — the panel is part of the workspace", () => {
  // A result is open: the panel has something to say, so it is drawn.
  const html = render({ result: "calendar", resultNavigation: {} as never });

  it("is a complementary landmark, never a dialog", () => {
    expect(html).toContain("<aside");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("aria-modal");
    expect(html).toContain('data-testid="context-panel"');
  });

  it("contains no navigation at all", () => {
    // Not one anchor, not one href. Opening something in the workspace can
    // never become a page load by accident.
    expect(html).not.toMatch(/<a/);
    expect(html).not.toContain("href=");
  });

  it("renders REAL localized copy, not raw keys", () => {
    expect(html).toContain(ltPanel.regionLabel);
    // A raw key leaking into the DOM is the failure this catches.
    expect(html).not.toContain("workspace.panel");
    expect(html).not.toContain("regionLabel");
  });
});
