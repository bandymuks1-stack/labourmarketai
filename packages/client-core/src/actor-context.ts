/**
 * ONE PERSON, MANY CONTEXTS — invariant I-1, expressed for a client.
 *
 * `docs/ARCHITECTURE.md` §3: student / employee / freelancer / founder /
 * volunteer / project participant are relationships and states of the SAME
 * person, held simultaneously. Never duplicate the human.
 *
 * A phone makes that invariant easy to break, because a phone screen is small
 * and the tempting shortcut is one app per audience — a worker app and an
 * employer app. That is duplicating the human. There is one client, and the
 * person switches the context they are acting in, exactly as on the web.
 *
 * ## What this file is NOT
 *
 * It is not a permission model, and it does not know which contexts anyone
 * holds. Holdings live in `profile_roles`, `company_workers`,
 * `organization_capabilities` and the relationship tables, and are read under
 * RLS. A client that stored "this person is a manager" and unlocked a screen
 * on that basis would be a second permission model that the database never
 * agreed to. #1335 already separated these four ideas in the web codebase —
 * actor type, participation mode, permission and plan — and this keeps them
 * apart on the client.
 *
 * Selecting a context is a VIEW choice: it changes which surfaces the person
 * is looking at. Every request still carries only their identity, and the
 * database still decides what comes back.
 */

/**
 * The participation modes that are live in production today, mirroring
 * `LIVE_ROLE_IDS` in `apps/web/lib/config/roles.ts`. Pinned by
 * `apps/web/lib/guards/client-core-vocabulary-mirror.test.ts`.
 *
 * The web catalogue also carries forward-looking ids (freelancer, team_lead,
 * service_provider) that are `hidden` and have no database enum value. They
 * are deliberately absent here: a client offering a context the backend cannot
 * store would be promising something that silently fails.
 */
export const PARTICIPATION_MODES = [
  "worker",
  "company",
  "agency",
  "customer",
] as const;

export type ParticipationMode = (typeof PARTICIPATION_MODES)[number];

/**
 * A context the person can act in.
 *
 * `organizationId` is present when the mode is exercised through an
 * organization (a company manager acts for one company at a time). The
 * organization is a scope, not a permission — what the person may do inside it
 * is still `manages_organization` and RLS, server-side.
 */
export type ActorContext = {
  readonly mode: ParticipationMode;
  readonly organizationId: string | null;
  /** The organization's own name, for display. Never derived from an id. */
  readonly label: string;
};

/**
 * What the client knows about the person's contexts.
 *
 * Three states, and `unavailable` is a first-class one for the same reason it
 * is in `session.ts`: until the canonical transport is open (see
 * `transport.ts`) this client cannot read a person's contexts at all. It must
 * say so. Rendering "no contexts" would tell a manager of three companies that
 * they manage none.
 */
export type ContextHoldings =
  | { readonly status: "unknown" }
  | { readonly status: "known"; readonly contexts: readonly ActorContext[] }
  | { readonly status: "unavailable"; readonly because: string };

export type ContextSelection = {
  readonly holdings: ContextHoldings;
  /** Null until the person has chosen, or while holdings are not known. */
  readonly active: ActorContext | null;
};

export function contextKey(context: ActorContext): string {
  return context.organizationId === null
    ? context.mode
    : context.mode + ":" + context.organizationId;
}

export function sameContext(a: ActorContext, b: ActorContext): boolean {
  return contextKey(a) === contextKey(b);
}

/**
 * Choose the context to open on.
 *
 * Prefers the one the person used last, then their single context if they have
 * only one, and otherwise chooses NOTHING and lets them pick. Guessing between
 * several would put someone into an employer view when they opened the app to
 * log their own hours — a small annoyance on a desktop, a real one on a phone
 * held in a work glove.
 */
export function initialSelection(
  holdings: ContextHoldings,
  rememberedKey: string | null,
): ContextSelection {
  if (holdings.status !== "known") return { holdings, active: null };
  const { contexts } = holdings;
  if (rememberedKey !== null) {
    const remembered = contexts.find((c) => contextKey(c) === rememberedKey);
    if (remembered !== undefined) return { holdings, active: remembered };
  }
  if (contexts.length === 1) return { holdings, active: contexts[0] };
  return { holdings, active: null };
}

/**
 * Switch context.
 *
 * Refuses a context the person is not recorded as holding. Not as a security
 * measure — the database is that, and it would refuse the data anyway — but so
 * a bug in the client surfaces as a refusal here rather than as a screen that
 * asks the backend for something and renders its empty answer as fact.
 */
export function selectContext(
  selection: ContextSelection,
  next: ActorContext,
): ContextSelection {
  if (selection.holdings.status !== "known") return selection;
  const held = selection.holdings.contexts.some((c) => sameContext(c, next));
  if (!held) return selection;
  return { holdings: selection.holdings, active: next };
}
