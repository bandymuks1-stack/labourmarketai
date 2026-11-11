/**
 * OPERATOR ALERTS (owner decision 2026-11-11, P1) — an e-mail to the responsible operators when a
 * company application arrives, a reminder at 24 h, an escalation to admins at 48 h.
 *
 * The database decides everything that matters (migration 20261112090000):
 *   operator_alerts_due_v1()             what waits on a human, and at which stage
 *   operator_alert_recipients_v1(stage)  who may receive it, from the rights valid now
 *   record_operator_alert_v1(...)        reserved / sent / failed / skipped_no_recipient, in audit_logs
 * This module only groups, renders and sends. It never chooses a recipient and never invents an
 * address: with no recipient the stage is logged as skipped and stays open.
 *
 * THE MAIL carries the minimum: what kind of application, how long it has waited, the country, a
 * short reference and where to review it. No name, no contact, no document, no free text.
 * The deadlines are internal; nothing here is shown to a customer.
 *
 * Pure apart from the injected `rpc` and `send`, so the stage handling, idempotency and the body are
 * unit-tested without a database or SMTP.
 */

export type AlertEntity = "company_need_public_intakes" | "organization_claims" | "companies";
export type AlertStage = "immediate" | "reminder_24h" | "escalation_48h";

export type DueItem = {
  entity: AlertEntity;
  entity_id: string;
  stage: AlertStage;
  age_hours: number;
  country: string | null;
};

export type Recipient = { profile_id: string; email: string };

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
export type Send = (msg: { to: string; subject: string; text: string }) => Promise<
  { status: "sent" } | { status: "failed"; reason: string } | { status: "not_configured" }
>;

export const STAGES: readonly AlertStage[] = ["immediate", "reminder_24h", "escalation_48h"];
/** One mail never lists more than this; the rest waits for the next run. */
export const MAX_ITEMS_PER_MAIL = 20;
const ABSENT = ["42883", "PGRST202"];

const SUBJECT: Record<AlertStage, (n: number) => string> = {
  immediate: (n) => `Nauja paraiška laukia peržiūros (${n})`,
  reminder_24h: (n) => `Priminimas: paraiška laukia ilgiau nei 24 h (${n})`,
  escalation_48h: (n) => `Eskalacija: paraiška neperžiūrėta ilgiau nei 48 h (${n})`,
};

const KIND: Record<AlertEntity, string> = {
  company_need_public_intakes: "Įmonės poreikio paraiška",
  organization_claims: "Įmonės perėmimo prašymas",
  companies: "Įmonės patikros prašymas",
};

/** Where an operator really reviews each kind. Claims have no web page yet (see `reviewLines`). */
function reviewLines(item: DueItem, origin: string): string[] {
  switch (item.entity) {
    case "company_need_public_intakes":
      return [`  Peržiūra: ${origin}/lt/dashboard/admin/company-need-intakes`];
    case "companies":
      return [`  Peržiūra: ${origin}/lt/dashboard/admin/company-verification`];
    case "organization_claims":
      // No admin page exists for claims. The working review path today is the operator's own
      // LabourMarket.ai MCP connection (ChatGPT or Claude), signed in with the operator account.
      return [
        "  Web peržiūros puslapio dar nėra. Peržiūra per LabourMarket.ai MCP jungtį (ChatGPT ar Claude),",
        `  prisijungus operatoriaus paskyra: ${origin}/api/mcp`,
        "  1) company.claims.list  2) company.claim.decide.preview  3) company.claim.decide.confirm",
        `  Prašymo nr.: ${item.entity_id}`,
      ];
  }
}

export function buildOperatorAlertMail(
  stage: AlertStage,
  items: readonly DueItem[],
  origin: string,
): { subject: string; text: string } {
  const lines: string[] = [];
  lines.push(
    stage === "escalation_48h"
      ? "Šios paraiškos neperžiūrėtos ilgiau nei 48 valandas. Pranešimas administratoriams."
      : stage === "reminder_24h"
        ? "Šios paraiškos vis dar laukia peržiūros ilgiau nei 24 valandas."
        : "Gauta nauja paraiška, kuri laukia operatoriaus peržiūros.",
    "",
  );
  for (const item of items) {
    const ref = item.entity === "organization_claims" ? "" : ` · nr. ${item.entity_id.slice(0, 8)}`;
    lines.push(`- ${KIND[item.entity]} · laukia ${item.age_hours} h · šalis ${item.country ?? "nenurodyta"}${ref}`);
    lines.push(...reviewLines(item, origin));
  }
  lines.push(
    "",
    "Vidinis operatorių pranešimas: 24 ir 48 valandų ribos yra vidiniai terminai, ne pažadas klientui.",
    "Laiške nėra asmens duomenų; visa informacija – peržiūros eilėje.",
  );
  return { subject: SUBJECT[stage](items.length), text: lines.join("\n") };
}

export type SweepCounts = {
  due: number;
  sent: number;
  failed: number;
  skipped_no_recipient: number;
  in_flight: number;
  already_sent: number;
  gave_up: number;
  ledger_errors: number;
};

export type SweepResult =
  | { kind: "ok"; counts: SweepCounts }
  | { kind: "needs_migration" }
  | { kind: "unavailable"; reason: string };

function outcomeOf(data: unknown): { outcome: string; token?: string } {
  const o = (data ?? {}) as { outcome?: unknown; token?: unknown };
  return { outcome: typeof o.outcome === "string" ? o.outcome : "", token: typeof o.token === "string" ? o.token : undefined };
}

export async function runOperatorAlertSweep(rpc: Rpc, send: Send, origin: string): Promise<SweepResult> {
  const due = await rpc("operator_alerts_due_v1");
  if (due.error) {
    if (ABSENT.includes(due.error.code ?? "")) return { kind: "needs_migration" };
    return { kind: "unavailable", reason: "due_read_failed" };
  }
  const items = ((due.data ?? []) as DueItem[]).filter((i) => STAGES.includes(i.stage));
  const counts: SweepCounts = {
    due: items.length, sent: 0, failed: 0, skipped_no_recipient: 0,
    in_flight: 0, already_sent: 0, gave_up: 0, ledger_errors: 0,
  };

  for (const stage of STAGES) {
    const stageItems = items.filter((i) => i.stage === stage);
    if (stageItems.length === 0) continue;

    const rec = await rpc("operator_alert_recipients_v1", { p_stage: stage });
    if (rec.error) return { kind: "unavailable", reason: "recipients_read_failed" };
    const recipients = ((rec.data ?? []) as Recipient[]).filter((r) => typeof r.email === "string" && r.email.includes("@"));

    if (recipients.length === 0) {
      for (const item of stageItems) {
        const r = await rpc("record_operator_alert_v1", {
          p_event: "skipped_no_recipient", p_entity: item.entity, p_entity_id: item.entity_id, p_stage: stage,
        });
        if (r.error) counts.ledger_errors++;
        else counts.skipped_no_recipient++;
      }
      continue;
    }

    for (const recipient of recipients) {
      const held: { item: DueItem; token: string }[] = [];
      for (const item of stageItems) {
        if (held.length >= MAX_ITEMS_PER_MAIL) break;
        const r = await rpc("record_operator_alert_v1", {
          p_event: "reserve", p_entity: item.entity, p_entity_id: item.entity_id, p_stage: stage,
          p_recipient: recipient.profile_id,
        });
        if (r.error) { counts.ledger_errors++; continue; }
        const { outcome, token } = outcomeOf(r.data);
        if (outcome === "reserved" && token) held.push({ item, token });
        else if (outcome === "in_flight") counts.in_flight++;
        else if (outcome === "already_sent") counts.already_sent++;
        else if (outcome === "gave_up") counts.gave_up++;
      }
      if (held.length === 0) continue;

      const mail = buildOperatorAlertMail(stage, held.map((h) => h.item), origin);
      let sendResult: Awaited<ReturnType<Send>>;
      try {
        sendResult = await send({ to: recipient.email, ...mail });
      } catch {
        sendResult = { status: "failed", reason: "send_threw" };
      }
      const event = sendResult.status === "sent" ? "sent" : "failed";
      const reason = sendResult.status === "failed" ? sendResult.reason : sendResult.status;
      for (const h of held) {
        const r = await rpc("record_operator_alert_v1", {
          p_event: event, p_entity: h.item.entity, p_entity_id: h.item.entity_id, p_stage: stage,
          p_recipient: recipient.profile_id, p_token: h.token, p_reason: event === "failed" ? reason : null,
        });
        if (r.error) counts.ledger_errors++;
        else if (event === "sent") counts.sent++;
        else counts.failed++;
      }
    }
  }
  return { kind: "ok", counts };
}
