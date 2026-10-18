"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { switchWorkspaceAction } from "@/lib/company/organization-actions";

/**
 * Enter an organization's workspace from a page opened for it by name
 * (`?org=`). The people, projects and planning doors read the ACTIVE
 * workspace; this is the one move that makes them read this organization -
 * through the existing membership-checked switch, never a client claim.
 */
export function OpenWorkspaceButton({
  organizationId,
  label,
  pendingLabel,
  errorLabel,
}: {
  readonly organizationId: string;
  readonly label: string;
  readonly pendingLabel: string;
  readonly errorLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(false);
            const res = await switchWorkspaceAction(organizationId);
            if (!res.ok) setFailed(true);
            else router.refresh();
          })
        }
        className="inline-flex min-h-11 items-center rounded-full bg-gradient-cta px-4 text-sm font-semibold text-text-on-brand disabled:opacity-50"
        data-testid="open-workspace-button"
      >
        {pending ? pendingLabel : label}
      </button>
      {failed ? (
        <span role="alert" className="text-meta text-state-danger">
          {errorLabel}
        </span>
      ) : null}
    </span>
  );
}
