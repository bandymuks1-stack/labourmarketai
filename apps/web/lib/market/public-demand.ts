/**
 * PUBLIC DEMAND PER PROFESSION — the one rule for reading
 * `count_public_vacancies_by_profession_v1`. PURE, DB-free, no `server-only`
 * so any reader in any domain can hold it.
 *
 * The function is a GROUPED TOP-N: it counts the active, unexpired public
 * vacancies, groups by profession, orders by count descending and LIMITs. So
 * a profession can be absent from the result for two completely different
 * reasons, and telling them apart is the whole job here:
 *
 *   · the list came back SHORTER than the limit — every profession with any
 *     active vacancy is in it, so an absent profession has a MEASURED ZERO;
 *   · the list came back FULL — it may be truncated, so an absent profession
 *     is NOT MEASURED, and `null` is the only honest answer.
 *
 * SEP-7 cuts BOTH ways, and this product has now got it wrong in both
 * directions within one day:
 *
 *   · `programs.ts` read `?? 0`, so a truncated list would have reported a
 *     measured zero for a profession nobody counted;
 *   · the "fix" for that returned `null` unconditionally, which HID a real
 *     zero — production's `builder` programme has genuinely no active public
 *     vacancy (verified directly against `public_vacancies`), and the
 *     institution was told the number was unavailable.
 *
 * An unknown dressed as a zero and a zero dressed as an unknown are the same
 * defect. Both mislead the person planning against the number.
 *
 * WHY IT LIVES HERE. `lib/learning/learning-compass.ts` already had this rule,
 * correct and inline, while `lib/education/programs.ts` had a second, wrong
 * copy — two readers of ONE function with two answers for the same profession.
 * That is the drift a shared rule prevents, so the rule has one home and both
 * read it.
 */

/** The limit every caller requests, so `exhaustive` means the same thing. */
export const PUBLIC_DEMAND_LIMIT = 100;

export interface PublicDemandRead {
  readonly bySlug: ReadonlyMap<string, number>;
  /** The list was SHORTER than the requested limit, so absence is a zero. */
  readonly exhaustive: boolean;
}

/** Build the read from the RPC's rows. `rows.length < limit` ⇒ exhaustive. */
export function publicDemandRead(
  rows: ReadonlyArray<{ profession_slug?: unknown; active_vacancies?: unknown }>,
  requestedLimit: number = PUBLIC_DEMAND_LIMIT,
): PublicDemandRead {
  const bySlug = new Map<string, number>();
  for (const row of rows) {
    bySlug.set(String(row.profession_slug), Number(row.active_vacancies ?? 0));
  }
  return { bySlug, exhaustive: rows.length < requestedLimit };
}

/**
 * The demand number for one profession, or null when it is NOT KNOWN.
 *
 * `demand === null` is a FAILED read — "we could not ask" is not "there is
 * none". A profession with no work direction set has nothing to count.
 */
export function demandCountFor(
  targetProfessionSlug: string | null,
  demand: PublicDemandRead | null,
): number | null {
  if (!targetProfessionSlug || !demand) return null;
  const found = demand.bySlug.get(targetProfessionSlug);
  if (found !== undefined) return found;
  return demand.exhaustive ? 0 : null;
}
