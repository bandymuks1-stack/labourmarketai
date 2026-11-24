"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Tester language-feedback submission. Anyone who can render the widget
 * (currently: authenticated dashboard surfaces) may file a "this copy is
 * confusing" report; the row goes into `public.language_feedback` and is
 * visible only to admins via the inbox at
 * `/[locale]/dashboard/admin/language-feedback`.
 *
 * The contract is a tagged result so the widget can render precise LT/EN
 * messages — never a thrown server-action digest (matches the journal
 * save pattern from PR #61).
 */
export type SubmitLanguageFeedbackInput = {
  route: string;
  locale: string;
  /** The text snippet the tester highlighted before opening the widget,
   *  if any. Capped at 240 chars server-side so a runaway paste can't
   *  blow up the row. */
  selectedText?: string | null;
  comment: string;
};

export type SubmitLanguageFeedbackResult =
  | { ok: true }
  | { ok: false; code: SubmitLanguageFeedbackErrorCode; message: string };

export type SubmitLanguageFeedbackErrorCode =
  | "comment_required"
  | "comment_too_long"
  | "route_required"
  | "rate_limited"
  | "insert_failed"
  | "unknown_error";

const COMMENT_MIN = 3;
const COMMENT_MAX = 1000;
const SELECTED_MAX = 240;

export async function submitLanguageFeedback(
  input: SubmitLanguageFeedbackInput,
): Promise<SubmitLanguageFeedbackResult> {
  const comment = (input.comment ?? "").trim();
  const route = (input.route ?? "").trim().slice(0, 240);
  const locale = (input.locale ?? "lt").trim().slice(0, 16);
  const selectedText = input.selectedText
    ? input.selectedText.trim().slice(0, SELECTED_MAX)
    : null;

  if (!route) {
    return {
      ok: false,
      code: "route_required",
      message: "Trūksta maršruto adreso — bandykite dar kartą iš to paties puslapio.",
    };
  }
  if (comment.length < COMMENT_MIN) {
    return {
      ok: false,
      code: "comment_required",
      message: "Įveskite trumpą paaiškinimą (bent 3 simboliai).",
    };
  }
  if (comment.length > COMMENT_MAX) {
    return {
      ok: false,
      code: "comment_too_long",
      message: `Paaiškinimas per ilgas (riba — ${COMMENT_MAX} simboliai).`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // The generated Supabase types don't include `language_feedback` until
  // `pnpm db:types` is re-run after 0019 is applied. Cast supabase.from
  // through `any` for this call so the static name check passes; RLS
  // still enforces row-level ownership + admin-only SELECT at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (
    name: string,
  ) => {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message?: string } | null;
    }>;
  };
  // WRITE ONLY — never read the row back.
  //
  // This used to be `.insert(...).select("id").single()`. `RETURNING` is
  // evaluated under the SELECT policy, and this table's SELECT policy is
  // `is_admin()` — so for every ordinary user Postgres rejected the whole
  // statement with "new row violates row-level security policy" and rolled the
  // insert back. The reporting mechanism therefore worked for administrators
  // and for nobody else: exactly the people it exists for could not file a
  // report, and the inbox stayed empty. Proven directly against the database —
  // the same INSERT succeeds without `RETURNING` and fails with it.
  //
  // Nothing consumed the returned id, so the fix is to stop asking for it.
  const { error } = await fromAny("language_feedback").insert({
    route,
    locale,
    selected_text: selectedText,
    comment,
    user_id: userId,
  });

  if (error) {
    console.error("[language-feedback] insert failed:", error?.message);
    return {
      ok: false,
      code: "insert_failed",
      message: `Pranešimo išsiųsti nepavyko: ${error?.message ?? "nežinoma klaida"}`,
    };
  }
  return { ok: true };
}
