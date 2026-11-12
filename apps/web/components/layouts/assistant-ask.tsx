"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * ASK THE ASSISTANT — the always-visible input of the public inner pages
 * (owner V2, coordinator decision 2026-11-12).
 *
 *   desktop (`lg` up): one field in the header row;
 *   phone and tablet:  a bar fixed to the bottom of the screen, taken away
 *                      while another form field has focus so it never sits
 *                      on top of a keyboard or a form being filled.
 *
 * The landing does NOT mount it: its first screen already has the one
 * sentence field. Both send the words the same way — to the conversation
 * home with the sentence in the address (`/dashboard?say=…`). A signed-in
 * person lands in the conversation with it; a signed-out visitor is sent to
 * sign in and arrives with it afterwards, through the existing return path.
 *
 * It is a plain GET form: it works before the page's scripts load, and its
 * feedback is the navigation itself. Every label arrives from the server.
 */
export function AssistantAsk({
  variant,
  action,
  name,
  maxLength,
  label,
  placeholder,
  submitLabel,
}: {
  variant: "header" | "bar";
  /** Locale-prefixed path of the conversation home. */
  action: string;
  /** The query parameter the conversation reads the sentence from. */
  name: string;
  maxLength: number;
  label: string;
  placeholder: string;
  submitLabel: string;
}) {
  const rootRef = useRef<HTMLFormElement>(null);
  // Bar only: true while a form field OUTSIDE the bar has focus.
  const [fieldBusy, setFieldBusy] = useState(false);

  useEffect(() => {
    if (variant !== "bar") return;
    const isField = (el: Element | null) =>
      !!el &&
      (el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLInputElement &&
          !["button", "submit", "checkbox", "radio", "range", "file"].includes(el.type)) ||
        (el instanceof HTMLElement && el.isContentEditable));
    const update = () => {
      const el = document.activeElement;
      setFieldBusy(isField(el) && !rootRef.current?.contains(el));
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [variant]);

  const field = (
    <>
      <MessageCircle aria-hidden className="h-4 w-4 shrink-0 text-brand-blue" />
      <input
        type="text"
        name={name}
        required
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint="send"
        aria-label={label}
        placeholder={placeholder}
        className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
      />
      <button
        type="submit"
        className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-brand-blue transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none"
      >
        {submitLabel}
      </button>
    </>
  );
  const shell =
    "flex min-w-0 items-center gap-2 rounded-full border border-ink-500 bg-ink-800/70 pl-3.5 pr-1 focus-within:border-brand-blue";

  if (variant === "header") {
    return (
      <form
        ref={rootRef}
        method="get"
        action={action}
        role="search"
        aria-label={label}
        data-testid="header-ask"
        className={cn(shell, "hidden w-full max-w-md lg:flex")}
      >
        {field}
      </form>
    );
  }
  return (
    <div
      data-testid="bottom-ask"
      data-hidden={fieldBusy || undefined}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-ink-600 bg-ink-900/95 px-3 pt-2 backdrop-blur-md lg:hidden",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        fieldBusy && "hidden",
      )}
    >
      <form
        ref={rootRef}
        method="get"
        action={action}
        role="search"
        aria-label={label}
        className={cn(shell, "mx-auto max-w-2xl")}
      >
        {field}
      </form>
    </div>
  );
}
