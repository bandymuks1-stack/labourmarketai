import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";

/**
 * MULTI-STEP UNDERSTANDING — one sentence, an ordered plan (owner 2026-10-14
 * §4: "kelių žingsnių įrankių naudojimą pirmiausia užbaik per jau veikiančią
 * Gemini infrastruktūrą … naudok esamus įgaliojimus, ribok sąnaudas ir
 * reikalauk patvirtinimo rizikingiems veiksmams").
 *
 * WITHIN THE EXISTING GRANT. The model already receives the sentence, the
 * locale, the coarse identity and the intent catalogue (task
 * `propose_conversation_intent`). A plan adds NOTHING to what leaves the
 * platform: it is the same single call, answered with up to three catalogue
 * ids instead of one. Tool RESULTS never go back to the model — the product
 * runs each step itself, under the person's own permissions.
 *
 * WITHIN THE EXISTING AUTHORITY. Every step is an id the registry already
 * owns, run by the SAME handler the deterministic path runs. The rule is
 * deliberately narrow:
 *   - 2–3 distinct steps;
 *   - every step is a READ, except that the LAST may be a WRITE — and a write
 *     handler only opens the existing draft → confirm card; nothing is saved
 *     until the person confirms it;
 *   - no ROUTE step (it navigates away and would strand the rest) and no
 *     BLOCKED step.
 * Anything else is not a plan, and the caller falls back to one intent.
 *
 * THE PERSON'S OWN WORDS. Each step's label is a span copied verbatim out of
 * the person's sentence — accepted only if it really occurs there — so the
 * plan reads back what they asked, in their language, without a new
 * vocabulary. A span that does not occur is dropped (label null → the surface
 * shows a neutral "step n of N").
 *
 * Pure: no IO, no clock, no model call.
 */
export const PLAN_MAX_STEPS = 3;
export const PLAN_LABEL_MAX = 60;

export type PlanStep = { readonly intent: RoutedIntent; readonly label: string | null };

function isRouted(v: unknown): v is RoutedIntent {
  return typeof v === "string" && v !== "unknown" && Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, v);
}

function ownWords(words: unknown, sentence: string): string | null {
  if (typeof words !== "string") return null;
  const w = words.trim().slice(0, PLAN_LABEL_MAX);
  if (w.length < 2) return null;
  return sentence.toLocaleLowerCase().includes(w.toLocaleLowerCase()) ? w : null;
}

/** A valid ordered plan, or null when the proposal is not one. */
export function validatePlan(raw: unknown, sentence: string): PlanStep[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > PLAN_MAX_STEPS) return null;
  const steps: PlanStep[] = [];
  const seen = new Set<string>();
  for (const [i, item] of raw.entries()) {
    const intent = (item as { intent?: unknown } | null)?.intent;
    if (!isRouted(intent) || seen.has(intent)) return null;
    seen.add(intent);
    const access = INTENT_REGISTRY[intent].access;
    const last = i === raw.length - 1;
    if (access === "read" || (access === "write" && last)) {
      steps.push({ intent, label: ownWords((item as { words?: unknown }).words, sentence) });
      continue;
    }
    return null;
  }
  return steps;
}
