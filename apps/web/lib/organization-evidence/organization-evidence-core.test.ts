import { describe, expect, it } from "vitest";

import {
  ATTESTED_EVIDENCE_STATES,
  EVIDENCE_STATES,
  INDEPENDENTLY_VERIFIED,
  REPORTED_EVIDENCE_STATES,
  canIndependentlyVerify,
  countsAsIndependentlyVerified,
  deriveEvidenceStanding,
  factOrDerived,
  isReportedEvidenceState,
  isSelfVouched,
  type RecordLifecycleEvent,
} from "./evidence-state";
import {
  canonicalJson,
  chainHash,
  fingerprintPayload,
  recordFingerprint,
  recordFingerprintForRow,
} from "./fingerprint";
import {
  matchPerson,
  matchPlace,
  personKey,
  type RosterPerson,
} from "./person-matching";
import { MAX_ROWS_PER_SUBMIT, sourceWorkRowSchema, tidy } from "./source-rows";
import {
  mapHeaderRow,
  parseDelimited,
  readDate,
  readHours,
  rowsFromGrid,
} from "./parse-tabular";

/**
 * THE PURE CORE OF THE ORGANIZATION EVIDENCE IMPORT.
 *
 * Everything tested here decides what an organization's historical record MEANS
 * before any database is involved: what may be claimed, what may never be
 * claimed, when two rows are the same fact, and when a name is a person.
 *
 * These are the rules the owner command names as non-negotiable — FACT vs
 * DERIVED, "never silently promote an inference into source fact", the
 * self-confirmation model, idempotency, and "the matcher never creates
 * anyone". They belong in a pure test because they must hold identically for
 * the web UI and for an authorized assistant: one engine, one meaning.
 */

const SUBJECT = "11111111-1111-1111-1111-111111111111";
const MANAGER = "22222222-2222-2222-2222-222222222222";
const ORG = "33333333-3333-3333-3333-333333333333";

// ── the vocabulary itself ──────────────────────────────────────────────────

describe("an import can only ever write a REPORTED state", () => {
  it("no attested or verified value is a reported one", () => {
    for (const s of ATTESTED_EVIDENCE_STATES) {
      expect(isReportedEvidenceState(s)).toBe(false);
    }
    expect(isReportedEvidenceState(INDEPENDENTLY_VERIFIED)).toBe(false);
  });

  it("the reported set carries no word implying anyone checked it", () => {
    // The DB CHECK on `organization_evidence_records.evidence_state` is exactly
    // this list — so this assertion is what makes "an import cannot mint trust"
    // a structural fact rather than a promise in a comment.
    expect([...REPORTED_EVIDENCE_STATES]).toEqual([
      "SELF_REPORTED",
      "ORGANIZATION_REPORTED",
      "LEGACY_IMPORTED",
      "UNVERIFIED",
      "NEEDS_REVIEW",
    ]);
  });

  it("exactly ONE state counts as independent verification", () => {
    const counting = EVIDENCE_STATES.filter(countsAsIndependentlyVerified);
    expect(counting).toEqual([INDEPENDENTLY_VERIFIED]);
  });

  it("both self- states are marked self-vouched, and no other state is", () => {
    expect(EVIDENCE_STATES.filter(isSelfVouched)).toEqual([
      "SELF_REPORTED",
      "SELF_ATTESTED",
    ]);
  });
});

// ── owner decision 3: self-attestation is real, and never independent ──────

describe("a sole trader may attest their own work — and it stays self-attested", () => {
  const attested = (
    by: string,
    role: string,
    at: string,
  ): RecordLifecycleEvent => ({
    eventType: "attested",
    actorRole: role,
    actorProfileId: by,
    createdAt: at,
  });

  it("the subject attesting derives SELF_ATTESTED, not ORGANIZATION_ATTESTED", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [attested(SUBJECT, "employer", "2026-07-05T10:00:00Z")],
      SUBJECT,
    );
    expect(standing.state).toBe("SELF_ATTESTED");
    expect(standing.attestation).toMatchObject({
      self: true,
      byProfileId: SUBJECT,
    });
    // The whole point: it is REAL evidence that never counts as verification.
    expect(standing.independentlyVerified).toBe(false);
  });

  it("a manager attesting someone else's work derives the role's state", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [attested(MANAGER, "employer", "2026-07-05T10:00:00Z")],
      SUBJECT,
    );
    expect(standing.state).toBe("ORGANIZATION_ATTESTED");
    expect(standing.attestation).toMatchObject({ self: false });
    expect(standing.independentlyVerified).toBe(false);
  });

  it("the actor's role decides WHICH attested state — a client is not an employer", () => {
    const roleState = (role: string) =>
      deriveEvidenceStanding(
        "ORGANIZATION_REPORTED",
        [attested(MANAGER, role, "2026-07-05T10:00:00Z")],
        SUBJECT,
      ).state;
    expect(roleState("client")).toBe("CLIENT_ATTESTED");
    expect(roleState("education_provider")).toBe("INSTITUTION_ATTESTED");
    expect(roleState("assessor")).toBe("ASSESSOR_ATTESTED");
    expect(roleState("public_body")).toBe("PUBLIC_BODY_ATTESTED");
    // An unknown role degrades to the weakest attested state, never the strongest.
    expect(roleState("something_new")).toBe("THIRD_PARTY_ATTESTED");
  });

  it("an unclaimed person cannot accidentally read as self-attested", () => {
    // No linked profile → the subject id is null and the comparison must not
    // match a null actor into a self-attestation.
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [
        {
          eventType: "attested",
          actorRole: "employer",
          actorProfileId: null,
          createdAt: "2026-07-05T10:00:00Z",
        },
      ],
      null,
    );
    expect(standing.state).toBe("ORGANIZATION_ATTESTED");
    expect(standing.attestation).toMatchObject({ self: false });
  });

  it("a self-attestation cannot be laundered into verification by adding it twice", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [
        attested(SUBJECT, "employer", "2026-07-05T10:00:00Z"),
        attested(SUBJECT, "client", "2026-08-05T10:00:00Z"),
      ],
      SUBJECT,
    );
    expect(standing.state).toBe("SELF_ATTESTED");
    expect(standing.independentlyVerified).toBe(false);
  });
});

describe("independent verification requires a genuinely distinct party", () => {
  it("a real verification event reaches the one verified state", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [
        {
          eventType: "independently_verified",
          actorProfileId: MANAGER,
          createdAt: "2026-08-01T10:00:00Z",
        },
      ],
      SUBJECT,
    );
    expect(standing.state).toBe(INDEPENDENTLY_VERIFIED);
    expect(standing.independentlyVerified).toBe(true);
  });

  it("the subject may never verify themselves", () => {
    expect(
      canIndependentlyVerify({
        actorProfileId: SUBJECT,
        subjectProfileId: SUBJECT,
        actorManagesSupplier: false,
        actorIsRecordedVerifyingParty: true,
      }),
    ).toEqual({ ok: false, reason: "actor_is_subject" });
  });

  it("the supplying organization may never verify its own submission", () => {
    expect(
      canIndependentlyVerify({
        actorProfileId: MANAGER,
        subjectProfileId: SUBJECT,
        actorManagesSupplier: true,
        actorIsRecordedVerifyingParty: true,
      }),
    ).toEqual({ ok: false, reason: "actor_is_supplier" });
  });

  it("a stranger with no recorded party role may not verify either", () => {
    expect(
      canIndependentlyVerify({
        actorProfileId: MANAGER,
        subjectProfileId: SUBJECT,
        actorManagesSupplier: false,
        actorIsRecordedVerifyingParty: false,
      }),
    ).toEqual({ ok: false, reason: "not_a_recorded_party" });
  });

  it("a distinct recorded party may — and that is the ONLY way through", () => {
    expect(
      canIndependentlyVerify({
        actorProfileId: MANAGER,
        subjectProfileId: SUBJECT,
        actorManagesSupplier: false,
        actorIsRecordedVerifyingParty: true,
      }),
    ).toEqual({ ok: true });
  });
});

describe("the rollback path hides standing, never the record", () => {
  it("a withdrawal wins over an attestation", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [
        {
          eventType: "attested",
          actorRole: "employer",
          actorProfileId: MANAGER,
          createdAt: "2026-07-05T10:00:00Z",
        },
        {
          eventType: "withdrawn",
          actorProfileId: MANAGER,
          createdAt: "2026-07-06T10:00:00Z",
        },
      ],
      SUBJECT,
    );
    expect(standing.state).toBe("WITHDRAWN");
    expect(standing.withdrawn).toBe(true);
    // The attestation is still READABLE — withdrawal is not erasure.
    expect(standing.attestation).toMatchObject({ byProfileId: MANAGER });
  });

  it("reinstating restores the standing that was there before", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [
        {
          eventType: "attested",
          actorRole: "employer",
          actorProfileId: MANAGER,
          createdAt: "2026-07-05T10:00:00Z",
        },
        {
          eventType: "withdrawn",
          actorProfileId: MANAGER,
          createdAt: "2026-07-06T10:00:00Z",
        },
        {
          eventType: "reinstated",
          actorProfileId: MANAGER,
          createdAt: "2026-07-07T10:00:00Z",
        },
      ],
      SUBJECT,
    );
    expect(standing.withdrawn).toBe(false);
    expect(standing.state).toBe("ORGANIZATION_ATTESTED");
  });

  it("a dispute is never silently dropped", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [
        {
          eventType: "disputed",
          actorProfileId: SUBJECT,
          createdAt: "2026-07-06T10:00:00Z",
        },
      ],
      SUBJECT,
    );
    expect(standing.state).toBe("DISPUTED");
  });

  it("a withdrawn verification stops counting as verification", () => {
    const standing = deriveEvidenceStanding(
      "ORGANIZATION_REPORTED",
      [
        {
          eventType: "independently_verified",
          actorProfileId: MANAGER,
          createdAt: "2026-08-01T10:00:00Z",
        },
        {
          eventType: "verification_withdrawn",
          actorProfileId: MANAGER,
          createdAt: "2026-08-02T10:00:00Z",
        },
      ],
      SUBJECT,
    );
    expect(standing.independentlyVerified).toBe(false);
    expect(standing.state).toBe("ORGANIZATION_REPORTED");
  });

  it("with no events at all the reported state passes through untouched", () => {
    expect(deriveEvidenceStanding("LEGACY_IMPORTED").state).toBe(
      "LEGACY_IMPORTED",
    );
    expect(
      deriveEvidenceStanding("LEGACY_IMPORTED").independentlyVerified,
    ).toBe(false);
  });
});

// ── FACT vs DERIVED ────────────────────────────────────────────────────────

describe("an inference is never readable as a source fact", () => {
  it("a stated field is a fact, an inferred one carries its method", () => {
    const derived = {
      projectLabel: {
        value: "Site A",
        method: "object_from_text",
        confidence: 0.6,
      },
    };
    expect(factOrDerived("workDate", ["workDate"], derived)).toEqual({
      kind: "fact",
    });
    expect(factOrDerived("projectLabel", ["workDate"], derived)).toEqual({
      kind: "derived",
      derived: derived.projectLabel,
    });
    // Absent is its own answer — "we do not know" must never render as "no".
    expect(factOrDerived("hours", ["workDate"], derived)).toEqual({
      kind: "absent",
    });
  });

  it("the row schema REFUSES a field claimed as both fact and inference", () => {
    const row = {
      personLabel: "Jonas Petraitis",
      workDate: "2026-03-04",
      workText: "Tiled the second floor",
      raw: { A: "Jonas Petraitis" },
      factFields: ["workDate"],
      derived: {
        workDate: { value: "2026-03-04", method: "dmy_guess", confidence: 0.5 },
      },
    };
    const parsed = sourceWorkRowSchema.safeParse(row);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain(
      "a field cannot be both a source fact and derived",
    );
  });

  it("undated work is refused — it cannot be placed in anyone's history", () => {
    const parsed = sourceWorkRowSchema.safeParse({
      personLabel: "Jonas Petraitis",
      workText: "Tiled the second floor",
      raw: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("a valid row keeps the verbatim source line and defaults to claiming nothing", () => {
    const parsed = sourceWorkRowSchema.parse({
      personLabel: "Jonas Petraitis",
      workDate: "2026-03-04",
      workText: "Tiled the second floor",
      raw: { Vardas: "Jonas Petraitis", Data: "04.03.2026" },
    });
    // Defaults must UNDER-claim: nothing is a stated fact unless said so.
    expect(parsed.factFields).toEqual([]);
    expect(parsed.derived).toEqual({});
    expect(parsed.raw).toEqual({
      Vardas: "Jonas Petraitis",
      Data: "04.03.2026",
    });
  });

  it("a batch is bounded so thousands of rows arrive as batches, not one request", () => {
    expect(MAX_ROWS_PER_SUBMIT).toBe(500);
  });
});

// ── idempotency ────────────────────────────────────────────────────────────

describe("the same fact fingerprints the same way twice", () => {
  const base = {
    organizationId: ORG,
    organizationPersonId: null,
    personLabel: "Jonas Petraitis",
    workObjectId: null,
    projectLabel: "Objektas A",
    workDate: "2026-03-04",
    periodStart: null,
    periodEnd: null,
    hours: 8,
    workText: "Klojo plyteles",
  };

  it("re-importing the identical row collides — which is what stops a double import", () => {
    expect(recordFingerprint(base)).toBe(recordFingerprint({ ...base }));
  });

  it("hours normalise, so 8 / 8.0 / 8.00 are ONE fact", () => {
    expect(recordFingerprint({ ...base, hours: 8.0 })).toBe(
      recordFingerprint(base),
    );
    expect(recordFingerprint({ ...base, hours: 8.004 })).toBe(
      recordFingerprint(base),
    );
  });

  it("the written name and the resolved person id agree, so matching later still collides", () => {
    // A row imported before the roster person existed and the same row imported
    // after must NOT become two facts — but only once the row is actually
    // pointed at that person; the id is the stronger key when present.
    const byName = recordFingerprint(base);
    const byId = recordFingerprint({
      ...base,
      organizationPersonId: "person-1",
    });
    expect(byId).not.toBe(byName);
    expect(
      recordFingerprint({
        ...base,
        organizationPersonId: "person-1",
        personLabel: "PETRAITIS, Jonas",
      }),
    ).toBe(byId);
  });

  it("a different day, a different person or different hours is a DIFFERENT fact", () => {
    expect(recordFingerprint({ ...base, workDate: "2026-03-05" })).not.toBe(
      recordFingerprint(base),
    );
    expect(
      recordFingerprint({ ...base, personLabel: "Petras Jonaitis" }),
    ).not.toBe(recordFingerprint(base));
    expect(recordFingerprint({ ...base, hours: 9 })).not.toBe(
      recordFingerprint(base),
    );
  });

  it("casing and spacing in the written name do not create a second fact", () => {
    expect(
      recordFingerprint({ ...base, personLabel: "  JONAS   petraitis " }),
    ).toBe(recordFingerprint(base));
  });

  it("the fingerprint ignores WHERE the row came from — the same fact from CSV and from an agent is one fact", () => {
    const row = sourceWorkRowSchema.parse({
      personLabel: "Jonas Petraitis",
      projectLabel: "Objektas A",
      workDate: "2026-03-04",
      hours: 8,
      workText: "Klojo plyteles",
      raw: { file: "2019.xlsx", line: 12 },
    });
    const sameFactOtherFile = sourceWorkRowSchema.parse({
      ...row,
      raw: { source: "chatgpt", batch: 3 },
    });
    expect(recordFingerprintForRow(ORG, row)).toBe(
      recordFingerprintForRow(ORG, sameFactOtherFile),
    );
  });

  it("two organizations never share a fingerprint", () => {
    expect(
      recordFingerprint({ ...base, organizationId: "other-org" }),
    ).not.toBe(recordFingerprint(base));
  });

  it("canonical JSON sorts keys, so payload hashing is order-independent", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
    expect(fingerprintPayload("x", { a: 1, b: 2 })).toBe(
      fingerprintPayload("x", { b: 2, a: 1 }),
    );
    // The label separates namespaces on purpose.
    expect(fingerprintPayload("x", { a: 1 })).not.toBe(
      fingerprintPayload("y", { a: 1 }),
    );
  });

  it("the chain links each record to the one before it", () => {
    const a = chainHash(null, "fp-a", "2026-03-04T00:00:00Z");
    const b = chainHash(a, "fp-b", "2026-03-04T00:00:01Z");
    // Altering an earlier record changes every link after it — that is the
    // whole tamper-evidence property (doctrine §3.3).
    const tampered = chainHash(null, "fp-a-CHANGED", "2026-03-04T00:00:00Z");
    expect(chainHash(tampered, "fp-b", "2026-03-04T00:00:01Z")).not.toBe(b);
  });
});

// ── matching ───────────────────────────────────────────────────────────────

describe("the matcher never creates anyone", () => {
  const roster: RosterPerson[] = [
    {
      id: "p1",
      displayName: "Jonas Petraitis",
      normalizedName: personKey("Jonas Petraitis"),
      externalRef: "1042",
    },
    {
      id: "p2",
      displayName: "Petras Jonaitis",
      normalizedName: personKey("Petras Jonaitis"),
      externalRef: null,
    },
  ];

  it("the person key folds diacritics, punctuation and word order", () => {
    expect(personKey("Petraitis, Jonas")).toBe(personKey("Jonas PETRAITIS"));
    expect(personKey("Šukys Ramūnas")).toBe(personKey("ramunas sukys"));
  });

  it("an employee number is the strongest match", () => {
    expect(
      matchPerson({ name: "J. Petraitis", externalRef: "1042" }, roster),
    ).toMatchObject({
      kind: "matched",
      personId: "p1",
      method: "external_ref",
      confidence: 1,
    });
  });

  it("an exact name matches, at less than full confidence", () => {
    const m = matchPerson({ name: "petraitis jonas" }, roster);
    expect(m).toMatchObject({
      kind: "matched",
      personId: "p1",
      method: "exact_name",
    });
    expect(m.kind === "matched" && m.confidence).toBeLessThan(1);
  });

  it("two real people with the same name are ASKED about, never guessed", () => {
    const twins: RosterPerson[] = [
      ...roster,
      {
        id: "p3",
        displayName: "Jonas Petraitis",
        normalizedName: personKey("Jonas Petraitis"),
        externalRef: null,
      },
    ];
    const m = matchPerson({ name: "Jonas Petraitis" }, twins);
    expect(m.kind).toBe("ambiguous");
    expect(
      m.kind === "ambiguous" && m.candidates.map((c) => c.id).sort(),
    ).toEqual(["p1", "p3"]);
  });

  it("a duplicated employee number is reported as a roster problem, not resolved", () => {
    const dupes: RosterPerson[] = [
      {
        id: "p1",
        displayName: "A",
        normalizedName: personKey("A"),
        externalRef: "1042",
      },
      {
        id: "p2",
        displayName: "B",
        normalizedName: personKey("B"),
        externalRef: "1042",
      },
    ];
    expect(matchPerson({ name: "A", externalRef: "1042" }, dupes).kind).toBe(
      "ambiguous",
    );
  });

  it("an unknown name stays unmatched — it never becomes a new person here", () => {
    expect(matchPerson({ name: "Someone Unknown" }, roster)).toEqual({
      kind: "unmatched",
    });
    expect(matchPerson({ name: "   " }, roster)).toEqual({ kind: "unmatched" });
  });

  it("an empty roster matches nobody, whatever the name", () => {
    expect(
      matchPerson({ name: "Jonas Petraitis", externalRef: "1042" }, []).kind,
    ).toBe("unmatched");
  });

  it("a place that was NEVER NAMED is different from one we cannot find", () => {
    const objects = [{ id: "o1", name: "Objektas A" }];
    expect(matchPlace(null, objects)).toEqual({ kind: "absent" });
    expect(matchPlace("   ", objects)).toEqual({ kind: "absent" });
    expect(matchPlace("Objektas Z", objects)).toEqual({ kind: "unmatched" });
    expect(matchPlace("objektas a", objects)).toMatchObject({
      kind: "matched",
      workObjectId: "o1",
    });
  });
});

// ── parsing ────────────────────────────────────────────────────────────────

describe("reading a real spreadsheet without guessing", () => {
  it("splits delimited text and honours quoted separators", () => {
    const grid = parseDelimited('a;b;c\n"x;y";2;3\n');
    expect(grid[0]).toEqual(["a", "b", "c"]);
    expect(grid[1]).toEqual(["x;y", "2", "3"]);
  });

  it("maps headers in more than one language", () => {
    expect(mapHeaderRow(["Vardas", "Data", "Valandos"])).toMatchObject({
      personLabel: 0,
      workDate: 1,
      hours: 2,
    });
    expect(mapHeaderRow(["Name", "Date", "Hours"])).toMatchObject({
      personLabel: 0,
      workDate: 1,
      hours: 2,
    });
  });

  it("an ISO date is a fact; an ambiguous D/M date is FLAGGED as a guess", () => {
    expect(readDate("2026-03-04")).toEqual({
      iso: "2026-03-04",
      ambiguous: false,
    });
    // 04/03 could be either convention — read day-first and reported as such.
    expect(readDate("04/03/2026")).toEqual({
      iso: "2026-03-04",
      ambiguous: true,
    });
    // 25 cannot be a month, so day-first is a fact here, not a guess.
    expect(readDate("25/03/2026")).toEqual({
      iso: "2026-03-25",
      ambiguous: false,
    });
    expect(readDate("31/02/2026")).toBeNull();
    expect(readDate("not a date")).toBeNull();
  });

  it("hours accept the European comma and NEVER default to zero", () => {
    expect(readHours("7,5")).toBe(7.5);
    expect(readHours("8")).toBe(8);
    // "no number here" must stay unknown — a 0 would under-report real work.
    expect(readHours("visa diena")).toBeNull();
    expect(readHours("")).toBeNull();
  });

  it("a grid becomes rows that flag the guessed date as DERIVED, not as fact", () => {
    const result = rowsFromGrid([
      ["Darbo laiko apskaita 2019"],
      ["Vardas", "Data", "Valandos", "Objektas", "Darbas"],
      ["Jonas Petraitis", "04/03/2019", "8", "Objektas A", "Klojo plyteles"],
      ["Jonas Petraitis", "2019-03-05", "7,5", "Objektas A", "Gruntavo sienas"],
    ]);
    expect(result.rows).toHaveLength(2);

    const guessed = result.rows[0];
    expect(guessed.workDate).toBe("2019-03-04");
    expect(guessed.factFields).not.toContain("workDate");
    expect(guessed.derived.workDate).toMatchObject({ value: "2019-03-04" });
    expect(guessed.derived.workDate?.confidence).toBeLessThan(1);

    const stated = result.rows[1];
    expect(stated.factFields).toContain("workDate");
    expect(stated.derived.workDate).toBeUndefined();
    expect(stated.hours).toBe(7.5);
  });

  it("a line that cannot become a row is REPORTED, never silently dropped", () => {
    const result = rowsFromGrid([
      ["Vardas", "Data", "Darbas"],
      ["Jonas Petraitis", "", "Klojo plyteles"],
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBeTruthy();
  });

  it("a sheet with no recognisable header says so instead of inventing columns", () => {
    const result = rowsFromGrid([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toBe("no_header");
  });

  it("every parsed row survives the canonical schema", () => {
    const result = rowsFromGrid([
      ["Vardas", "Data", "Valandos", "Darbas"],
      ["Jonas Petraitis", "2019-03-05", "8", "Klojo plyteles"],
    ]);
    for (const row of result.rows) {
      expect(sourceWorkRowSchema.safeParse(row).success).toBe(true);
    }
  });

  it("tidy collapses whitespace so the stored and fingerprinted text agree", () => {
    expect(tidy("  Klojo   plyteles \n")).toBe("Klojo plyteles");
  });
});
