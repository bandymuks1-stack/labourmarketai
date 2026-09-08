import "server-only";

/**
 * Provider-neutral transactional email adapter (core-network area B).
 *
 * TRUTHFUL DELIVERY ONLY: `sent` is returned ONLY when the configured
 * provider's API acknowledged the message (2xx). No provider configured →
 * `not_configured` (the caller shows the copy-link path instead — never a
 * fake "Išsiųsta"). Any transport / non-2xx problem → `failed` (retryable).
 *
 * Configuration (server-only env — never NEXT_PUBLIC, never in the client
 * bundle; see .env.example → "Invitation email delivery"):
 *   INVITE_EMAIL_PROVIDER  'resend' | 'postmark' | '' (off)
 *   INVITE_EMAIL_API_KEY   provider API key (secret)
 *   INVITE_EMAIL_FROM      verified sender, e.g. "LabourMarket.ai <invites@labourmarket.ai>"
 *
 * Provider names never reach the UI — the interface speaks only in
 * outcomes. No SDK dependencies: both providers are one HTTPS call.
 */

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type TransactionalSendResult =
  | { status: "sent" }
  /** The dev/test LOG provider accepted the message — nothing left the
   *  machine. Distinct from "sent" by design: no caller may ever render a
   *  "logged" outcome as a delivered email. */
  | { status: "logged" }
  | { status: "not_configured" }
  | { status: "failed"; reason: string };

const SEND_TIMEOUT_MS = 10_000;

function config():
  | { provider: "resend" | "postmark"; apiKey: string; from: string }
  | null {
  const provider = (process.env.INVITE_EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = (process.env.INVITE_EMAIL_API_KEY ?? "").trim();
  const from = (process.env.INVITE_EMAIL_FROM ?? "").trim();
  if ((provider !== "resend" && provider !== "postmark") || !apiKey || !from) {
    return null;
  }
  return { provider, apiKey, from };
}

/**
 * The OFFLINE "log" provider (completion v1): `INVITE_EMAIL_PROVIDER=log`
 * exercises the whole email path without vendor keys — the adapter accepts
 * the message and returns `logged` (the caller decides what, if anything, to
 * write to the server log; this module stays free of logging so it can never
 * leak an address or a key). DELIBERATELY TEST/DEV-ONLY: in production the
 * log provider is ignored entirely (not_configured), because a provider that
 * swallows mail while preferences say "email on" would be a silent delivery
 * kill. `isTransactionalEmailConfigured()` NEVER counts it — the invitation
 * UI's "email sent vs copy-link" fork keys off that check and must not offer
 * a send that goes nowhere.
 */
function logProviderActive(): boolean {
  return (
    (process.env.INVITE_EMAIL_PROVIDER ?? "").trim().toLowerCase() === "log" &&
    process.env.NODE_ENV !== "production"
  );
}

/** True when a real provider is fully configured (env-only check).
 *  The dev/test log provider deliberately does NOT count: this is the
 *  "a real email can reach a real inbox" fact the UI keys off. */
export function isTransactionalEmailConfigured(): boolean {
  return config() !== null;
}

/** True when the adapter can produce any outcome other than not_configured —
 *  a real provider OR the dev/test log provider. Callers that only need the
 *  path exercised (the notification email dispatcher's tests) gate on this;
 *  callers that promise delivery to a person gate on
 *  `isTransactionalEmailConfigured()`. */
export function isTransactionalEmailPathActive(): boolean {
  return config() !== null || logProviderActive();
}

export async function sendTransactionalEmail(
  message: TransactionalEmail,
): Promise<TransactionalSendResult> {
  const cfg = config();
  if (!cfg) {
    // Log provider (dev/test only): accept without sending. No console use
    // here — the invitations-network guard pins this file log-free so an
    // address or key can never leak; the caller logs what it needs.
    if (logProviderActive()) return { status: "logged" };
    return { status: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const request: { url: string; headers: Record<string, string>; body: string } =
      cfg.provider === "resend"
        ? {
            url: "https://api.resend.com/emails",
            headers: {
              Authorization: `Bearer ${cfg.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: cfg.from,
              to: [message.to],
              subject: message.subject,
              text: message.text,
              ...(message.html ? { html: message.html } : {}),
            }),
          }
        : {
            url: "https://api.postmarkapp.com/email",
            headers: {
              "X-Postmark-Server-Token": cfg.apiKey,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              From: cfg.from,
              To: message.to,
              Subject: message.subject,
              TextBody: message.text,
              ...(message.html ? { HtmlBody: message.html } : {}),
              MessageStream: "outbound",
            }),
          };

    const res = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    if (res.ok) return { status: "sent" };
    // Never log the address or the key — status code only.
    return { status: "failed", reason: `provider_status_${res.status}` };
  } catch {
    return { status: "failed", reason: "transport_error" };
  } finally {
    clearTimeout(timer);
  }
}
