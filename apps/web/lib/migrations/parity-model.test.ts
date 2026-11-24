import { describe, expect, it } from "vitest";

import {
  REVIEWED_APPLY_SHAPES,
  checkMigrationParity,
  matchRepoStem,
  type ProductionMigration,
} from "@/lib/migrations/parity-model";

const row = (name: string, version = "20260101000000"): ProductionMigration => ({
  version,
  name,
});

describe("name matching (version is apply time and must never be used)", () => {
  it("matches an exact repo stem", () => {
    expect(matchRepoStem("0013_work_journal_m1", ["0013_work_journal_m1"])).toBe(
      "0013_work_journal_m1",
    );
  });

  it("matches a slug-only ledger name to its timestamped repo stem", () => {
    expect(
      matchRepoStem("timesheets_v1", ["20260817170000_timesheets_v1", "0001_initial"]),
    ).toBe("20260817170000_timesheets_v1");
  });

  it("REFUSES to guess when two repo files share a slug", () => {
    expect(
      matchRepoStem("company_memberships_v1", [
        "20260714210000_company_memberships_v1",
        "20260806090000_company_memberships_v1",
      ]),
    ).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(matchRepoStem("nope", ["0001_initial"])).toBeNull();
  });
});

describe("parity verdicts", () => {
  it("a production row with no file and no reviewed shape is an ORPHAN", () => {
    const result = checkMigrationParity([row("mystery_migration")], ["0001_initial"]);
    expect(result.orphans.map((o) => o.name)).toEqual(["mystery_migration"]);
  });

  it("a reviewed split shape accounts for several rows against one file", () => {
    const stems = ["20260612091000_journal_entry_photos"];
    const result = checkMigrationParity(
      [
        row("journal_entry_photos_table"),
        row("journal_entry_photos_rpc"),
        row("journal_entry_photos_storage"),
      ],
      stems,
    );
    expect(result.orphans).toEqual([]);
    expect(result.reviewed).toHaveLength(3);
    expect(result.unapplied).toEqual([]);
  });

  it("a reviewed union shape accounts for one row against several files", () => {
    const stems = [
      "20260817130100_notification_events_v3_workflow_types",
      "20260817140100_notification_document_types_v3",
    ];
    const result = checkMigrationParity(
      [row("notification_types_union_workflow_document_v3")],
      stems,
    );
    expect(result.orphans).toEqual([]);
    expect(result.unapplied).toEqual([]);
  });

  it("a reviewed shape naming a file the repo LOST is an orphan, not a pass", () => {
    // A stale entry must fail loudly — that is how a gate rots into a rubber stamp.
    const result = checkMigrationParity(
      [row("journal_entry_photos_table")],
      ["0001_initial"],
    );
    expect(result.orphans.map((o) => o.name)).toEqual(["journal_entry_photos_table"]);
  });

  it("repo files not yet applied are reported, not failed", () => {
    const result = checkMigrationParity([row("0001_initial")], [
      "0001_initial",
      "20260818150000_pending_thing",
    ]);
    expect(result.orphans).toEqual([]);
    expect(result.unapplied).toEqual(["20260818150000_pending_thing"]);
  });

  it("is deterministic regardless of ledger order", () => {
    const stems = ["a_one", "b_two"];
    const forward = checkMigrationParity([row("a_one"), row("b_two")], stems);
    const reverse = checkMigrationParity([row("b_two"), row("a_one")], stems);
    expect(forward.orphans).toEqual(reverse.orphans);
    expect(forward.unapplied).toEqual(reverse.unapplied);
  });
});

describe("duplicate slugs are disambiguated, never guessed", () => {
  it("the applied file is named and the superseded sibling stays 'not applied'", () => {
    const stems = [
      "20260714210000_company_memberships_v1",
      "20260806090000_company_memberships_v1",
    ];
    const result = checkMigrationParity([row("company_memberships_v1")], stems);
    expect(result.orphans).toEqual([]);
    expect(result.reviewed).toHaveLength(1);
    // The never-applied draft is correctly reported as not applied.
    expect(result.unapplied).toEqual(["20260714210000_company_memberships_v1"]);
  });
});

describe("the reviewed register itself", () => {
  it("every reviewed shape states WHY, so a reader can re-check it", () => {
    for (const [name, shape] of Object.entries(REVIEWED_APPLY_SHAPES)) {
      expect(shape.why.length, `${name} must explain itself`).toBeGreaterThan(20);
    }
  });

  it("covers exactly the nine shapes reviewed on 2026-08-18", () => {
    expect(Object.keys(REVIEWED_APPLY_SHAPES).sort()).toEqual(
      [
        "company_memberships_v1",
        "company_memberships_v1_trigger_fn_revoke",
        "conversation_message_language_check",
        "invitation_org_authority_v1_resend_completion",
        "journal_entry_photos_rpc",
        "journal_entry_photos_storage",
        "journal_entry_photos_table",
        "notification_types_union_workflow_document_v3",
        "public_vacancy_preview_v1_revoke_public",
      ].sort(),
    );
  });

  it("the ONE genuine orphan is NOT excused here — it was restored as a file", () => {
    expect(REVIEWED_APPLY_SHAPES["20260705240000_agency_legacy_retype"]).toBeUndefined();
  });
});
