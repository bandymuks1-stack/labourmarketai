/**
 * WORKER PROFILE VISIBILITY — behavioural unit tests (Step 3A foundation).
 *
 * Proves the owner-approved visibility rules hold at runtime: profile-safe
 * fields are returned, contact/private fields never are, relation gates the
 * preview, shortlist data is anonymized, and communication eligibility requires
 * a free schedule or an available-from date.
 */
import { describe, expect, it } from "vitest";
import {
  PROFILE_SAFE_PREVIEW_FIELDS,
  FORBIDDEN_PREVIEW_KEY_PATTERNS,
  toProfileSafePreview,
  toShortlistSafePreview,
  anonymizedWorkerLabel,
  isContactSafe,
  assertContactSafe,
  resolveWorkerVisibilityRelation,
  canViewProfilePreview,
  canViewWorkerContact,
  canStartCommunicationOrBooking,
} from "./worker-profile-visibility";

// A hostile raw record that DOES carry contact/private fields — the builders
// must ignore every one of them.
const HOSTILE_RAW = {
  id: "11111111-2222-3333-4444-555555555555",
  headline: "  Steel fixer • 10y  ",
  skills: ["welding", " rigging ", "", "scaffolding"],
  locationCountry: "LT",
  preferredCountries: ["NL", "DE", ""],
  availabilityStatus: "available",
  availableFrom: "2026-07-01",
  rateMinEur: 18,
  rateMaxEur: 26,
  evidenceCount: 4,
  experienceYears: 10,
  // forbidden — must never surface:
  phone: "+37060000000",
  email: "worker@example.com",
  full_name: "Jonas Petraitis",
  displayName: "Jonas P.",
  address: "Some street 5, Vilnius",
  profile_text: "private owner-only narrative",
  bio: "deprecated private bio",
  cvUrl: "https://files/private-cv.pdf",
  messages: ["private message"],
} as unknown as Parameters<typeof toProfileSafePreview>[0];

describe("profile-safe preview — allowed fields", () => {
  it("returns exactly the allow-listed non-contact fields", () => {
    const p = toProfileSafePreview(HOSTILE_RAW);
    const keys = Object.keys(p).filter((k) => k !== "kind");
    expect(new Set(keys)).toEqual(new Set(PROFILE_SAFE_PREVIEW_FIELDS));
  });

  it("maps and cleans the safe values", () => {
    const p = toProfileSafePreview(HOSTILE_RAW);
    expect(p.headline).toBe("Steel fixer • 10y");
    expect(p.skills).toEqual(["welding", "rigging", "scaffolding"]);
    expect(p.location).toBe("LT");
    expect(p.preferredCountries).toEqual(["NL", "DE"]);
    expect(p.availability).toBe("available");
    expect(p.availableFrom).toBe("2026-07-01");
    expect(p.rate).toEqual({ minEur: 18, maxEur: 26 });
    expect(p.evidenceCount).toBe(4);
    expect(p.experienceYears).toBe(10);
  });
});

describe("profile-safe preview — forbidden contact/private fields", () => {
  it("never includes any contact/private field even when the raw carries them", () => {
    const p = toProfileSafePreview(HOSTILE_RAW) as unknown as Record<string, unknown>;
    expect(isContactSafe(p)).toBe(true);
    expect(() => assertContactSafe(p)).not.toThrow();
    for (const forbidden of ["phone", "email", "full_name", "displayName", "address", "profile_text", "bio", "cvUrl", "messages"]) {
      expect(p[forbidden]).toBeUndefined();
    }
  });

  it("assertContactSafe throws if a forbidden key is injected", () => {
    expect(() => assertContactSafe({ workerId: "x", phone: "123" })).toThrow(/forbidden/i);
    expect(() => assertContactSafe({ workerId: "x", contactEmail: "a@b" })).toThrow();
    expect(isContactSafe({ workerId: "x", whatsapp: "1" })).toBe(false);
  });

  it("forbidden-pattern list covers the core contact channels", () => {
    for (const must of ["phone", "email", "contact", "address", "bio"]) {
      expect(FORBIDDEN_PREVIEW_KEY_PATTERNS as readonly string[]).toContain(must);
    }
  });
});

describe("relation gating (owner rule 1) + contact gate (rules 2,3)", () => {
  it("no relation → cannot view preview (default-closed)", () => {
    expect(resolveWorkerVisibilityRelation({})).toBe("none");
    expect(canViewProfilePreview("none")).toBe(false);
  });

  it("direct / agency / project / object relations allow the preview", () => {
    expect(resolveWorkerVisibilityRelation({ directCompany: true })).toBe("direct_company");
    expect(resolveWorkerVisibilityRelation({ agency: true })).toBe("agency");
    expect(resolveWorkerVisibilityRelation({ projectAssignment: true })).toBe("project_assignment");
    expect(resolveWorkerVisibilityRelation({ clientObject: true })).toBe("client_object");
    for (const rel of ["direct_company", "agency", "project_assignment", "client_object"] as const) {
      expect(canViewProfilePreview(rel)).toBe(true);
    }
  });

  it("precedence is deterministic when several relations hold", () => {
    expect(
      resolveWorkerVisibilityRelation({ directCompany: true, agency: true, projectAssignment: true }),
    ).toBe("direct_company");
  });

  it("contact exposure is ALWAYS denied (no paid unlock implemented)", () => {
    expect(canViewWorkerContact()).toBe(false);
  });
});

describe("shortlist-safe preview (owner rule 4)", () => {
  it("is profile-safe and carries no contact/private field", () => {
    const s = toShortlistSafePreview(HOSTILE_RAW) as unknown as Record<string, unknown>;
    expect(isContactSafe(s)).toBe(true);
    expect(s.kind).toBe("worker_shortlist_safe_preview");
  });

  it("uses a deterministic anonymized label (no name, no randomness)", () => {
    const a = toShortlistSafePreview(HOSTILE_RAW).anonymizedLabel;
    const b = toShortlistSafePreview(HOSTILE_RAW).anonymizedLabel;
    expect(a).toBe(b); // deterministic
    expect(a).toMatch(/^Candidate /);
    expect(a).not.toMatch(/Jonas|Petraitis/); // never the real name
  });

  it("anonymizedWorkerLabel is stable and PII-free", () => {
    expect(anonymizedWorkerLabel("11111111-2222")).toBe("Candidate 111111");
    expect(anonymizedWorkerLabel("")).toBe("Candidate");
  });
});

describe("communication/booking eligibility (owner rule 6)", () => {
  it("eligible when the worker has a free schedule", () => {
    expect(canStartCommunicationOrBooking({ availabilityStatus: "available", availableFrom: null })).toBe(true);
  });

  it("eligible when the worker has an available-from date", () => {
    expect(canStartCommunicationOrBooking({ availabilityStatus: "busy", availableFrom: "2026-08-01" })).toBe(true);
  });

  it("NOT eligible when busy/unavailable with no available-from date", () => {
    expect(canStartCommunicationOrBooking({ availabilityStatus: "busy", availableFrom: null })).toBe(false);
    expect(canStartCommunicationOrBooking({ availabilityStatus: "unavailable", availableFrom: "  " })).toBe(false);
    expect(canStartCommunicationOrBooking({ availabilityStatus: null, availableFrom: null })).toBe(false);
  });
});
