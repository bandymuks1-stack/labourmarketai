import {
  browserFamily,
  sanitizeClientErrorReport,
  type ClientErrorKind,
} from "@/lib/telemetry/client-error-report";

/**
 * Send one crash report from an error boundary (client only). Fire-and-forget:
 * `sendBeacon` survives the page being left or reloaded, and nothing here may
 * throw — a reporter that crashes inside an error boundary would hand the
 * person Next's dead error shell, the very thing it exists to catch.
 * At most three reports per page load.
 */
let sent = 0;

export function reportClientError(
  kind: ClientErrorKind,
  error: { name?: string; message?: string; digest?: string } | null | undefined,
): void {
  try {
    if (typeof window === "undefined" || sent >= 3) return;
    const report = sanitizeClientErrorReport({
      kind,
      name: error?.name,
      message: error?.message,
      digest: error?.digest,
      route: window.location.pathname,
      browser: browserFamily(navigator.userAgent),
    });
    if (!report) return;
    sent++;
    const body = JSON.stringify(report);
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/client-errors", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never let reporting break the page
  }
}
