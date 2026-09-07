import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveIndependentReviewResult,
  deriveReviewResult,
  isSelfConfirmation,
  isSelfConfirmedOnly,
  type ConfirmationRow,
} from "@/lib/journal/review-status";
import { deriveProvenance, provenanceTextKey } from "@/lib/evidence/provenance";
import { deriveWorkVerificationState } from "@/lib/journal/work-verification-state";

/**
 * CONFIRMING YOUR OWN WORK IS NOT INDEPENDENT CONFIRMATION.
 * (Owner P0, 2026-09-07 reconciliation.)
 *
 * ── THE DEFECT, MEASURED ON PRODUCTION ─────────────────────────────────────
 * `review_journal_entry` authorises on `is_admin() OR manages_organization()`
 * and never compares the reviewer to the worker. It selects the worker and
 * uses it only in the audit payload. So anyone who manages an organisation can
 * approve work they logged against that same organisation.
 *
 * Read live from the production database on 2026-09-07, not inferred (the
 * project ref itself stays out of source — `single-domain-origin.test.ts`
 * forbids that literal, and it caught this very comment on its first run): of
 * the 13 real `journal_entry_confirmations` rows, **3 are self-confirmations** — one
 * person, holding an `owner` engagement, approving their own entries on
 * 2026-06-16 and 2026-07-05 (×2). All three carry `decision: "approved"`.
 *
 * Those three have not yet flipped a skill: `worker_skills.verified` is 2 on
 * production and both belong to a different person, confirmed by someone else.
 * What IS wrong today is the read — a self-approved entry rendered exactly
 * like one a supervisor confirmed, and confirmed work is the platform's trust
 * currency (doctrine §9; ARCHITECTURE I-4).
 *
 * ── WHAT THIS GUARD PINS, AND WHAT IT DELIBERATELY DOES NOT ────────────────
 * It pins the READ. Blocking the write is a `SECURITY DEFINER` authorisation
 * change (RED, owner-gated) AND an open product decision, because a sole
 * trader legitimately has nobody above them. The owner's own instruction is to
 * PRESERVE existing self-confirmations and classify them correctly — never to
 * delete evidence — so that is exactly what is tested here:
 *
 *   · the row survives and still reads as a real decision;
 *   · it never reaches EMPLOYER_CONFIRMED or `verified`;
 *   · the text equivalent says so out loud;
 *   · a caller that cannot answer the question gets the OLD behaviour, never a
 *     silently weakened one.
 */

const SUBJECT = "11111111-1111-1111-1111-111111111111";
const MANAGER = "22222222-2222-2222-2222-222222222222";

const approvedBy = (who: string, at: string): ConfirmationRow => ({
  confirmation_scope: { decision: "approved" },
  created_at: at,
  confirmer_role: "owner",
  confirmer_id: who,
});

describe("a self-confirmation is still a real, preserved decision", () => {
  it("deriveReviewResult is unchanged — the row is never erased or ignored", () => {
    const rows = [approvedBy(SUBJECT, "2026-07-05T10:00:00Z")];
    expect(deriveReviewResult(rows)).toBe("approved");
  });

  it("isSelfConfirmation names it without needing anything but the two ids", () => {
    expect(isSelfConfirmation(approvedBy(SUBJECT, "2026-07-05T10:00:00Z"), SUBJECT)).toBe(true);
    expect(isSelfConfirmation(approvedBy(MANAGER, "2026-07-05T10:00:00Z"), SUBJECT)).toBe(false);
  });
});

describe("the independence question is answered separately", () => {
  it("only the subject approved → NOT independently approved", () => {
    const rows = [approvedBy(SUBJECT, "2026-07-05T10:00:00Z")];
    expect(deriveIndependentReviewResult(rows, SUBJECT)).toBe("submitted");
    expect(isSelfConfirmedOnly(rows, SUBJECT)).toBe(true);
  });

  it("a supervisor also approved → independently approved", () => {
    const rows = [
      approvedBy(SUBJECT, "2026-07-05T10:00:00Z"),
      approvedBy(MANAGER, "2026-07-06T10:00:00Z"),
    ];
    expect(deriveIndependentReviewResult(rows, SUBJECT)).toBe("approved");
    expect(isSelfConfirmedOnly(rows, SUBJECT)).toBe(false);
  });

  it("a later self-approval cannot undo an earlier independent one", () => {
    // Latest-wins runs over the INDEPENDENT subset, so a self row is simply
    // absent from that ordering rather than overwriting a real decision.
    const rows = [
      approvedBy(MANAGER, "2026-07-01T10:00:00Z"),
      approvedBy(SUBJECT, "2026-07-09T10:00:00Z"),
    ];
    expect(deriveIndependentReviewResult(rows, SUBJECT)).toBe("approved");
  });

  it("a supervisor's request for changes still stands over a self-approval", () => {
    const rows: ConfirmationRow[] = [
      approvedBy(SUBJECT, "2026-07-05T10:00:00Z"),
      {
        confirmation_scope: { decision: "changes_requested" },
        created_at: "2026-07-06T10:00:00Z",
        confirmer_id: MANAGER,
      },
    ];
    expect(deriveIndependentReviewResult(rows, SUBJECT)).toBe("changes_requested");
  });
});

describe("no caller is silently weakened", () => {
  it("without a subject id the answer equals the old one", () => {
    const rows = [approvedBy(SUBJECT, "2026-07-05T10:00:00Z")];
    expect(deriveIndependentReviewResult(rows, null)).toBe(deriveReviewResult(rows));
    expect(isSelfConfirmedOnly(rows, null)).toBe(false);
  });

  it("rows that never selected confirmer_id keep the old answer", () => {
    const rows: ConfirmationRow[] = [
      { confirmation_scope: { decision: "approved" }, created_at: "2026-07-05T10:00:00Z" },
    ];
    expect(deriveIndependentReviewResult(rows, SUBJECT)).toBe("approved");
    expect(isSelfConfirmedOnly(rows, SUBJECT)).toBe(false);
  });
});

describe("provenance never shows a self-confirmation as employer-confirmed", () => {
  const org = (row: ConfirmationRow) => ({ ...row, organizationName: "UAB Pavyzdys" });

  it("self-approved → EVIDENCE_SUPPORTED, flagged, and the text says so", () => {
    const p = deriveProvenance({
      confirmations: [org(approvedBy(SUBJECT, "2026-07-05T10:00:00Z"))],
      subjectProfileId: SUBJECT,
      journalEntries: 4,
    });
    expect(p.class).toBe("EVIDENCE_SUPPORTED");
    expect(p).toMatchObject({ selfConfirmedOnly: true });
    expect(provenanceTextKey(p)).toBe("evidenceSelfConfirmed");
  });

  it("a real supervisor confirmation still reaches the gold class", () => {
    const p = deriveProvenance({
      confirmations: [org(approvedBy(MANAGER, "2026-07-05T10:00:00Z"))],
      subjectProfileId: SUBJECT,
      journalEntries: 4,
    });
    expect(p).toEqual({
      class: "EMPLOYER_CONFIRMED",
      confirmedBy: "UAB Pavyzdys",
      confirmedAt: "2026-07-05T10:00:00Z",
    });
  });

  it("self-approved with NO journal entries is still evidence, not nothing", () => {
    // The record exists. Dropping to SELF_DECLARED would under-state a real
    // stored decision as if the person had merely typed a claim.
    const p = deriveProvenance({
      confirmations: [org(approvedBy(SUBJECT, "2026-07-05T10:00:00Z"))],
      subjectProfileId: SUBJECT,
      journalEntries: 0,
    });
    expect(p.class).toBe("EVIDENCE_SUPPORTED");
    expect(provenanceTextKey(p)).toBe("evidenceSelfConfirmed");
  });

  it("omitting subjectProfileId preserves the previous behaviour exactly", () => {
    const p = deriveProvenance({
      confirmations: [org(approvedBy(SUBJECT, "2026-07-05T10:00:00Z"))],
      journalEntries: 4,
    });
    expect(p.class).toBe("EMPLOYER_CONFIRMED");
  });
});

describe("the verification ladder keeps self-confirmation off the top rung", () => {
  const context = {
    organizationId: "org-a",
    journalReviewEnabled: true,
    relationshipSlug: "employee",
    status: "active",
  };

  it("self-approved → self_confirmed, never verified", () => {
    const v = deriveWorkVerificationState({
      reviewResult: "approved",
      context,
      selfConfirmedOnly: true,
    });
    expect(v.state).toBe("self_confirmed");
    expect(v.verifier).toEqual({ kind: "none" });
    expect(v.nextAction).toBe("identify_verifier");
  });

  it("independently approved → verified, unchanged", () => {
    const v = deriveWorkVerificationState({ reviewResult: "approved", context });
    expect(v.state).toBe("verified");
    expect(v.nextAction).toBe("none");
  });
});

describe("the read path actually asks the question", () => {
  const read = (rel: string) =>
    readFileSync(join(__dirname, "..", "..", rel), "utf8");

  it("the player card selects confirmer_id and passes the subject", () => {
    // Without the column the filter is a no-op and the gold class would stay
    // reachable by approving your own work — the exact hole this closes.
    const card = read("lib/player-card/player-card.ts");
    expect(card).toMatch(/confirmer_id,\s*confirmer_role/);
    expect(card).toMatch(/subjectProfileId:\s*user\.id/);
  });

  it("the evidence is preserved, not deleted — nothing here removes a row", () => {
    const status = read("lib/journal/review-status.ts");
    expect(status).not.toMatch(/\.delete\(|DELETE FROM/i);
    const prov = read("lib/evidence/provenance.ts");
    expect(prov).not.toMatch(/\.delete\(|DELETE FROM/i);
  });
});
