/**
 * THE EARLIEST CRASH REPORTER (2026-10-18 incident).
 *
 * The incident's crash happened while a module was being evaluated — before
 * React, before any error boundary, so no boundary could ever report it. This
 * inline script runs in <head> (app/[locale]/layout.tsx, right after the regex
 * compatibility shim) and listens for exactly the failures no boundary sees:
 *   - an uncaught error (`error` on window), including module evaluation;
 *   - an unhandled promise rejection;
 *   - a script or stylesheet that failed to load (a missing chunk after a
 *     deploy) — images and other resources are ignored on purpose.
 *
 * It sends the error class, a short message prefix and the path (never the
 * query string or hash) to /api/client-errors, at most three times per page.
 * The server sanitises again and logs one line; it stores nothing. Plain
 * ES2015, no build step, and it never throws.
 */
export const CLIENT_ERROR_EARLY_SCRIPT = `(function () {
  var sent = 0;
  function send(kind, name, message) {
    if (sent >= 3) return;
    sent++;
    try {
      var body = JSON.stringify({
        kind: kind,
        name: String(name || "Error").slice(0, 40),
        message: String(message || "").slice(0, 300),
        route: location.pathname
      });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
    } catch (e) {}
  }
  window.addEventListener("error", function (event) {
    try {
      var t = event.target;
      if (t && t !== window && t.tagName) {
        var tag = String(t.tagName).toLowerCase();
        if (tag === "script" || (tag === "link" && t.rel === "stylesheet")) {
          var src = String(t.src || t.href || "").split("?")[0].replace(/^https?:\\/\\/[^/]+/, "");
          send("window", "ResourceLoadError", tag + " " + src);
        }
        return;
      }
      var error = event.error;
      send("window", error && error.name, error && error.message ? error.message : event.message);
    } catch (e) {}
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    try {
      var reason = event.reason;
      send("rejection", reason && reason.name, reason && reason.message ? reason.message : String(reason));
    } catch (e) {}
  });
})();`;
