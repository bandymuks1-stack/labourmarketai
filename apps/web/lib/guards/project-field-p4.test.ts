import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P4 — THE FIELD on the operations page (frozen design contract §5 P4, §1.5,
 * §2.5, §3; owner master contract §1a "one backbone"). The commercial subset:
 * lanes = stages in time, tokens = people, dashed slots = missing capacity,
 * the ready edge = the capacity read, click/keyboard only, a list equivalent.
 *
 * These pins keep the subset honest:
 *   1. NOTHING REMOVED — /operations keeps every section it had (§1.5).
 *   2. ONE BACKBONE — every control is an EXISTING server action the chat
 *      executes (company-executors.ts imports the same symbols); the Field
 *      owns no insert/update/rpc of its own and never shows optimistic state
 *      (router.refresh after each write).
 *   3. REUSED READS — the page adds exactly one read (the chat's capacity
 *      read); the model is a pure projection with no IO.
 *   4. ACCESSIBILITY — a LIST equivalent of the same objects, buttons with
 *      aria-pressed, ≥ 44 px targets, state as edge + text + symbol.
 *   5. NO SPORTS TERMS in the canonical model — UI words only.
 *   6. i18n parity for the namespace across the five active locales, with
 *      the honesty vocabulary (no "verified", no forecast).
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const PAGE = read("app/[locale]/dashboard/projects/[id]/operations/page.tsx");
const FIELD = read("components/app/project-field.tsx");
const MODEL = read("lib/projects/field-model.ts");
const EXECUTORS = read("lib/conversation/company-executors.ts");

describe("1 · the Field is ADDED on the operations page; nothing is removed", () => {
  it("renders <ProjectField> above the existing sections", () => {
    expect(PAGE).toMatch(/import \{ ProjectField \} from "@\/components\/app\/project-field"/);
    expect(PAGE).toMatch(/<ProjectField\b/);
    const fieldAt = PAGE.indexOf("<ProjectField");
    for (const testid of [
      "ops-centre-header",
      "ops-manage",
      "ops-centre-attention",
      "ops-centre-resources",
      "ops-centre-tasks",
      "ops-centre-evidence",
    ]) {
      const at = PAGE.indexOf(`data-testid="${testid}"`);
      expect(at, `${testid} still rendered`).toBeGreaterThan(fieldAt);
    }
    for (const component of ["<ProjectOperationsBoard", "<ProjectStagesPanel", "<ProjectStageGantt", "<HandoverPassportPanel", "<ProjectEconomicsPanel", "<ProjectDefectsPanel", "<ConfirmPulse />"]) {
      expect(PAGE, `${component} stays`).toContain(component);
    }
    expect(PAGE).toMatch(/MANAGER_ROLES = new Set<Role>\(\["company", "agency"\]\)/);
    expect(PAGE).not.toMatch(/redirect\([^)]*field/i);
  });
});

describe("2 · one backbone — the SAME actions the chat executes, with readback", () => {
  const REUSED: ReadonlyArray<readonly [symbol: string, module: string, chatAction: string]> = [
    ["upsertReadinessItemAction", "@/lib/projects/operations-actions", "company.set-readiness-item"],
    ["sendWorkInstructionAction", "@/lib/instructions/actions", "company.request-readiness"],
    ["updateStageStatusAction", "@/lib/projects/stages-actions", "company.update-stage-status"],
    ["setWorkTaskStatusForChatAction", "@/lib/tasks/task-chat-actions", "company.update-task-status"],
    ["endAssignmentAction", "@/lib/projects/actions", "company.move-worker"],
  ];

  for (const [symbol, module, chatAction] of REUSED) {
    it(`${symbol} — imported from ${module}, the executor of ${chatAction} uses the same symbol`, () => {
      expect(FIELD).toMatch(new RegExp(`import \\{[^}]*\\b${symbol}\\b[^}]*\\} from "${module.replace(/\//g, "\\/")}"`));
      expect(FIELD).toMatch(new RegExp(`\\b${symbol}\\(`));
      expect(EXECUTORS).toMatch(new RegExp(`\\b${symbol}\\b`));
      expect(EXECUTORS).toContain(`"${chatAction}"`);
    });
  }

  it("the Field owns no write path of its own and no optimistic state", () => {
    for (const src of [FIELD, MODEL]) {
      expect(src).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
      expect(src).not.toMatch(/supabase|service_role|createAdminClient/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
    }
    // Every write goes through ONE helper that re-reads the page after the
    // action resolved; the facts on screen come from server props only.
    expect(FIELD).toMatch(/function useCanonicalWrite\(/);
    expect(FIELD).toMatch(/const r = await write\(\);\s*if \(r\.ok\) \{\s*router\.refresh\(\);/);
    expect(FIELD).not.toMatch(/useOptimistic/);
  });

  it("the page stays read-only (no write of its own) and adds only the chat's capacity read", () => {
    expect(PAGE).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
    expect(PAGE).toMatch(/import \{ loadWhoIsAvailableForChat \} from "@\/lib\/conversation\/capacity"/);
    expect(PAGE).toMatch(/loadWhoIsAvailableForChat\(\)/);
    expect(PAGE).toMatch(/buildProjectField\(\{/);
    // the model is a pure projection: no IO, no server-only import
    expect(MODEL).not.toMatch(/server-only|createClient|async function/);
    expect(MODEL).toMatch(/import \{ buildStageGantt \} from "@\/lib\/projects\/stage-gantt"/);
    expect(MODEL).toMatch(/from "@\/lib\/conversation\/capacity-contract"/);
  });
});

describe("3 · bounded, time from evidence, derived flagged", () => {
  it("bounds are constants and enforced in the model", () => {
    expect(MODEL).toMatch(/export const FIELD_LANE_MAX = 12;/);
    expect(MODEL).toMatch(/export const FIELD_SLOT_MAX = 12;/);
    expect(MODEL).toMatch(/export const FIELD_READY_MAX = 12;/);
    expect(MODEL).toMatch(/export const FIELD_OBJECT_MAX = 60;/);
  });

  it("past / now / next come from stage dates only; 'next' is marked DERIVED in the UI", () => {
    expect(MODEL).toMatch(/export function laneTime\(/);
    const code = MODEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/forecast|predict|probab/i);
    expect(FIELD).toMatch(/lane\.time === "next" \? [^:]*derivedFromDates/);
    expect(FIELD).toMatch(/derivedFromDueDates/);
  });
});

describe("4 · accessibility — list equivalent, real buttons, state never by colour alone", () => {
  it("offers a list view of the same objects and a keyboard escape", () => {
    expect(FIELD).toMatch(/data-testid="project-field-view-list"/);
    expect(FIELD).toMatch(/function ListEquivalent\(/);
    expect(FIELD).toMatch(/data-testid="project-field-list"/);
    expect(FIELD).toMatch(/e\.key === "Escape"/);
  });

  it("every object is a <button> with aria-pressed and a ≥ 44 px target", () => {
    for (const name of ["LaneButton", "TokenButton", "SlotButton", "ReadyButton"]) {
      const start = FIELD.indexOf(`function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const body = FIELD.slice(start, FIELD.indexOf("\nfunction ", start + 10));
      expect(body).toMatch(/<button\s+type="button"/);
      expect(body).toMatch(/aria-pressed=\{pressed\}/);
      expect(body).toMatch(/aria-label=/);
    }
    expect(FIELD).toMatch(/const OBJECT_BUTTON =\s*"[^"]*min-h-11/);
    expect(FIELD).toMatch(/const CONTROL =\s*"[^"]*min-h-11/);
  });

  it("edge colour is always paired with a text label and a symbol", () => {
    expect(FIELD).toMatch(/const EDGE_CLASS: Record<LaneEdge, string>/);
    expect(FIELD).toMatch(/const EDGE_SYMBOL: Record<LaneEdge, string>/);
    expect(FIELD).toMatch(/const TOKEN_CLASS: Record<TokenState, string>/);
    expect(FIELD).toMatch(/const TOKEN_SYMBOL: Record<TokenState, string>/);
    expect(FIELD).toMatch(/t\(`tokenState\.\$\{token\.state\}`\)/);
    expect(FIELD).toMatch(/tStages\(`statuses\.\$\{lane\.status\}`\)/);
  });

  it("tokens use the canonical player identity tile (no bespoke card)", () => {
    expect(FIELD).toMatch(/playerInitials\(token\.name\)/);
    expect(FIELD).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    expect(FIELD).toMatch(/PLAYER_IDENTITY_AVATAR_BORDER/);
    expect(FIELD).not.toMatch(/\.split\(\/\\s\+\/\)/);
  });
});

describe("5 · no sports vocabulary in the canonical model; tokens only", () => {
  it("model identifiers are lanes / people / slots / ready — no pitch, player, team, match, score", () => {
    const code = MODEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\b(pitch|player|team|match|score|league|goal|striker|bench)\b/i);
  });

  it("only design tokens for colour (no raw palette classes)", () => {
    expect(FIELD).not.toMatch(/\b(zinc|emerald|amber|red|green|blue|slate|gray)-\d{2,3}\b/);
  });
});

describe("6 · i18n — the namespace exists in the five active locales with honest vocabulary", () => {
  const LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

  function keyPaths(obj: Record<string, unknown>, prefix = "", out: string[] = []): string[] {
    for (const k of Object.keys(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(p);
      const v = obj[k];
      if (v && typeof v === "object" && !Array.isArray(v)) keyPaths(v as Record<string, unknown>, p, out);
    }
    return out;
  }

  const catalogs = Object.fromEntries(
    LOCALES.map((l) => [l, JSON.parse(read(`messages/${l}.json`)) as Record<string, unknown>]),
  );

  it("every referenced projectField.* key resolves in every active locale", () => {
    const referenced = [...FIELD.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)]
      .map((m) => m[1]!)
      .filter((k) => !["body", "checked", "needed", "received"].includes(k));
    const templated = ["time.past", "time.now", "time.next", "time.undated", "tokenState.clear", "tokenState.needs", "tokenState.blocked", "tokenState.untracked", "slot.kind.unassigned_task", "slot.kind.no_people", "errors.needs_migration", "errors.not_authorized"];
    for (const locale of LOCALES) {
      const ns = catalogs[locale]!.projectField as Record<string, unknown>;
      expect(ns, `${locale}: projectField namespace`).toBeTruthy();
      const keys = new Set(keyPaths(ns));
      const missing = [...new Set([...referenced, ...templated])].filter((k) => !keys.has(k));
      expect(missing, `${locale}: missing projectField keys`).toEqual([]);
    }
  });

  it("the five active locales share one key structure", () => {
    const base = keyPaths(catalogs.en!.projectField as Record<string, unknown>).sort();
    for (const locale of LOCALES) {
      expect(keyPaths(catalogs[locale]!.projectField as Record<string, unknown>).sort()).toEqual(base);
    }
  });

  it("honest vocabulary — no verification claim, no forecast, no ranking claim, no 'demo'", () => {
    const en = JSON.stringify(catalogs.en!.projectField);
    expect(en).not.toMatch(/\bverified\b|\bguaranteed\b|forecast|predict|\bdemo\b/i);
    expect(en).toMatch(/Nothing is ranked/);
    expect(en).toMatch(/derived from dates/);
  });
});
