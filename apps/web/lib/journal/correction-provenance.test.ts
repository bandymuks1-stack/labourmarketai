import { describe, expect, it } from "vitest";

import { deriveCorrectionProvenance } from "./correction-provenance";

/**
 * A CORRECTION CARRIES WHAT IT ANSWERED (walk work-verification 2026-10-25,
 * PR #2786). After a worker answered a returned or rejected entry, the
 * original left the diary (counted once) and its decision and note were
 * nowhere on screen. The provenance is read off the decided original's real
 * decision rows and handed to the correction's card — never a card, a state
 * or a count of its own.
 */

const returned = (at: string, note?: string, role = "owner") => ({
  confirmation_scope: note === undefined ? { decision: "changes_requested" } : { decision: "changes_requested", note },
  created_at: at,
  confirmer_role: role,
});

describe("deriveCorrectionProvenance", () => {
  it("a correction of a RETURNED original carries the decision, its role, date and real note", () => {
    const p = deriveCorrectionProvenance(
      [{ id: "fix", correction_of: "orig", journal_entry_confirmations: [] }],
      [{ id: "orig", journal_entry_confirmations: [returned("2026-10-25T10:00:00Z", "  nurodyk kvadratus  ")] }],
    );
    expect(p).toEqual({
      fix: [
        {
          originalId: "orig",
          result: "changes_requested",
          role: "owner",
          at: "2026-10-25T10:00:00Z",
          note: "nurodyk kvadratus",
        },
      ],
    });
  });

  it("a REJECTED original reads as rejected; a missing note stays null (never invented)", () => {
    const p = deriveCorrectionProvenance(
      [{ id: "fix", correction_of: "orig" }],
      [
        {
          id: "orig",
          journal_entry_confirmations: [
            { confirmation_scope: { action: "reject" }, created_at: "2026-10-25T11:00:00Z", confirmer_role: "manager" },
          ],
        },
      ],
    );
    expect(p.fix).toEqual([
      { originalId: "orig", result: "rejected", role: "manager", at: "2026-10-25T11:00:00Z", note: null },
    ]);
  });

  it("the LATEST employer decision of the original speaks; a client (counterparty) row never does", () => {
    const p = deriveCorrectionProvenance(
      [{ id: "fix", correction_of: "orig" }],
      [
        {
          id: "orig",
          journal_entry_confirmations: [
            { confirmation_scope: { decision: "approved" }, created_at: "2026-10-20T08:00:00Z", confirmer_role: "owner" },
            returned("2026-10-21T08:00:00Z", "per daug valandų"),
            {
              confirmation_scope: { decision: "approved", authority: { basis: "counterparty" } },
              created_at: "2026-10-22T08:00:00Z",
              confirmer_role: null,
            },
          ],
        },
      ],
    );
    expect(p.fix?.map((s) => [s.result, s.note])).toEqual([["changes_requested", "per daug valandų"]]);
  });

  it("a correction of a correction walks the chain, nearest decision first", () => {
    const p = deriveCorrectionProvenance(
      [{ id: "fix2", correction_of: "fix1" }],
      [
        { id: "fix1", correction_of: "orig", journal_entry_confirmations: [returned("2026-10-23T08:00:00Z", "dar ne")] },
        {
          id: "orig",
          journal_entry_confirmations: [
            { confirmation_scope: { decision: "rejected", note: "ne tas objektas" }, created_at: "2026-10-22T08:00:00Z", confirmer_role: "owner" },
          ],
        },
      ],
    );
    expect(p.fix2?.map((s) => [s.originalId, s.result, s.note])).toEqual([
      ["fix1", "changes_requested", "dar ne"],
      ["orig", "rejected", "ne tas objektas"],
    ]);
    // The middle link is not a counted entry, so it carries nothing itself.
    expect(p.fix1).toBeUndefined();
  });

  it("no decided original → no key (nothing to say, nothing said); a cycle terminates", () => {
    const p = deriveCorrectionProvenance(
      [
        { id: "plain" },
        { id: "fix", correction_of: "undecided" },
        { id: "outside", correction_of: "not-read" },
        { id: "loop", correction_of: "a" },
      ],
      [
        { id: "undecided", journal_entry_confirmations: [] },
        { id: "a", correction_of: "b", journal_entry_confirmations: [] },
        { id: "b", correction_of: "a", journal_entry_confirmations: [] },
      ],
    );
    expect(p).toEqual({});
  });
});
