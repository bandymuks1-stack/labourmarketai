/**
 * Participation recognition (v1) — PURE. Classifies whether an action is a
 * MEANINGFUL contribution (improves match quality, trust or documentation) and,
 * if so, builds an honest private progress message (an i18n code + count param,
 * never raw text, never a fabricated streak).
 *
 * Honesty rules enforced here:
 *   - An empty login (or any non-meaningful action) returns null → no reward.
 *   - The message reflects only what REALLY improved (the `improved` field keys).
 *
 * Delivering this message to a user requires a system→user message channel that
 * does NOT exist yet (communication is bilateral) — that delivery + any
 * company-owner/team message is owner-approval-gated (audit §D). This module only
 * produces the message value.
 */
import type {
  MeaningfulAction,
  ParticipationActor,
  ParticipationEvent,
  PrivateProgressMessage,
} from "./types";

const MEANINGFUL_ACTIONS: ReadonlySet<string> = new Set<MeaningfulAction>([
  "worker_added_availability",
  "worker_added_location",
  "worker_added_experience",
  "worker_added_photos",
  "worker_updated_cv",
  "worker_confirmed_skills",
  "worker_responded_request",
  "company_completed_job_fields",
  "company_added_conditions",
  "company_updated_offer",
  "user_added_project_photos",
  "user_reduced_missing_fields",
]);

export interface ParticipationInput {
  /** Raw action id (may be an empty login or any string). */
  readonly action: string;
  readonly actor: ParticipationActor;
  /** Field keys that genuinely improved (empty → nothing actually changed). */
  readonly improved?: readonly string[];
}

/**
 * Classify an action. Returns a ParticipationEvent ONLY for a recognized
 * meaningful action that actually improved something; otherwise null (no reward
 * for empty logins or no-op actions).
 */
export function classifyParticipation(
  input: ParticipationInput,
): ParticipationEvent | null {
  if (!MEANINGFUL_ACTIONS.has(input.action)) return null;
  const improved = input.improved ?? [];
  if (improved.length === 0) return null;
  return {
    action: input.action as MeaningfulAction,
    actor: input.actor,
    improved,
  };
}

/** Honest private appreciation — i18n code + count, never a fabricated streak. */
export function buildPrivateProgressMessage(
  event: ParticipationEvent,
): PrivateProgressMessage {
  const code =
    event.actor === "worker"
      ? "marketRecognition.progress.worker"
      : event.actor === "company"
        ? "marketRecognition.progress.company"
        : "marketRecognition.progress.buyer";
  return { code, params: { count: event.improved.length } };
}
