"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { MarketMap } from "@/components/app/market-map/market-map";
import { loadMarketResultAction } from "@/lib/market-map/market-result-actions";
import type { MarketResultData } from "@/lib/market-map/market-result";

import {
  canRenderInline,
  getResult,
  type ResultContext,
  type ResultKind,
} from "@/lib/conversation/result-registry";

/**
 * RESULT BODY — what the Context Panel shows when the person asked for a
 * RESULT rather than selected an entity.
 *
 * The unified-product audit found the product had ~72 authenticated routes
 * because the conversation had nowhere to put an answer. The Context Panel was
 * already the right place (it is non-modal, it shares World State, and it never
 * navigates) — it simply only knew how to render entity context and work
 * context. This is the third thing it can render.
 *
 * HONESTY IS THE WHOLE DESIGN HERE. A result renders inline ONLY when its data
 * source has actually been verified (`dataReadiness: "real"` in the result
 * registry) AND it is meaningful in the active context. Otherwise the person is
 * NOT shown a premium-looking empty panel — they are told plainly that the full
 * screen is where this lives, and handed the way there.
 *
 * That fallback is deliberate and is the NO REGRESSION guarantee: every result
 * keeps its existing working route, so this work can never take a capability
 * away, only add an inline way to reach it.
 *
 * NO ROUTING HERE. `onOpenFull` is a callback the workspace layer wires — this
 * component, like the panel that hosts it, contains no `<Link>` and no router.
 */
export function ResultBody({
  kind,
  context,
  onOpenFull,
}: {
  kind: ResultKind;
  /** The active work context — a result not meaningful here is not rendered. */
  context: ResultContext;
  /** Wired by the workspace layer to reach the result's existing full screen. */
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const descriptor = getResult(kind);

  // An invented kind renders nothing at all rather than an error surface.
  if (!descriptor) return null;

  if (canRenderInline(kind, context)) {
    return <InlineResult kind={kind} />;
  }

  // Honest degradation — see the header note. The reason is stated, not hidden.
  return (
    <div className="flex flex-col gap-3" data-testid="result-body-fallback">
      <p className="text-basis text-text-secondary">
        {descriptor.dataReadiness === "unverified"
          ? t("fallbackUnverified")
          : t("fallbackContext")}
      </p>
      <button
        type="button"
        onClick={() => onOpenFull(descriptor.advancedRoute)}
        data-testid="result-body-open-full"
        className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
      >
        {t("openFull")}
      </button>
    </div>
  );
}

/**
 * The inline renderers, added one phase at a time as each result's data path is
 * verified. A kind reaches this function ONLY after passing `canRenderInline`,
 * so anything still unimplemented falls through to the same honest fallback
 * rather than rendering an empty premium shell.
 */
function InlineResult({ kind }: { kind: ResultKind }) {
  const t = useTranslations("conversation.results");

  switch (kind) {
    case "market":
      return <MarketInline />;
    // Phase C wires the canonical Player Card here; the rest follow.
    default:
      return (
        <p className="text-basis text-text-muted" data-testid="result-body-pending">
          {t("pendingInline")}
        </p>
      );
  }
}

/**
 * THE MARKET RESULT, inline in the panel.
 *
 * The SAME canonical <MarketMap> the landing hero mounts — one engine, one
 * geographic model, different mode. The data is real rows for this environment
 * (`origin: "live"`); there is deliberately no demo fallback, so an empty
 * market says so instead of borrowing the landing's scenario.
 */
function MarketInline() {
  const t = useTranslations("conversation.results");
  const [data, setData] = useState<MarketResultData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMarketResultAction()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-basis text-text-secondary" data-testid="market-error">
        {t("marketError")}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="text-basis text-text-muted" data-testid="market-loading">
        {t("pendingInline")}
      </p>
    );
  }
  if (data.empty) {
    // Honest empty: no rows is a real answer, and inventing demand here would
    // be exactly the fabricated market this platform bans.
    return (
      <p className="text-basis text-text-secondary" data-testid="market-empty">
        {t("marketEmpty")}
      </p>
    );
  }

  return <MarketMap view={data.view} mode="result" layer="demand" />;
}
