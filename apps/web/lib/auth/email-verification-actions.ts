"use server";

import { headers } from "next/headers";

import { outboundLinkOrigin } from "@/lib/domain/canonical";
import { createClient } from "@/lib/supabase/server";
import { getSafeReturnPath } from "@/lib/auth/redirect";
import {
  buildVerifyEmailRedirectTo,
  isEmailVerifiedRead,
} from "@/lib/auth/email-verification";
import { mapAuthError } from "@/lib/auth-errors";

/**
 * Progressive "verify your email" proof (WORKER_REGISTRATION_FRICTION_REMOVAL).
 *
 * Step 1 of 2 — the person asked for it, at the moment a trust-sensitive
 * action needed it (never at signup). Step 2 is the auth callback
 * (`flow=verify_email`) calling `confirm_my_email_v1()`.
 *
 *   1. `request_email_verification_v1()` records WHICH address (the LIVE
 *      auth.users address — never a client-supplied one) is being proved.
 *   2. GoTrue mails a one-time link to that address
 *      (`signInWithOtp`, `shouldCreateUser:false`) through the existing custom
 *      SMTP. Opening it mints a session whose `amr` records the one-time token;
 *      only such a session can pass `confirm_my_email_v1()`.
 *
 * Nothing here marks anything verified. `sent` means GoTrue accepted the mail
 * request, not that it was delivered or opened.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type EmailVerificationState =
  | { status: "not-authed" }
  | { status: "ok"; verified: boolean; email: string | null }
  | { status: "error" };

/** The caller's own verification state. Fail-closed: anything unexpected is
 *  `verified: false` (an unverified state is never shown as verified). */
export async function getMyEmailVerification(): Promise<EmailVerificationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await (supabase as AnyClient).rpc("my_email_verification_v1");
  if (error) return { status: "error" };
  const email =
    typeof (data as { email?: unknown } | null)?.email === "string"
      ? ((data as { email: string }).email)
      : null;
  return { status: "ok", verified: isEmailVerifiedRead(data), email };
}

export type RequestEmailVerificationResult =
  | { status: "not-authed" }
  | {
      status: "ok";
      outcome: "sent" | "already_verified" | "rate_limited" | "no_email" | "error";
      /** Where the mail was sent — shown so a typo is visible. */
      email?: string;
    };

export async function requestEmailVerificationAction(input: {
  locale: string;
  /** Where to land after the proof (e.g. the network page). Sanitised. */
  next?: string | null;
}): Promise<RequestEmailVerificationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const { data, error } = await (supabase as AnyClient).rpc(
    "request_email_verification_v1",
  );
  if (error) {
    console.error("[email-verification] request rpc failed:", error.code ?? "unknown");
    return { status: "ok", outcome: "error" };
  }
  const outcome = (data as { outcome?: string } | null)?.outcome;
  const email = (data as { email?: string } | null)?.email;
  if (outcome === "already_verified") {
    return { status: "ok", outcome: "already_verified", email };
  }
  if (outcome !== "requested" || !email) {
    return { status: "ok", outcome: outcome === "no_email" ? "no_email" : "error" };
  }

  const h = await headers();
  const origin = outboundLinkOrigin(
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto"),
  );
  const nextPath = input.next ? getSafeReturnPath(input.next, input.locale) : null;
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: buildVerifyEmailRedirectTo(origin, input.locale, nextPath),
    },
  });
  if (otpError) {
    const info = mapAuthError(otpError);
    console.error("[email-verification] otp send failed:", info.key);
    return {
      status: "ok",
      outcome: info.key === "rateLimited" ? "rate_limited" : "error",
    };
  }
  return { status: "ok", outcome: "sent", email };
}
