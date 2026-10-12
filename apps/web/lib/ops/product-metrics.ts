/**
 * PRODUCT METRICS — one computation, two readers: the superadmin metrics page
 * (`/dashboard/admin/metrics`) and the scheduled monitor
 * (`scripts/product-monitor.ts`). Owner programme 2026-10-12 §8–§9.
 *
 * RULES
 *  - Every number is read from a canonical table at call time. Nothing is
 *    stored, cached, estimated or back-filled. A read that fails is `null`
 *    (UNKNOWN), never 0 (SEP-7).
 *  - Every metric names its SOURCE, its RULE and its WINDOW.
 *  - People and organizations are split into REAL / TEST / INTERNAL before
 *    counting, and the split is the metric — a total that mixes the owner's
 *    and the QA cast's activity with real users is the misleading number this
 *    module exists to stop.
 *  - Aggregates only. No id, e-mail, name or free text leaves this module.
 *
 * Pure over an injected client: the caller decides which client (the page
 * passes the service-role client AFTER `requireSuperadmin`; the monitor runs in
 * CI with the secret held by GitHub).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSyntheticFixtureLabel, isSyntheticViewer } from "@/lib/qa/synthetic-fixture";

export type Population = "REAL" | "TEST" | "INTERNAL";
export const POPULATIONS: readonly Population[] = ["REAL", "TEST", "INTERNAL"];

export type MetricGroup = "users" | "teams" | "b2b" | "work" | "technical";

export interface Metric {
  readonly key: string;
  readonly group: MetricGroup;
  /** Split by population when the subject is a person or an organization. */
  readonly value: number | null | Readonly<Record<Population, number>>;
  readonly source: string;
  readonly rule: string;
  readonly window: string;
}

export interface MetricsSnapshot {
  readonly computedAt: string;
  readonly metrics: readonly Metric[];
  /** Reads that failed — their metrics are null, and the reason is kept. */
  readonly unknown: readonly { readonly source: string; readonly reason: string }[];
  /** Reads that hit the row cap — their counts are a LOWER bound. */
  readonly truncated: readonly string[];
}

// ── population ──────────────────────────────────────────────────────────────

const TEST_DOMAIN = /@(example\.(com|org|net)|[^@]*\.invalid|[^@]*\.test|local\.test)$/i;
const INTERNAL_DOMAIN = /@labourmarket\.ai$/i;

/** The ONE classification rule, shared by every metric and every monitor. */
export function classifyAccount(user: {
  email?: string | null;
  app_metadata?: unknown;
  isAdmin?: boolean;
}): Population {
  if (isSyntheticViewer(user)) return "TEST";
  const email = user.email ?? "";
  if (TEST_DOMAIN.test(email)) return "TEST";
  if (user.isAdmin || INTERNAL_DOMAIN.test(email)) return "INTERNAL";
  return "REAL";
}

/** An organization is TEST when its name carries the fixture marker, else
 *  it inherits its owner's population. Unknown owner → REAL (never hide a
 *  real organization because a join failed). */
export function classifyOrganization(
  org: { owner_profile_id: string | null; legal_name?: string | null; display_name?: string | null },
  people: ReadonlyMap<string, Population>,
): Population {
  if (isSyntheticFixtureLabel(org.legal_name, org.display_name)) return "TEST";
  return (org.owner_profile_id && people.get(org.owner_profile_id)) || "REAL";
}

// ── reading ─────────────────────────────────────────────────────────────────

const ROW_CAP = 20_000;
const PAGE = 1_000;

type Row = Record<string, unknown>;

/** The slice of the PostgREST builder this module uses — chained filters. */
interface Query extends PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }> {
  gte(column: string, value: string): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
}

interface Reader {
  rows(table: string, columns: string, filter?: (q: Query) => Query): Promise<Row[] | null>;
  unknown: { source: string; reason: string }[];
  truncated: string[];
}

function reader(client: SupabaseClient): Reader {
  const unknown: { source: string; reason: string }[] = [];
  const truncated: string[] = [];
  return {
    unknown,
    truncated,
    async rows(table, columns, filter) {
      const out: Row[] = [];
      for (let from = 0; from < ROW_CAP; from += PAGE) {
        let q = client.from(table).select(columns).range(from, from + PAGE - 1) as unknown as Query;
        if (filter) q = filter(q);
        const { data, error } = await q;
        if (error) {
          unknown.push({ source: table, reason: error.code ?? "read_failed" });
          return null;
        }
        out.push(...((data ?? []) as Row[]));
        if (!data || data.length < PAGE) return out;
      }
      truncated.push(table);
      return out;
    },
  };
}

const iso = (msAgo: number, now: number) => new Date(now - msAgo).toISOString();
const DAY = 86_400_000;

function split(): Record<Population, number> {
  return { REAL: 0, TEST: 0, INTERNAL: 0 };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

// ── snapshot ────────────────────────────────────────────────────────────────

export async function computeProductMetrics(
  client: SupabaseClient,
  now: number = Date.now(),
): Promise<MetricsSnapshot> {
  const r = reader(client);
  const m: Metric[] = [];
  const add = (x: Metric) => m.push(x);

  // People: auth is the identity source; admins come from profiles.active_role.
  type AuthRow = { id: string; email?: string | null; app_metadata?: unknown; created_at: string; last_sign_in_at?: string | null };
  const users: AuthRow[] = [];
  let usersOk = true;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      usersOk = false;
      r.unknown.push({ source: "auth.users", reason: error.name ?? "read_failed" });
      break;
    }
    users.push(...(data.users as AuthRow[]));
    if (data.users.length < 1000) break;
  }
  const profiles = await r.rows("profiles", "id, active_role, onboarded");
  const admins = new Set((profiles ?? []).filter((p) => p.active_role === "admin").map((p) => p.id as string));
  const onboarded = new Set((profiles ?? []).filter((p) => p.onboarded === true).map((p) => p.id as string));
  const people = new Map<string, Population>();
  for (const u of users) people.set(u.id, classifyAccount({ ...u, isAdmin: admins.has(u.id) }));
  const pop = (id: unknown): Population => (typeof id === "string" && people.get(id)) || "REAL";

  const countUsers = (pred: (u: (typeof users)[number]) => boolean) => {
    if (!usersOk) return null;
    const s = split();
    for (const u of users) if (pred(u)) s[pop(u.id)]++;
    return s;
  };
  const within = (ts: string | null | undefined, ms: number) => !!ts && Date.parse(ts) > now - ms;

  add({ key: "accounts_total", group: "users", value: countUsers(() => true), source: "auth.users", rule: "all accounts", window: "all time" });
  add({ key: "signups_7d", group: "users", value: countUsers((u) => within(u.created_at, 7 * DAY)), source: "auth.users.created_at", rule: "accounts created", window: "7 days" });
  add({ key: "signups_30d", group: "users", value: countUsers((u) => within(u.created_at, 30 * DAY)), source: "auth.users.created_at", rule: "accounts created", window: "30 days" });
  add({ key: "onboarded_accounts", group: "users", value: countUsers((u) => onboarded.has(u.id)), source: "profiles.onboarded", rule: "onboarding finished", window: "all time" });
  add({ key: "signin_dau", group: "users", value: countUsers((u) => within(u.last_sign_in_at, DAY)), source: "auth.users.last_sign_in_at", rule: "signed in (a session start, not activity)", window: "24 h" });
  add({ key: "signin_wau", group: "users", value: countUsers((u) => within(u.last_sign_in_at, 7 * DAY)), source: "auth.users.last_sign_in_at", rule: "signed in", window: "7 days" });
  add({ key: "signin_mau", group: "users", value: countUsers((u) => within(u.last_sign_in_at, 30 * DAY)), source: "auth.users.last_sign_in_at", rule: "signed in", window: "30 days" });
  add({ key: "returning_7d", group: "users", value: countUsers((u) => within(u.last_sign_in_at, 7 * DAY) && !within(u.created_at, 7 * DAY)), source: "auth.users", rule: "signed in this week, account older than a week", window: "7 days" });

  // Activity from first-party events (identified only — anonymous events have no population).
  const events = await r.rows("pilot_events", "profile_id, event_name, created_at, metadata", (q) => q.gte("created_at", iso(30 * DAY, now)));
  const prodEvents = (events ?? []).filter((e) => {
    const env = (e.metadata as { deploy_env?: unknown } | null)?.deploy_env;
    return env === undefined || env === "production";
  });
  const activeIn = (ms: number) => {
    if (!events) return null;
    const seen = new Map<string, Population>();
    for (const e of prodEvents) if (e.profile_id && within(e.created_at as string, ms)) seen.set(e.profile_id as string, pop(e.profile_id));
    const s = split();
    for (const p of seen.values()) s[p]++;
    return s;
  };
  add({ key: "active_dau", group: "users", value: activeIn(DAY), source: "pilot_events (production)", rule: "distinct identified people with any event", window: "24 h" });
  add({ key: "active_wau", group: "users", value: activeIn(7 * DAY), source: "pilot_events (production)", rule: "distinct identified people with any event", window: "7 days" });
  add({ key: "active_mau", group: "users", value: activeIn(30 * DAY), source: "pilot_events (production)", rule: "distinct identified people with any event", window: "30 days" });
  const eventCount = (name: string, ms: number) => (events ? prodEvents.filter((e) => e.event_name === name && within(e.created_at as string, ms)).length : null);
  add({ key: "registration_started_7d", group: "users", value: eventCount("registration_started", 7 * DAY), source: "pilot_events", rule: "registration_started events (anonymous included, no split)", window: "7 days" });
  add({ key: "signup_completed_7d", group: "users", value: eventCount("signup_completed", 7 * DAY), source: "pilot_events", rule: "signup_completed events", window: "7 days" });
  add({ key: "first_real_action_30d", group: "users", value: eventCount("first_real_action", 30 * DAY), source: "pilot_events", rule: "activation: first real action", window: "30 days" });

  // Organizations and teams.
  const orgs = await r.rows("organizations", "id, organization_type, owner_profile_id, legal_name, display_name, created_at", (q) => q.is("archived_at", null));
  const orgPop = new Map<string, Population>();
  for (const o of orgs ?? []) orgPop.set(o.id as string, classifyOrganization(o as Parameters<typeof classifyOrganization>[0], people));
  const countOrgs = (pred: (o: Row) => boolean) => {
    if (!orgs) return null;
    const s = split();
    for (const o of orgs) if (pred(o)) s[orgPop.get(o.id as string)!]++;
    return s;
  };
  add({ key: "organizations_by_type_company", group: "users", value: countOrgs((o) => o.organization_type === "company"), source: "organizations", rule: "active company organizations", window: "now" });
  add({ key: "organizations_by_type_agency", group: "users", value: countOrgs((o) => o.organization_type === "agency"), source: "organizations", rule: "active agency organizations", window: "now" });

  const engagements = await r.rows("engagement_contexts", "organization_id, profile_id, relationship_slug, status", (q) => q.eq("status", "active"));
  const membersOf = new Map<string, number>();
  for (const e of engagements ?? []) {
    if (e.relationship_slug === "employee" && e.organization_id) membersOf.set(e.organization_id as string, (membersOf.get(e.organization_id as string) ?? 0) + 1);
  }
  add({ key: "teams_total", group: "teams", value: countOrgs((o) => o.organization_type === "team"), source: "organizations (type team)", rule: "active brigades", window: "now" });
  add({ key: "teams_created_30d", group: "teams", value: countOrgs((o) => o.organization_type === "team" && within(o.created_at as string, 30 * DAY)), source: "organizations.created_at", rule: "brigades created", window: "30 days" });
  add({ key: "teams_with_member", group: "teams", value: engagements ? countOrgs((o) => o.organization_type === "team" && (membersOf.get(o.id as string) ?? 0) >= 1) : null, source: "engagement_contexts", rule: "brigades with ≥1 active employee engagement", window: "now" });
  add({ key: "teams_offerable", group: "teams", value: engagements ? countOrgs((o) => o.organization_type === "team" && (membersOf.get(o.id as string) ?? 0) >= 2) : null, source: "engagement_contexts", rule: "brigades with ≥2 members (the offer_team_to_demand floor)", window: "now" });

  const invites = await r.rows("invitations", "invitation_type, status, delivery_status, open_count, created_at, expires_at, inviter_profile_id", (q) => q.gte("created_at", iso(90 * DAY, now)));
  const inviteCount = (pred: (i: Row) => boolean) => {
    if (!invites) return null;
    const s = split();
    for (const i of invites) if (pred(i)) s[pop(i.inviter_profile_id)]++;
    return s;
  };
  const expired = (i: Row) => i.status === "pending" && Date.parse(i.expires_at as string) < now;
  for (const [suffix, pred, rule] of [
    ["created", () => true, "invitations created (generated link or e-mail)"],
    ["emailed", (i: Row) => i.delivery_status === "sent", "delivered by e-mail"],
    ["link_only", (i: Row) => i.delivery_status === "not_sent", "link generated, nothing e-mailed"],
    ["delivery_failed", (i: Row) => i.delivery_status === "delivery_failed", "e-mail attempted and failed"],
    ["opened", (i: Row) => Number(i.open_count ?? 0) > 0, "link opened at least once (invitations.open_count)"],
    ["accepted", (i: Row) => i.status === "accepted", "accepted"],
    ["declined", (i: Row) => i.status === "declined", "declined"],
    ["expired_open", expired, "still pending past expires_at"],
  ] as const) {
    add({ key: `invites_all_${suffix}_90d`, group: "teams", value: inviteCount(pred as (i: Row) => boolean), source: "invitations", rule, window: "90 days" });
    add({ key: `invites_team_${suffix}_90d`, group: "teams", value: inviteCount((i) => i.invitation_type === "join_team" && (pred as (i: Row) => boolean)(i)), source: "invitations (join_team)", rule, window: "90 days" });
  }

  // B2B market.
  const needs = await r.rows("customer_requests", "id, status, created_at, profile_id, organization_id");
  const needPop = (n: Row) => (n.organization_id ? orgPop.get(n.organization_id as string) : undefined) ?? pop(n.profile_id);
  const needCount = (pred: (n: Row) => boolean) => {
    if (!needs) return null;
    const s = split();
    for (const n of needs) if (pred(n)) s[needPop(n)]++;
    return s;
  };
  add({ key: "needs_open", group: "b2b", value: needCount((n) => n.status === "submitted"), source: "customer_requests", rule: "status submitted", window: "now" });
  add({ key: "needs_posted_30d", group: "b2b", value: needCount((n) => n.status !== "draft" && within(n.created_at as string, 30 * DAY)), source: "customer_requests", rule: "non-draft needs created", window: "30 days" });

  const offers = await r.rows("team_demand_offers", "team_org_id, request_id, status, offered_at, responded_at");
  const offerCount = (pred: (o: Row) => boolean) => {
    if (!offers) return null;
    const s = split();
    for (const o of offers) if (pred(o)) s[orgPop.get(o.team_org_id as string) ?? "REAL"]++;
    return s;
  };
  for (const st of ["offered", "accepted", "declined", "withdrawn", "assigned"]) {
    add({ key: `team_offers_${st}`, group: "b2b", value: offerCount((o) => o.status === st), source: "team_demand_offers", rule: `status ${st} (accepted = agreed in principle, not a contract)`, window: "all time" });
  }
  // Time from a need being posted to its first offer, over needs that got one.
  if (needs && offers) {
    const firstOffer = new Map<string, number>();
    for (const o of offers) {
      const t = Date.parse(o.offered_at as string);
      const k = o.request_id as string;
      if (!firstOffer.has(k) || t < firstOffer.get(k)!) firstOffer.set(k, t);
    }
    const hours: number[] = [];
    for (const n of needs) {
      const t = firstOffer.get(n.id as string);
      if (t !== undefined) hours.push((t - Date.parse(n.created_at as string)) / 3_600_000);
    }
    add({ key: "need_to_first_offer_hours_p50", group: "b2b", value: percentile(hours, 50), source: "customer_requests × team_demand_offers", rule: "median hours from need created to first offer (needs with an offer)", window: "all time" });
  }
  const offerThreads = await r.rows("conversations", "source_type, created_at");
  add({ key: "conversations_started_30d", group: "b2b", value: offerThreads ? offerThreads.filter((c) => within(c.created_at as string, 30 * DAY)).length : null, source: "conversations", rule: "threads opened (all kinds)", window: "30 days" });
  const serviceReqs = await r.rows("service_offering_requests", "status, provider_id");
  for (const st of ["sent", "accepted", "declined", "withdrawn"]) {
    add({
      key: `service_requests_${st}`,
      group: "b2b",
      value: serviceReqs ? (() => { const s = split(); for (const x of serviceReqs) if (x.status === st) s[pop(x.provider_id)]++; return s; })() : null,
      source: "service_offering_requests",
      rule: `status ${st}`,
      window: "all time",
    });
  }
  const agencyOffers = await r.rows("agency_candidate_offers", "status");
  add({ key: "agency_candidate_offers", group: "b2b", value: agencyOffers ? agencyOffers.length : null, source: "agency_candidate_offers", rule: "agency offers of a person against a client need", window: "all time" });

  // Work journal and Living CV.
  const workers = await r.rows("workers", "id, profile_id");
  const workerPop = new Map<string, Population>();
  for (const w of workers ?? []) workerPop.set(w.id as string, pop(w.profile_id));
  const journal = await r.rows("journal_entries", "id, worker_id, created_at, deleted_at, correction_of", (q) => q.gte("created_at", iso(90 * DAY, now)));
  const jCount = (pred: (j: Row) => boolean) => {
    if (!journal) return null;
    const s = split();
    for (const j of journal) if (pred(j)) s[workerPop.get(j.worker_id as string) ?? pop(j.worker_id)]++;
    return s;
  };
  add({ key: "journal_entries_7d", group: "work", value: jCount((j) => !j.deleted_at && within(j.created_at as string, 7 * DAY)), source: "journal_entries", rule: "live entries created", window: "7 days" });
  add({ key: "journal_entries_30d", group: "work", value: jCount((j) => !j.deleted_at && within(j.created_at as string, 30 * DAY)), source: "journal_entries", rule: "live entries created", window: "30 days" });
  add({ key: "journal_corrections_90d", group: "work", value: jCount((j) => !!j.correction_of), source: "journal_entries.correction_of", rule: "entries that correct an earlier entry", window: "90 days" });
  const confirmations = await r.rows("journal_entry_confirmations", "entry_id, created_at", (q) => q.gte("created_at", iso(90 * DAY, now)));
  add({ key: "journal_confirmations_30d", group: "work", value: confirmations ? confirmations.filter((c) => within(c.created_at as string, 30 * DAY)).length : null, source: "journal_entry_confirmations", rule: "confirmations given", window: "30 days" });
  const submissions = await r.rows("journal_entry_review_submissions", "entry_id, submitted_at", (q) => q.gte("submitted_at", iso(90 * DAY, now)));
  if (submissions && confirmations) {
    const confirmed = new Set(confirmations.map((c) => c.entry_id as string));
    const waiting = submissions.filter((s) => !confirmed.has(s.entry_id as string));
    add({ key: "review_queue_open", group: "work", value: waiting.length, source: "journal_entry_review_submissions − confirmations", rule: "submitted for review, no confirmation yet", window: "90 days" });
    add({ key: "review_queue_older_14d", group: "work", value: waiting.filter((s) => !within(s.submitted_at as string, 14 * DAY)).length, source: "journal_entry_review_submissions", rule: "waiting more than 14 days", window: "90 days" });
  }
  const skills = await r.rows("worker_skills", "worker_id, verified, source, last_recompute_at, updated_at");
  if (skills) {
    add({ key: "worker_skills_total", group: "work", value: skills.length, source: "worker_skills", rule: "skill rows on Living CVs", window: "now" });
    add({ key: "worker_skills_verified", group: "work", value: skills.filter((s) => s.verified === true).length, source: "worker_skills.verified", rule: "confirmed by a manager", window: "now" });
    add({ key: "worker_skills_recomputed_7d", group: "work", value: skills.filter((s) => within((s.last_recompute_at ?? s.updated_at) as string, 7 * DAY)).length, source: "worker_skills.last_recompute_at", rule: "Living CV skill rows refreshed", window: "7 days" });
  }
  const recognitions = await r.rows("competency_recognitions", "decision, revoked_at");
  add({ key: "competency_recognitions_live", group: "work", value: recognitions ? recognitions.filter((x) => !x.revoked_at).length : null, source: "competency_recognitions", rule: "recognitions not revoked", window: "now" });

  // Technical — AI runs carry their own latency and outcome.
  const ai = await r.rows("ai_runs", "created_at, latency_ms, schema_validation, fallback_applied, blocked_reason, actual_cost_usd, estimated_cost_usd", (q) => q.gte("created_at", iso(7 * DAY, now)));
  if (ai) {
    const lat = ai.map((a) => Number(a.latency_ms)).filter((n) => Number.isFinite(n) && n > 0);
    add({ key: "ai_runs_7d", group: "technical", value: ai.length, source: "ai_runs", rule: "AI calls", window: "7 days" });
    add({ key: "ai_latency_ms_p50", group: "technical", value: percentile(lat, 50), source: "ai_runs.latency_ms", rule: "p50", window: "7 days" });
    add({ key: "ai_latency_ms_p95", group: "technical", value: percentile(lat, 95), source: "ai_runs.latency_ms", rule: "p95", window: "7 days" });
    add({ key: "ai_latency_ms_p99", group: "technical", value: percentile(lat, 99), source: "ai_runs.latency_ms", rule: "p99", window: "7 days" });
    add({ key: "ai_runs_failed_validation_7d", group: "technical", value: ai.filter((a) => a.schema_validation === "failed" || a.schema_validation === "invalid").length, source: "ai_runs.schema_validation", rule: "output failed its schema", window: "7 days" });
    add({ key: "ai_runs_fallback_7d", group: "technical", value: ai.filter((a) => a.fallback_applied === true).length, source: "ai_runs.fallback_applied", rule: "fell back to another model or a deterministic answer", window: "7 days" });
    add({ key: "ai_runs_blocked_7d", group: "technical", value: ai.filter((a) => !!a.blocked_reason).length, source: "ai_runs.blocked_reason", rule: "refused before the call", window: "7 days" });
    add({ key: "ai_cost_usd_7d", group: "technical", value: Math.round(100 * ai.reduce((s, a) => s + Number(a.actual_cost_usd ?? a.estimated_cost_usd ?? 0), 0)) / 100, source: "ai_runs.actual_cost_usd (else estimated)", rule: "sum", window: "7 days" });
  }
  const cursors = await r.rows("vacancy_import_cursors", "provider_key, last_success_at");
  if (cursors) {
    // A provider can hold several cursors (one per channel, e.g. a retired
    // snapshot channel beside the live stream); the provider is as fresh as its
    // FRESHEST success.
    const latest = new Map<string, number>();
    for (const c of cursors) {
      if (!c.last_success_at) continue;
      const t = Date.parse(c.last_success_at as string);
      const k = c.provider_key as string;
      if (!latest.has(k) || t > latest.get(k)!) latest.set(k, t);
    }
    const ages = [...latest.values()].map((t) => (now - t) / 3_600_000);
    add({ key: "vacancy_sync_lag_hours_max", group: "technical", value: ages.length ? Math.round(Math.max(...ages) * 10) / 10 : null, source: "vacancy_import_cursors.last_success_at", rule: "per provider its freshest success; the stalest provider", window: "now" });
  }

  return { computedAt: new Date(now).toISOString(), metrics: m, unknown: r.unknown, truncated: r.truncated };
}

/** Total across populations, or the number itself. */
export function metricTotal(v: Metric["value"]): number | null {
  if (v === null || typeof v === "number") return v;
  return v.REAL + v.TEST + v.INTERNAL;
}

/** The REAL share, or the number itself when the metric has no split. */
export function metricReal(v: Metric["value"]): number | null {
  if (v === null || typeof v === "number") return v;
  return v.REAL;
}
