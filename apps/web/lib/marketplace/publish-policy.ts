/**
 * Marketplace PUBLISH POLICY (TypeScript half) — PURE.
 *
 * The policy layer of the universal marketplace. It sits BESIDE the person
 * model, never inside it: the owner REJECTED any age / adult-confirmed column
 * or adult-only domain. A listing is a PERSON's (or organisation's) listing;
 * eligibility, guardian and legal constraints are a separate policy that can
 * grow without a schema change. This module reads NOTHING about age or
 * identity in v1 — its inputs are the subject, the kind and the text.
 *
 * It REUSES the verdict union of `lib/value-channels/eligibility.ts`
 * (CAN_ROUTE / LEGAL_CHECK_REQUIRED / CHANNEL_RESTRICTED) and the SAME
 * restricted-category and food needles — nothing is re-invented, and the food
 * rule is NOT weakened:
 *
 *   - restricted categories (weapons, medicines, tobacco, alcohol, live
 *     animals) on an OFFER -> CHANNEL_RESTRICTED / restricted_category,
 *     no alternative suggested;
 *   - selling food / home-grown produce (subject goods_food_homegrown, or food
 *     text inside the goods domain) -> LEGAL_CHECK_REQUIRED naming the check
 *     (`food_sale_rules`): the listing may be DRAFTED, but PUBLISHING requires
 *     the person's explicit confirmation that they checked the rules that
 *     apply to them. The platform never asserts the sale is lawful.
 *
 * The database twin is `market_publish_policy_v1` (registered + active
 * subject, coherent direction). It is the single hook where future guardian /
 * legal facts plug in via a facts table; the TypeScript rules below are the
 * text-aware half that the database function deliberately does not read.
 */

import type { ChannelVerdictKind } from "@/lib/value-channels/eligibility";
import { textMatchesFood, textMatchesRestricted } from "@/lib/value-channels/eligibility";
import {
  deriveDirection,
  domainOfSubject,
  isKindAllowedForSubject,
} from "@/lib/marketplace/market-model";

export type PublishVerdictKind = Extract<
  ChannelVerdictKind,
  "CAN_ROUTE" | "LEGAL_CHECK_REQUIRED" | "CHANNEL_RESTRICTED"
>;

/** The policy rule that produced a verdict (stable keys, usable in copy). */
export type PolicyRuleKey =
  | "registered_subject"
  | "unregistered_subject"
  | "direction_not_allowed"
  | "restricted_category"
  | "food_sale_rules";

export interface PublishVerdict {
  readonly kind: PublishVerdictKind;
  readonly ruleKey: PolicyRuleKey;
  /** LEGAL_CHECK_REQUIRED: the named check the person must confirm. */
  readonly legalCheckKey?: "food_sale_rules";
  /** CHANNEL_RESTRICTED: the named reason (same codes as the channel verdicts). */
  readonly reasonKey?: "restricted_category" | "category_not_supported";
}

export interface PublishPolicyInput {
  /** The listing's SUBJECT (its `category`). */
  readonly subject: string;
  /** sale | rental | wanted — direction is derived from it. */
  readonly listingKind: string;
  readonly title?: string | null;
  readonly description?: string | null;
}

export function assessPublish(input: PublishPolicyInput): PublishVerdict {
  const domain = domainOfSubject(input.subject);
  if (domain === null) {
    return {
      kind: "CHANNEL_RESTRICTED",
      ruleKey: "unregistered_subject",
      reasonKey: "category_not_supported",
    };
  }
  if (!isKindAllowedForSubject(input.listingKind, input.subject)) {
    return {
      kind: "CHANNEL_RESTRICTED",
      ruleKey: "direction_not_allowed",
      reasonKey: "category_not_supported",
    };
  }

  const direction = deriveDirection(input.listingKind);
  const text = `${input.title ?? ""} ${input.description ?? ""}`;

  if (direction === "offer") {
    // The restricted needles are tuned for consumer goods ("\bguns?\b" would
    // refuse a "nail gun for rent"), so they apply to the goods and personal
    // domains only — the work_resource domain keeps its pre-existing behaviour.
    if ((domain === "goods" || domain === "personal") && textMatchesRestricted(text)) {
      return {
        kind: "CHANNEL_RESTRICTED",
        ruleKey: "restricted_category",
        reasonKey: "restricted_category",
      };
    }
    if (
      input.subject === "goods_food_homegrown" ||
      (domain === "goods" && textMatchesFood(text))
    ) {
      return {
        kind: "LEGAL_CHECK_REQUIRED",
        ruleKey: "food_sale_rules",
        legalCheckKey: "food_sale_rules",
      };
    }
  }

  return { kind: "CAN_ROUTE", ruleKey: "registered_subject" };
}
