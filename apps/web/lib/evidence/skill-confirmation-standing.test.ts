import { describe, expect, it } from "vitest";

import { cvSkillTier, groupCvSkillTiers } from "@/lib/cv-export/skill-tiers";
import {
  skillConfirmationState,
  standingConfirmedSkillIds,
  withStandingConfirmation,
  type StandingEntryRow,
} from "./skill-confirmation-standing";

/**
 * A skill confirmation stands only while the work it confirmed stands.
 * Every case below is a real way the sticky `worker_skills.verified` flag
 * used to keep reading "confirmed" — and the cases that must KEEP it.
 */

const SUBJECT = "subject-profile";
const at = (d: number) => `2026-09-${String(d).padStart(2, "0")}T10:00:00Z`;
const decision = (d: "approved" | "rejected" | "changes_requested", by: string, day = 1, extra = {}) => ({
  confirmation_scope: { decision: d, ...extra },
  created_at: at(day),
  confirmer_id: by,
});
const entry = (
  id: string,
  confirmations: StandingEntryRow["journal_entry_confirmations"],
  skills: string[] = [],
  correction_of: string | null = null,
): StandingEntryRow => ({
  id,
  correction_of,
  journal_entry_confirmations: confirmations,
  journal_entry_skills: skills.map((skill_id) => ({ skill_id })),
});
const ids = (rows: StandingEntryRow[], subject: string | null | undefined = SUBJECT, corrected?: Set<string>) =>
  [...(standingConfirmedSkillIds(rows, subject, corrected) ?? new Set(["<null>"]))].sort();

describe("standingConfirmedSkillIds — which recorded confirmations still stand", () => {
  it("an independently approved live entry linked to the skill keeps it standing", () => {
    expect(ids([entry("e1", [decision("approved", "m1")], ["s1"])])).toEqual(["s1"]);
  });

  it("a LATER rejection or changes-request withdraws it (latest decision wins)", () => {
    expect(ids([entry("e1", [decision("approved", "m1", 1), decision("rejected", "m2", 2)], ["s1"])])).toEqual([]);
    expect(
      ids([entry("e1", [decision("approved", "m1", 1), decision("changes_requested", "m1", 2)], ["s1"])]),
    ).toEqual([]);
  });

  it("a re-approval after the rejection restores it", () => {
    expect(
      ids([
        entry("e1", [decision("approved", "m1", 1), decision("rejected", "m1", 2), decision("approved", "m1", 3)], ["s1"]),
      ]),
    ).toEqual(["s1"]);
  });

  it("a corrected original is replaced by its live correction (counted once), which has no approval yet", () => {
    expect(
      ids([entry("orig", [decision("approved", "m1")], ["s1"]), entry("fix", [], ["s1"], "orig")]),
    ).toEqual([]);
    // the same when the read only returned decided entries (inner join)
    expect(ids([entry("orig", [decision("approved", "m1")], ["s1"])], SUBJECT, new Set(["orig"]))).toEqual([]);
  });

  it("a deleted / superseded entry is simply not among the live rows — nothing stands", () => {
    expect(ids([])).toEqual([]);
  });

  it("the subject's own approval is not a confirmation", () => {
    expect(ids([entry("e1", [decision("approved", SUBJECT)], ["s1"])])).toEqual([]);
  });

  it("a client / counterparty acceptance never stands in for the employer decision (0018)", () => {
    expect(
      ids([
        entry("e1", [decision("approved", "client", 1, { action: "client_accept", authority: { basis: "counterparty" } })], ["s1"]),
      ]),
    ).toEqual([]);
  });

  it("a skill NAMED by the approving decision stands even without a link; a self-named one does not", () => {
    expect(
      ids([entry("e1", [decision("approved", "m1", 1, { action: "confirm", skills_confirmed: ["s9"] })])]),
    ).toEqual(["s9"]);
    expect(
      ids([
        entry("e1", [
          decision("approved", "m1", 1),
          decision("approved", SUBJECT, 2, { skills_confirmed: ["s9"] }),
        ]),
      ]),
    ).toEqual([]);
  });

  it("the policy auto-confirmation is an approval like the manual one", () => {
    expect(
      ids([entry("e1", [decision("approved", "m1", 1, { action: "auto_confirm", skills_confirmed: ["s1"] })])]),
    ).toEqual(["s1"]);
  });

  it("an unreadable subject is UNKNOWN, never a set that counts self-approvals", () => {
    expect(standingConfirmedSkillIds([entry("e1", [decision("approved", "m1")], ["s1"])], undefined)).toBeNull();
  });
});

describe("skillConfirmationState / withStandingConfirmation — what the tier readers see", () => {
  const read = { ids: new Set(["s1"]), subjectProfileId: SUBJECT };

  it("classifies each recorded confirmation honestly", () => {
    expect(skillConfirmationState({ skill_id: "s1", verified: false }, read)).toBe("none");
    expect(skillConfirmationState({ skill_id: "s1", verified: true, verified_by: "m1" }, read)).toBe("standing");
    expect(skillConfirmationState({ skill_id: "s2", verified: true, verified_by: "m1" }, read)).toBe("withdrawn");
    expect(skillConfirmationState({ skill_id: "s2", verified: true, verified_by: SUBJECT }, read)).toBe(
      "self_confirmed",
    );
    // a self-flagged skill that an independent approval LATER backs stands
    // (verified_by is never rewritten after the first flip)
    expect(skillConfirmationState({ skill_id: "s1", verified: true, verified_by: SUBJECT }, read)).toBe("standing");
    expect(skillConfirmationState({ skill_id: "s1", verified: true, verified_by: "m1" }, null)).toBe("unknown");
    // an erased confirmer (verified_by severed to NULL) is judged by the work alone
    expect(skillConfirmationState({ skill_id: "s1", verified: true, verified_by: null }, read)).toBe("standing");
  });

  it("only a standing confirmation reaches the CV's confirmed tier; history is carried, not rewritten", () => {
    const rows = withStandingConfirmation(
      [
        { skill_id: "s1", verified: true, verified_by: "m1", source: "manager_confirmed" },
        { skill_id: "s2", verified: true, verified_by: "m1", source: "manager_confirmed" },
        { skill_id: "s3", verified: true, verified_by: SUBJECT, source: "manager_confirmed" },
        { skill_id: "s4", verified: false, verified_by: null, source: "work_journal" },
      ],
      read,
    );
    expect(rows.map((r) => [r.skill_id, r.verified, r.verifiedRecorded, r.confirmation, r.source])).toEqual([
      ["s1", true, true, "standing", "manager_confirmed"],
      ["s2", false, true, "withdrawn", null],
      ["s3", false, true, "self_confirmed", null],
      ["s4", false, false, "none", "work_journal"],
    ]);
    const tiers = groupCvSkillTiers(
      rows.map((r) => ({
        slug: r.skill_id ?? "",
        verified: r.verified,
        source: r.source,
        journalSupported: r.skill_id === "s2", // s2 still has a live journal link
      })),
    );
    expect(tiers).toEqual({ confirmed: ["s1"], evidence: ["s2", "s4"], declared: ["s3"] });
  });

  it("an UNKNOWN standing read under-states (evidence), never confirms and never erases", () => {
    const [r] = withStandingConfirmation(
      [{ skill_id: "s1", verified: true, verified_by: "m1", source: "manager_confirmed" }],
      null,
    );
    expect(r.verified).toBe(false);
    expect(cvSkillTier({ slug: "s1", verified: r.verified, source: r.source })).toBe("evidence");
  });
});
