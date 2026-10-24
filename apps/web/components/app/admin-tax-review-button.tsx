"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markTaxEvidenceReviewedAction } from "@/lib/admin/billing-actions";

/**
 * Superadmin: close one Stripe Tax review row (records who/when; amounts and
 * the stated reason stay). Honest states: saving / done / failed.
 */
export function AdminTaxReviewButton({
  locale,
  evidenceId,
  labels,
}: {
  locale: string;
  evidenceId: string;
  labels: { mark: string; saving: string; error: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setFailed(false);
          startTransition(async () => {
            const res = await markTaxEvidenceReviewedAction({ locale, evidenceId });
            if (res.ok) router.refresh();
            else setFailed(true);
          });
        }}
        className="rounded-md border border-ink-500 px-2 py-1 text-meta text-text-primary hover:border-brand-blue disabled:opacity-60"
        data-testid="admin-tax-review-mark"
      >
        {pending ? labels.saving : labels.mark}
      </button>
      {failed ? <span className="text-meta text-state-danger">{labels.error}</span> : null}
    </span>
  );
}
