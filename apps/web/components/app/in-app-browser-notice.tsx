"use client";

import { useEffect, useState } from "react";

import { detectInAppBrowser } from "@/lib/browser/geo-capability";

/**
 * Shown on the sign-up and sign-in pages ONLY inside an app's built-in browser
 * (Facebook, Instagram, LinkedIn, an Android webview…). Google refuses to sign
 * people in from those browsers and shows its own refusal page, from which
 * there is no way back here — so the person is told before they press the
 * button, and pointed at what works: the phone's own browser, or e-mail and
 * password on this page. Nothing is hidden or disabled: some in-app browsers
 * do complete the sign-in, and the choice stays the person's.
 *
 * The user agent is read after mount, so the server markup and the first
 * client render are identical (no hydration mismatch) and an ordinary browser
 * never renders anything.
 */
export function InAppBrowserNotice({ text }: { readonly text: string }) {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(detectInAppBrowser(window.navigator.userAgent) !== null);
  }, []);
  if (!inApp) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
      data-testid="auth-inapp-browser-notice"
    >
      {text}
    </p>
  );
}
