import { describe, expect, it } from "vitest";
import {
  COUNTRY_TEXT_MAX,
  WORKER_FORMS,
  getWorkerForm,
  workCardPrefillFromCard,
  type FormState,
} from "@/lib/conversation/worker-forms";
import { WORKER_ACTION_SCHEMAS, type WorkerActionId } from "@/lib/conversation/worker-schemas";
import { getConversationAction } from "@/lib/conversation/action-registry";
import { normalizeCountry, normalizeCountryList } from "@/lib/worker/work-card-core";

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

/**
 * W6 (measured on production, #1579): `preferred_countries` is saved as a
 * WHOLE list, so a form that opened empty let one new country replace the
 * rest. Two rules now hold at the form layer: a blank list field is OMITTED
 * (`undefined` = keep — never `[]`, which the executor treats as the explicit
 * clear), and the form opens prefilled from the current card.
 */
describe("work-card form — blank keeps, prefill carries the current card", () => {
  const form = getWorkerForm("worker.save-work-card")!;
  const schema = WORKER_ACTION_SCHEMAS["worker.save-work-card"];

  it("a blank country field is omitted (undefined), never an empty list", () => {
    for (const st of [{}, { preferredCountries: "" }, { preferredCountries: "   " }, { availabilityStatus: "available" }]) {
      const input = form.build(st as FormState) as { preferredCountries?: string[] };
      expect(input.preferredCountries, JSON.stringify(st)).toBeUndefined();
      expect(schema.safeParse(input).success).toBe(true);
    }
  });

  // Re-pinned 2026-09-22 (global-access rule): the form no longer upper-cases
  // or drops entries that are not two characters — a NAME is a country too.
  // Resolution (code or name → ISO, refusal of the unresolvable) is the
  // resolver's job in `lib/worker/work-card-core`, never the form's.
  it("a filled country field is the whole list AS TYPED — codes and names, nothing dropped by length", () => {
    const input = form.build({ preferredCountries: "no, se ,de, xyz" }) as { preferredCountries?: string[] };
    expect(input.preferredCountries).toEqual(["no", "se", "de", "xyz"]);
    const named = form.build({ preferredCountries: "LT, Vietnam; Saudi Arabia\nviet nam" }) as { preferredCountries?: string[] };
    expect(named.preferredCountries).toEqual(["LT", "Vietnam", "Saudi Arabia", "viet nam"]);
    expect(schema.safeParse(named).success).toBe(true);
  });

  it("a typed country NAME passes through the form and the schema untruncated, and the core resolves it", () => {
    const input = form.build({ locationCountry: "Vietnam", preferredCountries: "Ireland, Philippines" }) as {
      locationCountry: string | null;
      preferredCountries?: string[];
    };
    expect(input.locationCountry).toBe("Vietnam");
    expect(input.preferredCountries).toEqual(["Ireland", "Philippines"]);
    const parsed = schema.safeParse(input);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    // The name-aware resolver (PR #1824) is what turns the text into ISO codes.
    expect(normalizeCountry(input.locationCountry)).toBe("VN");
    expect(normalizeCountryList(input.preferredCountries)).toEqual(["IE", "PH"]);
    // The old clamp would have sent "VI" (the Virgin Islands) for Vietnam.
    expect(normalizeCountry(input.locationCountry)).not.toBe("VI");
  });

  it("a separators-only country field is undefined (= keep), never the explicit clear", () => {
    const input = form.build({ preferredCountries: " , ; " }) as { preferredCountries?: string[] };
    expect(input.preferredCountries).toBeUndefined();
  });

  it("the location field's maxLength fits a country name, not a two-letter code", () => {
    const field = form.fields.find((f) => f.name === "locationCountry");
    expect(field && "maxLength" in field ? field.maxLength : 0).toBe(COUNTRY_TEXT_MAX);
    expect(COUNTRY_TEXT_MAX).toBeGreaterThanOrEqual("Saint Vincent and the Grenadines".length);
  });

  it("the blank scalars are null (keep) — no field is cleared by an empty form", () => {
    const input = form.build({}) as Record<string, unknown>;
    expect(input.availabilityStatus).toBeNull();
    expect(input.availableFrom).toBeNull();
    expect(input.locationCountry).toBeNull();
    expect(input.salaryMin).toBeNull();
    expect(input.salaryMax).toBeNull();
  });

  it("prefill maps the current card onto the form fields by name, recorded values only", () => {
    const values = workCardPrefillFromCard({
      availabilityStatus: "available",
      availableFrom: "2026-10-01",
      locationCountry: "LT",
      preferredCountries: ["NO", "SE"],
      salaryMinEur: 1800,
      salaryMaxEur: null,
    });
    expect(values).toEqual({
      availabilityStatus: "available",
      availableFrom: "2026-10-01",
      locationCountry: "LT",
      preferredCountries: "NO, SE",
      salaryMin: "1800",
    });
    // Every prefill key is a real field of the form.
    const names = new Set(form.fields.map((f) => f.name));
    for (const k of Object.keys(values)) expect(names.has(k), k).toBe(true);
    // Round trip: saving the prefilled form unchanged re-sends the same list.
    const input = form.build(values) as { preferredCountries?: string[]; salaryMin: number | null };
    expect(input.preferredCountries).toEqual(["NO", "SE"]);
    expect(input.salaryMin).toBe(1800);
  });

  it("an empty card prefills nothing (blank = keep; no invented value)", () => {
    expect(
      workCardPrefillFromCard({
        availabilityStatus: null,
        availableFrom: null,
        locationCountry: null,
        preferredCountries: [],
        salaryMinEur: null,
        salaryMaxEur: null,
      }),
    ).toEqual({});
  });

  it("the caller's own prefill lays OVER the card (the #1579 country chip, the parsed date)", () => {
    const card = workCardPrefillFromCard({
      availabilityStatus: "busy",
      availableFrom: null,
      preferredCountries: ["NO", "SE"],
      salaryMinEur: null,
      salaryMaxEur: null,
    });
    const merged = { ...card, ...{ preferredCountries: "NO,SE,DE", availableFrom: "2026-10-01" } };
    const input = form.build(merged) as { preferredCountries?: string[]; availableFrom: string | null; availabilityStatus: string | null };
    expect(input.preferredCountries).toEqual(["NO", "SE", "DE"]);
    expect(input.availableFrom).toBe("2026-10-01");
    expect(input.availabilityStatus).toBe("busy");
  });
});
