"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { CalendarResult } from "@/components/app/workspace/calendar-result";
import { CandidatesResult } from "@/components/app/workspace/candidates-result";
import { ExperiencesResult } from "@/components/app/workspace/experiences-result";
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
  /**
   * W6 slice 3D — which interaction the `experiences` result is describing, as
   * a validated `kind:uuid` token, or null for the list depth. Opaque here:
   * the panel never learns what a booking or an engagement is, and the token
   * buys nothing on its own — the server re-derives participation, completion,
   * the subject and duplicate state before any form is mounted.
   */
  readonly interactionToken: string | null;
  /**
   * W8 — which DEMAND the `candidates` result is answering for, as a validated
   * uuid, or null for the demand list. Opaque here exactly like the two tokens
   * above: the panel never learns what a demand is, and the id buys nothing on
   * its own — `runScouting` re-derives the company context and verifies the row
   * is the caller's own before a single candidate is ranked.
   */
  readonly demandId: string | null;
  /** Active organization name, or null when the person is in their own space.
   *  Carried into the people continuation (W4.5). */
  readonly workspace: string | null;
  readonly onSelectGeography: (g: GeographySelection) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onBackToMarket: () => void;
  readonly onBackToProjects: () => void;
  /** Step back out of one interaction to the list of experiences. */
  readonly onBackToExperiences: () => void;
  /** Drill into one demand's candidates. Pushes, so Back returns to the list. */
  readonly onSelectDemand: (requestId: string) => void;
  /** Step back up to the demand list. Replaces. */
  readonly onBackToDemands: () => void;
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
  locale,
  onOpenFull,
}: {
  kind: ResultKind;
  /** The active work context — a result not meaningful here is not rendered. */
  context: ResultContext;
  /** Depth within the result — see `ResultNavigation`. */
  navigation: ResultNavigation;
  /** The active locale. Results that DISPATCH an action (W8's `candidates`)
   *  pass it to the canonical dispatcher so the server action revalidates the
   *  caller's own locale path — the same value the inline form supplies. */
  locale: string;
  /** Wired by the workspace layer to reach the result's existing full screen. */
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const descriptor = getResult(kind);

  // An invented kind renders nothing at all rather than an error surface.
  if (!descriptor) return null;

  if (canRenderInline(kind, context)) {
    return (
      <InlineResult
        kind={kind}
        navigation={navigation}
        locale={locale}
        onOpenFull={onOpenFull}
      />
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
      <Button
        type="button"
        variant="pill"
        onClick={() => onOpenFull(descriptor.advancedRoute)}
        data-testid="result-body-open-full"
        className="self-start"
      >
        {t("openFull")}
      </Button>
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
  locale,
  onOpenFull,
}: {
  kind: ResultKind;
  navigation: ResultNavigation;
  locale: string;
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
    case "calendar":
      // W3 calendar slice — the panel presentation of the Time Engine. The
      // SAME canonical agenda projection the planning page and the chat's
      // agenda sentence read; no second calendar, no second truth store. The
      // full calendar stays one action away via `onOpenFull`.
      return <CalendarResult onOpenFull={onOpenFull} />;
    case "experiences":
      // W6 slice 3 — the experience domain. This is the ONLY surface it has:
      // the `/dashboard/experiences` screen slice 3B briefly added was refused
      // by the Product Gate (A-09) and deleted, so there is no full screen to
      // fall back to and none is offered. Everything the domain can show — the
      // count-only block, published-about-me with reply and dispute, my own
      // submissions in their real lifecycle state, and (slice 3D) the
      // interaction-bound submit depth — lives here.
      return (
        <ExperiencesResult
          interactionToken={navigation.interactionToken}
          onBack={navigation.onBackToExperiences}
        />
      );
    case "candidates":
      // W8 — the employer's whole hiring stage, in the panel. The chat
      // EXPLAINS and the panel SHOWS AND ACTS: the demand list, one demand's
      // ranked candidates, the §19 confirm/close/reopen lifecycle, shortlist,
      // contact and booking — every one of them the canonical executor that
      // already existed and had no client caller.
      return (
        <CandidatesResult
          demandId={navigation.demandId}
          locale={locale}
          onSelectDemand={navigation.onSelectDemand}
          onBack={navigation.onBackToDemands}
          onOpenFull={onOpenFull}
        />
      );
    // The remaining kinds follow, one verified data path at a time.
    default:
      return (
        <p className="text-basis text-text-muted" data-testid="result-body-pending">
          {t("pendingInline")}
        </p>
      );
  }
}
