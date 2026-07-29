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
 *   2. it opens in work-context mode (always available, never blank);
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

const { ContextPanel } = await import("@/components/app/world-state/context-panel");
const { WorldStateProvider } = await import(
  "@/components/app/world-state/world-state-provider"
);

function render(): string {
  return renderToStaticMarkup(
    createElement(
      WorldStateProvider,
      // `as never`: children arrive as the third argument (React's own idiom,
      // and what the lint rule requires), but `createElement`'s prop type still
      // demands them in the props object. The repo uses the same escape in
      // journal-card-render-order.test.ts.
      { avatarId: "u1" } as never,
      createElement(ContextPanel, { locale: "lt", onChip: () => {} }),
    ),
  );
}

describe("W3 render proof — the panel is part of the workspace", () => {
  const html = render();

  it("is a complementary landmark, never a dialog", () => {
    expect(html).toContain("<aside");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("aria-modal");
  });

  it("opens in work-context mode — always available, never blank", () => {
    expect(html).toContain('data-panel-mode="work_context"');
    expect(html).toContain('data-testid="context-panel"');
    // Nothing is selected, so there is nothing to close.
    expect(html).not.toContain('data-testid="context-panel-close"');
  });

  it("contains no navigation at all", () => {
    // Not one anchor, not one href. Opening something in the workspace can
    // never become a page load by accident.
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toContain("href=");
  });

  it("renders REAL localized copy, not raw keys", () => {
    expect(html).toContain(ltPanel.regionLabel);
    expect(html).toContain(ltPanel.workTitle);
    // A raw key leaking into the DOM is the failure this catches.
    expect(html).not.toContain("workspace.panel");
    expect(html).not.toContain("regionLabel");
  });

  it("states that it is reading, instead of showing an empty shell", () => {
    expect(html).toContain(ltPanel.loading);
  });
});
