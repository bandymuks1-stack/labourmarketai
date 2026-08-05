"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";

/**
 * §7.1 — ending a company-worker engagement. THE one write path, shared by
 * BOTH sides.
 *
 * ─── ONE API, TWO SURFACES ──────────────────────────────────────────────────
 * The employer and the worker both have the right to end an engagement
 * (`owns_company(...) OR the engagement's own worker`, enforced in SQL since
 * 20260723120000). They therefore share this module and the single RPC behind
 * it. A second employer-only or worker-only action would be two authorization
 * models for one decision, and they would drift.
 *
 * ─── WHY v2 ─────────────────────────────────────────────────────────────────
 * `end_company_worker_engagement_v1` returns a bare boolean whose `false`
 * means four different things (no such row / not yours / not active / no row
 * updated). A screen built on it could not tell "you may not do this" from
 * "it was already ended", so it would have to guess. `..._v2` returns a tagged
 * outcome. This module forwards that outcome and adds no rule of its own — it
 * never turns a refusal into a success and never invents a state the server
 * did not return.
 *
 * ─── THE CLIENT SUPPLIES AN ID AND NOTHING ELSE ─────────────────────────────
 * No company id, no worker id, no role, no "side". Authority is re-derived
 * server-side from the authenticated actor and the row's own relationships, so
 * a hand-typed engagement id buys nothing: an id the caller may not act on
 * comes back `not_found`, exactly like one that does not exist.
 */

/** The RPC's absent-migration signatures — the owner gate is not yet given. */
const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/**
 * Which side the server says acted. Derived from the row, never from the
 * client — it exists so a surface can confirm the server agreed with the
 * context it thought it was in, not so it can choose.
 */
export type EngagementActorSide = "company" | "worker";

export type EndEngagementResult =
  /** This call moved active → ended. `endedAt` is the stored timestamp. */
  | { kind: "ended"; engagementId: string; endedAt: string | null; actorSide: EngagementActorSide }
  /** It was already ended. NOT a failure, and NOT a second write. */
  | { kind: "already_ended"; engagementId: string; endedAt: string | null; actorSide: EngagementActorSide }
  /** No such row, OR the caller may not act on it. Deliberately the same
   *  answer for both — see the anti-oracle note in the migration. */
  | { kind: "not_found" }
  /** It changed underneath us. Safe to re-read and try again. */
  | { kind: "conflict" }
  /** The owner-gated migration is not applied here yet. */
  | { kind: "needs_migration" }
  /** Anything else. No raw database text ever reaches a person. */
  | { kind: "error" };

function asSide(value: unknown): EngagementActorSide {
  // An unreadable side is reported as the LESS privileged one rather than
  // guessed upward.
  return value === "company" ? "company" : "worker";
}

function asIsoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * End one engagement, addressed by primary key.
 *
 * `locale` is used only to refresh the surfaces that render engagement state;
 * it is never part of the authorization decision.
 */
export async function endEngagementAction(
  locale: string,
  engagementId: string,
): Promise<EndEngagementResult> {
  if (typeof engagementId !== "string" || engagementId.trim() === "") {
    // A missing id is not an error state to explain — it is simply not a row.
    return { kind: "not_found" };
  }

  let data: unknown;
  let error: { code?: string } | null = null;
  try {
    const res = await asAny(await createClient()).rpc(
      "end_company_worker_engagement_v2",
      { p_engagement_id: engagementId },
    );
    data = res.data;
    error = res.error;
  } catch {
    return { kind: "error" };
  }

  if (error) {
    // Until the owner applies 20260804160000 the RPC is absent. Say so
    // honestly rather than showing a generic failure nobody can act on.
    if (error.code && ABSENT.has(error.code)) return { kind: "needs_migration" };
    return { kind: "error" };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const outcome = typeof payload.outcome === "string" ? payload.outcome : "";
  const engagement =
    typeof payload.engagement_id === "string" ? payload.engagement_id : null;

  switch (outcome) {
    case "ended": {
      // A success whose subject we cannot read is not a success we can report.
      if (!engagement) return { kind: "error" };
      // W14 mid-funnel: only a real state change counts — `already_ended`,
      // refusals and errors emit nothing. `role_context` is the
      // server-derived side of THIS engagement; other engagements of the
      // same person are untouched and unreported.
      emitServerFunnelEvent(FUNNEL_EVENTS.engagementEnded, {
        source: "engagements",
        metadata: { role_context: asSide(payload.actor_side) },
      });
      // Every surface that renders engagement state re-reads.
      revalidatePath(`/${locale}/dashboard/projects`);
      revalidatePath(`/${locale}/dashboard`);
      return {
        kind: "ended",
        engagementId: engagement,
        endedAt: asIsoOrNull(payload.ended_at),
        actorSide: asSide(payload.actor_side),
      };
    }
    case "already_ended": {
      if (!engagement) return { kind: "error" };
      return {
        kind: "already_ended",
        engagementId: engagement,
        endedAt: asIsoOrNull(payload.ended_at),
        actorSide: asSide(payload.actor_side),
      };
    }
    case "not_found":
      return { kind: "not_found" };
    case "conflict":
      return { kind: "conflict" };
    default:
      // An unrecognised outcome collapses to `error` — NEVER to success.
      return { kind: "error" };
  }
}
