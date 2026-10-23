/**
 * AGENTAI OS PRODUCTION EVIDENCE — the strict contract of `POST /api/internal/agentai-ops-evidence/v1` (owner 2026-10-23:
 * Agentai OS production state must be verifiable without SSH, through existing authorised channels).
 *
 * Agentai OS pushes ONE compact snapshot of its own production (deployed sha, last outcome per scheduler job, commercial
 * result counts, mail-listener liveness). This module is the only gate between that body and storage, and it is
 * deliberately unforgiving: any unknown key, any string outside its regex, any non-integer and ANY '@' rejects the whole
 * body — so no name, address, subject or correspondence can ever be stored. Counts only; `null` = unmeasured.
 *
 * PURE: no I/O.
 */

export const AGENTAI_OPS_EVIDENCE_SCHEMA = "agentai-ops-evidence/v1";
/** Raw request body cap; the stored metadata (body + `via`) must stay under pilot_events' 4096-byte CHECK. */
export const AGENTAI_OPS_EVIDENCE_MAX_BYTES = 3800;
export const AGENTAI_OPS_EVIDENCE_MAX_JOBS = 60;

export const COMMERCIAL_METRIC_KEYS = [
  "found", "offers", "smtpAccepted", "repliedFirst", "repliedFollowUp", "positive", "requests", "negotiations", "orders",
] as const;
const PERIOD_KEYS = ["today", "week", "total"] as const;

type Metric = number | null;
export type CommercialPeriod = Record<(typeof COMMERCIAL_METRIC_KEYS)[number], Metric>;
export type JobEvidence = [string | null, string | null, number | null];

export interface AgentaiOpsEvidence {
  readonly schema: typeof AGENTAI_OPS_EVIDENCE_SCHEMA;
  readonly builtAtIso: string;
  readonly deployedSha: string | null;
  readonly jobs: Record<string, JobEvidence>;
  readonly commercial: Record<(typeof PERIOD_KEYS)[number], CommercialPeriod>;
  readonly listener: { readonly imapLastSeenIso: string | null };
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const MINUTE_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
const SHA = /^[0-9a-f]{40}$/;
const JOB_ID = /^[a-z0-9-]{1,48}$/;
const OUTCOME = /^[A-Z_]{1,24}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const intOrNull = (v: unknown, max: number): boolean =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max);
const isoOrNull = (v: unknown, re: RegExp): boolean =>
  v === null || (typeof v === "string" && re.test(v) && !Number.isNaN(Date.parse(v)));

/** The validated snapshot, or a short machine reason why the body is refused. Never echoes the input. */
export function parseAgentaiOpsEvidence(raw: unknown): { ok: true; value: AgentaiOpsEvidence } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) return { ok: false, reason: "not_an_object" };
  // Anything that could carry a mailbox or a person's address is refused outright, wherever it appears.
  if (JSON.stringify(raw).includes("@")) return { ok: false, reason: "at_sign" };
  if (!exactKeys(raw, ["schema", "builtAtIso", "deployedSha", "jobs", "commercial", "listener"])) return { ok: false, reason: "keys" };
  if (raw.schema !== AGENTAI_OPS_EVIDENCE_SCHEMA) return { ok: false, reason: "schema" };
  if (typeof raw.builtAtIso !== "string" || !isoOrNull(raw.builtAtIso, ISO_UTC)) return { ok: false, reason: "builtAtIso" };
  if (!(raw.deployedSha === null || (typeof raw.deployedSha === "string" && SHA.test(raw.deployedSha)))) return { ok: false, reason: "deployedSha" };

  if (!isPlainObject(raw.jobs)) return { ok: false, reason: "jobs" };
  const jobIds = Object.keys(raw.jobs);
  if (jobIds.length > AGENTAI_OPS_EVIDENCE_MAX_JOBS) return { ok: false, reason: "jobs_too_many" };
  for (const id of jobIds) {
    const j = raw.jobs[id];
    if (!JOB_ID.test(id) || !Array.isArray(j) || j.length !== 3) return { ok: false, reason: "job_shape" };
    const [outcome, finished, failures] = j as unknown[];
    if (!(outcome === null || (typeof outcome === "string" && OUTCOME.test(outcome)))) return { ok: false, reason: "job_outcome" };
    if (!isoOrNull(finished, MINUTE_UTC)) return { ok: false, reason: "job_finished" };
    if (!intOrNull(failures, 999)) return { ok: false, reason: "job_failures" };
  }

  if (!isPlainObject(raw.commercial) || !exactKeys(raw.commercial, PERIOD_KEYS)) return { ok: false, reason: "commercial" };
  for (const p of PERIOD_KEYS) {
    const m = raw.commercial[p];
    if (!isPlainObject(m) || !exactKeys(m, COMMERCIAL_METRIC_KEYS)) return { ok: false, reason: "commercial_period" };
    for (const k of COMMERCIAL_METRIC_KEYS) if (!intOrNull(m[k], 1_000_000)) return { ok: false, reason: "commercial_value" };
  }

  if (!isPlainObject(raw.listener) || !exactKeys(raw.listener, ["imapLastSeenIso"])) return { ok: false, reason: "listener" };
  if (!isoOrNull(raw.listener.imapLastSeenIso, ISO_UTC)) return { ok: false, reason: "listener_iso" };

  return { ok: true, value: raw as unknown as AgentaiOpsEvidence };
}
