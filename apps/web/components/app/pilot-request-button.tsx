"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/context";

/** Honest pilot-request CTA. Posts the signed-in user's email to the EXISTING
 *  /api/leads endpoint (real lead row — no new schema, no fake state). Used on
 *  the company/agency/customer activity-start surface so the founder can review
 *  early companies and start pilot conversations manually. */
export function PilotRequestButton({ intent }: { intent: "hire_workers" | "partner" }) {
  const t = useTranslations("auth.dashboard.wow.pilot");
  const { profile, user } = useAuth();
  const email = profile?.email ?? user?.email ?? null;
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function request() {
    if (!email) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: profile?.full_name ?? null,
          intent,
          source: "dashboard_pilot",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      setState(res.ok && data.ok !== false ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-state-success" role="status">
        {t("done")}
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
        className="self-start"
      >
        {state === "sending" ? t("sending") : t("cta")}
      </Button>
      {state === "error" && (
        <p className="text-xs text-state-danger" role="alert">
          {t("error")}
        </p>
      )}
    </div>
  );
}
