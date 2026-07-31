"use client";

import { useTranslations } from "next-intl";

import { MarketDrilldown } from "@/components/app/workspace/market-drilldown";
import { OpportunitiesResult } from "@/components/app/workspace/opportunities-result";
import { PlayerCardResult } from "@/components/app/workspace/player-card-result";
import type { GeographySelection } from "@/lib/market-map/geography-selection";

import {
  canRenderInline,
  getResult,
  type ResultContext,
  type ResultKind,
} from "@/lib/conversation/result-registry";

/**
 * The workspace's result state below the kind — the depth Goal 3 added.
 *
 * It arrives as one object rather than seven props so that adding a depth later
 * cannot silently skip a component in the chain.
 */
export interface ResultNavigation {
  readonly geography: GeographySelection | null;
  readonly geoToken: string | null;
  readonly projectId: string | null;
  /** Active organization name, or null when the person is in their own space.
   *  Carried into the people continuation (W4.5). */
  readonly workspace: string | null;
  readonly onSelectGeography: (g: GeographySelection) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onBackToMarket: () => void;
  readonly onBackToProjects: () => void;
}

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
  navigation,
  onOpenFull,
}: {
  kind: ResultKind;
  /** The active work context — a result not meaningful here is not rendered. */
  context: ResultContext;
  /** Depth within the result — see `ResultNavigation`. */
  navigation: ResultNavigation;
  /** Wired by the workspace layer to reach the result's existing full screen. */
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const descriptor = getResult(kind);

  // An invented kind renders nothing at all rather than an error surface.
  if (!descriptor) return null;

  if (canRenderInline(kind, context)) {
    return (
      <InlineResult kind={kind} navigation={navigation} onOpenFull={onOpenFull} />
    );
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
function InlineResult({
  kind,
  navigation,
  onOpenFull,
}: {
  kind: ResultKind;
  navigation: ResultNavigation;
  /** An inline result may still need the full screen — the opportunities
   *  result offers the board from every one of its states, so no state is a
   *  dead end. Passed through rather than re-derived: the fallback route and
   *  the inline route must stay the same route. */
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");

  switch (kind) {
    case "opportunities":
      // W3 row 5 — the first ABSORB. "Man tinkantys darbai" existed ONLY on
      // /dashboard/advanced; it is a result now, so the route may lose it.
      return <OpportunitiesResult onOpenFull={onOpenFull} />;
    case "market":
      // Goal 3: the market result now has depth — map → projects → evaluation.
      // Still ONE result and ONE panel; the depth lives in the URL.
      return (
        <MarketDrilldown
          geography={navigation.geography}
          geoToken={navigation.geoToken}
          projectId={navigation.projectId}
          workspace={navigation.workspace}
          onSelectGeography={navigation.onSelectGeography}
          onSelectProject={navigation.onSelectProject}
          onBackToMarket={navigation.onBackToMarket}
          onBackToProjects={navigation.onBackToProjects}
        />
      );
    case "player-card":
      // W3 row 1 — the canonical card. It was rendered in the chat THREAD and
      // (as a lesser person block) twice inside the premium hub; both are gone
      // and this is the one renderer.
      return <PlayerCardResult onOpenFull={onOpenFull} />;
    // The remaining kinds follow, one verified data path at a time.
    default:
      return (
        <p className="text-basis text-text-muted" data-testid="result-body-pending">
          {t("pendingInline")}
        </p>
      );
  }
}
