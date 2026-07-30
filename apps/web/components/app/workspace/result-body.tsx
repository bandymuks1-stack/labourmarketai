"use client";

import { useTranslations } from "next-intl";

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
    // Phase C wires the canonical Player Card here; phases D/E wire the rest.
    default:
      return (
        <p className="text-basis text-text-muted" data-testid="result-body-pending">
          {t("pendingInline")}
        </p>
      );
  }
}
