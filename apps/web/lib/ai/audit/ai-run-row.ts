/**
 * AI run audit — pure row builder + hashing (Internal LLM Agents v1, PR4).
 *
 * Turns a run into the exact `ai_runs` insert row. It stores only HASHES of the
 * input/output (sha256 hex) — never the raw content, never a secret, never a
 * key. Pure (no IO, no server-only) so it is unit-tested directly and the guard
 * can assert no raw payload is ever persisted.
 */
import { createHash } from "node:crypto";

export type AiRunStatus = "suggestion" | "disabled" | "needs_review" | "error";

export interface AiRunRecord {
  readonly ownerId?: string | null;
  readonly orgId?: string | null;
  readonly agentKey: string;
  readonly promptVersion: string;
  readonly provider: string;
  readonly model?: string | null;
  readonly status: AiRunStatus;
  readonly errorCode?: string | null;
  /** Hashed, never stored raw. */
  readonly input?: unknown;
  readonly output?: unknown;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
}

/** Deterministic sha256 hex of any value (stable JSON). null/undefined → null. */
export function hashForAudit(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface AiRunRow {
  owner_id: string | null;
  org_id: string | null;
  agent_key: string;
  prompt_version: string;
  provider: string;
  model: string | null;
  status: AiRunStatus;
  error_code: string | null;
  input_hash: string | null;
  output_hash: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export function buildAiRunRow(rec: AiRunRecord): AiRunRow {
  return {
    owner_id: rec.ownerId ?? null,
    org_id: rec.orgId ?? null,
    agent_key: rec.agentKey,
    prompt_version: rec.promptVersion,
    provider: rec.provider,
    model: rec.model ?? null,
    status: rec.status,
    error_code: rec.errorCode ?? null,
    input_hash: hashForAudit(rec.input),
    output_hash: hashForAudit(rec.output),
    input_tokens: rec.inputTokens ?? null,
    output_tokens: rec.outputTokens ?? null,
  };
}
