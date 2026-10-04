"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { requestEmailVerificationAction } from "@/lib/auth/email-verification-actions";
import { parseVerifyResult } from "@/lib/auth/email-verification";

/**
 * Progressive "verify your email" prompt — shown ONLY at the moment a
 * trust-sensitive action needs a proven mailbox (claiming an invitation that is
 * addressed to an email). It is never a gate at signup, login, onboarding,
 * profile, CV or journal, and it never says the person cannot continue: every
 * other part of the product keeps working while the address is unverified.
 *
 * It states a fact (the address is not verified yet) and offers ONE action
 * (send me a one-time link). `sent` means the mail request was accepted — the
 * copy says "we sent", never "verified". The verified state is rendered
 * nowhere here: only the database can establish it.
 */
export function VerifyEmailPrompt({
  locale,
  next,
  /** `email_verify` result the callback appended to the URL, if any. */
  result,
}: {
  locale: string;
  next?: string | null;
  result?: string | null;
}) {
  const t = useTranslations("network.incoming.verify");
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<
    | { kind: "idle" }
    | { kind: "sent"; email: string | null }
    | { kind: "rate_limited" }
    | { kind: "already_verified" }
    | { kind: "error" }
  >({ kind: "idle" });
  const failedReturn = parseVerifyResult(result) === "failed";

  function send() {
    start(async () => {
      const r = await requestEmailVerificationAction({ locale, next });
      if (r.status !== "ok") return setPhase({ kind: "error" });
      if (r.outcome === "sent") return setPhase({ kind: "sent", email: r.email ?? null });
      if (r.outcome === "already_verified") return setPhase({ kind: "already_verified" });
      if (r.outcome === "rate_limited") return setPhase({ kind: "rate_limited" });
      return setPhase({ kind: "error" });
    });
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2"
      data-testid="verify-email-prompt"
    >
      <p className="text-sm font-medium text-text-primary">{t("title")}</p>
      <p className="text-xs text-text-secondary">{t("body")}</p>
      {failedReturn && phase.kind === "idle" && (
        <p role="alert" className="text-xs text-state-warning" data-testid="verify-email-failed">
          {t("failed")}
        </p>
      )}
      {phase.kind === "sent" && (
        <p role="status" className="text-xs text-text-secondary" data-testid="verify-email-sent">
          {phase.email ? t("sent", { email: phase.email }) : t("sentNoAddress")}
        </p>
      )}
      {phase.kind === "rate_limited" && (
        <p role="status" className="text-xs text-text-secondary">{t("rateLimited")}</p>
      )}
      {phase.kind === "already_verified" && (
        <p role="status" className="text-xs text-text-secondary">{t("alreadyVerified")}</p>
      )}
      {phase.kind === "error" && (
        <p role="alert" className="text-xs text-state-danger">{t("error")}</p>
      )}
      {phase.kind !== "sent" && (
        <button
          type="button"
          onClick={send}
          disabled={pending}
          data-testid="verify-email-send"
          className="inline-flex min-h-9 w-fit items-center rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
        >
          {pending ? t("sending") : t("send")}
        </button>
      )}
    </div>
  );
}
