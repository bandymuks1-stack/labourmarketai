import type { ConsoleMessage, Frame, Page, Request, Response } from "@playwright/test";

/**
 * What the page did after "create need", for the run log when the confirmation
 * does not show (run 45241051644: the need was saved and matched within 6 s, the
 * page showed neither the confirmation nor the limit, and nothing said why).
 * Status codes, content types, error texts and test ids only — no page text.
 */
export function watchNeedSubmit(page: Page): { report: () => Promise<string>; stop: () => void } {
  const t0 = Date.now();
  const events: string[] = [];
  const at = () => `${Math.round((Date.now() - t0) / 100) / 10}s`;
  const onResponse = (r: Response) => {
    if (r.request().method() !== "POST") return;
    events.push(`${at()} POST ${new URL(r.url()).pathname} ${r.status()} ${r.headers()["content-type"] ?? "-"}`);
  };
  const onFailed = (q: Request) => {
    if (q.method() === "POST") events.push(`${at()} POST ${new URL(q.url()).pathname} failed: ${q.failure()?.errorText ?? "?"}`);
  };
  const onNav = (f: Frame) => {
    if (f === page.mainFrame()) events.push(`${at()} navigated ${new URL(f.url()).pathname}`);
  };
  const onError = (e: Error) => events.push(`${at()} pageerror ${e.message.slice(0, 200)}`);
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() === "error") events.push(`${at()} console.error ${m.text().slice(0, 200)}`);
  };
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  page.on("framenavigated", onNav);
  page.on("pageerror", onError);
  page.on("console", onConsole);
  const stop = () => {
    page.off("response", onResponse);
    page.off("requestfailed", onFailed);
    page.off("framenavigated", onNav);
    page.off("pageerror", onError);
    page.off("console", onConsole);
  };
  return {
    stop,
    report: async () => {
      stop();
      const state = await page
        .evaluate(() => ({
          path: location.pathname,
          mains: document.querySelectorAll("main").length,
          ids: Array.from(document.querySelectorAll("[data-testid^='demand-']"))
            .map((e) => `${e.getAttribute("data-testid")}${e.closest("main") ? "" : "(outside main)"}`)
            .filter((id) => !/^demand-(status|visibility|resume)-/.test(id))
            .slice(0, 25),
          create: document.querySelector("[data-testid='demand-create']")?.textContent?.trim().slice(0, 40) ?? null,
          alerts: Array.from(document.querySelectorAll("[role='alert']")).map((e) => (e.textContent ?? "").trim().slice(0, 120)),
        }))
        .catch((e: unknown) => ({ unreadable: String(e).slice(0, 120) }));
      return `${JSON.stringify(state)} | ${events.join(" ; ") || "no events"}`;
    },
  };
}

