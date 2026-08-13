/**
 * Bounded channel eligibility (V10) — PURE, closed verdict set.
 *
 * Given a structured value statement, answer per channel: CAN_ROUTE,
 * NEEDS_MORE_INFORMATION (which fields), CHANNEL_RESTRICTED (why),
 * LEGAL_CHECK_REQUIRED (what must be checked), or UNSUPPORTED (why).
 *
 * BOUNDED BY DESIGN — this is not a lawyer-bot:
 *  - a short, closed list of RESTRICTED categories (weapons, medicines,
 *    tobacco, alcohol, live animals) is refused outright, no workaround
 *    ever suggested;
 *  - home-grown food/produce gets LEGAL_CHECK_REQUIRED naming plainly WHAT
 *    would have to be checked (food sale/hygiene/marketing rules) — the
 *    platform has no approved produce channel, so the net state is gated;
 *  - everything else routes only into the registry's real channels, with
 *    the marketplace strictly on the shared WORK-BOUNDED category
 *    vocabulary — unknown goods are honestly CHANNEL_RESTRICTED.
 *
 * AUTHORITY: every statement is the person's OWN claim. The type carries
 * the full ladder, but this slice only ever produces "claimed" (default)
 * or "confirmed_by_user" (after the person confirms the interpretation) —
 * never any verified state. No fake verification (§7).
 */
import { foldText } from "@/lib/structuring/normalize";
import type { ValueStatement } from "@/lib/structuring/value-statement";
import type { ListingCategory, ListingKind } from "@/lib/marketplace/listings-model";
import {
  VALUE_CHANNELS,
  type ChannelValueType,
  type ValueChannelDescriptorV1,
} from "./channel-registry";

export type AuthorityStatus =
  | "claimed"
  | "confirmed_by_user"
  | "evidence_supported"
  | "authorized"
  | "unknown";

/** The statuses THIS slice may produce. The rest of the ladder exists so the
 *  type is honest about what a future evidence slice could add — nothing
 *  here mints them. */
export type ProducibleAuthorityStatus = "claimed" | "confirmed_by_user";

export type ChannelVerdictKind =
  | "CAN_ROUTE"
  | "NEEDS_MORE_INFORMATION"
  | "CHANNEL_RESTRICTED"
  | "LEGAL_CHECK_REQUIRED"
  | "UNSUPPORTED";

export interface ChannelVerdict {
  readonly channelId: string;
  readonly kind: ChannelVerdictKind;
  /** NEEDS_MORE_INFORMATION: exactly the fields that would unblock. */
  readonly missingFields?: readonly string[];
  /** CHANNEL_RESTRICTED / UNSUPPORTED: the named reason (stable code). */
  readonly reasonKey?:
    | "restricted_category"
    | "category_not_supported"
    | "value_type_not_supported"
    | "outside_geography";
  /** LEGAL_CHECK_REQUIRED: the named check (stable code). */
  readonly legalCheckKey?: "food_sale_rules";
  /** Marketplace CAN_ROUTE: the honest listing shape hint. */
  readonly listingKind?: ListingKind;
  readonly listingCategory?: ListingCategory;
}

export interface ChannelEligibility {
  readonly authorityStatus: ProducibleAuthorityStatus;
  readonly verdicts: readonly ChannelVerdict[];
}

/** NEVER-ROUTE categories (folded needles, LT/EN/RU + opportunistic NL/DE).
 *  Matching any of these refuses EVERY channel — no alternative suggested. */
const RESTRICTED_RES: RegExp[] = [
  /ginkl|saudmen|sautuv|pistolet|weapon|firearm|\bguns?\b|ammunition|оруж|патрон|пистолет|wapen|waffe/u,
  /vaist|pharma|medicin|medikament|лекарств|таблет|medicijn/u,
  // "cigare" (not "cigaret"): the LT genitive folds č→c ("cigarečių" →
  // "cigareciu"), which a t-anchored needle would miss.
  /tabak|cigare|tobacco|табак|сигарет|rukal/u,
  /alkohol|alcohol|degtin|snaps|vodka|viski|whisk|\bwine\b|\bbeer\b|алкогол|водк|\bвино\b|пиво|likeri/u,
  /gyvun|gyvuli|live\s+animals?|животн|скот\b|\bvee\b|lebende?\s+tiere/u,
];

/** Food / grown produce (folded needles) → the named legal check. */
const FOOD_RES: RegExp[] = [
  /agurk|darzov|vaisi|uog(a|as|u|os)|grud|bulv|pomidor|mork|kopust|obuol|medaus|medus|kiaus|pien(a|o)\b|mes(a|os)\b|maist|derli/u,
  /\bfood\b|produce\b|vegetable|fruit|berr(y|ies)|\beggs?\b|\bmeat\b|\bmilk\b|honey|harvest/u,
  /овощ|фрукт|ягод|картоф|огурц|помидор|яйц|молок|мяс(о|а)\b|мёд|мед\b|продукт(ы|ов)?\s+питани|еда\b/u,
  /groente|obst\b|gemuse|lebensmittel/u,
];

/** Work-bounded marketplace category needles → the SHARED category slug. */
const CATEGORY_RES: ReadonlyArray<{ category: ListingCategory; re: RegExp }> = [
  { category: "accommodation", re: /apgyvendin|nakvyn|gyvenam|namel|butas|buta\b|kambar|accommodation|housing|\brooms?\b|жиль|общежит|комнат|unterkunft|huisvesting/u },
  { category: "premises", re: /patalp|sandeli(o|s|u)|angar|dirbtuv|premises|warehouse\s+space|\bhall\b|помещен|склад(а|у)?\b|halle\b/u },
  { category: "vehicle", re: /automobil|masina\b|mikroautobus|furgon|priekab|vilkik|bus(as|iuk)|\bvans?\b|\btrucks?\b|vehicle|trailer|фургон|прицеп|грузовик|автомобил|anhanger/u },
  { category: "tools", re: /iranki|grazt|pjukl|sriegikl|perforator|\btools?\b|\bdrills?\b|\bsaws?\b|инструмент|дрел|перфоратор|gereedschap|werkzeug/u },
  { category: "equipment", re: /irang|generator|kompresor|suvirinimo\s+aparat|equipment|compressor|оборудован|генератор|компрессор|ausrustung|apparatuur/u },
  { category: "machinery", re: /ekskavator|krautuv|traktor|kran(as|o|u)|buldozer|stakl|excavator|forklift|\bcranes?\b|bulldozer|machin(e|ery)|экскаватор|погрузчик|трактор|кран\b|станок|bagger|kraan/u },
  { category: "safety_equipment", re: /salm|apsaugin|liemen|safety\s+(equipment|gear|helmet)|helmet|каск|защитн|helm\b|veiligheids/u },
];

/** Availability wording that makes an equipment offer a RENTAL, not a sale. */
const RENTAL_RES =
  /laisv|nuomo|isnuomo|\brent(al)?\b|\bhire\b|for\s+hire|аренд|сда(м|ю|ем)|\bhuur|miet(e|en)/u;

function scanHaystack(statement: ValueStatement, text?: string): string {
  return foldText(`${statement.subjectLabel ?? ""} ${text ?? ""}`);
}

export function matchesRestrictedCategory(
  statement: ValueStatement,
  text?: string,
): boolean {
  const hay = scanHaystack(statement, text);
  return RESTRICTED_RES.some((re) => re.test(hay));
}

export function matchesFoodProduce(
  statement: ValueStatement,
  text?: string,
): boolean {
  const hay = scanHaystack(statement, text);
  return FOOD_RES.some((re) => re.test(hay));
}

export function matchWorkBoundedCategory(
  statement: ValueStatement,
  text?: string,
): ListingCategory | null {
  const hay = scanHaystack(statement, text);
  for (const { category, re } of CATEGORY_RES) {
    if (re.test(hay)) return category;
  }
  return null;
}

/** The value type a statement realizes on a channel, or null. */
function statementValueTypes(statement: ValueStatement): ChannelValueType[] {
  if (statement.subject === "goods") {
    return statement.offerMode === "rental" ||
      statement.offerMode === "availability"
      ? ["equipment_capacity", "goods"]
      : ["goods"];
  }
  if (statement.subject === "work_capacity") return ["work_capacity"];
  if (statement.subject === "workforce") return ["workforce"];
  if (statement.subject === "service") return ["service"];
  return [];
}

export function assessChannelEligibility(
  statement: ValueStatement,
  text?: string,
  authorityStatus: ProducibleAuthorityStatus = "claimed",
): ChannelEligibility {
  const verdicts: ChannelVerdict[] = [];

  // 1. RESTRICTED — every channel refuses; no alternative is suggested.
  if (statement.axis === "offer" && matchesRestrictedCategory(statement, text)) {
    for (const c of VALUE_CHANNELS) {
      verdicts.push({
        channelId: c.channelId,
        kind: "UNSUPPORTED",
        reasonKey: "restricted_category",
      });
    }
    return { authorityStatus, verdicts };
  }

  const types = statementValueTypes(statement);
  const isFood =
    statement.subject === "goods" && matchesFoodProduce(statement, text);
  const category =
    statement.subject === "goods"
      ? matchWorkBoundedCategory(statement, text)
      : null;

  for (const c of VALUE_CHANNELS) {
    verdicts.push(assessOne(c, statement, types, isFood, category));
  }
  return { authorityStatus, verdicts };
}

function assessOne(
  c: ValueChannelDescriptorV1,
  statement: ValueStatement,
  types: readonly ChannelValueType[],
  isFood: boolean,
  category: ListingCategory | null,
): ChannelVerdict {
  // An unreadable statement blocks every channel on the same missing facts.
  if (statement.subject === null) {
    return {
      channelId: c.channelId,
      kind: "NEEDS_MORE_INFORMATION",
      missingFields:
        statement.missing.length > 0 ? statement.missing : ["subject"],
    };
  }

  const supported = types.some((t) => c.valueTypesSupported.includes(t));
  if (!supported) {
    return {
      channelId: c.channelId,
      kind: "UNSUPPORTED",
      reasonKey: "value_type_not_supported",
    };
  }

  // Geography: a bounded external channel outside the stated country.
  if (
    c.geography !== "any" &&
    statement.country !== null &&
    !c.geography.includes(statement.country)
  ) {
    return {
      channelId: c.channelId,
      kind: "CHANNEL_RESTRICTED",
      reasonKey: "outside_geography",
    };
  }

  if (c.channelId === "internal_marketplace_listings") {
    // Food/produce: the marketplace is work-bounded and the platform has no
    // approved produce channel — name the check, do not route.
    if (isFood) {
      return {
        channelId: c.channelId,
        kind: "LEGAL_CHECK_REQUIRED",
        legalCheckKey: "food_sale_rules",
      };
    }
    if (category === null) {
      return {
        channelId: c.channelId,
        kind: "CHANNEL_RESTRICTED",
        reasonKey: "category_not_supported",
      };
    }
    if (!statement.subjectLabel) {
      return {
        channelId: c.channelId,
        kind: "NEEDS_MORE_INFORMATION",
        missingFields: ["subjectLabel"],
      };
    }
    return {
      channelId: c.channelId,
      kind: "CAN_ROUTE",
      listingCategory: category,
      listingKind:
        statement.offerMode === "rental" ||
        statement.offerMode === "availability"
          ? "rental"
          : "sale",
    };
  }

  return { channelId: c.channelId, kind: "CAN_ROUTE" };
}
