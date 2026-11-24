import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WORKFLOW_AUTHORABLE_CONTEXT_TYPES,
  WORKFLOW_CONTEXT_ENTITY_TYPES,
  WORKFLOW_DEFAULT_PACK,
  WORKFLOW_NON_AUTHORABLE_CONTEXT_TYPES,
} from "@/lib/approvals/approvals-model";

/**
 * GUARD — the work_task approval ON-RAMP (field-work audit v1, chain step B).
 *
 * 20260819210000 widened the engine to accept `work_task`, the server action
 * validated it, and all 11 locales carried its label. It was still impossible
 * for an organization to author the flow, because the template-creation form
 * offered a SECOND, hardcoded list of context types that simply omitted it.
 * The route existed with no on-ramp, and production had 16 workflow
 * definitions and 0 instances.
 *
 * The fix creates no table, no column, no engine and no migration: it derives
 * the picker from the canonical vocabulary. This guard keeps that derivation
 * honest, and pins the two things that must NOT happen.
 */

const APP = join(__dirname, "..", "..");
const SECTION = readFileSync(
  join(APP, "app/[locale]/dashboard/network/approvals-section.tsx"),
  "utf8",
);
const MESSAGES = join(APP, "messages");
const LOCALES = [
  "en", "lt", "lv", "et", "pl", "ru", "de", "nl", "da", "no", "sv",
];

describe("the on-ramp exists", () => {
  it("work_task is offerable in the template-authoring form", () => {
    expect(WORKFLOW_AUTHORABLE_CONTEXT_TYPES).toContain("work_task");
  });

  it("the picker is DERIVED, not a second hardcoded list", () => {
    expect(SECTION).toContain("WORKFLOW_AUTHORABLE_CONTEXT_TYPES.map");
    // The literal array that used to drift is gone. If someone reintroduces a
    // hardcoded list of context slugs in this file, this fails.
    expect(SECTION).not.toMatch(/"management_decision",\s*\n\s*"agreement",/);
  });

  it("every authorable type is a real engine type, and none is missing", () => {
    for (const t of WORKFLOW_AUTHORABLE_CONTEXT_TYPES) {
      expect(WORKFLOW_CONTEXT_ENTITY_TYPES).toContain(t);
    }
    const excluded = new Set<string>(WORKFLOW_NON_AUTHORABLE_CONTEXT_TYPES);
    const expected = WORKFLOW_CONTEXT_ENTITY_TYPES.filter(
      (t) => !excluded.has(t),
    );
    expect([...WORKFLOW_AUTHORABLE_CONTEXT_TYPES]).toEqual([...expected]);
  });

  it("every offered type has a REAL label in all 11 locales", () => {
    for (const loc of LOCALES) {
      const json = JSON.parse(
        readFileSync(join(MESSAGES, `${loc}.json`), "utf8"),
      ) as unknown;
      const find = (o: unknown): Record<string, string> | null => {
        if (!o || typeof o !== "object" || Array.isArray(o)) return null;
        const rec = o as Record<string, unknown>;
        if (rec.contextType && typeof rec.contextType === "object") {
          return rec.contextType as Record<string, string>;
        }
        for (const v of Object.values(rec)) {
          const r = find(v);
          if (r) return r;
        }
        return null;
      };
      const labels = find(json);
      expect(labels, `${loc}.json has no contextType block`).not.toBeNull();
      for (const t of WORKFLOW_AUTHORABLE_CONTEXT_TYPES) {
        const label = labels?.[t];
        expect(label, `${loc}.contextType.${t}`).toBeTruthy();
        // Doctrine §2: no placeholder passes as a translation.
        expect(label).not.toMatch(/^\[EN\]/);
      }
    }
  });
});

describe("what the on-ramp must NOT become", () => {
  it("work_task is NOT seeded into the default pack — that would invent authority", () => {
    // Seeding a work_task template would pick an approver for every
    // organization on the platform without anyone choosing one. The owner's
    // instruction was explicit: if a universal default approver would require
    // inventing organizational authority, do not guess — make the selection
    // configurable instead.
    const slugs = WORKFLOW_DEFAULT_PACK.map((p) => p.slug);
    const contexts = WORKFLOW_DEFAULT_PACK.map((p) => p.contextEntityType);
    expect(contexts).not.toContain("work_task");
    expect(slugs).not.toContain("work_task_default");
    // The pack stays exactly the eight the SQL installer constructs.
    expect(WORKFLOW_DEFAULT_PACK).toHaveLength(8);
  });

  it("leave keeps its OWN review path — no second truth about absence", () => {
    // worker_absences already carries requested_by / reviewed_by and has
    // cancel_worker_absence_v1. A second approval route for the same decision
    // would let the two disagree about whether leave was granted.
    expect(WORKFLOW_NON_AUTHORABLE_CONTEXT_TYPES).toContain("worker_absence");
    expect(WORKFLOW_AUTHORABLE_CONTEXT_TYPES).not.toContain("worker_absence");
    // ...but the ENGINE still accepts it, so existing instances stay readable.
    expect(WORKFLOW_CONTEXT_ENTITY_TYPES).toContain("worker_absence");
  });

  it("no approval_status column on work_tasks, no parallel approval store", () => {
    const model = readFileSync(
      join(APP, "lib/approvals/approvals-model.ts"),
      "utf8",
    );
    expect(model).not.toMatch(/approval_status/);
    const taskApprovals = readFileSync(
      join(APP, "lib/approvals/task-approvals.ts"),
      "utf8",
    );
    // Task approval state is READ from the canonical engine, never stored.
    expect(taskApprovals).toContain("workflow_instances");
    expect(taskApprovals).not.toMatch(/insert|upsert/i);
  });
});
