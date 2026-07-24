import { describe, expect, it } from "vitest";
import { WORKER_FORMS, getWorkerForm, type FormState } from "@/lib/conversation/worker-forms";
import { WORKER_ACTION_SCHEMAS, type WorkerActionId } from "@/lib/conversation/worker-schemas";
import { getConversationAction } from "@/lib/conversation/action-registry";

/**
 * Inline form ↔ schema ↔ registry contract. Every form must map to a real
 * registry action, its `build()` must produce input the action's zod schema
 * accepts (representative filled state), and empty state must be REJECTED so
 * the review→save step can never persist a blank record.
 */

const FILLED: Record<string, FormState> = {
  "worker.add-language": { lang: "en", level: "B2" },
  "worker.add-work-history": { title: "Nurse", startYear: "2020", startMonth: "3", endYear: "2023", endMonth: "6", isCurrent: false },
  "worker.add-education": { institution: "Vilnius College", program: "Nursing", educationTypeSlug: "vocational", startYear: "2016", endYear: "2019", isCurrent: false },
  "worker.add-achievement": { title: "First aid certificate", kind: "declared_certificate", achievedYear: "2022" },
  "worker.save-work-card": { availabilityStatus: "available", locationCountry: "lt", preferredCountries: "nl, de", salaryMin: "1500", salaryMax: "2500" },
  "worker.save-preferences": { willingToRelocate: "yes", hasTransport: "no", needsAccommodation: "not_stated", availabilityNote: "from August" },
};

describe("worker inline forms", () => {
  it("every form maps to a real registry action + a schema", () => {
    for (const form of WORKER_FORMS) {
      expect(getConversationAction(form.actionId), form.actionId).toBeDefined();
      expect(WORKER_ACTION_SCHEMAS[form.actionId as WorkerActionId], form.actionId).toBeDefined();
      expect(form.fields.length).toBeGreaterThan(0);
    }
  });

  it("build() from a filled state produces schema-valid input", () => {
    for (const form of WORKER_FORMS) {
      const schema = WORKER_ACTION_SCHEMAS[form.actionId as WorkerActionId];
      const input = form.build(FILLED[form.actionId] ?? {});
      const parsed = schema.safeParse(input);
      expect(parsed.success, `${form.actionId}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("work-history 'ongoing' clears the end date", () => {
    const form = getWorkerForm("worker.add-work-history")!;
    const input = form.build({ title: "Dev", startYear: "2024", isCurrent: true, endYear: "2025" }) as {
      isCurrent: boolean;
      endYear: number | null;
    };
    expect(input.isCurrent).toBe(true);
    expect(input.endYear).toBeNull();
  });

  it("empty required state is rejected by the schema (no blank saves)", () => {
    for (const form of WORKER_FORMS) {
      const schema = WORKER_ACTION_SCHEMAS[form.actionId as WorkerActionId];
      const parsed = schema.safeParse(form.build({}));
      // Forms with a required field must reject empty; work-card/preferences
      // are all-optional partial saves and may accept an empty (no-op) payload.
      const hasRequired = form.fields.some((f) => "required" in f && f.required);
      if (hasRequired) {
        expect(parsed.success, `${form.actionId} should reject empty`).toBe(false);
      }
    }
  });
});
