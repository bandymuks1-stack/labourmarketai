import "server-only";

import { env } from "@/lib/env";

/**
 * Owner Telegram demand-signal alerts (v1).
 *
 * Best-effort, server-only, env-gated owner notification. When a public
 * /company-need anonymous intake is successfully PERSISTED, the caller fires a
 * plain-text alert to the owner Telegram chat. When the channel is not
 * configured, every entry point is a silent no-op — nothing is faked and no
 * network call is made.
 *
 * HARD RULES (enforced by telegram-owner-alerts.test.ts):
 *   - server-only: the `server-only` import makes any client import a build error;
 *   - the bot token + chat id come ONLY from server env (env.OWNER_TELEGRAM_*),
 *     never a NEXT_PUBLIC var, never a literal — so they never reach the client
 *     bundle (Next.js only inlines NEXT_PUBLIC_* into client code);
 *   - NEVER throws to the caller: a send failure must not affect the
 *     /company-need submission, its persistence, or the owner queue;
 *   - PLAIN TEXT only (no Telegram markup mode is set) so user-supplied fields
 *     cannot inject Telegram Markdown/HTML markup; every field is
 *     whitespace-collapsed and length-capped;
 *   - only the events that actually exist are supported: today that is exactly
 *     `company_need_submitted`. No worker-search / company-search senders exist
 *     because those flows do not exist in the product yet.
 */

/** The owner queue route; used as a text pointer (repo has no base-URL env). */
const ADMIN_QUEUE_ROUTE = "/dashboard/admin/company-need-intakes";
/** Per-field character cap — keeps the message bounded + injection-inert. */
const FIELD_CAP = 120;
/** Hard timeout so a hung Telegram API can never stall the caller. */
const SEND_TIMEOUT_MS = 4000;

export interface CompanyNeedAlert {
  readonly companyName: string;
  readonly contact?: string;
  readonly sector?: string;
  readonly country?: string;
  readonly cityRegion?: string;
  readonly headcount?: number;
  readonly urgency?: string;
  readonly startOrDate?: string;
  readonly duration?: string;
  readonly languages?: string;
  readonly sourcePath?: string;
}

/** Collapse whitespace, trim, cap length; empty → em dash. Plain text only. */
function clip(value: string | number | undefined | null): string {
  const s = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "—";
  return s.length > FIELD_CAP ? `${s.slice(0, FIELD_CAP)}…` : s;
}

/** Build the plain-text owner alert for a persisted company need. */
export function buildCompanyNeedAlertText(a: CompanyNeedAlert): string {
  return [
    "Naujas LabourMarket.ai įmonės poreikis",
    "",
    `Įmonė: ${clip(a.companyName)}`,
    `Kontaktas: ${clip(a.contact)}`,
    `Sektorius: ${clip(a.sector)}`,
    `Šalis/regionas: ${clip(a.country)} / ${clip(a.cityRegion)}`,
    `Kiekis: ${clip(a.headcount)}`,
    `Skubumas: ${clip(a.urgency)}`,
    `Pradžia/trukmė: ${clip(a.startOrDate)} / ${clip(a.duration)}`,
    `Kalbos: ${clip(a.languages)}`,
    `Šaltinis: ${clip(a.sourcePath)}`,
    "",
    `Admin queue: ${ADMIN_QUEUE_ROUTE}`,
  ].join("\n");
}

/** True only when the owner Telegram alert channel is fully configured. */
export function ownerTelegramConfigured(): boolean {
  return (
    env.OWNER_TELEGRAM_ALERTS_ENABLED === "true" &&
    !!env.OWNER_TELEGRAM_BOT_TOKEN &&
    !!env.OWNER_TELEGRAM_CHAT_ID
  );
}

/**
 * Best-effort owner alert for a persisted company need. Resolves `true` when
 * Telegram accepts the message, `false` on no-op (channel not configured) or
 * any failure. NEVER rejects — safe to call (awaited or not) from the intake
 * server action.
 */
export async function sendCompanyNeedOwnerAlert(
  alert: CompanyNeedAlert,
): Promise<boolean> {
  if (!ownerTelegramConfigured()) return false; // not configured → honest no-op

  const token = env.OWNER_TELEGRAM_BOT_TOKEN as string;
  const chatId = env.OWNER_TELEGRAM_CHAT_ID as string;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildCompanyNeedAlertText(alert),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    );
    return res.ok;
  } catch {
    // Best-effort: swallow. No secret, no stack, no provider wording leaked.
    console.warn("[owner-alert] telegram send failed");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
