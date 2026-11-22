import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * NO SYNTHETIC NEED STAYS OPEN — the one sweep every production walk that can
 * post a need runs in `test.afterAll` (Playwright runs it when a test fails
 * too), and the workflow runs again in an `if: always()` step before the
 * sessions are revoked (it also covers a cancel or a job timeout, when no
 * hook runs).
 *
 * Owner order 2026-11-22: 15 synthetic needs left open by walks that stopped
 * before their own close were on the open agency board, where real agencies
 * saw them. A walk's inline close only runs when the steps before it pass.
 *
 * How: for every minted synthetic session present (each identity's OWN token,
 * through `qaApi`, which refuses anything but an allowlisted synthetic identity
 * on the production project), read that person's own SUBMITTED needs, keep the
 * ones carrying the walks' marker, and close each through the product's own
 * lifecycle RPC `close_demand_v1` — the same call the needs page's Close
 * button makes (lib/demand/demand-lifecycle.ts). Then read each one back.
 *
 * Never a delete, never the service role: a closed need keeps its row and
 * history; it is only off the market. Logs counts, never ids or text.
 */
export const SYNTHETIC_NEED_MARKER = "QA-SYNTHETIC";

const E2E_DIR = __dirname;
const SLOT_FILE = /^\.storage-state\.prod-qa\.([a-z0-9-]{1,24})\.json$/;

export interface NeedSweepResult {
  readonly label: string;
  readonly slots: number;
  readonly seen: number;
  readonly closed: number;
  /** Slot names (never ids) where a read or a close did not end closed. */
  readonly failed: readonly string[];
}

/** The minted synthetic sessions present in this run (slot names). */
export function mintedSlots(): string[] {
  if (!existsSync(E2E_DIR)) return [];
  return readdirSync(E2E_DIR)
    .map((f) => SLOT_FILE.exec(f)?.[1] ?? "")
    .filter((s) => s !== "");
}

function subOf(token: string): string {
  const part = token.split(".")[1] ?? "";
  return String(JSON.parse(Buffer.from(part, "base64url").toString("utf8")).sub ?? "");
}

async function openOwnSyntheticNeeds(token: string, sub: string): Promise<string[] | null> {
  const res = await qaApi(
    `/rest/v1/customer_requests?select=id,title,payload&profile_id=eq.${encodeURIComponent(sub)}&status=eq.submitted&limit=200`,
    token,
  );
  if (res.status !== 200) return null;
  const rows = (await res.json()) as Array<{ id: string; title: unknown; payload: unknown }>;
  return rows.filter((r) => JSON.stringify([r.title, r.payload]).includes(SYNTHETIC_NEED_MARKER)).map((r) => r.id);
}

async function statusOf(token: string, id: string): Promise<string> {
  const res = await qaApi(`/rest/v1/customer_requests?select=status&id=eq.${encodeURIComponent(id)}`, token);
  if (res.status !== 200) return "unreadable";
  const rows = (await res.json()) as Array<{ status: string }>;
  return rows[0]?.status ?? "not-visible";
}

/**
 * Close every open synthetic need of every minted synthetic session (or of
 * `slots`). Tolerant — one failure never stops the rest — and reported:
 * `failed` names the slots where something stayed open.
 */
export async function closeOpenSyntheticNeeds(label: string, slots: readonly string[] = mintedSlots()): Promise<NeedSweepResult> {
  let seen = 0;
  let closed = 0;
  const failed: string[] = [];
  let used = 0;
  for (const slot of slots) {
    if (!existsSync(resolve(E2E_DIR, `.storage-state.prod-qa.${slot}.json`))) continue;
    let token: string;
    try {
      token = bearerOf(slot);
    } catch {
      continue; // not an allowlisted synthetic production session: never touched
    }
    used += 1;
    try {
      const ids = await openOwnSyntheticNeeds(token, subOf(token));
      if (ids === null) {
        failed.push(`${slot}:read`);
        continue;
      }
      seen += ids.length;
      for (const id of ids) {
        try {
          const res = await qaApi("/rest/v1/rpc/close_demand_v1", token, { method: "POST", body: { p_request_id: id } });
          const outcome = res.status === 200 ? String(((await res.json()) as { outcome?: string }).outcome ?? "") : "";
          const after = await statusOf(token, id);
          if (after === "closed" || (outcome === "already_closed" && after !== "submitted")) closed += 1;
          else failed.push(`${slot}:close`);
        } catch {
          failed.push(`${slot}:close`);
        }
      }
    } catch {
      failed.push(`${slot}:read`);
    }
  }
  console.info(`[need-sweep] ${label}: sessions=${used} open-synthetic=${seen} closed=${closed} failed=${failed.length}`);
  return { label, slots: used, seen, closed, failed };
}

/** For an afterAll: sweep, then fail the hook if a synthetic need stayed open. */
export async function closeOpenSyntheticNeedsOrFail(label: string): Promise<void> {
  const r = await closeOpenSyntheticNeeds(label);
  if (r.failed.length > 0) {
    throw new Error(`[need-sweep] ${label}: ${r.failed.length} synthetic need(s) may still be open (${[...new Set(r.failed)].join(", ")})`);
  }
}
