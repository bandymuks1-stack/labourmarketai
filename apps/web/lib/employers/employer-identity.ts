/**
 * EMPLOYER IDENTITY RESOLUTION v1 — read-only, deterministic, no persistence.
 *
 * ── WHY THIS IS NOT A FUZZY NAME MATCHER ───────────────────────────────────
 *
 * `docs/audits/full-project-truth-2026-08-18.md` §J records the funnel gap as
 * "no canonicalisation of vacancy `employer_name` into a company entity" and
 * ranks it P1. That is true about the *entity* and misleading about the *work*:
 * it invites a name-similarity matcher over ~8.3k strings.
 *
 * Measured against production 2026-08-18 (46,217 rows), a name matcher would be
 * both unnecessary and dangerous:
 *
 *   * **45,744 of 46,217 rows (98.98%) already carry `employer_external_org_id`**
 *     — the source's own registry identifier, uniformly 10 characters. For
 *     `arbetsformedlingen` that is the Swedish organisationsnummer. Legal
 *     identity is already in the data; deriving it from spelling would be a
 *     downgrade from an authoritative key to a guess.
 *   * **0 names are shared by two registry ids.** There is no name collision to
 *     resolve.
 *   * Of 7,832 registry ids, only **158** carry more than one raw spelling, and
 *     **113 of those differ by letter case alone** (`Färgelanda kommun` vs
 *     `FÄRGELANDA KOMMUN`). The remaining 45 are mostly a parent plus a unit
 *     (`Arbetsförmedlingen`, `Arbetsförmedlingen Norrköping`, `SÖDRA GÖTEBORG`).
 *   * Of the 326 distinct names on rows with **no** registry id, exactly **one**
 *     matches a registry name case-insensitively.
 *
 * So fuzzy matching would buy ~1 link and risk the one failure that actually
 * matters: **merging two legal entities because their names look alike.** This
 * module therefore resolves identity from the registry id and treats the name
 * as a *label*, never as evidence of identity.
 *
 * ── INVARIANTS (each one has a test) ───────────────────────────────────────
 *
 *  1. Two distinct registry ids NEVER merge, whatever their names.
 *  2. A name-only group NEVER merges into a registry candidate. Where the names
 *     coincide it is reported as `unresolved`, for a human to decide — a shared
 *     trade name is not proof of shared legal identity.
 *  3. `registryId` is only ever copied from the input. It is never derived,
 *     inferred, parsed out of a name, or invented.
 *  4. `canonicalName` is always one of the spellings actually observed. No
 *     casing is invented, no legal form is added or removed.
 *  5. A row with neither a usable name nor a registry id is dropped and counted,
 *     never turned into a placeholder company.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ──────────────────────────────
 *
 * It writes nothing. Persisting these candidates needs a table and therefore an
 * owner-gated production migration; see `docs/audits/employer-identity-v1.md`
 * for the exact approval that step requires, including the privacy point that a
 * Swedish sole trader's organisationsnummer **is** their personnummer, so the
 * registry id is not automatically safe to store or display.
 */

/** How much the identity of a candidate can be trusted. */
export type EmployerIdentityConfidence =
  /** The source supplied a registry identifier. Authoritative. */
  | "registry"
  /** No registry identifier; grouped by normalised name within one provider. */
  | "name-only";

/** The three fields identity resolution reads. Nothing else is consulted. */
export interface EmployerSourceRow {
  readonly providerKey: string;
  readonly employerName: string | null;
  readonly employerExternalOrgId: string | null;
}

export interface EmployerCandidate {
  /** Stable, provider-scoped. `registry:<provider>:<id>` or `name:<provider>:<key>`. */
  readonly key: string;
  readonly providerKey: string;
  /** Copied verbatim from the source, or null. Never derived. */
  readonly registryId: string | null;
  /** One of `observedNames`, chosen deterministically. Never synthesised. */
  readonly canonicalName: string;
  /** Every distinct spelling seen, normalised for whitespace only, sorted. */
  readonly observedNames: readonly string[];
  readonly rowCount: number;
  readonly confidence: EmployerIdentityConfidence;
  /** Why this candidate is what it is, in human-readable terms. */
  readonly evidence: readonly string[];
  /** Non-empty when a human must decide something. Never auto-resolved. */
  readonly unresolved: readonly string[];
}

export interface EmployerResolutionStats {
  readonly rowsSeen: number;
  readonly rowsWithRegistryId: number;
  readonly rowsNameOnly: number;
  /** Rows with no usable name AND no registry id. Dropped, not invented. */
  readonly rowsUnusable: number;
  readonly distinctRawNames: number;
  readonly registryCandidates: number;
  readonly nameOnlyCandidates: number;
  /** Registry candidates whose spellings differ by letter case alone. */
  readonly registryCandidatesCaseOnlyVariants: number;
  /** Registry candidates carrying genuinely different name strings. */
  readonly registryCandidatesMultiName: number;
  /** Name-only candidates whose name coincides with a registry candidate's. */
  readonly nameOnlyCollidingWithRegistry: number;
}

export interface EmployerResolution {
  readonly candidates: readonly EmployerCandidate[];
  readonly stats: EmployerResolutionStats;
}

/**
 * Whitespace/format normalisation for DISPLAY. Case is preserved — the source's
 * own casing is data, and "fixing" it would be invention.
 *
 * NFKC first so that widths and composed accents compare equal; `Å` typed as
 * `A` + combining ring must not become a second company.
 */
export function normalizeEmployerName(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/[\s ]+/g, " ")
    .trim()
    .replace(/[,;:.•\-–—]+$/u, "")
    .trim();
}

/**
 * Grouping key for name-only rows. Case-folded, accent-preserving.
 *
 * Accents are NOT stripped: `Malmö` and `Malmo` are different strings and this
 * layer has no authority to declare them the same company.
 */
export function employerNameKey(raw: string | null | undefined): string {
  return normalizeEmployerName(raw).toLocaleLowerCase("sv-SE");
}

function isAllUpperCase(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters === letters.toLocaleUpperCase("sv-SE");
}

/**
 * Pick the display name for a group, deterministically and without invention.
 *
 * TWO STAGES, and the order matters — getting it wrong was caught by real data.
 *
 * Stage 1 picks WHICH NAME, by folded row count. The source's dominant label is
 * the best available evidence of what the entity is called.
 *
 * Stage 2 picks WHICH SPELLING of that name, preferring a form that is not
 * ALL-CAPS, then the shortest, then lexicographic order.
 *
 * Casing preference is deliberately confined to stage 2. A first draft applied
 * it across all names, which on real production data promoted a branch office
 * over the company: `K-bemanning Värnamokontoret` (1 row, mixed case) beat
 * `K-BEMANNING AB` (15 rows) purely because the latter shouts. Frequency
 * decides the name; casing only decides how that name is written.
 *
 * On the real multi-spelling groups this yields `Försvarsmakten` (374 rows
 * across two spellings), `Arbetsförmedlingen` (44, over its two branch labels),
 * and `Färgelanda kommun` — while keeping `K-BEMANNING AB` and
 * `SAAB AKTIEBOLAG`, whose dominant spellings are genuinely upper-case.
 */
export function chooseCanonicalName(counts: ReadonlyMap<string, number>): string {
  const entries = [...counts.entries()].filter(([name]) => name.length > 0);
  if (entries.length === 0) return "";

  // Stage 1 — fold spellings together and find the dominant name.
  const folded = new Map<string, { rows: number; spellings: string[] }>();
  for (const [name, rows] of entries) {
    const key = employerNameKey(name);
    const bucket = folded.get(key);
    if (bucket) {
      bucket.rows += rows;
      bucket.spellings.push(name);
    } else {
      folded.set(key, { rows, spellings: [name] });
    }
  }
  const foldedEntries = [...folded.entries()].sort((a, b) => {
    if (b[1].rows !== a[1].rows) return b[1].rows - a[1].rows;
    // Ties: the shorter name is the parent, not a branch, then lexicographic.
    if (a[0].length !== b[0].length) return a[0].length - b[0].length;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  // Stage 2 — choose the spelling of that name.
  const spellings = [...foldedEntries[0]![1].spellings].sort((a, b) => {
    const aCaps = isAllUpperCase(a);
    const bCaps = isAllUpperCase(b);
    if (aCaps !== bCaps) return aCaps ? 1 : -1;
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return spellings[0]!;
}

interface Bucket {
  providerKey: string;
  registryId: string | null;
  nameCounts: Map<string, number>;
  rowCount: number;
}

function bucketKey(providerKey: string, registryId: string | null, nameKey: string): string {
  return registryId === null
    ? `name:${providerKey}:${nameKey}`
    : `registry:${providerKey}:${registryId}`;
}

/**
 * Group rows into employer candidates.
 *
 * Registry rows group by (provider, registry id) — identity comes from the
 * source. Rows without a registry id group by (provider, folded name), which is
 * a labelling convenience and is reported as `name-only`, never as identity.
 */
export function buildEmployerCandidates(
  rows: Iterable<EmployerSourceRow>,
): EmployerResolution {
  const buckets = new Map<string, Bucket>();
  const rawNames = new Set<string>();
  let rowsSeen = 0;
  let rowsWithRegistryId = 0;
  let rowsNameOnly = 0;
  let rowsUnusable = 0;

  for (const row of rows) {
    rowsSeen += 1;
    const providerKey = (row.providerKey ?? "").trim();
    const name = normalizeEmployerName(row.employerName);
    const registryId = (row.employerExternalOrgId ?? "").trim() || null;

    if (name.length > 0) rawNames.add(name);

    // Invariant 5: nothing to identify and nothing to label — drop, don't invent.
    if (registryId === null && (name.length === 0 || providerKey.length === 0)) {
      rowsUnusable += 1;
      continue;
    }
    if (providerKey.length === 0) {
      rowsUnusable += 1;
      continue;
    }

    if (registryId === null) rowsNameOnly += 1;
    else rowsWithRegistryId += 1;

    const key = bucketKey(providerKey, registryId, employerNameKey(name));
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { providerKey, registryId, nameCounts: new Map(), rowCount: 0 };
      buckets.set(key, bucket);
    }
    bucket.rowCount += 1;
    if (name.length > 0) {
      bucket.nameCounts.set(name, (bucket.nameCounts.get(name) ?? 0) + 1);
    }
  }

  // Registry names, folded, so name-only groups can be FLAGGED against them.
  // This map is used to raise a question, never to merge. (Invariant 2.)
  const registryNameIndex = new Map<string, string[]>();
  for (const [key, bucket] of buckets) {
    if (bucket.registryId === null) continue;
    for (const name of bucket.nameCounts.keys()) {
      const folded = employerNameKey(name);
      const list = registryNameIndex.get(folded);
      if (list) {
        if (!list.includes(key)) list.push(key);
      } else {
        registryNameIndex.set(folded, [key]);
      }
    }
  }

  const candidates: EmployerCandidate[] = [];
  let registryCandidates = 0;
  let nameOnlyCandidates = 0;
  let registryCandidatesCaseOnlyVariants = 0;
  let registryCandidatesMultiName = 0;
  let nameOnlyCollidingWithRegistry = 0;

  for (const [key, bucket] of buckets) {
    const observedNames = [...bucket.nameCounts.keys()].sort();
    const canonicalName = chooseCanonicalName(bucket.nameCounts);
    const foldedDistinct = new Set(observedNames.map((n) => employerNameKey(n)));
    const evidence: string[] = [];
    const unresolved: string[] = [];

    if (bucket.registryId !== null) {
      registryCandidates += 1;
      evidence.push(
        `provider "${bucket.providerKey}" supplied a registry identifier for all ${bucket.rowCount} row(s)`,
      );
      if (observedNames.length > 1) {
        if (foldedDistinct.size === 1) {
          registryCandidatesCaseOnlyVariants += 1;
          evidence.push(
            `${observedNames.length} spellings differing by letter case only; kept the source's own non-uppercase form`,
          );
        } else {
          registryCandidatesMultiName += 1;
          evidence.push(
            `${observedNames.length} distinct names share this registry id — the source reports units or branches under one entity`,
          );
          unresolved.push(
            `names other than "${canonicalName}" may be units rather than alternate spellings: ${observedNames
              .filter((n) => n !== canonicalName)
              .map((n) => `"${n}"`)
              .join(", ")}`,
          );
        }
      }
    } else {
      nameOnlyCandidates += 1;
      evidence.push(
        `provider "${bucket.providerKey}" supplied NO registry identifier for ${bucket.rowCount} row(s); grouped by normalised name only`,
      );
      unresolved.push(
        "no registry identifier — this is a label, not a verified legal entity",
      );
      const collides = registryNameIndex.get(employerNameKey(canonicalName));
      if (collides && collides.length > 0) {
        nameOnlyCollidingWithRegistry += 1;
        unresolved.push(
          `name also appears under registry candidate(s) ${collides.join(", ")}; a shared trade name is not proof of legal identity, so this is NOT merged`,
        );
      }
    }

    candidates.push({
      key,
      providerKey: bucket.providerKey,
      registryId: bucket.registryId,
      canonicalName,
      observedNames,
      rowCount: bucket.rowCount,
      confidence: bucket.registryId !== null ? "registry" : "name-only",
      evidence,
      unresolved,
    });
  }

  candidates.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    candidates,
    stats: {
      rowsSeen,
      rowsWithRegistryId,
      rowsNameOnly,
      rowsUnusable,
      distinctRawNames: rawNames.size,
      registryCandidates,
      nameOnlyCandidates,
      registryCandidatesCaseOnlyVariants,
      registryCandidatesMultiName,
      nameOnlyCollidingWithRegistry,
    },
  };
}
