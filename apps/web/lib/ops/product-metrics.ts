/**
 * PRODUCT METRICS — one computation, two readers: the superadmin metrics
 * section on the launch-readiness page and the hourly monitor
 * (`scripts/product-monitor.ts`). Owner programme 2026-10-12 §8–§9.
 *
 * THE COMPUTATION IS SQL. `public.ops_product_metrics_v1()` (migration
 * 20261012090000) returns numbers only, split REAL / TEST / INTERNAL, and is
 * executable by service_role alone. In production service_role holds no SELECT
 * on people's tables (least privilege, measured 2026-10-12), so counting
 * here in TypeScript would need exactly the row access this design refuses.
 * This module is the CATALOGUE — what each number means, its source, its rule
 * and its window — plus the two technical reads service_role may make
 * (`ai_runs`, `vacancy_import_cursors`).
 *
 * RULES
 *  - Nothing is stored, cached, estimated or back-filled.
 *  - A source that cannot be read is `null` (UNKNOWN) and listed — never 0 (SEP-7).
 *  - Aggregates only. No id, e-mail, name or free text leaves this module.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Population = "REAL" | "TEST" | "INTERNAL";
export const POPULATIONS: readonly Population[] = ["REAL", "TEST", "INTERNAL"];

export type MetricGroup = "users" | "teams" | "b2b" | "work" | "technical";

export type MetricValue = number | null | Readonly<Record<Population, number>>;

export interface Metric {
  readonly key: string;
  readonly group: MetricGroup;
  /** Split by population when the subject is a person or an organization. */
  readonly value: MetricValue;
  readonly source: string;
  readonly rule: string;
  readonly window: string;
}

export interface MetricsSnapshot {
  readonly computedAt: string;
  readonly metrics: readonly Metric[];
  /** Reads that failed — their metrics are null, and the reason is kept. */
  readonly unknown: readonly { readonly source: string; readonly reason: string }[];
  /** Integrity counts for the monitor; null = unreadable. */
  readonly integrity: Readonly<Record<IntegrityKey, number | null>>;
}

export const METRICS_RPC = "ops_product_metrics_v1";

export type IntegrityKey =
  | "integrity_accepted_without_acceptor"
  | "integrity_offer_on_missing_need"
  | "integrity_confirmation_on_deleted_entry"
  | "integrity_join_team_into_non_team"
  | "stale_offers_real_7d";
const INTEGRITY_KEYS: readonly IntegrityKey[] = [
  "integrity_accepted_without_acceptor",
  "integrity_offer_on_missing_need",
  "integrity_confirmation_on_deleted_entry",
  "integrity_join_team_into_non_team",
  "stale_offers_real_7d",
];

type Def = Omit<Metric, "value">;
const def = (key: string, group: MetricGroup, source: string, rule: string, window: string): Def => ({ key, group, source, rule, window });

const INVITE_STATES: readonly [string, string][] = [
  ["created", "invitations created (generated link or e-mail)"],
  ["emailed", "delivered by e-mail"],
  ["link_only", "link generated, nothing e-mailed"],
  ["delivery_failed", "e-mail attempted and failed"],
  ["opened", "link opened at least once (invitations.open_count)"],
  ["accepted", "accepted"],
  ["declined", "declined"],
  ["expired_open", "still pending past expires_at"],
];
const OFFER_STATES = ["offered", "accepted", "declined", "withdrawn", "assigned"] as const;
const SERVICE_STATES = ["sent", "accepted", "declined", "withdrawn"] as const;

/** Every number the SQL function returns, with its meaning. Order = display order. */
export const RPC_CATALOGUE: readonly Def[] = [
  def("accounts_total", "users", "auth.users", "all accounts", "all time"),
  def("signups_7d", "users", "auth.users.created_at", "accounts created", "7 days"),
  def("signups_30d", "users", "auth.users.created_at", "accounts created", "30 days"),
  def("onboarded_accounts", "users", "profiles.onboarded", "onboarding finished", "all time"),
  def("signin_dau", "users", "auth.users.last_sign_in_at", "signed in (a session start, not activity)", "24 h"),
  def("signin_wau", "users", "auth.users.last_sign_in_at", "signed in", "7 days"),
  def("signin_mau", "users", "auth.users.last_sign_in_at", "signed in", "30 days"),
  def("returning_7d", "users", "auth.users", "signed in this week, account older than a week", "7 days"),
  def("active_dau", "users", "pilot_events (production)", "distinct identified people with any event", "24 h"),
  def("active_wau", "users", "pilot_events (production)", "distinct identified people with any event", "7 days"),
  def("active_mau", "users", "pilot_events (production)", "distinct identified people with any event", "30 days"),
  def("registration_started_7d", "users", "pilot_events", "registration_started events (anonymous included, no split)", "7 days"),
  def("signup_completed_7d", "users", "pilot_events", "signup_completed events", "7 days"),
  def("first_real_action_30d", "users", "pilot_events", "activation: first real action", "30 days"),
  def("organizations_by_type_company", "users", "organizations", "active company organizations", "now"),
  def("organizations_by_type_agency", "users", "organizations", "active agency organizations", "now"),
  def("teams_total", "teams", "organizations (type team)", "active brigades", "now"),
  def("teams_created_30d", "teams", "organizations.created_at", "brigades created", "30 days"),
  def("teams_with_member", "teams", "engagement_contexts", "brigades with ≥1 active employee engagement", "now"),
  def("teams_offerable", "teams", "engagement_contexts", "brigades with ≥2 members (the offer_team_to_demand floor)", "now"),
  ...INVITE_STATES.flatMap(([s, rule]) => [
    def(`invites_all_${s}_90d`, "teams", "invitations", rule, "90 days"),
    def(`invites_team_${s}_90d`, "teams", "invitations (join_team)", rule, "90 days"),
  ]),
  def("needs_open", "b2b", "customer_requests", "status submitted", "now"),
  def("needs_posted_30d", "b2b", "customer_requests", "non-draft needs created", "30 days"),
  ...OFFER_STATES.map((s) =>
    def(`team_offers_${s}`, "b2b", "team_demand_offers", `status ${s}${s === "accepted" ? " (agreed in principle, not a contract)" : ""}`, "all time"),
  ),
  def("need_to_first_offer_hours_p50", "b2b", "customer_requests × team_demand_offers", "median hours from need created to its first offer", "all time"),
  def("conversations_started_30d", "b2b", "conversations", "threads opened (all kinds, count only)", "30 days"),
  ...SERVICE_STATES.map((s) => def(`service_requests_${s}`, "b2b", "service_offering_requests", `status ${s}`, "all time")),
  def("agency_candidate_offers", "b2b", "agency_candidate_offers", "agency offers of a person against a client need", "all time"),
  def("journal_entries_7d", "work", "journal_entries", "live entries created", "7 days"),
  def("journal_entries_30d", "work", "journal_entries", "live entries created", "30 days"),
  def("journal_corrections_90d", "work", "journal_entries.correction_of", "entries that correct an earlier entry", "90 days"),
  def("journal_confirmations_30d", "work", "journal_entry_confirmations", "confirmations given", "30 days"),
  def("review_queue_open", "work", "journal_entry_review_submissions − confirmations", "submitted for review, no confirmation yet", "90 days"),
  def("review_queue_older_14d", "work", "journal_entry_review_submissions", "waiting more than 14 days", "90 days"),
  def("worker_skills_total", "work", "worker_skills", "skill rows on Living CVs", "now"),
  def("worker_skills_verified", "work", "worker_skills.verified", "confirmed by a manager", "now"),
  def("worker_skills_recomputed_7d", "work", "worker_skills.last_recompute_at", "Living CV skill rows refreshed", "7 days"),
  def("competency_recognitions_live", "work", "competency_recognitions", "recognitions not revoked", "now"),
];

type RpcPayload = Record<string, unknown>;

/** Flatten the function's nested groups into the catalogue's keys. */
function flatten(raw: RpcPayload): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const nest = (field: string, toKey: (k: string) => string) => {
    const v = raw[field];
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[toKey(k)] = x;
  };
  nest("invites", (k) => `invites_${k}_90d`);
  nest("team_offers", (k) => `team_offers_${k}`);
  nest("service_requests", (k) => `service_requests_${k}`);
  return out;
}

function asValue(x: unknown): MetricValue {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (POPULATIONS.every((p) => typeof o[p] === "number")) return { REAL: o.REAL as number, TEST: o.TEST as number, INTERNAL: o.INTERNAL as number };
  }
  return null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

const DAY = 86_400_000;

export async function computeProductMetrics(client: SupabaseClient, now: number = Date.now()): Promise<MetricsSnapshot> {
  const unknown: { source: string; reason: string }[] = [];
  const metrics: Metric[] = [];

  const { data, error } = await client.rpc(METRICS_RPC);
  const flat = !error && data && typeof data === "object" ? flatten(data as RpcPayload) : null;
  if (!flat) unknown.push({ source: METRICS_RPC, reason: error?.code ?? "no_result" });
  for (const d of RPC_CATALOGUE) metrics.push({ ...d, value: flat ? asValue(flat[d.key]) : null });

  const integrity = Object.fromEntries(
    INTEGRITY_KEYS.map((k) => {
      const v = flat ? asValue(flat[k]) : null;
      return [k, typeof v === "number" ? v : null];
    }),
  ) as Record<IntegrityKey, number | null>;

  // Technical reads service_role may make directly (no person data).
  const since = new Date(now - 7 * DAY).toISOString();
  const ai = await client
    .from("ai_runs")
    .select("latency_ms, schema_validation, fallback_applied, blocked_reason, actual_cost_usd, estimated_cost_usd")
    .gte("created_at", since)
    .limit(20_000);
  if (ai.error) unknown.push({ source: "ai_runs", reason: ai.error.code ?? "read_failed" });
  const runs = (ai.data ?? []) as Record<string, unknown>[];
  const lat = runs.map((a) => Number(a.latency_ms)).filter((n) => Number.isFinite(n) && n > 0);
  const tech = (key: string, value: number | null, source: string, rule: string) =>
    metrics.push({ key, group: "technical", value: ai.error ? null : value, source, rule, window: "7 days" });
  tech("ai_runs_7d", runs.length, "ai_runs", "AI calls");
  tech("ai_latency_ms_p50", percentile(lat, 50), "ai_runs.latency_ms", "p50");
  tech("ai_latency_ms_p95", percentile(lat, 95), "ai_runs.latency_ms", "p95");
  tech("ai_latency_ms_p99", percentile(lat, 99), "ai_runs.latency_ms", "p99");
  tech("ai_runs_failed_validation_7d", runs.filter((a) => a.schema_validation === "failed" || a.schema_validation === "invalid").length, "ai_runs.schema_validation", "output failed its schema");
  tech("ai_runs_fallback_7d", runs.filter((a) => a.fallback_applied === true).length, "ai_runs.fallback_applied", "fell back to another model or a deterministic answer");
  tech("ai_runs_blocked_7d", runs.filter((a) => !!a.blocked_reason).length, "ai_runs.blocked_reason", "refused before the call");
  tech("ai_cost_usd_7d", Math.round(100 * runs.reduce((s, a) => s + Number(a.actual_cost_usd ?? a.estimated_cost_usd ?? 0), 0)) / 100, "ai_runs.actual_cost_usd (else estimated)", "sum");

  const cur = await client.from("vacancy_import_cursors").select("provider_key, last_success_at");
  if (cur.error) unknown.push({ source: "vacancy_import_cursors", reason: cur.error.code ?? "read_failed" });
  // A provider can hold several cursors (one per channel, e.g. a retired
  // snapshot channel beside the live stream); the provider is as fresh as its
  // FRESHEST success.
  const latest = new Map<string, number>();
  for (const c of (cur.data ?? []) as { provider_key: string; last_success_at: string | null }[]) {
    if (!c.last_success_at) continue;
    const t = Date.parse(c.last_success_at);
    if (!latest.has(c.provider_key) || t > latest.get(c.provider_key)!) latest.set(c.provider_key, t);
  }
  const ages = [...latest.values()].map((t) => (now - t) / 3_600_000);
  metrics.push({
    key: "vacancy_sync_lag_hours_max",
    group: "technical",
    value: cur.error || ages.length === 0 ? null : Math.round(Math.max(...ages) * 10) / 10,
    source: "vacancy_import_cursors.last_success_at",
    rule: "per provider its freshest success; the stalest provider",
    window: "now",
  });

  return { computedAt: new Date(now).toISOString(), metrics, unknown, integrity };
}

/** Total across populations, or the number itself. */
export function metricTotal(v: MetricValue): number | null {
  if (v === null || typeof v === "number") return v;
  return v.REAL + v.TEST + v.INTERNAL;
}

/** The REAL share, or the number itself when the metric has no split. */
export function metricReal(v: MetricValue): number | null {
  if (v === null || typeof v === "number") return v;
  return v.REAL;
}
