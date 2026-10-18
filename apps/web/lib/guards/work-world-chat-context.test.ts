import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContextHistorySpine } from "@/components/app/world-state/context-history-spine";

/**
 * Guard: the chat-first workspace shows its selected object with the SAME
 * work-world grammar the pages use — the Context Panel's history is a work
 * spine, the World State map states place precision — with no parallel chat
 * model, no navigation and no modal (the W3 lock stays intact).
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const PANEL = read("components/app/world-state/context-panel.tsx");
const WSMAP = read("components/app/world-state/workspace-map.tsx");

describe("Guard: chat context wears the work-world grammar (CHAT_CONTEXT_PRESERVED)", () => {
  it("the selected object's history is ONE WorkSpine — a node per real event, time as a mono stamp", () => {
    const SPINE = read("components/app/world-state/context-history-spine.tsx");
    expect(PANEL).toContain('from "./context-history-spine"');
    expect(PANEL).toMatch(/<ContextHistorySpine history=\{view\.history\} \/>/);
    expect(SPINE).toContain('from "@/components/app/work-world/primitives"');
    expect(SPINE).toMatch(/data-testid="context-panel-history"[\s\S]{0,80}<WorkSpine>/);
    expect(SPINE).toMatch(/\{h\.at \? <PlaceTimeStamp>\{h\.at\}<\/PlaceTimeStamp> : null\}/);
  });

  it("renders the real entries as spine nodes, and nothing for an empty history", () => {
    const html = renderToStaticMarkup(
      createElement(ContextHistorySpine, {
        history: [
          { text: "Interest sent", at: "2026-09-10" },
          { text: "Saved", at: null },
        ],
      }),
    );
    expect(html.match(/data-testid="ww-spine-node"/g)?.length).toBe(2);
    expect(html.match(/data-testid="ww-place-time"/g)?.length).toBe(1); // only the dated event
    expect(html).toContain("2026-09-10");
    expect(html).toContain("Interest sent");
    expect(html).toContain("Saved");
    expect(renderToStaticMarkup(createElement(ContextHistorySpine, { history: [] }))).toBe("");
  });

  it("the World State map legend states a country-level anchor as an approximation chip", () => {
    expect(WSMAP).toContain('from "@/components/app/work-world/primitives"');
    expect(WSMAP).toMatch(/view\.home\.precision === "country" \? \(\s*<PlacePrecision kind="country"/);
  });

  it("no parallel chat model, no navigation, no modal entered with the grammar", () => {
    expect(PANEL).not.toMatch(/chat_(people|demand|calendar|profile)|AI_work_history/);
    expect(PANEL).not.toMatch(/role="dialog"|aria-modal/);
    expect(PANEL).not.toMatch(/useRouter|router\.push|<Link\b/);
  });
});
