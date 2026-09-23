"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Paperclip, ArrowUp, FileText, X } from "lucide-react";

import { iconControl, iconInline } from "./icon-scale";

/** What the paperclip offers in the OS picker: exactly the types some existing
 *  door takes (journal photo, document file, CV reader). No forced `capture`
 *  — a phone offers camera AND library, and the person chooses. */
export const COMPOSER_ATTACH_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,.docx,.txt";

/** Grow ceiling. Past this the textarea scrolls internally instead of eating
 *  the thread — roughly nine lines at the 16px body size. */
const MAX_HEIGHT = 200;

/** Floor — the 44px touch-target minimum, enforced in JS rather than by a CSS
 *  `min-height`.
 *
 *  With a CSS floor the FIRST `scrollHeight` read is inflated by it (a browser
 *  reports `scrollHeight >= clientHeight`, and `clientHeight` obeys
 *  `min-height`), so the box measured 52px on mount and 50px after the first
 *  send — a visible 2px shrink the moment you sent your first message. One
 *  source of truth removes the disagreement entirely. */
const MIN_HEIGHT = 44;

/**
 * Chat composer — the persistent bottom input of the conversation. Text box +
 * file attach + send. Sticky to the viewport bottom; the keyboard never covers
 * it (the layout keeps it in flow at the bottom of a flex column).
 *
 * AUTO-GROW. It used to be `rows={1}` with `max-h-40` and no height sync, so a
 * four-line message scrolled inside a 44px box and the user could not see what
 * they had written. The height is now driven off `scrollHeight` on every value
 * change, capped at MAX_HEIGHT, after which the internal scrollbar takes over.
 *
 * The measurement runs in `useLayoutEffect` so it lands before paint — a plain
 * `useEffect` would let the browser paint the un-grown box first and the field
 * would visibly jump on every keystroke. Height is reset to `auto` before
 * reading `scrollHeight`, because on an already-tall box that property reports
 * the OLD height: without the reset the field could only ever grow, never
 * shrink back when text is deleted or after a send. The 44px floor is applied
 * in JS for the same reason — see MIN_HEIGHT.
 */
export function Composer({
  placeholder,
  attachLabel,
  sendLabel,
  disabled = false,
  onSend,
  onAttachFile,
  pendingAttachment = null,
  onRemoveAttachment,
  attachRemoveLabel,
  attachSelectedLabel,
  variant = "bar",
  prefill,
}: {
  placeholder: string;
  attachLabel: string;
  sendLabel: string;
  disabled?: boolean;
  onSend: (text: string) => void;
  /** A sentence handed to the person to SEND THEMSELVES — the `?say=` hand-off
   *  when the link did not come through our own door (QA Q-4, see
   *  `referrerIsOurOwnDoor` in conversation-chat). Placed into the box and
   *  focused; the composer never sends it. Text already typed stays ahead of
   *  it, so nothing the person wrote is lost either. */
  prefill?: string;
  /**
   * THE PAPERCLIP ATTACHES A FILE (owner P0 2026-09-23, CASE 5/7).
   *
   * It used to be a flow launcher: a click opened a work-log photo form or a
   * CV importer, and no file was ever picked, shown or classified here. The
   * click now opens the OS file picker; the picked file is handed up as-is.
   * What it is FOR is decided by the conversation (which asks), and nothing
   * is uploaded until the chosen flow's own confirm — until then the file
   * exists only in this browser tab.
   */
  onAttachFile?: (file: File) => void;
  /** The ONE file waiting for "what is this file for?". Held by the
   *  conversation, not here: the inline and the bar composer are different
   *  mounts, and the chip must survive the switch between them. */
  pendingAttachment?: File | null;
  onRemoveAttachment?: () => void;
  attachRemoveLabel?: string;
  attachSelectedLabel?: string;
  /** "bar" = the sticky bottom bar; "inline" = the same control rendered
   *  inside the centred opening composition (owner audit §4.1) — no border,
   *  no backdrop, it is part of the greeting, not chrome. */
  variant?: "bar" | "inline";
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  // The pending image's thumbnail — the work-log flow's preview rule, kept
  // identical: ONLY a browser-minted `blob:` URL, minted from a NAMELESS Blob
  // (bytes + MIME type, never the DOM-supplied file name), revoked whenever it
  // is replaced or the composer unmounts.
  useEffect(() => {
    if (!pendingAttachment || !/^image\/(jpeg|png|webp)$/.test(pendingAttachment.type)) {
      setThumb(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([pendingAttachment], { type: pendingAttachment.type }),
    );
    setThumb(url.startsWith("blob:") ? url : null);
    return () => URL.revokeObjectURL(url);
  }, [pendingAttachment]);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // The app sets `box-sizing: border-box` globally, so an inline `height`
    // INCLUDES the border while `scrollHeight` excludes it. Setting height =
    // scrollHeight therefore lost the border on every cycle: the box measured
    // 52px on mount and 50px after the first send. Add the border back and the
    // measurement is stable across every resize.
    const cs = getComputedStyle(el);
    const border =
      parseFloat(cs.borderTopWidth || "0") + parseFloat(cs.borderBottomWidth || "0");
    const content = el.scrollHeight + border;
    const next = Math.min(Math.max(content, MIN_HEIGHT), MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = content > MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  // Before paint, on every value change — including the reset after a send.
  useLayoutEffect(resize, [value, resize]);

  // Measure the starting height once mounted rather than assuming it: the same
  // component renders at different font sizes across breakpoints.
  useEffect(resize, [resize]);

  // PRE-HYDRATION SALVAGE (owner visual acceptance P0-4). On a slow load the
  // user can focus this textarea and type BEFORE React hydrates; the DOM then
  // holds their text while the controlled value is still "". The first
  // controlled re-render would silently erase what they wrote — in production
  // a whole message vanished this way. Adopting the DOM value once on mount
  // makes the typed text the state instead of losing the race to it.
  useEffect(() => {
    const el = ref.current;
    if (el && el.value) setValue((prev) => (prev ? prev : el.value));
  }, []);

  // The hand-off fallback (QA Q-4): the sentence appears in the box, the box
  // takes focus, and the person decides whether to send it. Never dropped,
  // never sent on their behalf.
  useEffect(() => {
    if (!prefill) return;
    setValue((prev) => (prev.trim() ? `${prev}\n${prefill}` : prefill));
    ref.current?.focus();
  }, [prefill]);

  function submit() {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue(""); // the layout effect shrinks the box back to one line
  }

  return (
    // `relative z-50` keeps the composer above the page's own stacked content.
    // It previously also had to out-rank the floating language-feedback button,
    // which sat on the send control and silently intercepted the tap; that
    // button is gone (it lives in the account menu now), so the only thing this
    // still guards is the composer's own bottom stack. Sending a message is the
    // primary action here and must never lose a hit-test.
    <div
      className={
        variant === "bar"
          ? "relative z-50 flex-none border-t border-ink-600 bg-ink-900/80 px-3 py-3 backdrop-blur"
          : "relative flex-none"
      }
    >
      {/* THE ONE PENDING ATTACHMENT — visible the moment the file is picked,
          so the pick itself is the feedback (a click that only posted another
          assistant bubble is why people clicked again). Name, an image
          thumbnail, and a way to drop it; nothing has been uploaded yet. */}
      {pendingAttachment ? (
        <div className="mx-auto mb-2 flex w-full max-w-3xl">
          <div
            role="status"
            aria-live="polite"
            data-testid="composer-attachment"
            className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-ink-500 bg-ink-800 py-0.5 pl-1.5 text-support text-text-primary"
          >
            {thumb?.startsWith("blob:") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                // Re-checked AT the sink: a local object URL is the only
                // thing this thumbnail may ever load.
                src={thumb}
                alt=""
                className="size-8 flex-none rounded-full border border-ink-500 object-cover"
              />
            ) : (
              <FileText {...iconInline("flex-none text-text-muted")} aria-hidden />
            )}
            {attachSelectedLabel ? <span className="sr-only">{attachSelectedLabel}:</span> : null}
            <span className="min-w-0 truncate" data-testid="composer-attachment-name">
              {pendingAttachment.name}
            </span>
            {onRemoveAttachment ? (
              <button
                type="button"
                onClick={onRemoveAttachment}
                aria-label={attachRemoveLabel}
                data-testid="composer-attachment-remove"
                className="ua-press flex size-11 flex-none items-center justify-center rounded-full text-text-secondary hover:text-brand-blue"
              >
                <X {...iconControl()} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        {onAttachFile && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={COMPOSER_ATTACH_ACCEPT}
              tabIndex={-1}
              aria-hidden="true"
              data-testid="composer-attach-input"
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                // Reset, so picking the SAME file again still fires onChange.
                e.target.value = "";
                if (picked) onAttachFile(picked);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label={attachLabel}
              data-testid="composer-attach"
              className="ua-press flex size-11 flex-none items-center justify-center rounded-full border border-ink-500 text-text-secondary hover:border-brand-blue hover:text-brand-blue"
            >
              <Paperclip {...iconControl()} aria-hidden />
            </button>
          </>
        )}
        <textarea
          ref={ref}
          rows={1}
          aria-label={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Unchanged contract: Enter sends, Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          data-testid="composer-input"
          className="w-full resize-none rounded-bubble border border-ink-500 bg-ink-800 px-4 py-3 text-body text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label={sendLabel}
          data-testid="composer-send"
          className="ua-press flex size-11 flex-none items-center justify-center rounded-full bg-brand-blue text-text-on-brand transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp {...iconControl()} aria-hidden />
        </button>
      </div>
    </div>
  );
}
