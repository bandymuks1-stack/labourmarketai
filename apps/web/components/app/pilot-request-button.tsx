"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { submitPilotRequestAction } from "@/lib/pilot/pilot-request-actions";

/** Pilot-request CTA → the CANONICAL demand intake (§17). Submits a real
 *  `customer_request` (status='submitted', kind by intent) through the
 *  owner-scoped `submit_demand_request` RPC — the single structured-demand front
 *  door. It no longer posts to `/api/leads`: that endpoint stays a DISTINCT
 *  anonymous pre-auth funnel (§17.2), not a path for an authenticated need. The
 *  server action resolves the owner from the session (auth.uid()), so no client
 *  email is read or sent. */
export function PilotRequestButton({
  intent,
}: {
  intent: "hire_workers" | "partner";
}) {
  const t = useTranslations("auth.dashboard.wow.pilot");
  // Intent-specific copy: company hiring is NOT a generic buyer "need".
  const key = intent === "hire_workers" ? "hire" : "partner";
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );

  async function request() {
    setState("sending");
    try {
      const res = await submitPilotRequestAction(intent);
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-state-success" role="status">
        {t(`${key}.done`)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        onClick={request}
        disabled={state === "sending"}
        // Mobile-first: the room's primary action is a full-width tap target on
        // phones, compact on larger screens.
        className="w-full sm:w-auto sm:self-start"
      >
        {state === "sending" ? t("sending") : t(`${key}.cta`)}
      </Button>
      {state === "error" && (
        <p className="text-xs text-state-danger" role="alert">
          {t("error")}
        </p>
      )}
    </div>
  );
}
