import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RENDER + MOBILE (375px) PROOF for the stage responsible picker.
 *
 * A real 375px browser check needs an authenticated QA session, which is
 * BLOCKED_QA_IDENTITY (no session may be minted). So this is the deterministic
 * substitute: the REAL component rendered to static markup with REAL Lithuanian
 * copy, plus class assertions that no fixed width above 375px and no
 * non-wrapping flex exists in the new markup. It is NOT browser evidence.
 */

const CWD = process.cwd();
const messages = JSON.parse(readFileSync(join(CWD, "messages/lt.json"), "utf8"));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    const base = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages/lt.json"), "utf8"));
    const root = ns.split(".").reduce((o: Record<string, unknown>, k: string) => (o?.[k] ?? {}) as Record<string, unknown>, base);
    return (key: string) => {
      const v = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], root);
      return typeof v === "string" ? v : key;
    };
  },
}));
vi.mock("@/lib/projects/stages-actions", () => ({
  setStageResponsibleAction: vi.fn(),
  addStageAction: vi.fn(),
  updateStageStatusAction: vi.fn(),
  deleteStageAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ResponsibleControl } from "@/components/app/project-stages-panel";
import type { ProjectStage } from "@/lib/projects/stages-model";

const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";
const STAGE_ID = "33333333-3333-4333-8333-333333333333";
const stage: ProjectStage = {
  id: STAGE_ID,
  name: "Pamatai",
  stageOrder: 1,
  status: "planned",
  plannedStart: null,
  plannedEnd: null,
  actualStart: null,
  actualEnd: null,
  blockedReason: null,
  completionCriteria: null,
  responsibleEngagementId: E1,
};
const options = [
  { engagementId: E1, name: "Ona Petraitė" },
  { engagementId: E2, name: "Jonas Jonaitis" },
];
const html = (props: Partial<Parameters<typeof ResponsibleControl>[0]>) =>
  renderToStaticMarkup(
    createElement(ResponsibleControl, { stage, options, canManage: true, ...props }),
  );

describe("ResponsibleControl render", () => {
  it("manager: select with 'no responsible' + ONLY the eligible people, current selected, no raw ids as text", () => {
    const out = html({});
    expect(out).toContain('data-testid="project-stage-responsible-select"');
    expect(out).toContain(messages.projectStages.responsible.none);
    expect(out).toContain("Ona Petraitė");
    expect(out).toContain("Jonas Jonaitis");
    expect(out).toMatch(new RegExp(`<option value="${E1}" selected`));
    // ids appear only as option values, never as visible text
    const visible = out.replace(/<option value="[^"]*"/g, "<option").replace(/id="[^"]*"/g, "");
    expect(visible).not.toContain(E1);
    expect(visible).not.toContain(E2);
    expect(out).toContain(`for="stage-responsible-${STAGE_ID}"`);
  });

  it("non-manager: read-only text with the name, no select", () => {
    const out = html({ canManage: false });
    expect(out).not.toContain("<select");
    expect(out).toContain('data-testid="project-stage-responsible-readonly"');
    expect(out).toContain("Ona Petraitė");
  });

  it("unreadable options (null) degrade to text; unlisted current shows the calm label, never the id", () => {
    const out = html({ options: null });
    expect(out).not.toContain("<select");
    expect(out).toContain(messages.projectStages.responsible.unreadable);
    expect(out).not.toContain(E1.slice(0, 8));
  });

  it("no eligible people: calm one-liner", () => {
    const out = html({ options: [], stage: { ...stage, responsibleEngagementId: null } });
    expect(out).toContain('data-testid="project-stage-responsible-empty"');
    expect(out).toContain(messages.projectStages.responsible.noOptions);
  });
});

describe("mobile 375px — static class assertions on the new markup", () => {
  const SRC = readFileSync(join(CWD, "components/app/project-stages-panel.tsx"), "utf8");
  const block = SRC.slice(
    SRC.indexOf("export function ResponsibleControl"),
    SRC.indexOf("function StageRow"),
  );

  it("the select meets the 44px tap target and cannot overflow", () => {
    const out = html({});
    expect(out).toMatch(/<select[^>]*class="[^"]*\bmin-h-11\b/);
    expect(out).toMatch(/<select[^>]*class="[^"]*\bmax-w-full\b/);
    expect(out).toMatch(/<select[^>]*class="[^"]*\bmin-w-0\b/);
  });

  it("rows wrap and labels/messages break words", () => {
    expect(block).toMatch(/flex flex-wrap items-center gap-2/);
    expect(block).toMatch(/break-words/);
  });

  it("no fixed width above 375px and no non-wrapping flex in the new markup", () => {
    for (const m of block.matchAll(/\b(?:min-|max-)?w-\[(\d+)(px|rem)\]|\bw-(\d+)\b/g)) {
      const px = m[2] === "rem" ? Number(m[1]) * 16 : m[1] ? Number(m[1]) : Number(m[3]) * 4;
      expect(px, `fixed width ${m[0]}`).toBeLessThanOrEqual(375);
    }
    expect(block).not.toMatch(/whitespace-nowrap|flex-nowrap|overflow-x-/);
    expect(block).not.toMatch(/style=\{\{[^}]*width/);
  });
});

describe("i18n parity for the new keys", () => {
  const LOCALES = ["en", "lt", "de", "nl", "pl", "ru"];
  const flat = (o: unknown, p = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? flat(v, `${p}${k}.`) : [`${p}${k}`],
    );
  it("every active locale has the same responsible keys, no 'demo'", () => {
    const keys = LOCALES.map((l) => {
      const j = JSON.parse(readFileSync(join(CWD, `messages/${l}.json`), "utf8"));
      expect(JSON.stringify(j.projectStages.responsible).toLowerCase()).not.toContain("demo");
      return flat(j.projectStages.responsible).sort();
    });
    for (const k of keys) expect(k).toEqual(keys[0]);
    expect(keys[0].length).toBeGreaterThanOrEqual(11);
  });
});
