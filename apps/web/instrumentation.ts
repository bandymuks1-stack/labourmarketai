/**
 * Server instrumentation (FINAL COMPLETION Train L1, 2026-09-02).
 *
 * `onRequestError` is Next.js's hook for every uncaught server error (route
 * handlers, server components, server actions, middleware). Until now those
 * reached Vercel's logs only as whatever the framework printed. This writes
 * ONE structured, PII-free JSON line per error so a log drain / alert rule
 * can match on `lm.event = "request_error"` and group by route + error name:
 *
 *   { lm: { event: "request_error", route, method, kind, name, digest } }
 *
 * What is deliberately NOT logged: the URL query string (may carry `next`,
 * ids, tokens), headers, cookies, the request body, the user, the error
 * message (free-form text can echo input). `digest` is Next's stable hash for
 * the error, which is what the error boundary shows a person — so a report
 * quoting a digest can be matched to this line without any of the above.
 *
 * No vendor SDK: the sink is stdout → Vercel logs (and any drain the owner
 * attaches). Choosing a monitoring vendor is a separate, owner-visible step
 * (docs/operations/observability-v1.md); nothing here has to change for it.
 */

type RequestErrorContext = {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "middleware";
  renderSource?: string;
  revalidateReason?: "on-demand" | "stale" | undefined;
  renderType?: string;
};

type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

function boundedName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const n = (error as { name?: unknown }).name;
    if (typeof n === "string" && /^[A-Za-z]{1,60}$/.test(n)) return n;
  }
  return "Error";
}

function digestOf(error: unknown): string | null {
  if (error && typeof error === "object" && "digest" in error) {
    const d = (error as { digest?: unknown }).digest;
    if (typeof d === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(d)) return d;
  }
  return null;
}

/** The route pattern (`/[locale]/dashboard/...`), never the concrete URL. */
function boundedRoute(context: RequestErrorContext, request: RequestInfo): string {
  const pattern = context.routePath || request.path.split("?")[0] || "";
  return pattern.slice(0, 160);
}

export async function onRequestError(
  error: unknown,
  request: RequestInfo,
  context: RequestErrorContext,
): Promise<void> {
  const line = {
    lm: {
      event: "request_error",
      route: boundedRoute(context, request),
      method: request.method,
      kind: context.routeType,
      name: boundedName(error),
      digest: digestOf(error),
      at: new Date().toISOString(),
    },
  };
  // One line, JSON, stdout — the cheapest sink that survives every runtime.
  console.error(JSON.stringify(line));
}

export async function register(): Promise<void> {
  // Nothing to initialise: no vendor SDK. The hook above is the instrumentation.
}
