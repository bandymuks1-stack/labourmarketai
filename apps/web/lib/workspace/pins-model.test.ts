import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PIN_ASK_THRESHOLD,
  PIN_CAP,
  isPinnableRef,
  orderPins,
  pinKindFor,
  recordPinUsage,
  sanitizePinLabel,
  shouldAskToPin,
} from "./pins-model";

/**
 * MY SPACE (owner contract 2026-09-04 §4C): a pin is ONLY a reference to an
 * existing canonical action / entity / view; pin · unpin · reorder; the system
 * may ASK after repeated use — never silently fill the desktop.
 */

describe("a pin is a reference the conversation can resolve — nothing else", () => {
  it.each([
    ["f:company.create-demand", "action"],
    ["f:agency.invite-client", "action"],
    ["agency:demand", "action"],
    ["candidates", "action"],
    ["logwork", "action"],
    ["documents-centre", "action"],
    ["project:11111111-1111-4111-8111-111111111111", "entity"],
    ["demand:22222222-2222-4222-8222-222222222222", "entity"],
    ["link:/dashboard/documents", "view"],
    ["link:/dashboard/network?relationship=student", "view"],
    ["link:/dashboard/profile#learning-compass", "view"],
  ])("%s → %s", (ref, kind) => {
    expect(pinKindFor(ref)).toBe(kind);
    expect(isPinnableRef(ref)).toBe(true);
  });

  it("refuses anything the chat cannot resolve (a dead chip is worse than none)", () => {
    for (const ref of ["", "javascript:alert(1)", "link:https://evil.example", "link:/admin", "f:", "assign:x:y", "a".repeat(201)]) {
      expect(isPinnableRef(ref), ref).toBe(false);
    }
  });

  it("labels are bounded and whitespace-normalised; blank means no label", () => {
    expect(sanitizePinLabel("  Klientų   poreikiai ")).toBe("Klientų poreikiai");
    expect(sanitizePinLabel("   ")).toBeNull();
    expect(sanitizePinLabel(42)).toBeNull();
    expect(sanitizePinLabel("x".repeat(200))?.length).toBe(80);
  });

  it("orders by position then ref, and never exceeds the cap", () => {
    const pins = Array.from({ length: PIN_CAP + 3 }, (_, i) => ({
      ref: `link:/dashboard/p${i}`,
      kind: "view" as const,
      label: null,
      position: (PIN_CAP + 3 - i) % 3,
    }));
    const ordered = orderPins(pins);
    expect(ordered.length).toBe(PIN_CAP);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i - 1].position <= ordered[i].position).toBe(true);
    }
  });
});

describe("the ask after repeated use — once, and only for something not yet pinned", () => {
  const day = 86_400_000;
  it("asks at the threshold within the window, not before", () => {
    let usage = {};
    const now = Date.now();
    for (let i = 0; i < PIN_ASK_THRESHOLD - 1; i++) usage = recordPinUsage(usage, "candidates", now - i * day);
    expect(shouldAskToPin(usage, "candidates", now, new Set(), new Set())).toBe(false);
    usage = recordPinUsage(usage, "candidates", now);
    expect(shouldAskToPin(usage, "candidates", now, new Set(), new Set())).toBe(true);
  });
  it("old uses fall out of the window; pinned or already-asked references never ask", () => {
    let usage = {};
    const now = Date.now();
    for (let i = 0; i < PIN_ASK_THRESHOLD; i++) usage = recordPinUsage(usage, "projects", now - 30 * day);
    expect(shouldAskToPin(usage, "projects", now, new Set(), new Set())).toBe(false);
    for (let i = 0; i < PIN_ASK_THRESHOLD; i++) usage = recordPinUsage(usage, "projects", now);
    expect(shouldAskToPin(usage, "projects", now, new Set(["projects"]), new Set())).toBe(false);
    expect(shouldAskToPin(usage, "projects", now, new Set(), new Set(["projects"]))).toBe(false);
    expect(shouldAskToPin(usage, "not-a-ref", now, new Set(), new Set())).toBe(false);
  });
});

describe("persistence is references only, owner-only RLS, plain writes", () => {
  const ROOT = join(__dirname, "..", "..", "..", "..");
  // The table ships in a separate RED draft (#1475 — the static grant rule);
  // until it lands on main these two files are absent and the migration
  // assertions are skipped honestly rather than failing the code PR.
  const MIG_PATH = join(ROOT, "supabase", "migrations", "20260904120000_workspace_pins_v1.sql");
  const DOWN_PATH = join(ROOT, "supabase", "rollbacks", "20260904120000_workspace_pins_v1.down.sql");
  const hasMigration = existsSync(MIG_PATH) && existsSync(DOWN_PATH);
  const MIG = hasMigration ? readFileSync(MIG_PATH, "utf8") : "";
  const DOWN = hasMigration ? readFileSync(DOWN_PATH, "utf8") : "";
  const ACTIONS = readFileSync(join(__dirname, "pins-actions.ts"), "utf8");

  it.skipIf(!hasMigration)("the table holds a reference, a kind, a label and a position — no copied domain facts", () => {
    expect(MIG).toMatch(/create table if not exists public\.workspace_pins/);
    for (const col of ["profile_id", "organization_id", "kind", "ref", "label", "position"]) expect(MIG).toContain(col);
    expect(MIG).not.toMatch(/title|status|company_name|request_id/);
    expect(MIG).toMatch(/nulls not distinct/);
  });
  it.skipIf(!hasMigration)("RLS: the owning profile only, all four verbs; no definer function, no anon", () => {
    for (const verb of ["select", "insert", "update", "delete"]) expect(MIG).toMatch(new RegExp(`for ${verb}`));
    expect(MIG).toMatch(/profile_id = auth\.uid\(\)/);
    expect(MIG).not.toMatch(/security definer/i);
    expect(MIG).not.toMatch(/to anon|using \(true\)/);
    expect(DOWN).toMatch(/drop table if exists public\.workspace_pins/);
  });
  it("the actions resolve the workspace server-side, refuse unresolvable refs and enforce the cap", () => {
    expect(ACTIONS).toMatch(/getActiveOrganizationContext\(\)/);
    expect(ACTIONS).not.toMatch(/input\.organizationId|input\?\.organizationId/);
    expect(ACTIONS).toMatch(/if \(!kind\) return \{ ok: false, code: "invalid" \}/);
    expect(ACTIONS).toMatch(/>= PIN_CAP\) return \{ ok: false, code: "cap" \}/);
  });
});
