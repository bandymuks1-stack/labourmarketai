import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { jobsWidgetResource, loadJobsWidgetLabels } from "./chatgpt-jobs-widget";

const LABELS = await loadJobsWidgetLabels();

/**
 * Runs the widget's own inline script against a minimal DOM, with the tool
 * result the ChatGPT host would hand it (`window.openai.toolOutput`), and
 * reads back the text it drew. Codex review on #3222:
 *   - a failed board read must not render as "no jobs match";
 *   - a one-sided pay bound must keep its direction ("from" / "up to"), the
 *     same wording as lib/vacancy-store/vacancy-pay-label.ts.
 */

type Node = { tag: string; className?: string; textContent: string; children: Node[] };

function render(toolOutput: unknown, locale = "en"): string[] {
  const html = jobsWidgetResource("https://labourmarket.ai", LABELS).text;
  const cfg = /<script type="application\/json" id="cfg">([\s\S]*?)<\/script>/.exec(html)![1]!;
  const script = /<script>\n([\s\S]*?)<\/script>/.exec(html)![1]!;
  const make = (tag: string): Node => {
    const n: Node & Record<string, unknown> = { tag, textContent: "", children: [] };
    n.appendChild = (c: Node) => n.children.push(c);
    n.addEventListener = () => {};
    return n;
  };
  const root = make("div");
  const sandbox = {
    document: {
      getElementById: (id: string) => (id === "cfg" ? { textContent: cfg } : root),
      createElement: make,
    },
    window: { openai: { toolOutput, locale }, addEventListener: () => {}, open: () => {} },
    JSON,
    String,
    isFinite,
    Math,
  };
  runInNewContext(script, sandbox);
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.textContent) out.push(n.textContent);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

const job = (over: Record<string, unknown>) => ({
  occupation: "Welder",
  webPath: "/en/jobs/1",
  compensationCurrency: "EUR",
  compensationMin: null,
  compensationMax: null,
  ...over,
});

describe("job-list widget rendering", () => {
  it("a failed read says the board could not be read, not that nothing matched", () => {
    for (const out of [{ ok: false, code: "unavailable" }, { ok: false, code: "needs_migration" }]) {
      const text = render(out).join(" ");
      expect(text).toMatch(/could not be read/);
      expect(text).not.toMatch(/No open jobs match/);
    }
  });

  it("a successful search with zero jobs says nothing matched", () => {
    expect(render({ ok: true, data: { jobs: [] } }).join(" ")).toMatch(/No open jobs match/);
  });

  it("one-sided pay keeps its direction; a range and an equal pair as stated", () => {
    const lines = render({
      ok: true,
      data: {
        jobs: [
          job({ compensationMax: 3200 }),
          job({ compensationMin: 2500 }),
          job({ compensationMin: 2500, compensationMax: 3200 }),
          job({ compensationMin: 3000, compensationMax: 3000 }),
          job({ compensationCurrency: null, compensationMin: 2500 }),
        ],
      },
    });
    const meta = lines.filter((l) => /EUR/.test(l));
    expect(meta).toEqual(["up to 3200 EUR", "from 2500 EUR", "2500–3200 EUR", "3000 EUR"]);
  });

  it("Lithuanian readers get the Lithuanian bound words", () => {
    const lines = render({ ok: true, data: { jobs: [job({ compensationMax: 3200 })] } }, "lt-LT");
    expect(lines).toContain("iki 3200 EUR");
  });

  it("a Russian ChatGPT session reads Russian (Codex P1: no English fallback for an active locale)", () => {
    const text = render({ ok: true, data: { jobs: [] } }, "ru").join(" ");
    expect(text).toBe(LABELS.ru!.empty);
    expect(text).not.toMatch(/No open jobs/);
  });

  it("draws nothing before the host has handed over a result", () => {
    expect(render(undefined)).toEqual([]);
  });
});
