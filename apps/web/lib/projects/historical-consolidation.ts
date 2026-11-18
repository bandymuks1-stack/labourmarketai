/**
 * HISTORICAL PROJECT CONSOLIDATION — the deterministic proposal (pure).
 *
 * The timesheet import made a project row from the raw object cell, and that
 * cell mixed the object CODE, the ADDRESS and the WORK DESCRIPTION
 * ("Cerero beton, W22.073"; "plamuur, Travers 19"). One real object became
 * dozens of rows. This proposes which rows are the same object — and nothing
 * else:
 *
 *   A  same single object code (W22.073; "w22:073" is the same code), or the
 *      same street + house number (spacing/case/city suffix only) with work
 *      periods that touch — proposed for merging
 *   B  same street + number but the rows name two numbers ("43/45") or the
 *      work periods are far apart (possibly separate orders) — shown, never
 *      merged without an explicit owner decision
 *
 * Never proposed: rows naming two or more codes (hours are never split), rows
 * with no code and no house number (a place name or a work description), and
 * anything merely SIMILAR ("Havenweg 81" / "Nieuwe Havenweg 81").
 *
 * Merging is the owner's own audited marker (mark_project_duplicate_v1):
 * every row and every record stays; readers fold fragments into the canonical.
 */

export interface ConsolidationInputProject {
  readonly id: string;
  readonly title: string | null;
  readonly createdAt: string;
  /** Names of the project's work objects (the imported object cells). */
  readonly objectNames: readonly string[];
  readonly records: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
}

export interface ConsolidationGroup {
  readonly key: string;
  readonly level: "A" | "B";
  /** What makes the rows one object, in words the owner can check. */
  readonly basis: string;
  readonly canonicalId: string;
  readonly fragmentIds: readonly string[];
  /** Why a B group is not merged automatically. */
  readonly caution: string | null;
}

/** Work periods further apart than this may be separate orders → B. */
export const SEPARATE_ORDER_GAP_DAYS = 180;

const CODE = /\b[Ww]22[.:](\d{3})\b/g;

export function objectCodesOf(text: string): string[] {
  return [...new Set([...text.matchAll(CODE)].map((m) => `W22.${m[1]}`))];
}

/** Street + house number, normalized ("borneolaan48" → "borneolaan 48"). */
export function addressKeyOf(text: string): string | null {
  const spaced = text.replace(/([A-Za-zÀ-ž])(\d)/g, "$1 $2");
  // The imported cell puts the work first and the place LAST
  // ("montage deurkozijn, blokken 1 rij, Travers 19"), so the last
  // street + number is the address; an earlier one is part of the work text.
  const all = [...spaced.matchAll(/([A-Za-zÀ-ž'.-]+(?:\s[A-Za-zÀ-ž'.-]+)*)\s+(\d+[a-zA-Z]?)(?:\s*[/]\s*(\d+))?/g)];
  const m = all[all.length - 1];
  if (!m) return null;
  const street = m[1]!.toLowerCase().replace(/\s+/g, " ").trim();
  return `${street} ${m[2]!.toLowerCase()}${m[3] ? `/${m[3]}` : ""}`;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** The gap between two rows' work periods (0 when they overlap). */
function periodGap(x: ConsolidationInputProject, y: ConsolidationInputProject): number {
  if (!x.firstDate || !y.firstDate || !x.lastDate || !y.lastDate) return 0;
  if (x.lastDate < y.firstDate) return daysBetween(x.lastDate, y.firstDate);
  if (y.lastDate < x.firstDate) return daysBetween(y.lastDate, x.firstDate);
  return 0;
}

const BARE = /^(W22\.\d{3}( \(\d+\)| \(adresas nerastas žodyne\))?|[A-Za-zÀ-ž'.\- ]+\s\d+[a-zA-Z]?( [A-Za-zÀ-ž]+)?)$/;

function pickCanonical(rows: readonly ConsolidationInputProject[]): ConsolidationInputProject {
  // Prefer the row whose name IS the object (bare code / bare address), then
  // the one carrying the most records, then the oldest, then the id.
  return [...rows].sort((a, b) => {
    const an = BARE.test(a.objectNames[0] ?? a.title ?? "") ? 0 : 1;
    const bn = BARE.test(b.objectNames[0] ?? b.title ?? "") ? 0 : 1;
    return an - bn || b.records - a.records || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  })[0]!;
}

export function proposeConsolidation(projects: readonly ConsolidationInputProject[]): ConsolidationGroup[] {
  const byKey = new Map<string, ConsolidationInputProject[]>();
  for (const p of projects) {
    const text = [...p.objectNames, p.title ?? ""].join(" | ");
    const codes = objectCodesOf(text);
    let key: string | null = null;
    if (codes.length === 1) key = `code:${codes[0]}`;
    else if (codes.length === 0) {
      // Every object name must point at the same street + number.
      const keys = new Set(p.objectNames.map((n) => addressKeyOf(n)).filter((k): k is string => !!k));
      if (keys.size === 1) key = `addr:${[...keys][0]}`;
    }
    if (!key) continue;
    const arr = byKey.get(key);
    if (arr) arr.push(p);
    else byKey.set(key, [p]);
  }

  // A "43/45" row is the same street as "43" but names two numbers → B with it.
  const groups: ConsolidationGroup[] = [];
  const twoNumber = [...byKey.keys()].filter((k) => k.startsWith("addr:") && k.includes("/"));
  for (const k of twoNumber) {
    const base = k.slice(0, k.indexOf("/"));
    const host = byKey.get(base);
    if (host) {
      host.push(...byKey.get(k)!);
      byKey.delete(k);
      byKey.set(`${base}#two-numbers`, host);
      byKey.delete(base);
    }
  }

  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;
    const canonical = pickCanonical(rows);
    const fragments = rows.filter((r) => r.id !== canonical.id);
    const isCode = key.startsWith("code:");
    const label = key.replace(/^code:|^addr:/, "").replace("#two-numbers", "");
    let caution: string | null = null;
    if (key.endsWith("#two-numbers")) caution = "two-numbers";
    else if (!isCode && fragments.some((f) => periodGap(f, canonical) > SEPARATE_ORDER_GAP_DAYS)) caution = "periods-apart";
    groups.push({
      key,
      level: caution ? "B" : "A",
      basis: isCode ? `object code ${label}` : `address ${label}`,
      canonicalId: canonical.id,
      fragmentIds: fragments.map((f) => f.id).sort(),
      caution,
    });
  }
  return groups.sort((a, b) => (a.level < b.level ? -1 : a.level > b.level ? 1 : b.fragmentIds.length - a.fragmentIds.length));
}
