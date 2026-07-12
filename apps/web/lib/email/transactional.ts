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

/** True when a real provider is fully configured (env-only check). */
export function isTransactionalEmailConfigured(): boolean {
  return config() !== null;
}

export async function sendTransactionalEmail(
  message: TransactionalEmail,
): Promise<TransactionalSendResult> {
  const cfg = config();
  if (!cfg) return { status: "not_configured" };

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
