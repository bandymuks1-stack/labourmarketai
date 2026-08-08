"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { usePathname } from "@/lib/i18n/navigation";
import { submitLanguageFeedback } from "@/lib/language-feedback/actions";
import { recordEvent } from "@/lib/telemetry/task";

/**
 * Tester-feedback reporting. Mounted inside the dashboard layout so it's only
 * reachable from authenticated sessions — no public landing/login exposure. The
 * DB-side RLS (`is_admin()` SELECT) keeps the inbox private even if the flow is
 * ever surfaced publicly later.
 *
 * Workflow:
 *   1. Tester (optionally) highlights a confusing word/section on the page.
 *   2. Opens "Pranešti apie problemą" from the account menu.
 *   3. Modal opens with the captured selection prefilled (read-only),
 *      route + locale stamped, and a comment textarea.
 *   4. Submit hits `submitLanguageFeedback` → row in language_feedback
 *      with status='open', visible only to admins.
 *
 * THERE IS NO FLOATING TRIGGER ANY MORE, and that is the point.
 *
 * The control was a fixed-position pill, and a fixed-position pill always
 * covers something. The history is three separate workarounds for one cause:
 *   - it sat on the conversation composer's send button and silently
 *     intercepted the tap, which is why `--feedback-fab-bottom` was invented so
 *     the composer could shove it out of the way;
 *   - it was hidden outright on /dashboard/market-map, because it obstructed
 *     the map controls;
 *   - at 412px on /dashboard/planning it covered three calendar cells — and
 *     shrinking it to a 36px icon to cover fewer had already made it
 *     undiscoverable, which is the defect the previous commit fixed.
 * Discoverability and non-obstruction cannot both be won by tuning the geometry
 * of something that floats over the page.
 *
 * The trigger now lives in the ACCOUNT MENU: one predictable place, present in
 * the header on every dashboard route at every width, already a 44px target,
 * and it covers nothing. All three workarounds above are deleted with it, and
 * reporting became available on the map surface, where it never was.
 *
 * The menu is a client component in the header and this modal is mounted by the
 * layout, so they are not in one React tree; the menu opens this via a window
 * event. That is deliberately the smallest possible coupling — no new provider,
 * no context threaded through server components, nothing else can grow on it.
 */
export const FEEDBACK_OPEN_EVENT = "labourmarket:feedback-open";

export function LanguageFeedbackWidget() {
  const t = useTranslations("languageFeedback");
  const locale = useLocale();
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The account menu's "report a problem" item opens this. Registered before
  // any early return below, so the listener exists on EVERY dashboard route —
  // a menu item that silently does nothing on one surface is worse than no
  // menu item.
  useEffect(() => {
    const onOpen = () => {
      recordEvent("language_feedback_opened");
      setOpen(true);
    };
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
  }, []);

  // When the modal opens, capture the current window selection (≤240 chars)
  // and focus the comment textarea. The selection is read-only inside the
  // modal — the tester can't tamper with what they highlighted.
  useEffect(() => {
    if (!open) return;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    const raw = sel?.toString().trim() ?? "";
    setSelectedText(raw.slice(0, 240));
    // Defer focus to next tick so the textarea is mounted.
    queueMicrotask(() => textareaRef.current?.focus());
  }, [open]);

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitLanguageFeedback({
        route: pathname,
        locale,
        selectedText: selectedText || null,
        comment,
      });
      if (!result.ok) {
        setError(result.message);
        recordEvent("language_feedback_submitted", {
          result_kind: result.code,
        });
        return;
      }
      recordEvent("language_feedback_submitted", {
        result_kind: "success",
        had_selection: selectedText.length > 0,
        comment_length: comment.length,
      });
      setSavedAt(Date.now());
      setComment("");
      setSelectedText("");
      // Auto-close after a short delay so the tester sees confirmation.
      setTimeout(() => {
        setOpen(false);
        setSavedAt(null);
      }, 1500);
    });
  }

  // The map surface no longer needs an exception: with no floating control
  // there is nothing to obstruct the map, so reporting works there too.

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="language-feedback-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="card-border flex w-full max-w-md flex-col gap-4 bg-ink-900 p-5">
            <header className="flex flex-col gap-1">
              <h2
                id="language-feedback-title"
                className="font-display text-lg font-semibold text-text-primary"
              >
                {t("title")}
              </h2>
              <p className="text-xs leading-relaxed text-text-secondary">
                {t("intro")}
              </p>
            </header>

            <dl className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3 text-meta text-text-secondary">
              <div className="flex justify-between gap-3">
                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("routeLabel")}
                </dt>
                <dd className="truncate text-right font-mono text-text-primary">
                  {pathname}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("localeLabel")}
                </dt>
                <dd className="font-mono text-text-primary">{locale}</dd>
              </div>
            </dl>

            {selectedText ? (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("selectedLabel")}
                </span>
                <blockquote className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs italic leading-relaxed text-text-primary">
                  &bdquo;{selectedText}&ldquo;
                </blockquote>
              </div>
            ) : (
              <p className="text-meta leading-relaxed text-text-muted">
                {t("noSelectionHint")}
              </p>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("commentLabel")}
              </span>
              <textarea
                ref={textareaRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={1000}
                required
                placeholder={t("commentPlaceholder")}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                data-testid="language-feedback-comment"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger"
                data-testid="language-feedback-error"
              >
                {error}
              </p>
            )}
            {savedAt !== null && (
              <p
                role="status"
                className="rounded-md border border-state-success/40 bg-state-success/5 px-3 py-2 text-xs text-state-success"
                data-testid="language-feedback-success"
              >
                ✓ {t("savedTitle")}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-meta uppercase tracking-label text-text-muted hover:text-text-primary"
              >
                {t("cancel")}
              </button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={pending || comment.trim().length < 3}
              >
                {pending ? t("submitting") : t("submit")}
              </Button>
            </div>
            <p className="text-meta leading-relaxed text-text-muted">
              {t("privacyNote")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
