import { describe, expect, it } from "vitest";

import {
  MAX_PEOPLE_PER_BATCH,
  peopleToCreate,
  planPeopleIngest,
  type IngestRelationship,
  type PersonSource,
} from "@/lib/organization-people/ingest-core";
import { peopleFromGrid, personFromCvText } from "@/lib/organization-people/ingest-sources";
import { personKey, type RosterPerson } from "@/lib/organization-evidence/person-matching";

const roster = (...names: [string, string?][]): RosterPerson[] =>
  names.map(([displayName, externalRef], i) => ({
    id: `p${i}`,
    displayName,
    normalizedName: personKey(displayName),
    externalRef: externalRef ?? null,
  }));

const plan = (
  sources: PersonSource[],
  people: RosterPerson[] = [],
  relationship: IngestRelationship | null = "employee",
) => {
  const p = planPeopleIngest({ sources, roster: people, relationship });
  if (p.kind !== "plan") throw new Error(`expected a plan, got ${p.kind}`);
  return p;
};

const named = (...names: string[]): PersonSource[] =>
  names.map((name, i) => ({ name, sourceNote: `file.xlsx · row ${i + 2}` }));

describe("1 person", () => {
  it("one new person becomes exactly one roster row, with provenance", () => {
    const p = plan(named("Jonas Petraitis"));
    expect(p.counts).toMatchObject({ total: 1, toCreate: 1, alreadyOnRoster: 0 });
    const rows = peopleToCreate(p);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      displayName: "Jonas Petraitis",
      relationshipKind: "employee",
      sourceNote: "file.xlsx · row 2",
      externalRef: null,
    });
    // The key the DB index and the matcher must agree on.
    expect(rows[0].normalizedName).toBe(personKey("Jonas Petraitis"));
  });
});

describe("20 people — and no number is special", () => {
  it("twenty distinct people become twenty rows", () => {
    const p = plan(named(...Array.from({ length: 20 }, (_, i) => `Person Number${i}`)));
    expect(p.counts.total).toBe(20);
    expect(p.counts.toCreate).toBe(20);
    expect(peopleToCreate(p)).toHaveLength(20);
  });

  it("a batch at the bound is accepted; one over is refused, not truncated", () => {
    const at = Array.from({ length: MAX_PEOPLE_PER_BATCH }, (_, i) => `Aaa Bbb${i}`);
    expect(plan(named(...at)).counts.toCreate).toBe(MAX_PEOPLE_PER_BATCH);
    const over = planPeopleIngest({
      sources: named(...at, "One Toomany"),
      roster: [],
      relationship: "employee",
    });
    expect(over.kind).toBe("too_many_rows");
    if (over.kind !== "too_many_rows") throw new Error("unreachable");
    expect(over.received).toBe(MAX_PEOPLE_PER_BATCH + 1);
  });
});

describe("duplicates", () => {
  it("the same person twice in one batch is ONE person", () => {
    const p = plan(named("Jonas Petraitis", "Tomas Kazlauskas", "PETRAITIS, JONAS"));
    expect(p.counts.duplicateInBatch).toBe(1);
    expect(p.counts.toCreate).toBe(2);
    const dup = p.rows[2].disposition;
    expect(dup.kind).toBe("duplicate_in_batch");
    if (dup.kind !== "duplicate_in_batch") throw new Error("unreachable");
    expect(dup.firstIndex).toBe(0);
  });

  it("the same person across two uploaded CVs is ONE person", () => {
    // Two files, same human — the batch is the unit, not the file.
    const p = plan([
      { name: "Jonas Petraitis", sourceNote: "a.pdf" },
      { name: "Jonas Petraitis", sourceNote: "b.pdf" },
    ]);
    expect(p.counts.toCreate).toBe(1);
    expect(p.counts.duplicateInBatch).toBe(1);
  });

  it("someone already on the roster is NOT created again", () => {
    const p = plan(named("Jonas Petraitis"), roster(["Jonas Petraitis"]));
    expect(p.counts.toCreate).toBe(0);
    expect(p.counts.alreadyOnRoster).toBe(1);
    expect(peopleToCreate(p)).toHaveLength(0);
  });

  it("IDEMPOTENCE: importing the same file twice creates nothing the second time", () => {
    const file = named("Jonas Petraitis", "Tomas Kazlauskas");
    const first = plan(file);
    expect(first.counts.toCreate).toBe(2);
    // Commit, then re-run against the roster those rows became.
    const after = peopleToCreate(first).map((r, i) => ({
      id: `new${i}`,
      displayName: r.displayName,
      normalizedName: r.normalizedName,
      externalRef: r.externalRef,
    }));
    const second = plan(file, after);
    expect(second.counts.toCreate).toBe(0);
    expect(second.counts.alreadyOnRoster).toBe(2);
    expect(peopleToCreate(second)).toHaveLength(0);
  });

  it("an employee number matches even when the name is written differently", () => {
    const p = plan(
      [{ name: "J. Petraitis", externalRef: "E-1", sourceNote: "x" }],
      roster(["Jonas Petraitis", "E-1"]),
    );
    expect(p.counts.alreadyOnRoster).toBe(1);
    const d = p.rows[0].disposition;
    if (d.kind !== "already_on_roster") throw new Error("unreachable");
    expect(d.method).toBe("external_ref");
  });
});

describe("ambiguity — ask, never guess", () => {
  it("two roster people could be meant: nothing commits until it is settled", () => {
    // Two real people with the same name is normal in any real roster, and it
    // is the one case a matcher must never resolve by picking.
    const p = plan(named("Jonas Petraitis"), roster(["Jonas Petraitis"], ["Jonas Petraitis"]));
    expect(p.counts.ambiguous).toBe(1);
    expect(p.needsReconciliation).toBe(true);
    // AND the whole batch is held — not "commit the easy ones".
    expect(peopleToCreate(p)).toHaveLength(0);
  });

  it("one ambiguity holds a batch that is otherwise fine", () => {
    const p = plan(
      named("Brand New", "Jonas Petraitis"),
      roster(["Jonas Petraitis"], ["Jonas Petraitis"]),
    );
    expect(p.counts.toCreate).toBe(1);
    expect(peopleToCreate(p), "an unanswered question let other rows through").toHaveLength(0);
  });
});

describe("unusable rows are never people", () => {
  it("a blank or punctuation-only name is refused, not written", () => {
    const p = plan([
      { name: "   ", sourceNote: "f · row 2" },
      { name: "---", sourceNote: "f · row 3" },
      { name: "Real Person", sourceNote: "f · row 4" },
    ]);
    expect(p.counts.unusable).toBe(2);
    expect(p.counts.toCreate).toBe(1);
    expect(peopleToCreate(p)).toHaveLength(1);
  });

  it("an absurdly long name is refused rather than truncated into someone else", () => {
    const p = plan([{ name: `${"A".repeat(150)} ${"B".repeat(150)}`, sourceNote: "f" }]);
    expect(p.counts.unusable).toBe(1);
  });
});

describe("relationships are supplied, never inferred", () => {
  it("no relationship means nothing may commit", () => {
    const p = plan(named("Jonas Petraitis"), [], null);
    expect(p.needsRelationship).toBe(true);
    expect(peopleToCreate(p)).toHaveLength(0);
  });

  it("each actor's truthful relationship is carried through unchanged", () => {
    for (const rel of ["candidate", "employee", "agency_worker", "student", "trainee"] as const) {
      const rows = peopleToCreate(plan(named("Jonas Petraitis"), [], rel));
      expect(rows[0].relationshipKind, rel).toBe(rel);
    }
  });

  it("a candidate is NEVER silently promoted to an employee", () => {
    const rows = peopleToCreate(plan(named("Jonas Petraitis"), [], "candidate"));
    expect(rows[0].relationshipKind).toBe("candidate");
    expect(rows[0].relationshipKind).not.toBe("employee");
  });
});

describe("the roster is not a CV database", () => {
  it("a written row carries a name, a reference and provenance — and nothing else", () => {
    const rows = peopleToCreate(
      plan([{ name: "Jonas Petraitis", externalRef: "E-9", sourceNote: "cvs.zip · jonas.pdf" }]),
    );
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["displayName", "externalRef", "normalizedName", "relationshipKind", "sourceNote"].sort(),
    );
  });
});

describe("XLSX / CSV as a source", () => {
  const grid = [
    ["Vardas Pavardė", "Tabelio nr.", "Pareigos"],
    ["Jonas Petraitis", "E-1", "Elektrikas"],
    ["Tomas Kazlauskas", "E-2", "Pastolininkas"],
    ["", "", ""],
  ];

  it("reads the declared name and reference columns", () => {
    const res = peopleFromGrid(grid, "darbuotojai.xlsx");
    expect(res.kind).toBe("people");
    if (res.kind !== "people") throw new Error("unreachable");
    expect(res.people).toHaveLength(2);
    expect(res.people[0]).toMatchObject({
      name: "Jonas Petraitis",
      externalRef: "E-1",
      sourceNote: "darbuotojai.xlsx · row 2",
    });
  });

  it("a sheet with no name column ASKS — it never takes column 0", () => {
    const res = peopleFromGrid(
      [
        ["Tabelio nr.", "Pareigos"],
        ["E-1", "Elektrikas"],
      ],
      "x.xlsx",
    );
    expect(res.kind).toBe("no_name_column");
  });

  it("an empty sheet is empty, not zero people imported", () => {
    expect(peopleFromGrid([["", ""]], "x.xlsx").kind).toBe("empty");
  });

  it("the grid path feeds the SAME core — one architecture, two formats", () => {
    const res = peopleFromGrid(grid, "darbuotojai.xlsx");
    if (res.kind !== "people") throw new Error("unreachable");
    const p = plan([...res.people], [], "employee");
    expect(p.counts.toCreate).toBe(2);
  });
});

describe("CV text as a source — conservative by design", () => {
  it("reads a clear name from the top of a CV", () => {
    const person = personFromCvText("Jonas Petraitis\nElektrikas\nVilnius", "jonas.pdf");
    expect(person?.name).toBe("Jonas Petraitis");
    expect(person?.sourceNote).toBe("jonas.pdf");
  });

  it("refuses a heading, a job title, a line with contact details", () => {
    for (const text of [
      "CURRICULUM VITAE\nSoftware Engineer",
      "Gyvenimo aprašymas",
      "jonas@example.com\nJonas",
      "+370 600 00000",
      "Senior Full Stack Software Engineer Consultant",
    ]) {
      expect(personFromCvText(text, "f.pdf"), text).toBeNull();
    }
  });

  it("a CV it cannot read yields NOTHING — never a person named after a heading", () => {
    const person = personFromCvText("RESUME\n\nEXPERIENCE\n\nSKILLS", "f.pdf");
    expect(person).toBeNull();
  });

  it("several CVs feed the same core and de-duplicate against each other", () => {
    const people = [
      personFromCvText("Jonas Petraitis\nElektrikas", "a.pdf"),
      personFromCvText("Tomas Kazlauskas\nPastolininkas", "b.pdf"),
      personFromCvText("Petraitis Jonas\nElektrikas", "c.pdf"),
    ].filter((p): p is PersonSource => p !== null);
    expect(people).toHaveLength(3);
    const p = plan(people, [], "candidate");
    expect(p.counts.toCreate).toBe(2);
    expect(p.counts.duplicateInBatch).toBe(1);
  });
});

describe("ambiguity resolution — the human settles it, nothing merges", () => {
  const twins = roster(["Jonas Petraitis"], ["Jonas Petraitis"]);

  it("choosing an EXISTING person creates nothing", () => {
    const p = planPeopleIngest({
      sources: named("Jonas Petraitis"),
      roster: twins,
      relationship: "employee",
      resolutions: [{ index: 0, choice: "existing", personId: "p1" }],
    });
    if (p.kind !== "plan") throw new Error("unreachable");
    expect(p.needsReconciliation).toBe(false);
    expect(p.counts.alreadyOnRoster).toBe(1);
    expect(peopleToCreate(p)).toHaveLength(0);
  });

  it("choosing NEW records a distinct person — a shared name is not one human", () => {
    const p = planPeopleIngest({
      sources: named("Jonas Petraitis"),
      roster: twins,
      relationship: "employee",
      resolutions: [{ index: 0, choice: "new" }],
    });
    if (p.kind !== "plan") throw new Error("unreachable");
    expect(p.needsReconciliation).toBe(false);
    expect(peopleToCreate(p)).toHaveLength(1);
  });

  it("an id that is NOT on this organization's roster is not an answer", () => {
    const p = planPeopleIngest({
      sources: named("Jonas Petraitis"),
      roster: twins,
      relationship: "employee",
      resolutions: [{ index: 0, choice: "existing", personId: "someone-elses-org" }],
    });
    if (p.kind !== "plan") throw new Error("unreachable");
    expect(p.needsReconciliation, "a foreign id settled an ambiguity").toBe(true);
    expect(peopleToCreate(p)).toHaveLength(0);
  });

  it("an answer to ONE row does not settle another", () => {
    const p = planPeopleIngest({
      sources: named("Jonas Petraitis", "Jonas Petraitis "),
      roster: twins,
      relationship: "employee",
      resolutions: [{ index: 0, choice: "new" }],
    });
    if (p.kind !== "plan") throw new Error("unreachable");
    // Row 1 is a duplicate of row 0 in the same batch, so it creates nothing
    // and asks nothing — the answer did not leak, and nor did a second person.
    expect(peopleToCreate(p)).toHaveLength(1);
  });
});
