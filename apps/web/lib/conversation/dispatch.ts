"use server";

import "server-only";
import { createHash } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { type Role } from "@/lib/auth/actions";
import { getConversationAction } from "@/lib/conversation/action-registry";
import { authorizeDispatch, requiresConfirmation } from "@/lib/conversation/dispatch-core";
import {
  WORKER_ACTION_SCHEMAS,
  type WorkerActionId,
} from "@/lib/conversation/worker-schemas";
import { WORKER_EXECUTORS, type ExecResult } from "@/lib/conversation/worker-executors";
import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";

/**
 * Server dispatcher (Phase B) — the ONLY path that executes a conversation
 * worker action. It enforces, in order: authentication, role (held-roles) via
 * the pure core, zod input validation, a fresh one-time confirmation token for
 * important/strong tiers, then delegates to the canonical executor and returns
 * the REAL result. It never writes the DB itself and never fabricates success.
 */

export type PrepareResult =
  | { ok: true; token: string; stateFingerprint: string }
  | { ok: false; code: string };

/**
 * HMAC key material for confirmation tokens. FAIL-CLOSED — security audit L-02.
 *
 * This used to end in an `||` fallback to a hardcoded dev literal. On a PUBLIC
 * repository that literal is known to everyone, so any environment where neither
 * secret was set signed confirmation tokens with a published constant. The
 * blast radius was bounded (a token is bound to `userId`, which is re-checked
 * against `auth.getUser()`, and the role + zod checks still ran, so it only let
 * a user skip their OWN confirmation step) — but a consent gate whose key is
 * public is not a gate, and "bounded" is not a reason to keep a published key.
 *
 * Now it throws instead. Refusing to mint a token is the safe direction: the
 * caller surfaces an error and the action does not run. Silently signing with a
 * known constant is the unsafe direction, and it looks identical to working.
 *
 * `CONVERSATION_TOKEN_SECRET` is preferred so this purpose can hold its own key
 * rather than reusing the service-role key as HMAC material (key-purpose reuse
 * — a rotation of one should not silently invalidate the other). The
 * service-role / DB-password fallbacks keep existing deployments working, since
 * production already sets the former.
 */
function tokenSecret(): string {
  const material =
    env.CONVERSATION_TOKEN_SECRET ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_DB_PASSWORD;
  if (!material) {
    throw new Error(
      "conversation confirmation tokens cannot be signed: set CONVERSATION_TOKEN_SECRET " +
        "(or SUPABASE_SERVICE_ROLE_KEY). Refusing to sign with a hardcoded fallback.",
    );
  }
  return createHash("sha256").update(`conversation-confirmation:v1:${material}`).digest("hex");
}

async function heldRolesOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<Role>> {
  try {
    const { data } = await supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", userId)
      .eq("is_active", true);
    const set = new Set<Role>((data ?? []).map((r) => r.role as Role));
    return set.size > 0 ? set : new Set<Role>(["worker"]);
  } catch {
    return new Set<Role>(["worker"]);
  }
}

/** Opaque state fingerprint bound into a confirmation token so a card that was
 *  shown for one state can never execute against a changed state (replay /
 *  stale). Only the confirm-tier actions need one. */
async function stateFingerprint(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  actionId: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (actionId === "worker.respond-booking") {
    const { data } = await supabase
      .from("booking_requests")
      .select("status")
      .eq("id", String(input.bookingId))
      .maybeSingle();
    return `booking:${(data?.status as string) ?? "missing"}`;
  }
  if (actionId === "worker.express-interest") {
    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!worker?.id) return "interest:no-worker";
    const { data } = await supabase
      .from("demand_interest_signals")
      .select("status")
      .eq("worker_id", worker.id)
      .eq("request_id", String(input.requestId))
      .maybeSingle();
    return `interest:${(data?.status as string) ?? "none"}`;
  }
  return "n/a";
}

function isWorkerExecutable(actionId: string): actionId is WorkerActionId {
  return Object.prototype.hasOwnProperty.call(WORKER_ACTION_SCHEMAS, actionId);
}

/** Mint a confirmation token for an important/strong worker action, after
 *  re-checking auth + role + input shape and capturing current state. */
export async function prepareConfirmationAction(
  actionId: string,
  input: unknown,
): Promise<PrepareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const descriptor = getConversationAction(actionId);
  const held = await heldRolesOf(supabase, user.id);
  const authz = authorizeDispatch({ descriptor, heldRoles: held, executable: isWorkerExecutable(actionId) });
  if (!authz.ok) return { ok: false, code: authz.code };
  if (!descriptor || !requiresConfirmation(descriptor.confirmation)) {
    return { ok: false, code: "no_confirmation_needed" };
  }

  const schema = WORKER_ACTION_SCHEMAS[actionId as WorkerActionId];
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const fp = await stateFingerprint(supabase, user.id, actionId, parsed.data as Record<string, unknown>);
  const token = issueConfirmationToken(tokenSecret(), {
    actionId,
    inputHash: canonicalInputHash(parsed.data),
    userId: user.id,
    stateFingerprint: fp,
    issuedAtMs: Date.now(),
  });
  return { ok: true, token, stateFingerprint: fp };
}

/** Execute a worker conversation action end-to-end. */
export async function dispatchWorkerAction(
  actionId: string,
  input: unknown,
  opts?: { locale?: string; confirmationToken?: string },
): Promise<ExecResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const descriptor = getConversationAction(actionId);
  const held = await heldRolesOf(supabase, user.id);
  const authz = authorizeDispatch({ descriptor, heldRoles: held, executable: isWorkerExecutable(actionId) });
  if (!authz.ok) return { ok: false, code: authz.code };
  // descriptor is defined here (authz.ok implies it).
  const desc = descriptor!;

  const schema = WORKER_ACTION_SCHEMAS[actionId as WorkerActionId];
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  if (requiresConfirmation(desc.confirmation)) {
    const token = opts?.confirmationToken;
    if (!token) return { ok: false, code: "confirmation_required" };
    const currentFp = await stateFingerprint(
      supabase,
      user.id,
      actionId,
      parsed.data as Record<string, unknown>,
    );
    const verdict = verifyConfirmationToken(tokenSecret(), token, {
      actionId,
      input: parsed.data,
      userId: user.id,
      currentStateFingerprint: currentFp,
      nowMs: Date.now(),
    });
    if (!verdict.ok) {
      return { ok: false, code: verdict.reason === "stale_state" ? "stale_confirmation" : "confirmation_invalid" };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const executor = WORKER_EXECUTORS[actionId as WorkerActionId] as any;
  return executor(parsed.data, { locale: opts?.locale ?? "lt" });
}
