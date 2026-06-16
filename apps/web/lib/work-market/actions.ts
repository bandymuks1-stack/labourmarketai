/**
 * Work Market Atlas — action + identity model (original Labourmarket.ai system).
 *
 * Built from the #426 acceptance criteria: a PERSON and a COMPANY are the two
 * base identities. "Buyer" and "agency" are NOT identities — buying, selling,
 * hiring, renting and offering services are ACTIONS a base identity takes.
 * This module is the single source of truth for that action/identity mapping;
 * every atlas category declares which of these actions it supports.
 *
 * Pure, deterministic, no external references. No DB.
 */

/** The six market actions a base identity can take on a category. */
export type WorkMarketAction =
  /** dirbu — do the work / offer my labour */
  | "work"
  /** samdau — hire people / a team for the work */
  | "hire"
  /** perku — buy a product or a service */
  | "buy"
  /** parduodu — sell a product or a service */
  | "sell"
  /** nuomoju — rent out a tool / equipment / space */
  | "rent"
  /** ieškau pagalbos — ask for local help / support */
  | "seek_help";

export const WORK_MARKET_ACTIONS: readonly WorkMarketAction[] = [
  "work",
  "hire",
  "buy",
  "sell",
  "rent",
  "seek_help",
];

/** Base identity (mirrors the #426 model — never "buyer" / "agency"). */
export type WorkMarketIdentity = "person" | "company" | "both";

export type ActionMeta = {
  id: WorkMarketAction;
  labelLt: string;
  labelEn: string;
  /** Which base identities can naturally take this action. A company is a
   *  legal person, so it can do everything a person can in market terms; a
   *  person cannot "hire as an employer entity" the same way — but may still
   *  bring in help, which is `seek_help`. */
  identities: readonly ("person" | "company")[];
};

export const ACTION_META: Record<WorkMarketAction, ActionMeta> = {
  work: { id: "work", labelLt: "Dirbu", labelEn: "I work", identities: ["person", "company"] },
  hire: { id: "hire", labelLt: "Samdau", labelEn: "I hire", identities: ["company"] },
  buy: { id: "buy", labelLt: "Perku", labelEn: "I buy", identities: ["person", "company"] },
  sell: { id: "sell", labelLt: "Parduodu", labelEn: "I sell", identities: ["person", "company"] },
  rent: { id: "rent", labelLt: "Nuomoju", labelEn: "I rent out", identities: ["person", "company"] },
  seek_help: {
    id: "seek_help",
    labelLt: "Ieškau pagalbos",
    labelEn: "I need help",
    identities: ["person", "company"],
  },
};

/** Does a base identity (`person` | `company`) support an action at all? */
export function identityCanTakeAction(
  identity: "person" | "company",
  action: WorkMarketAction,
): boolean {
  return ACTION_META[action].identities.includes(identity);
}

/** Resolve the actions a concrete identity can take on a category, given the
 *  category's own supported actions. Used by UI to render only honest CTAs. */
export function resolveActionsForIdentity(
  identity: "person" | "company",
  categoryActions: readonly WorkMarketAction[],
): WorkMarketAction[] {
  return WORK_MARKET_ACTIONS.filter(
    (a) => categoryActions.includes(a) && identityCanTakeAction(identity, a),
  );
}
