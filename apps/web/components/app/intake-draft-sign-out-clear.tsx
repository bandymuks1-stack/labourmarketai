"use client";

import { useEffect } from "react";

import { clearQuickRecordDraft } from "@/lib/journal/quick-record-draft";
import { clearWorkerIntakeDraft } from "@/lib/staffing/worker-intake-draft";

/** A sign-out entry point: a form posting to, or a link opening, `/<locale>/auth/logout`. */
export function isSignOutTarget(urlOrPath: string | null | undefined): boolean {
  if (!urlOrPath) return false;
  try {
    return /^\/[a-z]{2}(?:-[A-Za-z]{2,4})?\/auth\/logout\/?$/.test(new URL(urlOrPath, "https://x.invalid").pathname);
  } catch {
    return false;
  }
}

/**
 * Every sign-out removes the intake draft and the journal's started entry
 * from this browser (decision 0024, `lib/staffing/worker-intake-draft.ts`,
 * `lib/journal/quick-record-draft.ts`). The sign-out route itself is auth
 * core and is not touched: this listens, in the capture phase, for any form
 * submitted to it or any link opening it (the account menu, the account page,
 * the invitation page's switch-account link, and any added later).
 */
export function IntakeDraftSignOutClear() {
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (form instanceof HTMLFormElement && isSignOutTarget(form.getAttribute("action"))) {
        clearWorkerIntakeDraft();
        clearQuickRecordDraft();
      }
    };
    const onClick = (e: Event) => {
      const link = e.target instanceof Element ? e.target.closest("a") : null;
      if (link && isSignOutTarget(link.getAttribute("href"))) {
        clearWorkerIntakeDraft();
        clearQuickRecordDraft();
      }
    };
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
