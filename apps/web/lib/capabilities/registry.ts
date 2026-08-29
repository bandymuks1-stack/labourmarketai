import "server-only";

import { z } from "zod";
import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";

import { env } from "@/lib/env";
import { createJournalEntryCore } from "@/lib/journal/journal-write-core";
import { fd } from "@/lib/conversation/executor-contract";

import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import { workerLogWorkSchema } from "@/lib/conversation/worker-schemas";
import type { ExecResult } from "@/lib/conversation/executor-contract";
import type {
  CapabilityCaller,
  CapabilityDescriptor,
} from "./contract";

/**
 * THE capability registry — one entry per domain action an external client
 * may invoke. Additions happen here, in review, never dynamically.
 *
 * Every handler runs on the CALLER'S OWN client (RLS decides), reuses the
 * same tables/helpers the web routes read, and derives nothing the product
 * derives elsewhere — `profile.get` returns recorded facts, not a second
 * completeness score (the Player Card readiness model stays the ONE
 * completeness source and is cookie-coupled today; threading it to bearer
 * callers is the recorded shared-core refactor, not a thing to fake here).
 */

// ── profile.get ────────────────────────────────────────────────────────────

const profileGet: CapabilityDescriptor = {
  id: "profile.get",
  kind: "read",
  title: "My LabourMarket profile",
  description:
    "The caller's own profile record: name, locale, country, onboarding " +
    "state, and whether a worker profile exists. Facts as recorded — no " +
    "derived scores.",
  exposed: true,
  inputSchema: z.object({}).strict(),
  run: async (caller): Promise<ExecResult> => {
    const { data: profile, error } = await caller.supabase
      .from("profiles")
      .select("id, full_name, email, locale, country, onboarded, active_role")
      .eq("id", caller.userId)
      .maybeSingle();
    if (error) {
      // A failed read is "unavailable", never "you have no profile" (#1314).
      return { ok: false, code: "unavailable", message: "Profile read failed." };
    }
    if (!profile) {
      return { ok: false, code: "not_found", message: "No profile row for this account." };
    }

    const { data: worker, error: workerError } = await caller.supabase
      .from("workers")
      .select("id")
      .eq("profile_id", caller.userId)
      .maybeSingle();

    return {
      ok: true,
      data: {
        profile: {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          locale: profile.locale,
          country: profile.country,
          onboarded: profile.onboarded,
          activeRole: profile.active_role,
        },
        // Three-valued on purpose: unknown ≠ absent.
        worker: workerError
          ? { status: "unavailable" as const }
          : worker
            ? { status: "exists" as const, workerId: worker.id }
            : { status: "none" as const },
      },
    };
  },
};

// ── living_cv.skills.get ───────────────────────────────────────────────────

const livingCvSkillsGet: CapabilityDescriptor = {
  id: "living_cv.skills.get",
  kind: "read",
  title: "My Living CV skills",
  description:
    "The caller's own declared and journal-backed skills with their " +
    "verification state and source — the same rows the web Living CV reads.",
  exposed: true,
  inputSchema: z.object({}).strict(),
  run: async (caller): Promise<ExecResult> => {
    const { data: worker, error: workerError } = await caller.supabase
      .from("workers")
      .select("id")
      .eq("profile_id", caller.userId)
      .maybeSingle();
    if (workerError) {
      return { ok: false, code: "unavailable", message: "Worker read failed." };
    }
    if (!worker) {
      return {
        ok: false,
        code: "no_worker",
        message: "This account has no worker profile, so it has no Living CV skills.",
      };
    }

    // The identical read GET /api/workers/:id/skills serves, joined to the
    // catalogue slug so the rows are meaningful outside the web UI.
    const { data, error } = await caller.supabase
      .from("worker_skills")
      .select("skill_id, verified, source, verified_at, skills(slug)")
      .eq("worker_id", worker.id);
    if (error) {
      return { ok: false, code: "unavailable", message: "Skills read failed." };
    }

    return {
      ok: true,
      data: {
        workerId: worker.id,
        skills: (data ?? []).map((r) => ({
          skillId: r.skill_id,
          slug: (r.skills as { slug: string | null } | null)?.slug ?? null,
          verified: r.verified,
          source: r.source,
          verifiedAt: r.verified_at,
        })),
      },
    };
  },
};

// ── journal.create_draft / journal.confirm ─────────────────────────────────

/**
 * Domain-separated signing secret for CAPABILITY confirmation tokens. Same
 * derivation pattern as the conversation dispatcher's, different purpose
 * string — a token minted for one surface can never be replayed on the other.
 */
function capabilityTokenSecret(): string {
  const material = env.CONVERSATION_TOKEN_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) {
    throw new Error(
      "capability confirmation tokens cannot be signed: set CONVERSATION_TOKEN_SECRET " +
        "(or SUPABASE_SERVICE_ROLE_KEY). Refusing to sign with a hardcoded fallback.",
    );
  }
  return createHash("sha256").update(`capability-confirmation:v1:${material}`).digest("hex");
}

/** A draft is stateless, so its fingerprint is the draft itself. */
const DRAFT_STATE_FINGERPRINT = "journal-draft:v1";

const journalCreateDraft: CapabilityDescriptor = {
  id: "journal.create_draft",
  kind: "draft",
  title: "Draft a Work Journal entry",
  description:
    "Validates a Work Journal entry and returns the exact preview that " +
    "would be saved, plus a one-time confirmation token. NOTHING is written. " +
    "Uses the same input contract as the web chat work-log form.",
  // Exposed since the journal-write extraction landed (owner-approved
  // 2026-08-29 §6): journal.confirm now performs the real canonical write,
  // so the draft it prepares leads somewhere true.
  exposed: true,
  inputSchema: workerLogWorkSchema,
  run: async (caller, input): Promise<ExecResult> => {
    const draft = workerLogWorkSchema.parse(input);
    const token = issueConfirmationToken(capabilityTokenSecret(), {
      actionId: "journal.confirm",
      inputHash: canonicalInputHash(draft),
      userId: caller.userId,
      stateFingerprint: DRAFT_STATE_FINGERPRINT,
      issuedAtMs: Date.now(),
    });
    return {
      ok: true,
      data: {
        preview: {
          workDate: draft.workDate,
          siteName: draft.siteName ?? null,
          notes: draft.notes,
          engagementContextId: draft.engagementContextId,
        },
        confirmationToken: token,
        note: "Nothing was saved. Confirming requires journal.confirm with this exact draft and token.",
      },
    };
  },
};

const journalConfirmInput = workerLogWorkSchema.extend({
  confirmationToken: z.string().min(10),
});

const journalConfirm: CapabilityDescriptor = {
  id: "journal.confirm",
  kind: "confirm",
  title: "Confirm a drafted Work Journal entry",
  description:
    "Verifies the confirmation token against the exact draft, then performs " +
    "the canonical append-only journal write as the caller.",
  // The former honest gate is CLOSED: the canonical write was extracted into
  // the transport-neutral `createJournalEntryCore` (owner-approved 2026-08-29
  // §6), so a verified draft now becomes the SAME append-only, hash-chained,
  // pipeline-awaited save the web composer performs — as the caller, under
  // the caller's RLS, with the identical FormData mapping the conversation
  // executor uses (worker-executors.ts "worker.log-work"). No fork.
  exposed: true,
  inputSchema: journalConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = journalConfirmInput.parse(input);
    const { confirmationToken, ...draft } = parsed;
    const verdict = verifyConfirmationToken(capabilityTokenSecret(), confirmationToken, {
      actionId: "journal.confirm",
      input: draft,
      userId: caller.userId,
      currentStateFingerprint: DRAFT_STATE_FINGERPRINT,
      nowMs: Date.now(),
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message: `Confirmation token rejected (${verdict.reason}). Draft again.`,
      };
    }

    const t = await getTranslations({
      locale: caller.locale,
      namespace: "journal.errors",
    });
    const result = await createJournalEntryCore(
      { supabase: caller.supabase, userId: caller.userId, t },
      fd({
        locale: caller.locale,
        engagement_context_id: draft.engagementContextId,
        notes: draft.notes,
        work_date: draft.workDate,
        site_name: draft.siteName ?? "",
      }),
    );
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    return {
      ok: true,
      data: {
        entryId: result.entryId,
        // The REAL awaited pipeline outcome — read through, never invented.
        skills: {
          status: result.skills.status,
          added: result.skills.added,
          strengthened: result.skills.strengthened,
          reviewNeeded: result.skills.reviewNeeded,
          claimsSaved: result.skills.claimsSaved,
          cvUpdated: result.skills.cvUpdated,
        },
      },
    };
  },
};

// ── the registry ───────────────────────────────────────────────────────────

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  profileGet,
  livingCvSkillsGet,
  journalCreateDraft,
  journalConfirm,
];

export function listCapabilities(): readonly CapabilityDescriptor[] {
  return CAPABILITIES;
}

export function exposedCapabilities(): readonly CapabilityDescriptor[] {
  return CAPABILITIES.filter((c) => c.exposed);
}

/**
 * Validate and run one capability as `caller`. The ONLY execution path —
 * adapters translate protocol, they never reach a handler directly.
 */
export async function runCapability(
  id: string,
  caller: CapabilityCaller,
  rawInput: unknown,
): Promise<ExecResult> {
  const capability = CAPABILITIES.find((c) => c.id === id);
  if (!capability) {
    return { ok: false, code: "unknown_capability", message: `No capability "${id}".` };
  }
  const parsed = capability.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  try {
    return await capability.run(caller, parsed.data);
  } catch {
    // A thrown handler is an infrastructure fact, not a caller fact.
    return { ok: false, code: "unavailable", message: "Capability failed to run." };
  }
}
