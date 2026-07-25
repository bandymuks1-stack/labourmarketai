"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { usePathname } from "@/lib/i18n/navigation";
import { submitLanguageFeedback } from "@/lib/language-feedback/actions";
import { recordEvent } from "@/lib/telemetry/task";

/**
 * Floating tester-feedback widget. Mounted inside the dashboard layout so
 * it's only visible to authenticated sessions — no public landing/login
 * exposure. The DB-side RLS (`is_admin()` SELECT) keeps the inbox private
 * even if the widget is ever surfaced publicly later.
 *
 * Workflow:
 *   1. Tester highlights a confusing word/section anywhere on the page.
 *   2. Clicks the floating "Pranešti apie tekstą" pill.
 *   3. Modal opens with the captured selection prefilled (read-only),
 *      route + locale stamped, and a comment textarea.
 *   4. Submit hits `submitLanguageFeedback` → row in language_feedback
 *      with status='open', visible only to admins.
 */
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

  // On the map workspace the floating button would obstruct the map controls /
  // identity marker, so it is hidden there (the map is map-first). Feedback
  // stays available on every other page. (Hooks above always run first.)
  if (pathname.startsWith("/dashboard/market-map")) return null;

  return (
    <>
      {/* IA cleanup v2 (#11): reduced from an always-on wide pill that
          followed every page and covered content, to a small, low-profile
          icon-only report action. The label now lives in the tooltip /
          aria-label only, and it sits at lower opacity until hovered so it
          never competes with page content. The full report flow is unchanged. */}
      <button
        type="button"
        onClick={() => {
          recordEvent("language_feedback_opened");
          setOpen(true);
        }}
        /* The bottom offset reads `--feedback-fab-bottom` so a surface that
           owns the bottom of the viewport can push this button clear of its
           own controls. Each fallback reproduces the previous value exactly
           (5rem + safe-area on mobile, 1rem from `md:` up), so every existing
           page is unchanged. Arbitrary Tailwind values are used rather than an
           inline `style`, because an inline style would beat the `md:`
           breakpoint and pin the desktop button at the mobile offset.

           WHY IT IS A VARIABLE. A fixed `z-40` button pinned 5rem from the
           bottom sat directly on top of the conversation composer's send
           button on mobile, where the composer spans the full width — the FAB
           silently intercepted the click. Raising the composer's z-index fixes
           the click but buries the FAB, leaving an interactive control visible
           and unreachable. Neither control may lose: a surface with a bottom
           bar sets this variable to its own height so both stay usable. */
        className="fixed right-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-surface-1/70 text-xs text-text-muted opacity-60 shadow-sm backdrop-blur transition bottom-[var(--feedback-fab-bottom,calc(5rem+env(safe-area-inset-bottom)))] hover:border-brand-blue hover:text-text-primary hover:opacity-100 md:bottom-[var(--feedback-fab-bottom,1rem)]"
        data-testid="language-feedback-open"
        aria-label={t("openAria")}
        title={t("openLabel")}
      >
        <span aria-hidden>✎</span>
      </button>
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

            <dl className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3 text-[11px] text-text-secondary">
              <div className="flex justify-between gap-3">
                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("routeLabel")}
                </dt>
                <dd className="truncate text-right font-mono text-text-primary">
                  {pathname}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("localeLabel")}
                </dt>
                <dd className="font-mono text-text-primary">{locale}</dd>
              </div>
            </dl>

            {selectedText ? (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("selectedLabel")}
                </span>
                <blockquote className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs italic leading-relaxed text-text-primary">
                  &bdquo;{selectedText}&ldquo;
                </blockquote>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-text-muted">
                {t("noSelectionHint")}
              </p>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                className="font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-text-primary"
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
            <p className="text-[10px] leading-relaxed text-text-muted">
              {t("privacyNote")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
