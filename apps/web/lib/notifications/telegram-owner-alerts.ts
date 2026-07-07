import "server-only";

import { env } from "@/lib/env";

/**
 * Owner demand-signal alerts (v2 — Agentai OS bridge preferred).
 *
 * When a public /company-need anonymous intake is successfully PERSISTED, the
 * caller fires a best-effort owner alert. Dispatch priority:
 *
 *   1. Agentai OS bridge (PREFERRED): POST a stable JSON event to the owner's
 *      Agentai OS alert endpoint with a shared-secret bearer token. Agentai OS
 *      owns the Telegram sending through its existing owner control channel, so
 *      LabourMarket.ai needs NO Telegram bot token / chat id of its own.
 *   2. Standalone Telegram (FALLBACK, PR #685): direct Telegram sendMessage,
 *      only when the OWNER_TELEGRAM_* env is configured.
 *   3. No-op: nothing configured → silent, no network call, nothing faked.
 *
 * HARD RULES (enforced by telegram-owner-alerts.test.ts):
 *   - server-only: the `server-only` import makes any client import a build error;
 *   - every secret (bridge token, Telegram bot token, chat id) comes ONLY from
 *     server env, never a NEXT_PUBLIC var, never a literal → never in the client
 *     bundle;
 *   - NEVER throws to the caller: a send failure must not affect the
 *     /company-need submission, its persistence, or the owner queue;
 *   - PLAIN TEXT for the standalone path (no Telegram markup mode is set) so
 *     user fields cannot inject markup; every field is whitespace-collapsed and
 *     length-capped in BOTH the JSON event and the text message;
 *   - only the event that actually exists is supported: `company_need_submitted`.
 */

/** Stable event identity for the Agentai OS bridge payload. */
const EVENT_SOURCE = "labourmarketai";
const EVENT_NAME = "company_need_submitted";
/** Owner queue route; a text pointer (the repo has no base-URL env). */
const ADMIN_QUEUE_ROUTE = "/dashboard/admin/company-need-intakes";
/** Per-field character cap — keeps payloads bounded + injection-inert. */
const FIELD_CAP = 120;
/** Hard timeout so a hung endpoint can never stall the caller. */
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

/** Collapse whitespace, trim, cap length; empty → em dash. */
function clip(value: string | number | undefined | null): string {
  const s = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "—";
  return s.length > FIELD_CAP ? `${s.slice(0, FIELD_CAP)}…` : s;
}

/** Stable, minimal JSON event for the Agentai OS bridge. No secrets, no raw
 *  unbounded description; every field is clipped. */
export function buildCompanyNeedEvent(
  a: CompanyNeedAlert,
  createdAtIso: string,
): Record<string, unknown> {
  return {
    source: EVENT_SOURCE,
    event: EVENT_NAME,
    severity: "info",
    created_at: createdAtIso,
    payload: {
      company_name: clip(a.companyName),
      contact: clip(a.contact),
      sector: clip(a.sector),
      country: clip(a.country),
      city_or_region: clip(a.cityRegion),
      headcount: clip(a.headcount),
      urgency: clip(a.urgency),
      start_or_date: clip(a.startOrDate),
      duration: clip(a.duration),
      languages: clip(a.languages),
      source_path: clip(a.sourcePath),
      admin_route: ADMIN_QUEUE_ROUTE,
    },
  };
}

/** Plain-text owner alert for the standalone Telegram fallback path. */
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

/** True when the Agentai OS bridge (preferred path) is fully configured. */
export function agentaiBridgeConfigured(): boolean {
  return (
    env.AGENTAI_OS_ALERTS_ENABLED === "true" &&
    !!env.AGENTAI_OS_ALERT_ENDPOINT &&
    !!env.AGENTAI_OS_ALERT_TOKEN
  );
}

/** True when the standalone Telegram fallback (PR #685) is fully configured. */
export function ownerTelegramConfigured(): boolean {
  return (
    env.OWNER_TELEGRAM_ALERTS_ENABLED === "true" &&
    !!env.OWNER_TELEGRAM_BOT_TOKEN &&
    !!env.OWNER_TELEGRAM_CHAT_ID
  );
}

async function postWithTimeout(
  url: string,
  init: RequestInit,
  label: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res.ok;
  } catch {
    // Best-effort: swallow. No secret, no stack, no provider wording leaked.
    console.warn(`[owner-alert] ${label} send failed`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Preferred path: hand the event to Agentai OS to format + send to Telegram. */
async function sendViaAgentaiBridge(
  event: Record<string, unknown>,
): Promise<boolean> {
  const endpoint = env.AGENTAI_OS_ALERT_ENDPOINT as string;
  const token = env.AGENTAI_OS_ALERT_TOKEN as string;
  return postWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(event),
    },
    "agentai bridge",
  );
}

/** Fallback path: direct Telegram sendMessage (plain text). */
async function sendViaStandaloneTelegram(
  alert: CompanyNeedAlert,
): Promise<boolean> {
  const token = env.OWNER_TELEGRAM_BOT_TOKEN as string;
  const chatId = env.OWNER_TELEGRAM_CHAT_ID as string;
  return postWithTimeout(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildCompanyNeedAlertText(alert),
        disable_web_page_preview: true,
      }),
    },
    "telegram",
  );
}

/**
 * Best-effort owner alert for a persisted company need. Resolves `true` when a
 * configured channel accepted the message, `false` on no-op (nothing
 * configured) or any failure. NEVER rejects — safe to call from the intake
 * server action.
 */
export async function sendCompanyNeedOwnerAlert(
  alert: CompanyNeedAlert,
): Promise<boolean> {
  // 1) Preferred: Agentai OS bridge (no Telegram token needed here).
  if (agentaiBridgeConfigured()) {
    const event = buildCompanyNeedEvent(alert, new Date().toISOString());
    return sendViaAgentaiBridge(event);
  }
  // 2) Fallback: standalone Telegram (PR #685).
  if (ownerTelegramConfigured()) {
    return sendViaStandaloneTelegram(alert);
  }
  // 3) Nothing configured → honest no-op.
  return false;
}
