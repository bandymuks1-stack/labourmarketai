/**
 * PRODUCT MONITOR — the alert rules (owner programme 2026-10-12 §9).
 *
 * Pure: a snapshot of metrics + probe results in, a list of signal states out.
 * `scripts/product-monitor.ts` gathers the inputs and turns a BREACH into one
 * GitHub issue per signal (opened once, commented while it lasts, closed on
 * recovery) — the same owner-notification path the vacancy freshness monitor
 * already uses. No new SaaS.
 *
 * Each signal states its severity, its exact condition, the interval it is
 * evaluated at and who responds. A signal whose input could not be read is
 * UNKNOWN — never OK (SEP-7) — and UNKNOWN is itself reported.
 *
 * Severity: P1 = a core path is broken for users now; P2 = degraded or a
 * commercial chain is stalling; P3 = hygiene, look within a week.
 */

import { metricReal, metricTotal, type MetricsSnapshot } from "@/lib/ops/product-metrics";

export type Severity = "P1" | "P2" | "P3";
export type SignalState = "OK" | "BREACH" | "UNKNOWN";

export interface SignalDefinition {
  readonly id: string;
  readonly severity: Severity;
  readonly condition: string;
  readonly interval: string;
  readonly responder: string;
}

export interface SignalResult extends SignalDefinition {
  readonly state: SignalState;
  /** Aggregate numbers only — this text lands in a GitHub issue. */
  readonly observed: string;
}

export interface MonitorProbes {
  /** Median ms of the public free-text job search, or null when unreachable. */
  readonly searchMedianMs: number | null;
}

/** Interval the workflow runs at; every signal is evaluated every run. */
export const MONITOR_INTERVAL = "hourly (GitHub Actions cron, ±15 min)";
const RESPONDER = "owner via GitHub issue (label monitor) → Claude Code session fixes";

export const SIGNALS: readonly SignalDefinition[] = [
  { id: "signup-broken", severity: "P1", condition: "registration_started ≥ 3 in 7 days AND signup_completed = 0 in 7 days", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "signup-unfinished", severity: "P2", condition: "registration_started ≥ 10 in 7 days AND signup_completed / registration_started < 20 %", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "invites-failing", severity: "P2", condition: "invitations with delivery_failed in 90 days ≥ 1", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "invites-expiring-unused", severity: "P3", condition: "REAL invitations still pending past expiry in 90 days ≥ 5", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "team-formation-stalled", severity: "P2", condition: "REAL brigades exist AND none has an active member", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "b2b-offers-unanswered", severity: "P2", condition: "REAL brigade offers still 'offered' 7 days after they were made ≥ 1", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "review-queue-stale", severity: "P3", condition: "journal entries waiting > 14 days for confirmation ≥ 1", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "living-cv-not-refreshing", severity: "P2", condition: "journal entries in 7 days ≥ 3 AND no worker_skills row refreshed in 7 days", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "search-slow", severity: "P2", condition: "public free-text job search median of 3 > 3000 ms (or unreachable)", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "ai-failing", severity: "P2", condition: "AI runs in 7 days ≥ 10 AND (failed validation + blocked) / runs > 30 %", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "ai-runtime-disabled", severity: "P2", condition: "AI runs in 7 days answered by no provider (ai_runs.provider = 'disabled') ≥ 1: people reached an AI surface while the AI runtime was switched off or had no key", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "vacancy-sync-lagging", severity: "P2", condition: "oldest successful vacancy import > 30 h", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "data-integrity", severity: "P1", condition: "any of: accepted invitation without acceptor, brigade offer on a missing need, confirmation on a deleted entry, an accepted staff or partner invitation whose acceptor has no relationship with that organization", interval: MONITOR_INTERVAL, responder: RESPONDER },
  { id: "metrics-unreadable", severity: "P2", condition: "any metric source failed to read", interval: MONITOR_INTERVAL, responder: RESPONDER },
];

function metric(s: MetricsSnapshot, key: string) {
  return s.metrics.find((m) => m.key === key)?.value ?? null;
}

export function evaluateSignals(s: MetricsSnapshot, p: MonitorProbes): SignalResult[] {
  const out: SignalResult[] = [];
  const set = (id: string, state: SignalState, observed: string) => {
    const def = SIGNALS.find((d) => d.id === id)!;
    out.push({ ...def, state, observed });
  };
  const val = (n: number | null) => (n === null ? "unknown" : String(n));

  {
    const started = metricTotal(metric(s, "registration_started_7d"));
    const done = metricTotal(metric(s, "signup_completed_7d"));
    set("signup-broken", started === null || done === null ? "UNKNOWN" : started >= 3 && done === 0 ? "BREACH" : "OK", `started ${val(started)}, completed ${val(done)} (7 d)`);
  }
  {
    const started = metricTotal(metric(s, "registration_started_7d"));
    const done = metricTotal(metric(s, "signup_completed_7d"));
    set(
      "signup-unfinished",
      started === null || done === null ? "UNKNOWN" : started >= 10 && done / started < 0.2 ? "BREACH" : "OK",
      `started ${val(started)}, completed ${val(done)} (7 d)`,
    );
  }
  {
    const n = metricTotal(metric(s, "invites_all_delivery_failed_90d"));
    set("invites-failing", n === null ? "UNKNOWN" : n >= 1 ? "BREACH" : "OK", `${val(n)} failed deliveries (90 d)`);
  }
  {
    const n = metricReal(metric(s, "invites_all_expired_open_90d"));
    set("invites-expiring-unused", n === null ? "UNKNOWN" : n >= 5 ? "BREACH" : "OK", `${val(n)} REAL expired-open (90 d)`);
  }
  {
    const teams = metricReal(metric(s, "teams_total"));
    const withMember = metricReal(metric(s, "teams_with_member"));
    set("team-formation-stalled", teams === null || withMember === null ? "UNKNOWN" : teams > 0 && withMember === 0 ? "BREACH" : "OK", `${val(teams)} REAL brigades, ${val(withMember)} with a member`);
  }
  {
    const n = s.integrity.stale_offers_real_7d;
    set("b2b-offers-unanswered", n === null ? "UNKNOWN" : n >= 1 ? "BREACH" : "OK", `${val(n)} REAL offers unanswered > 7 d`);
  }
  {
    const n = metricTotal(metric(s, "review_queue_older_14d"));
    set("review-queue-stale", n === null ? "UNKNOWN" : n >= 1 ? "BREACH" : "OK", `${val(n)} waiting > 14 d`);
  }
  {
    const entries = metricTotal(metric(s, "journal_entries_7d"));
    const refreshed = metricTotal(metric(s, "worker_skills_recomputed_7d"));
    set("living-cv-not-refreshing", entries === null || refreshed === null ? "UNKNOWN" : entries >= 3 && refreshed === 0 ? "BREACH" : "OK", `${val(entries)} entries, ${val(refreshed)} skill rows refreshed (7 d)`);
  }
  set("search-slow", p.searchMedianMs === null ? "BREACH" : p.searchMedianMs > 3000 ? "BREACH" : "OK", p.searchMedianMs === null ? "search unreachable" : `median ${Math.round(p.searchMedianMs)} ms`);
  {
    const runs = metricTotal(metric(s, "ai_runs_7d"));
    const bad = (metricTotal(metric(s, "ai_runs_failed_validation_7d")) ?? 0) + (metricTotal(metric(s, "ai_runs_blocked_7d")) ?? 0);
    set("ai-failing", runs === null ? "UNKNOWN" : runs >= 10 && bad / runs > 0.3 ? "BREACH" : "OK", `${val(runs)} runs, ${bad} failed/blocked (7 d)`);
  }
  {
    const runs = metricTotal(metric(s, "ai_runs_7d"));
    const off = metricTotal(metric(s, "ai_runs_runtime_disabled_7d"));
    set("ai-runtime-disabled", runs === null || off === null ? "UNKNOWN" : off >= 1 ? "BREACH" : "OK", `${val(off)} of ${val(runs)} runs had no AI provider (7 d)`);
  }
  {
    const lag = metricTotal(metric(s, "vacancy_sync_lag_hours_max"));
    set("vacancy-sync-lagging", lag === null ? "UNKNOWN" : lag > 30 ? "BREACH" : "OK", `oldest import ${val(lag)} h`);
  }
  {
    const i = s.integrity;
    const parts = [i.integrity_accepted_without_acceptor, i.integrity_offer_on_missing_need, i.integrity_confirmation_on_deleted_entry, i.integrity_staff_accept_without_relationship];
    const anyUnknown = parts.some((x) => x === null);
    const sum = parts.reduce<number>((a, b) => a + (b ?? 0), 0);
    set("data-integrity", sum > 0 ? "BREACH" : anyUnknown ? "UNKNOWN" : "OK", `accepted-without-acceptor ${val(parts[0]!)}, offer-on-missing-need ${val(parts[1]!)}, confirmation-on-deleted ${val(parts[2]!)}, staff-accept-without-relationship ${val(parts[3]!)}`);
  }
  set("metrics-unreadable", s.unknown.length > 0 ? "BREACH" : "OK", s.unknown.length ? `unreadable: ${s.unknown.map((u) => `${u.source}(${u.reason})`).join(", ")}` : "all sources read");
  return out;
}
