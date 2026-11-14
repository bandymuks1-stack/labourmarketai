import "server-only";

/**
 * The server half of the platform e-mail delivery control
 * (`platform-email-delivery.ts` holds every rule): the Supabase record, the
 * mailbox sender, and what each e-mail is composed from.
 *
 * SERVICE ROLE, WITHOUT A USER: a retry runs from the scheduled sweep, so every
 * read here goes through the service-role client and is limited to the columns
 * migration 20261113220000 grants. No function in this module takes an id from a
 * browser: the ids come from a row the server has just written (a company save,
 * a stored request) or from the delivery record itself.
 *
 * CONFIGURATION (server env, no code change to move a mailbox):
 *   LM_OWNER_NOTIFY_EMAIL   where registration notices and request alerts go
 *                           (default info@labourmarket.ai)
 *   LM_SUPPORT_REPLY_TO     Reply-To on the welcome e-mail
 *                           (default info@labourmarket.ai)
 *   LM_SMTP_*               the platform mailbox itself (lib/email/smtp.ts);
 *                           the sender is LM_SMTP_FROM
 */
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import {
  companyRegistrationNotice,
  companyWelcomeEmail,
  intakeAlertEmail,
  isSyntheticIntake,
} from "@/lib/email/company-registration-emails";
import { reserveDurableEmailSend } from "@/lib/email/durable-send-guard";
import { notificationEmailLocale } from "@/lib/email/notification-email";
import {
  DELIVERY_KINDS,
  DeliveryRecordUnavailable,
  deliverEvent,
  retryDueDeliveries,
  type Compose,
  type DeliveryDeps,
  type DeliveryEvent,
  type DeliveryFinish,
  type DeliveryKind,
  type DeliveryOutcome,
  type DeliveryRow,
  type DeliveryStatus,
  type DeliveryStore,
  type RetrySweepReport,
  type Sender,
} from "@/lib/email/platform-email-delivery";
import { createSupabaseEmailSendStore } from "@/lib/email/send-ledger-store";
import { sendSmtp, smtpConfigFromEnv } from "@/lib/email/smtp";
import { isSyntheticQaPlusAddress } from "@/lib/email/synthetic-address";
import { requestDoorFromSourcePath, requestDoorOperatorTitle } from "@/lib/staffing/request-doors";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_MAILBOX = "info@labourmarket.ai";
const ADDRESS = /^[^\s<>@"]+@[^\s<>@"]+\.[^\s<>@"]+$/;

function addressFromEnv(name: string, env: Record<string, string | undefined>): string {
  const v = (env[name] ?? "").trim();
  return ADDRESS.test(v) ? v : DEFAULT_MAILBOX;
}

/** Where internal notices go. Configurable; a malformed value falls back to the default. */
export function ownerNotifyAddress(env: Record<string, string | undefined> = process.env): string {
  return addressFromEnv("LM_OWNER_NOTIFY_EMAIL", env);
}

/** Reply-To on an e-mail to a company. */
export function supportReplyToAddress(env: Record<string, string | undefined> = process.env): string {
  return addressFromEnv("LM_SUPPORT_REPLY_TO", env);
}

/**
 * The header a mailbox rule sorts on: an internal notice carries it, a person's
 * e-mail (and a reply to the welcome e-mail) never does.
 */
export const NOTIFICATION_HEADER = "X-LabourMarket-Notification";

const TABLE = "platform_email_deliveries_v1";
const COLUMNS = "id, event_key, kind, audience, subject_id, locale, status, attempts, last_error, next_attempt_at, created_at, updated_at";
/** Table or column absent, or no privilege: the migration is not applied here. */
const NOT_APPLIED = new Set(["42P01", "42501", "42703", "PGRST204", "PGRST205"]);
const UNIQUE_VIOLATION = "23505";

type Db = ReturnType<typeof createAdminClient>;
// The generated Database type predates this table — the same service-role
// type-escape as lib/admin/company-need-intakes.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (db: Db): any => (db as any).from(TABLE);

function unavailable(error: { code?: string } | null): never {
  throw new DeliveryRecordUnavailable(NOT_APPLIED.has(error?.code ?? "") ? "not_applied" : "error");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): DeliveryRow {
  return {
    id: r.id,
    eventKey: r.event_key,
    kind: r.kind,
    audience: r.audience,
    subjectId: r.subject_id,
    locale: r.locale ?? null,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error ?? null,
    nextAttemptAt: r.next_attempt_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createSupabaseDeliveryStore(getDb: () => Db = createAdminClient): DeliveryStore {
  return {
    async claimNew(e) {
      const { data, error } = await table(getDb())
        .insert({
          event_key: e.eventKey,
          kind: e.kind,
          audience: e.audience,
          subject_id: e.subjectId,
          locale: e.locale,
          status: "sending",
          attempts: 1,
          created_at: e.nowIso,
          updated_at: e.nowIso,
        })
        .select(COLUMNS)
        .maybeSingle();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error || !data) unavailable(error);
      return mapRow(data);
    },
    async claimRetry(id, attempts, nowIso) {
      const { data, error } = await table(getDb())
        .update({ status: "sending", attempts: attempts + 1, updated_at: nowIso, next_attempt_at: null })
        .eq("id", id)
        .eq("status", "retry_wait")
        .eq("attempts", attempts)
        .select(COLUMNS);
      if (error) unavailable(error);
      const rows = (data ?? []) as unknown[];
      return rows.length === 1 ? mapRow(rows[0]) : null;
    },
    async finish(id, attempts, f: DeliveryFinish, nowIso) {
      const { error } = await table(getDb())
        .update({
          status: f.status,
          last_error: f.lastError,
          message_id: f.messageId,
          next_attempt_at: f.nextAttemptAt,
          sent_at: f.sentAt,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("status", "sending")
        .eq("attempts", attempts);
      if (error) unavailable(error);
    },
    async listDue(nowIso, limit) {
      const { data, error } = await table(getDb())
        .select(COLUMNS)
        .eq("status", "retry_wait")
        .lte("next_attempt_at", nowIso)
        .order("next_attempt_at", { ascending: true })
        .limit(limit);
      if (error) unavailable(error);
      return ((data ?? []) as unknown[]).map(mapRow);
    },
    async listStaleSending(beforeIso, limit) {
      const { data, error } = await table(getDb())
        .select(COLUMNS)
        .eq("status", "sending")
        .lt("updated_at", beforeIso)
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (error) unavailable(error);
      return ((data ?? []) as unknown[]).map(mapRow);
    },
  };
}

/**
 * The platform mailbox. `sent` only after the mail server accepted the message
 * (lib/email/smtp.ts). An e-mail to a COMPANY first takes a slot in the durable
 * send ledger (per-organization and per-recipient caps, lib/email/durable-send-guard.ts);
 * an internal notice does not — it is bounded by one-per-event and by the intake
 * ceilings in the database, and the owner mailbox must not be capped at five a day.
 */
export const mailboxSender: Sender = async (email, audience) => {
  if (isSyntheticQaPlusAddress(email.to)) return { status: "suppressed", reason: "synthetic_address" };
  const smtp = smtpConfigFromEnv();
  if (!smtp) return { status: "failed", reason: "not_configured", retryable: true };
  if (audience === "company") {
    const slot = await reserveDurableEmailSend(createSupabaseEmailSendStore(), {
      recipientEmail: email.to,
      organizationId: email.organizationId ?? null,
      kind: "transactional",
    });
    if (!slot.allowed) return { status: "failed", reason: "rate_limited", retryable: true };
  }
  const r = await sendSmtp(smtp, {
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: email.replyTo,
    headers: email.headers,
  });
  if (r.status === "sent") return { status: "sent", messageId: r.messageId };
  if (r.status === "not_configured") return { status: "failed", reason: "not_configured", retryable: true };
  return { status: "failed", reason: r.reason, retryable: !r.reason.startsWith("invalid_") };
};

/**
 * "The e-mail address is confirmed, or the social sign-in is complete" (owner
 * P0 2026-11-13) is decided by the ONE existing rule, not a second one here:
 * `email_is_verified_v1(profile, address)` (migration 20261003151000) — a
 * confirmed address, a verified Google / LinkedIn identity, or a completed
 * mailbox proof, for THIS profile and THIS address. A session, the JWT or
 * `profiles.email` alone prove nothing (lib/auth/email-verification.ts).
 *
 * `null` = the rule could not be asked (function absent, no privilege, database
 * error). That is never read as "verified": the welcome e-mail waits.
 */
async function addressIsVerified(db: Db, profileId: string, address: string): Promise<boolean | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("email_is_verified_v1", { p_profile_id: profileId, p_email: address });
  if (error || typeof data !== "boolean") return null;
  return data;
}

type OrgRow = {
  id: string;
  legal_name: string | null;
  display_name: string | null;
  country: string | null;
  owner_profile_id: string | null;
};

const ADMIN_COMPANIES_PATH = "/lt/dashboard/admin/company-verification";
const ADMIN_QUEUE_PATH = "/lt/dashboard/admin/company-need-intakes";

/** What each e-mail is made of, read from the live rows at the moment of sending. */
export function createComposer(getDb: () => Db = createAdminClient, env: Record<string, string | undefined> = process.env): Compose {
  return async (row) => {
    const db = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const any = db as any;

    if (row.kind === "intake_alert") {
      const { data, error } = await any.from("company_need_public_intakes").select("id, source_path, company_name").eq("id", row.subjectId).maybeSingle();
      if (error) return { kind: "cannot", reason: "intake_unreadable", retryable: true };
      if (!data) return { kind: "cannot", reason: "intake_gone", retryable: false };
      const door = requestDoorFromSourcePath(data.source_path as string | null);
      const title = door ? requestDoorOperatorTitle(door) : "Įmonės poreikio užklausa";
      // The company name is read ONLY to see whether it starts with the test mark;
      // the name itself never enters the e-mail.
      const built = intakeAlertEmail({
        title,
        queueUrl: `${CANONICAL_ORIGIN}${ADMIN_QUEUE_PATH}#${row.subjectId}`,
        siteUrl: CANONICAL_ORIGIN,
        synthetic: isSyntheticIntake(data.company_name as string | null),
      });
      return {
        kind: "send",
        email: { to: ownerNotifyAddress(env), ...built, headers: { [NOTIFICATION_HEADER]: door ? "request" : "company-need" } },
      };
    }

    // Both registration e-mails start from the company the save returned.
    const { data: orgData, error: orgErr } = await any
      .from("organizations")
      .select("id, legal_name, display_name, country, owner_profile_id")
      .eq("legacy_company_id", row.subjectId)
      .eq("organization_type", "company")
      .maybeSingle();
    if (orgErr) return { kind: "cannot", reason: "organization_unreadable", retryable: true };
    const org = orgData as OrgRow | null;
    if (!org) return { kind: "cannot", reason: "organization_gone", retryable: false };

    let profile: { email: string | null; full_name: string | null; locale: string | null } | null = null;
    if (org.owner_profile_id) {
      const { data, error } = await any.from("profiles").select("id, email, full_name, locale").eq("id", org.owner_profile_id).maybeSingle();
      if (error) return { kind: "cannot", reason: "contact_unreadable", retryable: true };
      profile = data ?? null;
    }

    if (row.kind === "company_registration_notice") {
      const { count, error } = await any
        .from("customer_requests")
        .select("organization_id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("status", "submitted");
      const built = companyRegistrationNotice({
        organizationName: org.legal_name ?? org.display_name ?? "",
        countryCode: org.country,
        registeredAtIso: row.createdAt,
        contactName: profile?.full_name ?? null,
        contactEmail: profile?.email ?? null,
        adminUrl: `${CANONICAL_ORIGIN}${ADMIN_COMPANIES_PATH}#company-${row.subjectId}`,
        // Unreadable is "could not tell", never "no".
        publishedNeeds: error || typeof count !== "number" ? null : count,
        siteUrl: CANONICAL_ORIGIN,
      });
      return { kind: "send", email: { to: ownerNotifyAddress(env), ...built, headers: { [NOTIFICATION_HEADER]: "company-registration" } } };
    }

    // company_welcome — only to the account's own address, and only once that
    // address is verified for that account. Never to a contact address somebody
    // typed into the company form.
    const address = (profile?.email ?? "").trim();
    if (!org.owner_profile_id || !address) return { kind: "cannot", reason: "no_recipient", retryable: false };
    const verified = await addressIsVerified(db, org.owner_profile_id, address);
    if (verified === null) return { kind: "cannot", reason: "verification_unavailable", retryable: true };
    if (!verified) return { kind: "cannot", reason: "email_not_confirmed", retryable: true };
    const built = companyWelcomeEmail({ locale: notificationEmailLocale(row.locale ?? profile?.locale), siteUrl: CANONICAL_ORIGIN });
    return {
      kind: "send",
      email: { to: address, subject: built.subject, text: built.text, html: built.html, replyTo: supportReplyToAddress(env), organizationId: org.id },
    };
  };
}

function deps(): DeliveryDeps {
  return {
    store: createSupabaseDeliveryStore(),
    send: mailboxSender,
    compose: createComposer(),
    // Kind and a machine code only — never an address, a name or an id.
    log: (marker, detail) => console.warn(marker, detail),
  };
}

let override: DeliveryDeps | null = null;
/** Test seam. */
export function __setPlatformEmailDepsForTests(d: DeliveryDeps | null): void {
  override = d;
}

/** Deliver one event's e-mail at most once and record the outcome. Never throws. */
export async function deliverPlatformEmail(event: DeliveryEvent): Promise<DeliveryOutcome> {
  try {
    const outcome = await deliverEvent(override ?? deps(), event);
    console.info("[email/delivery]", { kind: event.kind, outcome: outcome.outcome });
    return outcome;
  } catch {
    // e.g. the service env is missing: nothing was sent, and it is said so.
    console.warn("[email/delivery] not attempted", { kind: event.kind });
    return { outcome: "failed_unrecorded", reason: "not_attempted" };
  }
}

/**
 * A company has registered (its organization now has a name): the internal notice
 * and the welcome e-mail, each its own event. `locale` is the language the person
 * registered in.
 */
export async function deliverCompanyRegistrationEmails(input: { readonly companyId: string; readonly locale?: string | null }): Promise<void> {
  await deliverPlatformEmail({ kind: "company_registration_notice", subjectId: input.companyId });
  await deliverPlatformEmail({ kind: "company_welcome", subjectId: input.companyId, locale: input.locale ? notificationEmailLocale(input.locale) : null });
}

export type SweepResult = { readonly kind: "ok"; readonly report: RetrySweepReport } | { readonly kind: "unavailable"; readonly code: string };

/** The scheduled sweep (app/api/cron/platform-email-retry). */
export async function runPlatformEmailRetrySweep(): Promise<SweepResult> {
  try {
    return { kind: "ok", report: await retryDueDeliveries(override ?? deps()) };
  } catch (e) {
    return { kind: "unavailable", code: e instanceof DeliveryRecordUnavailable ? e.code : "error" };
  }
}

export type DeliveryProblem = {
  readonly id: string;
  readonly kind: DeliveryKind;
  readonly status: DeliveryStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly nextAttemptAt: string | null;
};

export type DeliveryProblemsResult =
  | { readonly kind: "ok"; readonly failed: readonly DeliveryProblem[]; readonly waiting: readonly DeliveryProblem[] }
  /** The record could not be read (not applied here, or a database error). */
  | { readonly kind: "unavailable" };

/**
 * What the administrator must see: every e-mail that failed for good, and those
 * still waiting for a retry. The CALLER authorises (superadmin page); this reads
 * with the service role and returns no personal data — the record holds none.
 */
export async function listDeliveryProblems(limit = 50): Promise<DeliveryProblemsResult> {
  try {
    const { data, error } = await table(createAdminClient())
      .select(COLUMNS)
      .in("status", ["failed", "retry_wait"])
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return { kind: "unavailable" };
    const rows = ((data ?? []) as unknown[])
      .map(mapRow)
      .filter((r) => (DELIVERY_KINDS as readonly string[]).includes(r.kind))
      .map((r) => ({ id: r.id, kind: r.kind, status: r.status, attempts: r.attempts, lastError: r.lastError, createdAt: r.createdAt, nextAttemptAt: r.nextAttemptAt }));
    return { kind: "ok", failed: rows.filter((r) => r.status === "failed"), waiting: rows.filter((r) => r.status === "retry_wait") };
  } catch {
    return { kind: "unavailable" };
  }
}
