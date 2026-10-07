"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  ReservationNotice,
  type OverrideReasonLabels,
  type ReservationLabels,
} from "@/components/app/project-assignment-manager";
import { keepAssignmentAction } from "@/lib/projects/actions";
import type { OverrideReasonCode } from "@/lib/projects/override-receipt-model";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

/**
 * J-TIME-FREEDOM - the explicit "keep knowingly" decision for ONE MEMBER of an
 * actively assigned team whose calendar clashes.
 *
 * A team assignment is one canonical relationship and writes no per-person
 * assignment row, so the person-assignment controls (swap / undo) do not apply
 * here: ending or replacing happens on the team assignment as a whole. What
 * does apply is the manager's knowing override, which must leave the same
 * immutable receipt as for a person (basis = the team assignment, resolved by
 * record_commitment_override_v1 from team membership as of now).
 *
 * FAIL-LOUD: the decision is shown as made ONLY when keepAssignmentAction
 * returned ok (= the receipt exists, or the clash no longer exists). The
 * collisions are recomputed on the server inside that action; the verdict
 * passed in here is only what the manager is looking at.
 *
 * SEAM: this file is self-contained on purpose. The team assignments block
 * (components/app/project-team-assignments.tsx, #2149) renders it in place of
 * the advisory-only <ReservationNotice verdict labels /> for each member with a
 * known clash:
 *   <TeamMemberKeepDecision projectId={projectId} memberProfileId={m.profileId}
 *                           verdict={m.verdict} />
 */
export function TeamMemberKeepDecision({
  projectId,
  memberProfileId,
  verdict,
}: {
  projectId: string;
  memberProfileId: string;
  verdict: ReservationVerdict;
}) {
  const tRes = useTranslations("projects.assign.reservation");
  const [busy, startTransition] = useTransition();
  const [decided, setDecided] = useState(false);
  const [keepFailed, setKeepFailed] = useState(false);

  const labels: ReservationLabels = {
    reservationCollidesTitle: tRes("collidesTitle"),
    reservationNotBlocking: tRes("notBlocking"),
    reservationUnknown: tRes("unknown"),
    reservationAlternativesTitle: tRes("alternativesTitle"),
    reservationSwap: tRes("swap"),
    reservationUndo: tRes("undo"),
    reservationKeep: tRes("keep"),
    reservationSource: {
      project: tRes("source.project"),
      booking: tRes("source.booking"),
      trip: tRes("source.trip"),
      absence: tRes("source.absence"),
      plan: tRes("source.plan"),
    },
  };
  const reasons: OverrideReasonLabels = {
    label: tRes("reasonLabel"),
    none: tRes("reasonNone"),
    failed: tRes("keepFailed"),
    options: {
      agreed_with_worker: tRes("reason.agreed_with_worker"),
      agreed_with_client: tRes("reason.agreed_with_client"),
      partial_overlap: tRes("reason.partial_overlap"),
      urgent_need: tRes("reason.urgent_need"),
      other: tRes("reason.other"),
    },
  };

  if (decided) {
    return (
      <p className="text-xs text-state-success" role="status" data-testid="team-member-keep-decided">
        {tRes("decided")}
      </p>
    );
  }

  const keep = (reasonCode: OverrideReasonCode | null) =>
    startTransition(async () => {
      const r = await keepAssignmentAction(projectId, memberProfileId, reasonCode);
      if (r.ok) {
        setKeepFailed(false);
        setDecided(true);
      } else {
        setKeepFailed(true);
      }
    });

  return (
    <ReservationNotice
      verdict={verdict}
      labels={labels}
      busy={busy}
      onKeep={keep}
      reasons={reasons}
      keepFailed={keepFailed}
    />
  );
}
