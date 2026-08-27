/**
 * PRODUCT SURFACE REGISTRY — the declaration a new UI element must carry.
 *
 * Human half: `docs/PRODUCT_CONSTITUTION.md` §13.
 * Enforced by: `.github/scripts/product-gate.mjs` + `lib/guards/product-gate.test.ts`.
 *
 * THE RULE: a PR that adds a screen, a menu item, a dashboard element, a popup,
 * a module, a wizard or a persistent card must add its declaration here — with
 * the five answers the Product Constitution demands. A surface nobody can
 * justify in five short sentences is a surface that should not exist.
 *
 * THE BASELINE: everything that existed on 2026-07-28 is grandfathered. This
 * PR fixes nothing and redesigns nothing (that was the explicit scope); it
 * stops the NEXT undeclared surface. The known violations in today's baseline
 * are recorded in `docs/audits/product-constitution-audit-v1.md`, not silently
 * blessed here.
 *
 * Pure data. No IO.
 */

import type { AxiomId } from "./axioms";
import type { WorldElementId } from "./world-elements";
import { validateUniverseAnswers, type UniverseAnswers } from "./universal-object-model";
import { validateWorldStateAnswers, type WorldStateAnswers } from "./world-state";
import { validateEntityAnswers, type EntityAnswers } from "./entity-model";
import {
  validateBehaviorAnswers,
  type BehaviorAnswers,
  type TransitionalWaiver,
} from "./behavior-model";

export type SurfaceKind =
  | "screen"
  | "menu_item"
  | "dashboard_element"
  | "popup"
  | "module"
  | "wizard"
  | "persistent_card";

export interface SurfaceDeclaration {
  /** Stable id — the route, the nav id, or the component path. */
  readonly id: string;
  readonly kind: SurfaceKind;
  /** Which axiom PERMITS this to exist. Must be a real axiom id. */
  readonly originAxiom: AxiomId;
  /** What it is for, in one concrete sentence. */
  readonly purpose: string;
  /** Why a conversation cannot do this job. The hardest question, asked first. */
  readonly whyNotChat: string;
  /** Why an existing component cannot carry it. */
  readonly whyNotExistingComponent: string;
  /** The accountable role. */
  readonly owner: string;
  /**
   * The canonical action this surface OWNS. Two surfaces may not own the same
   * action (A-08). `null` = it owns no action (a pure read surface).
   */
  readonly ownsAction: string | null;

  // ── The six mandatory answers (PRODUCT_VISION_LOCK_V1, owner 2026-07-28) ──
  /** 1. Which core world element is being extended? */
  readonly worldElement: WorldElementId;
  /** 2. Why can an existing element not be used? */
  readonly whyNotExistingElement: string;
  /** 3. How does this integrate into the AI conversation? */
  readonly chatIntegration: string;
  /** 4. How is it reflected in the Avatar's state? */
  readonly avatarEffect: string;
  /** 5. How is it reflected in the World Map? */
  readonly mapEffect: string;
  /** 6. How is it related to the Work Journal? */
  readonly journalRelation: string;

  // ── The nine universe answers (PRODUCT_UNIVERSE_LOCK_V2, owner 2026-07-28) ─
  /** Which of the four pillars is extended. */
  readonly pillar: string;
  /** Which world object type it acts on. */
  readonly objectType: string;
  /** Is that type registered in the Universal Object Model? (blocking) */
  readonly registeredInObjectModel: boolean;
  /** Does the object have a Timeline? (blocking) */
  readonly hasTimeline: boolean;
  /** Does the object have History? (blocking) */
  readonly hasHistory: boolean;
  /** Can it be added WITHOUT changing World Map architecture? (blocking) */
  readonly addableWithoutMapChange: boolean;

  // ── The five world-state answers (WORLD_STATE_UX_ARCHITECTURE_V1) ─────────
  // All five are blocking: "Jeigu bent vienas atsakymas yra 'ne', sprendimas
  // laikomas neatitinkančiu PRODUCT_VISION_LOCK."
  readonly changesWorldState: boolean;
  readonly reflectedOnMap: boolean;
  readonly aiControlled: boolean;
  readonly usableWithoutLeavingWorkspace: boolean;
  readonly needsNoNewPage: boolean;

  // ── The entity answers (UNIFIED_WORLD_MODEL_V1, owner 2026-07-28) ─────────
  // Entity is the only base thing in the world. Growth happens by REGISTRATION:
  // `registrationIsEnough` is the mechanism, and it blocks. Needing a new type,
  // role or relationship never blocks on its own — that is how the world grows.
  // The map question is NOT repeated here: `addableWithoutMapChange` above is
  // the canonical one, and the entity validator reads it.
  /** Does it use Entity at all? (blocking) */
  readonly usesEntity: boolean;
  /** Does it need a new Entity Type? (never blocks — growth is allowed) */
  readonly needsNewEntityType: boolean;
  /** Is registering it enough? THE growth mechanism. (blocking) */
  readonly registrationIsEnough: boolean;
  /** Does it create a new Role? (never blocks — roles are dynamic) */
  readonly createsNewRole: boolean;
  /** Does it create a new Relationship? (never blocks — predicates register) */
  readonly createsNewRelationship: boolean;
  /** Can the AI work with this Entity? (blocking) */
  readonly aiCanWorkWithIt: boolean;
  // ── The behavior answers (ENTITY_BEHAVIOR_MODEL_V1, owner 2026-07-28) ─────
  // The world grows by CHANGING BEHAVIOR — not by new tables, modules or
  // architectures. All six of the owner's questions are still asked; three are
  // answered by fields ABOVE, which their own locks own, so nothing is judged
  // twice:
  //   "existing Entity Type?"     → `needsNewEntityType`      (entity block)
  //   "AI without arch. change?"  → `aiCanWorkWithIt`         (entity block)
  //   "can the Map render it?"    → `addableWithoutMapChange` (universe block)
  /** Is adding a new Behavior enough? (blocking) */
  readonly newBehaviorIsEnough: boolean;
  /** Is adding a new Relationship enough? (blocking) */
  readonly newRelationshipIsEnough: boolean;
  /** Can World State control it? — false means REDESIGN, not review. */
  readonly worldStateCanControlIt: boolean;

  /**
   * TEMPORARY, owner-approved, self-expiring. Present only while the enabling
   * architecture (E.7 map platform / B.6 behavior binding) does not exist. It
   * may excuse ONLY the readiness answers in `WAIVABLE_FIELDS`; it can never
   * excuse `usesEntity` or `registrationIsEnough`, and the Product Gate turns
   * it into a hard error the moment the enabling architecture ships.
   */
  readonly transitionalWaiver?: TransitionalWaiver;
}

/**
 * Declarations added from this PR onward.
 *
 * The FIRST entry is the Context Panel (W3). It is declared even though no
 * detection pattern in the Product Gate would have caught it — it is not a
 * page, not a modal, not a wizard and not a `*-card.tsx`. Declaring it anyway
 * is the point of the constitution: this is the largest UI addition since the
 * conversation itself, and a surface nobody can justify in five sentences is a
 * surface that should not exist. The alternative — shipping it silently because
 * the regexes happen not to match — would be following the letter of the gate
 * while defeating it.
 */
export const PRODUCT_SURFACES: readonly SurfaceDeclaration[] = [
  {
    id: "components/app/world-state/context-panel.tsx",
    kind: "dashboard_element",
    // A-01 does not merely permit this — it NAMES it: "AI Conversation + World
    // Map + Context Panel are ONE workspace".
    originAxiom: "A-01",
    purpose:
      "The third part of the one workspace: it always answers 'what is in front of me right now' — the person's real work context when nothing is selected, and the selected entity's facts, requirements, history, deterministic next steps and real actions when something is.",
    whyNotChat:
      "The conversation answers a question once and the answer scrolls away. Selection state is PERSISTENT context: while a person compares an opportunity against their own skills they need the facts to stay in view while they keep talking. Re-asking the assistant for the same demand every turn is the failure this replaces — and the panel still performs no action of its own, it dispatches into the conversation.",
    whyNotExistingComponent:
      "No existing component is keyed on an ENTITY. Every detail view in the product today is a page per domain (/dashboard/people/[id], /dashboard/projects/[id], the opportunities board), which is exactly the page-based shape WORLD_STATE_UX_ARCHITECTURE_V1 forbids. The panel replaces those detail pages with one entity-typed lens that any registered entity type reaches without new UI.",
    owner: "Product architecture (DI)",
    // It owns the ACT of opening an entity in the workspace. Every domain
    // action it offers still belongs to that domain's canonical control — the
    // express-interest write stays at lib/opportunities/interest-actions.ts.
    ownsAction: "world_state.open_entity",

    // ── PRODUCT_VISION_LOCK_V1: the six answers ─────────────────────────────
    worldElement: "ai_conversation",
    whyNotExistingElement:
      "It IS this element, not a new one: the AI Conversation element is defined as the interface that 'opens the context it needs, closes it, and returns to the conversation'. Before W3 the product had no way to open context without leaving the conversation, so the element was only half built.",
    chatIntegration:
      "One World State: a selection made in the chat opens the panel, and every action the panel offers is dispatched back into the chat's existing chip handler. The panel owns no dispatcher, no flow and no write path of its own.",
    avatarEffect:
      "It changes nothing about the avatar by itself. It shows the avatar's own state against a selected entity — which of the demand's required skills the person actually holds — and routes the fix to the work journal, where skills really come from.",
    mapEffect:
      "W6 delivered it: the workspace map (components/app/world-state/workspace-map.tsx) subscribes to the SAME World State — the selection flies the map to the entity's place, and clicking a marker dispatches open_object so the panel and the conversation follow. Real rows only, clustered per city, approximate centroids labelled.",
    journalRelation:
      "The panel's primary recommendation for a missing required skill is to log the work that proves it — the journal stays the source of skills, and the panel never offers a self-declaration shortcut around it.",

    // ── PRODUCT_UNIVERSE_LOCK_V2: the universe answers ──────────────────────
    pillar: "ai_conversation",
    objectType: "job",
    registeredInObjectModel: true, // EXAMPLE_OBJECT_TYPES includes "job"
    hasTimeline: true, // the person's own interest signal is dated state
    hasHistory: true, // interest + saved state, read from real rows
    addableWithoutMapChange: true, // no map file is touched by this slice

    // ── WORLD_STATE_UX_ARCHITECTURE_V1: the five answers ────────────────────
    changesWorldState: true, // it IS a World State slot (context_panel)
    reflectedOnMap: true, // W6: the workspace map reacts to the selection
    aiControlled: true, // opened/closed through the conversation's own state
    usableWithoutLeavingWorkspace: true,
    needsNoNewPage: true, // no route was added by this slice

    // ── UNIFIED_WORLD_MODEL_V1: the entity answers ──────────────────────────
    usesEntity: true, // it opens an EntityRef, never a per-domain screen
    needsNewEntityType: false, // "job" already exists in the registry
    registrationIsEnough: true, // a second type = one line in resolvers.ts
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    // ── ENTITY_BEHAVIOR_MODEL_V1: the behavior answers ──────────────────────
    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    worldStateCanControlIt: true,

    // The W3-era transitional waiver (reflectedOnMap) was DELETED in W6: the
    // workspace map now genuinely reacts to the selection, so the answer is a
    // real yes and nothing is excused any more.
  },
  {
    // ═══════════════════════════════════════════════════════════════════════
    // /create-cv — the PUBLIC front door of the free CV chain.
    //
    // Owner product decision, PUBLIC BETA TRAIN V3 §2.1 (2026-08-10):
    //   "YES — labourmarket.ai SHOULD have a dedicated public FREE CV creation
    //    / acquisition surface. The public CV builder is intentional. Do NOT
    //    fold it invisibly into /worker-intake merely to avoid adding a page."
    //
    // WHY THIS DECLARATION ANSWERS "NO" FIVE TIMES, AND WHY THAT IS THE HONEST
    // ANSWER. The five WORLD_STATE questions describe a surface INSIDE the
    // authenticated workspace: does it move World State, is it drawn on the
    // map, does the AI drive it, can the person stay in the workspace, does it
    // avoid a new page. An anonymous visitor arriving from a search result has
    // no World State, no avatar, no map and no assistant — there is no
    // workspace to stay inside, and the honest answer to all five is "no".
    //
    // Answering them "yes" to make the gate green would be a lie of exactly the
    // kind A-06 exists to prevent, so they are recorded as "no" and excused by
    // ONE scoped, expiring, owner-approved waiver in
    // `.github/scripts/owner-waivers.mjs` — the mechanism the owner ruling of
    // 2026-07-29 built for reviewed transitional debt. The violations stay
    // detected and stay printed; only the exit code changes, only for this PR,
    // only until the recorded date.
    //
    // WHAT REMOVES THE WAIVER: `gate-learns-public-acquisition-route-category`.
    // The gate does not currently distinguish a pre-auth public acquisition
    // route from a workspace screen — the 118 grandfathered BASELINE screens
    // include `/`, `/for-workers`, `/for-companies` and `/pricing`, none of
    // which satisfy the five questions either; they escape by being older, not
    // by being compliant. Teaching the gate that category is a constitution
    // change and therefore an OWNER decision, not something this train may take
    // on its own authority.
    // ═══════════════════════════════════════════════════════════════════════
    id: "/create-cv",
    kind: "screen",
    // A-04: "Multiple valid entry points, suggestions not coercion, progressive
    // completion — no mandatory long wizard, and no path may be blocked." This
    // surface IS an entry point, and it coerces nothing: the CV is free, the
    // profile step is optional, the discoverability step is optional again.
    originAxiom: "A-04",
    purpose:
      "The public, indexable, advert-addressable front door of the free CV chain: a visitor who has never heard of labourmarket.ai learns in one screen that they can build or import a CV for free, export it as a PDF, and — only if they choose — turn the facts they have reviewed into a work profile that improves the jobs they are shown.",
    whyNotChat:
      "There is no conversation before authentication. This surface exists precisely where the assistant cannot reach: an anonymous visitor arriving from a search result or an advert, who has not signed up and has nothing for an assistant to operate on. The moment that person starts, the surface hands off into the authenticated CV flow the assistant does drive — it adds no second flow of its own.",
    whyNotExistingComponent:
      "Every existing CV surface sits behind authentication, and `robots.ts` disallows the `/*/cv` prefix outright, so no current component can be indexed or pointed at by an advert. `/worker-intake` is a post-signup onboarding step, not an acquisition promise: it answers 'what do we need from you' to someone who already joined, not 'what do I get' to someone deciding whether to.",
    owner:
      "Product / worker acquisition — owner decision, PUBLIC BETA TRAIN V3 §2.1 (2026-08-10)",
    // A pure read surface. Every write it leads to belongs to the CV chain that
    // already owns it (upload/extract, per-fact confirm, profile write). It
    // deliberately owns NO action, so A-08 cannot be violated.
    ownsAction: null,

    // ── PRODUCT_VISION_LOCK_V1: the six answers ─────────────────────────────
    worldElement: "user_avatar",
    whyNotExistingElement:
      "It extends no new element: the CV is the avatar's work identity rendered for the outside world, and this surface is the public doorway to it. What did not exist was a doorway an anonymous person could find — the element was reachable only by people already inside.",
    chatIntegration:
      "One-way, by design: the surface starts the existing CV chain and the assistant takes over from the first authenticated screen onward. It dispatches nothing, holds no conversation state, and introduces no second flow the assistant would have to learn.",
    avatarEffect:
      "None by itself, and that is the honesty constraint: extracted facts are suggestions until the person confirms them one by one, and only confirmed facts reach the avatar's profile. A visitor who exports a PDF and leaves has changed nothing about any avatar.",
    mapEffect:
      "None. A pre-auth acquisition page draws nothing on the World Map — recorded as `reflectedOnMap: false` rather than dressed up as a map effect.",
    journalRelation:
      "Downstream and deliberately subordinate: the CV seeds an initial skill claim set, but the Work Journal remains the source of proven skills. The surface never presents an imported CV line as evidence of anything — it presents it as something the person said about themselves.",

    // ── PRODUCT_UNIVERSE_LOCK_V2: the universe answers ──────────────────────
    pillar: "avatar",
    objectType: "avatar",
    registeredInObjectModel: true, // EXAMPLE_OBJECT_TYPES includes "avatar"
    hasTimeline: true, // the profile's confirmed facts are dated state
    hasHistory: true, // CV imports and confirmations are recorded events
    addableWithoutMapChange: true, // no map file is touched by this slice

    // ── WORLD_STATE_UX_ARCHITECTURE_V1: the five answers ────────────────────
    // All five are "no", honestly. See the header comment: a pre-auth public
    // route has no World State to change, no map to appear on, no assistant to
    // be driven by, no workspace to stay inside, and it is by definition a new
    // page. Excused by the scoped owner waiver, not by a rewritten answer.
    changesWorldState: false,
    reflectedOnMap: false,
    aiControlled: false,
    usableWithoutLeavingWorkspace: false,
    needsNoNewPage: false,

    // ── UNIFIED_WORLD_MODEL_V1: the entity answers ──────────────────────────
    // These are real yeses: the chain this surface opens acts on the avatar
    // Entity that already exists, and needs no new type, role or relationship.
    usesEntity: true,
    needsNewEntityType: false,
    registrationIsEnough: true,
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    // ── ENTITY_BEHAVIOR_MODEL_V1: the behavior answers ──────────────────────
    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    // World State cannot control a page that renders before World State exists.
    worldStateCanControlIt: false,
  },

  // ══ PUBLIC JOB BOARD (owner directive 2026-08-18 §5) ══════════════════════
  // Three surfaces, one job: make the imported supply discoverable to people
  // who have not signed up. They share the same honest World-State answers as
  // `/create-cv` above and the same category error behind them — see the
  // scoped owner waiver in `.github/scripts/owner-waivers.mjs`.
  {
    id: "/jobs",
    kind: "screen",
    // A-04: multiple valid entry points, suggestions not coercion. This is an
    // entry point that coerces nothing — browsing is free and anonymous, and
    // the account is asked for only when the visitor wants the restricted half.
    originAxiom: "A-04",
    purpose:
      "The public, indexable front door to the imported job supply: an anonymous visitor searches 38,142 live vacancies by title and sees the safe half of each ad (title, occupation, employment form, working time, positions, publication date, and pay where the publisher genuinely supplied it) without an account.",
    whyNotChat:
      "There is no conversation before authentication. The assistant cannot reach an anonymous visitor arriving from a search result, and that visitor is exactly who this surface exists for. Members already meet the same vacancies inside the workspace through /dashboard/opportunities, which the assistant does operate — this adds a pre-auth doorway to the same supply, not a second board.",
    whyNotExistingComponent:
      "Every existing vacancy surface sits behind authentication because `public_vacancies` grants SELECT to `authenticated` only; an anonymous read of that table fails with 42501, proven in production. `/dashboard/opportunities` therefore cannot be indexed or linked from an advert, and it renders the COMPLETE ad, which an anonymous caller may not receive.",
    owner:
      "Product / worker acquisition — owner directive 2026-08-18 §5 (jobs must be publicly discoverable; anonymous must not receive the complete vacancy)",
    // A pure read surface: it owns no write. The search box is a GET filter.
    ownsAction: null,

    worldElement: "market_world_map",
    whyNotExistingElement:
      "It extends no new element. Imported vacancies are already market-world supply; what did not exist was a doorway an anonymous person could walk through. The element was reachable only from inside.",
    chatIntegration:
      "One-way by design: the surface hands off to signup/login carrying `?next=` back to the same job, after which the authenticated workspace and its assistant own the journey. It dispatches nothing and holds no conversation state.",
    avatarEffect:
      "None. Browsing anonymously changes no avatar; there is no avatar yet. That is the point of the surface.",
    mapEffect:
      "None. A pre-auth acquisition route draws nothing on the World Map — recorded as `reflectedOnMap: false` rather than dressed up as a map effect.",
    journalRelation:
      "None. An imported advert is somebody else's published offer, never evidence of work done; the Work Journal remains the only source of proven skills.",

    pillar: "world_map",
    objectType: "job",
    registeredInObjectModel: true, // EXAMPLE_OBJECT_TYPES includes "job"
    hasTimeline: true, // published_at / expires_at decide liveness at read time
    hasHistory: true, // first_seen_at / last_seen_at are recorded per import
    addableWithoutMapChange: true, // no map file is touched by this slice

    // Honestly "no", all five — a pre-auth public route has no World State to
    // change, no map to appear on, no assistant to be driven by, no workspace
    // to stay inside, and it is by definition a new page. A-06 forbids
    // rewriting these to green more strongly than A-01 forbids the page.
    changesWorldState: false,
    reflectedOnMap: false,
    aiControlled: false,
    usableWithoutLeavingWorkspace: false,
    needsNoNewPage: false,

    usesEntity: true,
    needsNewEntityType: false,
    registrationIsEnough: true,
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    worldStateCanControlIt: false,
  },
  {
    id: "/jobs/[id]",
    kind: "screen",
    originAxiom: "A-04",
    purpose:
      "One indexable page per live vacancy — the addressable unit of the acquisition funnel, showing the safe half of the ad and asking for a free account to reveal the employer, the location and how to apply.",
    whyNotChat:
      "Same reason as /jobs: this page's whole audience is people the assistant cannot talk to yet, arriving on a single URL from a search engine or a shared link.",
    whyNotExistingComponent:
      "No existing route renders a single vacancy at all, for members or anyone else, and none could be indexed: the member surface is a list inside an authenticated dashboard.",
    owner:
      "Product / worker acquisition — owner directive 2026-08-18 §5",
    ownsAction: null,

    worldElement: "market_world_map",
    whyNotExistingElement:
      "Same element as /jobs — one row of it, addressably. No new element is introduced.",
    chatIntegration:
      "One-way: both CTAs carry `?next=` back to this exact job, so the workspace resumes the visitor's actual intent instead of dropping them on a generic dashboard.",
    avatarEffect: "None until the visitor creates an account; the page itself writes nothing.",
    mapEffect: "None — recorded honestly rather than invented.",
    journalRelation:
      "None. A published advert is not evidence of work; the journal is untouched.",

    pillar: "world_map",
    objectType: "job",
    registeredInObjectModel: true,
    hasTimeline: true,
    hasHistory: true,
    addableWithoutMapChange: true,

    changesWorldState: false,
    reflectedOnMap: false,
    aiControlled: false,
    usableWithoutLeavingWorkspace: false,
    needsNoNewPage: false,

    usesEntity: true,
    needsNewEntityType: false,
    registrationIsEnough: true,
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    worldStateCanControlIt: false,
  },
  {
    id: "components/marketing/public-vacancy-card.tsx",
    kind: "persistent_card",
    originAxiom: "A-04",
    purpose:
      "The one row shape of the public board: title, occupation, and the few honest chips the anonymous projection actually carries, linking to that vacancy's own page.",
    whyNotChat:
      "It is the repeated unit of a pre-auth list; there is no conversation to render it in.",
    whyNotExistingComponent:
      "The member-side vacancy card renders employer, location and an apply link — every one of which is a restricted field here. Reusing it would hand a component the anonymous data it must never show, and the leak would be one prop away.",
    owner: "Product / worker acquisition — owner directive 2026-08-18 §5",
    ownsAction: null,

    worldElement: "market_world_map",
    whyNotExistingElement: "Same element, rendered for an anonymous reader.",
    chatIntegration:
      "None, deliberately: the card is a link, not a dispatcher. It holds no conversation state and cannot start an action — the visitor either opens the job page or does nothing.",
    avatarEffect:
      "None. An anonymous reader has no avatar, and the card writes nothing anywhere; rendering it changes no profile, no skill and no state.",
    mapEffect:
      "None. A pre-auth list row draws nothing on the World Map — recorded as false rather than dressed up as a map effect.",
    journalRelation:
      "None. The card shows somebody else's published advert, which is never evidence of work done; the Work Journal remains the only source of proven skills and is untouched.",

    pillar: "world_map",
    objectType: "job",
    registeredInObjectModel: true,
    hasTimeline: true,
    hasHistory: true,
    addableWithoutMapChange: true,

    changesWorldState: false,
    reflectedOnMap: false,
    aiControlled: false,
    usableWithoutLeavingWorkspace: false,
    needsNoNewPage: false,

    usesEntity: true,
    needsNewEntityType: false,
    registrationIsEnough: true,
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    worldStateCanControlIt: false,
  },
  {
    // PUBLIC LANDING V1 — owner decision 2026-08-20.
    //
    // This is the canonical anonymous front door, not a second authenticated
    // workspace. The six World-State answers are therefore recorded as honest
    // "no" values and covered only by the PR-scoped owner waiver in
    // `.github/scripts/owner-waivers.mjs`.
    id: "/",
    kind: "screen",
    originAxiom: "A-04",
    purpose:
      "The public Europe-first front door to LabourMarket.ai: it explains the Work → Evidence → Opportunity loop, presents governed current Sweden supply as secondary evidence, and hands workers and employers into the existing canonical signup and workforce-inquiry paths.",
    whyNotChat:
      "The audience is an anonymous visitor arriving before authentication, when no AI conversation, avatar or World State exists. The surface explains the product and routes intent into the existing flows; after authentication the AI-first workspace remains the operating interface.",
    whyNotExistingComponent:
      "The previous public homepage did not expose the approved living-market V1 composition or its governed supply reader. This route reuses one shared LiveMarketLanding component with the review alias and creates no duplicate workflow, write path or authenticated workspace.",
    owner:
      "Product owner — OWNER DECISION: SHIP THIS LANDING AS V1 (2026-08-20)",
    ownsAction: null,

    worldElement: "market_world_map",
    whyNotExistingElement:
      "It extends the existing Market World Map idea as a public, conceptual acquisition view; it introduces no thirteenth world element and does not alter the authenticated map architecture.",
    chatIntegration:
      "One-way at the pre-auth boundary: worker and employer intent is handed to the existing signup or workforce-inquiry entry, after which the authenticated AI conversation owns the journey. The landing dispatches no competing product action.",
    avatarEffect:
      "None on the page itself. Anonymous viewing changes no avatar, and the worker CTA enters the existing profile path where confirmed facts are handled under the avatar rules.",
    mapEffect:
      "The page shows conceptual Europe-wide sector activity and labels it as illustrative; it does not claim to be the authenticated World Map or mutate map state, so reflectedOnMap remains honestly false.",
    journalRelation:
      "It explains the canonical chain in which completed work becomes journal evidence and later opportunity; the landing writes no journal entry and never presents anonymous browsing as work evidence.",

    pillar: "world_map",
    objectType: "job",
    registeredInObjectModel: true,
    hasTimeline: true,
    hasHistory: true,
    addableWithoutMapChange: true,

    changesWorldState: false,
    reflectedOnMap: false,
    aiControlled: false,
    usableWithoutLeavingWorkspace: false,
    needsNoNewPage: false,

    usesEntity: true,
    needsNewEntityType: false,
    registrationIsEnough: true,
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    worldStateCanControlIt: false,
  },
  {
    // ORGANIZATION CAPABILITIES — "What does your organization do?"
    //
    // The screen that made an already-applied table reachable. Two of the five
    // World-State answers are recorded as honest NO below, and they are not
    // dressed up: the capability set is not drawn on the World Map yet, and the
    // AI cannot yet set it by conversation. Recording those as "yes" to clear
    // the gate would be exactly the fabrication the gate exists to catch.
    id: "components/app/organization-capabilities-card.tsx",
    kind: "persistent_card",
    originAxiom: "A-01",
    purpose:
      "Lets an organization state what it actually does — educate/train, employ, supply workers, recruit, run projects, commission work — as several simultaneous capabilities, so an education institution can register honestly instead of calling itself a company.",
    whyNotChat:
      "It is a settled identity claim about an organization, not a request. Each answer is a durable, owner-only statement that others rely on for matching and discovery, and the RPC behind it is additive — a capability cannot be withdrawn. A conversational turn is the wrong shape for a decision that is hard to reverse and must be reviewable at a glance; chat may later OPEN this card, which is the extension recorded below.",
    whyNotExistingComponent:
      "The company setup form already answers a different question — companies.company_type, which is the INDUSTRY and holds exactly one value. Capabilities are what the organization DOES and are many-valued; a vocational school that also employs people needs both. Extending the industry control to carry capabilities would collapse the two axes and rebuild the single-value trap ORGANIZATION_ROLE_ORCHESTRATION_V1 exists to forbid.",
    owner:
      "Product owner — education pilot P0.1, owner directive 2026-08-27 (institution capability UI)",
    ownsAction: null,

    worldElement: "organizations",
    whyNotExistingElement:
      "Same element. This states what an existing organization is, and creates no new world element.",
    chatIntegration:
      "None today, and that is recorded as a NO rather than implied. The capability question is reachable only from the organization page. Making the assistant able to open it — 'we also train people' — is the natural next step and needs no schema change, because add_organization_role_v1 already accepts it.",
    avatarEffect:
      "None on a person. This describes an organization, not a human, and writes nothing to any profile, skill or journal.",
    mapEffect:
      "None yet — recorded honestly. A training capability is exactly the kind of fact the market map should eventually show (where education supply actually is), but nothing renders it today and claiming otherwise would be a fabricated map effect.",
    journalRelation:
      "None. An organization declaring what it does is a statement about itself, never evidence of work performed; the Work Journal remains the only source of proven capability for a person.",

    pillar: "world_map",
    objectType: "company",
    registeredInObjectModel: true,
    hasTimeline: true,
    hasHistory: true,
    addableWithoutMapChange: true,

    // The five mandatory answers, honestly.
    changesWorldState: true,
    reflectedOnMap: false,
    aiControlled: false,
    usableWithoutLeavingWorkspace: true,
    needsNoNewPage: true,

    usesEntity: true,
    needsNewEntityType: false,
    registrationIsEnough: true,
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    worldStateCanControlIt: true,
  },
] as const;

/**
 * BASELINE — surfaces that existed before the gate. Recorded as PATHS only:
 * a grandfathered surface is not a justified one, it is an un-audited one.
 * The gate ignores these; the audit document lists which of them already
 * conflict with an axiom and at what priority.
 *
 * Generated from `apps/web/app/[locale]/**\/page.tsx` on 2026-07-28.
 * The COUNT is pinned by the guard, so the baseline cannot grow silently.
 */
export const BASELINE_SCREEN_COUNT = 118;
export const BASELINE_DASHBOARD_SCREEN_COUNT = 79;
export const BASELINE_DATE = "2026-07-28";

/**
 * The routes that behave as a PRIMARY surface today. Recorded because A-01
 * (chat-first) is about how many of these exist, and the honest answer today
 * is "more than one" — see the audit.
 */
export const BASELINE_PRIMARY_SURFACES: readonly string[] = [
  "/dashboard", // the canonical chat-first root (PR #864)
  // `/dashboard/advanced` was the documented module escape hatch — DELETED
  // by W3 Package 4 (the second dashboard is gone; chat-first is the one root).
  "/dashboard/visual-os", // NOT in any registry — audit finding PC-01
  "/dashboard/start", // activity setup hub — audit finding PC-04
] as const;

export function surface(id: string): SurfaceDeclaration | null {
  return PRODUCT_SURFACES.find((s) => s.id === id) ?? null;
}

export type DeclarationViolation =
  | "unknown_axiom"
  | "unknown_pillar"
  | "not_registered_object_type"
  | "requires_map_architecture_change"
  | "not_world_state_driven"
  | "not_reflected_on_map"
  | "not_ai_controlled"
  | "requires_leaving_workspace"
  | "requires_new_page"
  | "unknown_world_element"
  | "not_entity_based"
  | "new_base_entity"
  | "registration_not_enough"
  | "map_does_not_support_type"
  | "ai_cannot_work_with_entity"
  | "new_entity_type_instead_of_behavior"
  | "behavior_not_enough"
  | "relationship_not_enough"
  | "ai_needs_architecture_change"
  | "map_cannot_render_it"
  | "world_state_cannot_control_it"
  | "special_case_for_entity_type"
  | "unanswered_vision_question"
  | "empty_purpose"
  | "empty_why_not_chat"
  | "empty_why_not_existing_component"
  | "empty_owner"
  | "duplicate_id"
  | "waiver_not_approved"
  | "waiver_covers_unwaivable_field"
  | "waiver_expired"
  | "duplicate_action";

export interface DeclarationProblem {
  readonly id: string;
  readonly code: DeclarationViolation;
  readonly detail: string;
}

/**
 * Validate the registry itself. A declaration that answers "why not chat?"
 * with a blank is not a declaration — it is paperwork.
 */
export function validateDeclarations(
  declarations: readonly SurfaceDeclaration[],
  knownAxiomIds: readonly string[],
  knownWorldElementIds: readonly string[] = [],
): readonly DeclarationProblem[] {
  const problems: DeclarationProblem[] = [];
  const seenIds = new Set<string>();
  const actionOwners = new Map<string, string>();

  for (const d of declarations) {
    if (seenIds.has(d.id)) {
      problems.push({ id: d.id, code: "duplicate_id", detail: "declared twice" });
    }
    seenIds.add(d.id);

    if (!knownAxiomIds.includes(d.originAxiom)) {
      problems.push({
        id: d.id,
        code: "unknown_axiom",
        detail: `origin axiom ${d.originAxiom} is not in the Product Constitution`,
      });
    }
    if (d.purpose.trim().length < 10) {
      problems.push({ id: d.id, code: "empty_purpose", detail: "purpose is not stated" });
    }
    if (d.whyNotChat.trim().length < 10) {
      problems.push({
        id: d.id,
        code: "empty_why_not_chat",
        detail: "why a conversation cannot do this is not answered",
      });
    }
    if (d.whyNotExistingComponent.trim().length < 10) {
      problems.push({
        id: d.id,
        code: "empty_why_not_existing_component",
        detail: "why an existing component cannot carry this is not answered",
      });
    }
    if (d.owner.trim().length < 2) {
      problems.push({ id: d.id, code: "empty_owner", detail: "no accountable owner" });
    }
    // The six mandatory vision answers. A blank is not an answer.
    if (!knownWorldElementIds.includes(d.worldElement)) {
      problems.push({
        id: d.id,
        code: "unknown_world_element",
        detail: `"${d.worldElement}" is not one of the twelve world elements`,
      });
    }
    for (const [field, value] of [
      ["whyNotExistingElement", d.whyNotExistingElement],
      ["chatIntegration", d.chatIntegration],
      ["avatarEffect", d.avatarEffect],
      ["mapEffect", d.mapEffect],
      ["journalRelation", d.journalRelation],
    ] as const) {
      if (value.trim().length < 10) {
        problems.push({
          id: d.id,
          code: "unanswered_vision_question",
          detail: `${field} is unanswered — PRODUCT_VISION_LOCK_V1 requires all six answers`,
        });
      }
    }

    // The nine universe answers. A blocking "no" stops the PR (owner rule).
    for (const problem of validateUniverseAnswers(d.id, d as UniverseAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.detail,
      });
    }

    // The entity answers. registrationIsEnough is the growth mechanism.
    for (const problem of validateEntityAnswers(d.id, d as EntityAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.detail,
      });
    }

    // The five world-state answers. Any "no" breaks the vision lock.
    for (const problem of validateWorldStateAnswers(d.id, d as WorldStateAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.detail,
      });
    }

    // The six behavior answers. The last one escalates to REDESIGN.
    for (const problem of validateBehaviorAnswers(d.id, d as BehaviorAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.redesignRequired
          ? `${problem.detail} — REDESIGN REQUIRED`
          : problem.detail,
      });
    }

    if (d.ownsAction) {
      const existing = actionOwners.get(d.ownsAction);
      if (existing) {
        problems.push({
          id: d.id,
          code: "duplicate_action",
          detail: `action "${d.ownsAction}" is already owned by ${existing} (A-08: one function, one home)`,
        });
      } else {
        actionOwners.set(d.ownsAction, d.id);
      }
    }
  }
  return problems;
}
