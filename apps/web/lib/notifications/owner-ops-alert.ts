import "server-only";

import { guardedSendTransactionalEmail } from "@/lib/email/send-ledger-store";
import { isTransactionalEmailConfigured } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import type { DeliveryAlert, DeliveryHealth } from "@/lib/invitations/delivery-retry";

/**
 * OWNER OPS ALERT — invitation delivery (owner correction 2026-11-13 item 6).
 *
 * Delivers an alert raised by the scheduled delivery check to the OWNER through every
 * configured channel, independently, so one broken channel does not hide the alert:
 *   1. Telegram — the existing standalone owner bot (OWNER_TELEGRAM_ALERTS_ENABLED + _BOT_TOKEN
 *      + _CHAT_ID; the same three settings the company-need alert uses);
 *   2. e-mail — to LM_OWNER_ALERT_EMAIL through the ledgered transactional path. When the alert
 *      is itself an SMTP fault this channel may fail too; that is why (1) exists.
 *   Neither configured → `delivered: []`; the VPS script still writes the ALERT line to its log.
 *
 * Content: alert codes and counters only — never an invitation id, an address or a reason text
 * from a server. Plain text (no markup mode). Never throws.
 * De-duplication (one alert set per 6 h unless it changes) lives in the VPS script that calls
 * this, so the app keeps no alert state.
 */

const SEND_TIMEOUT_MS = 4000;

const LABEL: Record<DeliveryAlert, string> = {
  repeated_failures: "kartojasi siuntimo klaidos (≥3 per valandą)",
  configuration_failure: "SMTP / tiekėjo konfigūracijos klaida",
  dead_letter_present: "yra kvietimų, kuriems išnaudoti pakartojimai (dead letter)",
  stuck_reservation: "užstrigusi siuntimo rezervacija (>15 min.)",
  unknown_outcome_open: "yra kvietimų su neaiškiu SMTP rezultatu — reikia sutikrinimo",
  bounced: "gauta grąžinimo (bounce) pranešimų",
  low_success_rate: "siuntimo sėkmė < 90 %",
};

export function buildOwnerAlertText(alerts: readonly DeliveryAlert[], health: DeliveryHealth | null): string {
  const lines = [
    "LabourMarket.ai — kvietimų pristatymo perspėjimas",
    ...alerts.map((a) => `• ${LABEL[a] ?? a}`),
  ];
  if (health) {
    lines.push(
      "",
      `Per ${health.window_hours ?? 24} val.: bandymų ${health.attempts}, priimta SMTP ${health.sent}, ` +
        `laikinų ${health.failed_temporary}, nuolatinių ${health.failed_permanent}, ` +
        `konfigūracijos ${health.failed_configuration}, neaiškių ${health.failed_unknown_outcome}, grąžinta ${health.bounced}.`,
      `Laukia pakartojimo: ${health.retry_due + health.retry_scheduled}; dead letter: ${health.dead_letter}; ` +
        `neaiškus rezultatas (atviri): ${health.unknown_outcome_open}; užstrigusios rezervacijos: ${health.stuck_reservations}.`,
    );
    const reasons = Object.entries(health.reasons ?? {})
      .filter(([k]) => /^[a-z0-9_]{1,64}$/.test(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => `${k}×${n}`);
    if (reasons.length) lines.push(`Priežasčių kodai: ${reasons.join(", ")}`);
  }
  lines.push("", "Partnerių kvietimų pakartojimai sustabdomi tik šiame mechanizme; kampanijos neliečiamos.");
  return lines.join("\n");
}

export function ownerAlertChannels(): { telegram: boolean; email: boolean } {
  return {
    telegram:
      env.OWNER_TELEGRAM_ALERTS_ENABLED === "true" && !!env.OWNER_TELEGRAM_BOT_TOKEN && !!env.OWNER_TELEGRAM_CHAT_ID,
    email: /^[^\s<>@"]+@[^\s<>@"]+\.[^\s<>@"]+$/.test((process.env.LM_OWNER_ALERT_EMAIL ?? "").trim()) &&
      isTransactionalEmailConfigured(),
  };
}

async function viaTelegram(text: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.OWNER_TELEGRAM_BOT_TOKEN as string}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.OWNER_TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    console.warn("[owner-ops-alert] telegram send failed");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function viaEmail(text: string): Promise<boolean> {
  try {
    const r = await guardedSendTransactionalEmail(
      {
        to: (process.env.LM_OWNER_ALERT_EMAIL ?? "").trim(),
        subject: "LabourMarket.ai: kvietimų pristatymo perspėjimas",
        text,
      },
      { kind: "notification" },
    );
    return r.status === "sent";
  } catch {
    return false;
  }
}

export async function sendOwnerDeliveryAlert(
  alerts: readonly DeliveryAlert[],
  health: DeliveryHealth | null,
): Promise<{ readonly delivered: readonly ("telegram" | "email")[]; readonly configured: { telegram: boolean; email: boolean } }> {
  const configured = ownerAlertChannels();
  if (alerts.length === 0) return { delivered: [], configured };
  const text = buildOwnerAlertText(alerts, health);
  const delivered: ("telegram" | "email")[] = [];
  if (configured.telegram && (await viaTelegram(text))) delivered.push("telegram");
  if (configured.email && (await viaEmail(text))) delivered.push("email");
  return { delivered, configured };
}
