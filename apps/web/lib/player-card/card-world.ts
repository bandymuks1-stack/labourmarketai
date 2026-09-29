/**
 * THE PERSON'S PROFESSIONAL WORLD — the data the Player Card's spatial scene
 * draws (owner 2026-09-29 §30–§34 + premium addendum C–G).
 *
 * The scene is not a second card. It is the SAME facts the card's sections
 * already state, placed in space: the person at the centre, five satellites
 * (work, skills, evidence, history, next) sized by how much real record each
 * one holds, and — per mode — the rows behind that satellite.
 *
 * RULES
 *   · every node is a canonical row the card already read: a skill-evidence
 *     bar, a history lane, a current engagement, an evidence month, an
 *     adjacent direction derived by the existing engine. Nothing is invented
 *     to fill space; an empty satellite is drawn as empty (a ghost), never
 *     padded;
 *   · weights are listing weights for size only (log of a real count), never
 *     a score, rank or percentage shown to anyone;
 *   · plain serializable data — it crosses into a "use client" scene, so no
 *     function, Date, Map or Set (lib/guards/server-to-client-function-props).
 *
 * Pure — no IO.
 */

import type { PlayerCardMode } from "@/lib/player-card/card-modes";
import type { SkillEvidenceBar, EvidenceMonth, HistoryLane } from "@/lib/player-card/evidence-visuals";

export type WorldSatelliteKey = Exclude<PlayerCardMode, "identity">;

export type WorldNodeTone =
  | "confirmed" // a manager/client confirmed it — trust green
  | "recorded" // the journal backs it — evidence cyan
  | "declared" // the person said it, no record yet — hollow ivory
  | "current" // happening now
  | "past"
  | "direction"; // a possible next step, not a fact about the person

export type WorldNode = {
  readonly id: string;
  readonly label: string;
  /** One short factual line ("12 records", "2023-06 – now"), or null. */
  readonly detail: string | null;
  /** 0..1 — size only. */
  readonly weight: number;
  readonly tone: WorldNodeTone;
  /** The real number behind it when there is one (records for a skill). */
  readonly count?: number;
};

export type WorldSatellite = {
  readonly key: WorldSatelliteKey;
  readonly label: string;
  /** How many real rows sit behind it (0 → drawn as an empty ghost). */
  readonly count: number;
  /** 0..1 — size only. */
  readonly weight: number;
};

export type WorldEvidenceSource = {
  readonly key: "journal" | "confirmed" | "declared";
  readonly label: string;
  /** Skill node ids that come from this source. */
  readonly skillIds: readonly string[];
};

export type PlayerCardWorldModel = {
  readonly person: {
    readonly name: string;
    readonly initials: string;
    /** A real, consented photo only — else the engraved monogram. */
    readonly avatarUrl: string | null;
    readonly professions: readonly string[];
    /** Gold edge ONLY when a real confirmation row derives it (P6). */
    readonly confirmedEdge: boolean;
    /** Where they work now — the organizations of CURRENT engagements. */
    readonly currentWork: readonly string[];
    readonly currentWorkLabel: string;
    /** The journal's own all-time figures, already formatted (may be empty). */
    readonly facts: readonly { readonly value: string; readonly label: string }[];
    /** The provenance edge in words (P6: never colour alone). */
    readonly provenance: { readonly label: string; readonly text: string };
  };
  readonly satellites: readonly WorldSatellite[];
  readonly work: readonly WorldNode[];
  readonly skills: readonly WorldNode[];
  readonly evidence: {
    readonly sources: readonly WorldEvidenceSource[];
    readonly months: readonly WorldNode[];
  };
  readonly history: readonly WorldNode[];
  readonly next: readonly WorldNode[];
  /** Localized words the scene itself needs (all strings). */
  readonly words: {
    readonly sceneLabel: string;
    readonly empty: string;
    /** NEXT is not a record — its empty state says what would open it. */
    readonly emptyNext: string;
    /** The disclosure that holds the whole card's facts under the scene. */
    readonly allDetails: string;
  };
};

/** log-scaled 0..1 against the largest value in the set (size only). */
function weigh(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.log1p(value) / Math.log1p(max);
}

const MAX_SKILLS = 8;
const MAX_HISTORY = 7;
const MAX_WORK = 4;
const MAX_NEXT = 4;
const MAX_MONTHS = 12;

export type CardWorldInput = {
  readonly person: PlayerCardWorldModel["person"];
  readonly modeLabels: Readonly<Record<WorldSatelliteKey, string>>;
  readonly currentWork: readonly string[];
  readonly skillBars: readonly SkillEvidenceBar[];
  readonly skillNames: readonly string[];
  readonly skillEntryLabels: readonly string[];
  readonly noEvidence: string;
  readonly tierLabels: Readonly<Record<"verified" | "journal" | "declared", string>>;
  readonly months: readonly EvidenceMonth[];
  readonly monthLabels: readonly string[];
  readonly lanes: readonly HistoryLane[];
  readonly laneDetails: readonly string[];
  readonly currentLabel: string;
  readonly directions: readonly { readonly id: string; readonly label: string; readonly detail: string | null; readonly shared: number }[];
  readonly words: PlayerCardWorldModel["words"];
};

export function buildCardWorld(input: CardWorldInput): PlayerCardWorldModel {
  const skillRows = input.skillBars.slice(0, MAX_SKILLS).map((bar, i) => ({ bar, i }));
  const maxEntries = Math.max(0, ...skillRows.map((r) => r.bar.entries));
  const skills: WorldNode[] = skillRows.map(({ bar, i }) => ({
    id: `skill:${bar.slug}`,
    label: input.skillNames[i] ?? bar.slug,
    detail: bar.entries > 0 ? (input.skillEntryLabels[i] ?? null) : input.noEvidence,
    // a declared skill with no record still exists — drawn small, never absent
    weight: bar.entries > 0 ? Math.max(0.25, weigh(bar.entries, maxEntries)) : 0.12,
    tone: bar.tier === "verified" ? "confirmed" : bar.tier === "journal" ? "recorded" : "declared",
    count: bar.entries,
  }));

  const sources: WorldEvidenceSource[] = (
    [
      { key: "confirmed", tier: "verified" },
      { key: "journal", tier: "journal" },
      { key: "declared", tier: "declared" },
    ] as const
  )
    .map(({ key, tier }) => ({
      key,
      label: input.tierLabels[tier],
      skillIds: skillRows.filter((r) => r.bar.tier === tier).map((r) => `skill:${r.bar.slug}`),
    }))
    .filter((s) => s.skillIds.length > 0);

  const recentMonths = input.months
    .map((m, i) => ({ m, label: input.monthLabels[i] ?? m.month }))
    .slice(-MAX_MONTHS);
  const maxMonth = Math.max(0, ...recentMonths.map((r) => r.m.entries));
  const months: WorldNode[] = recentMonths.map(({ m, label }) => ({
    id: `month:${m.month}`,
    label,
    detail: m.entries > 0 ? String(m.entries) : null,
    weight: weigh(m.entries, maxMonth),
    tone: "recorded",
  }));

  // oldest → newest, so the path reads forward in time
  const history: WorldNode[] = input.lanes
    .map((lane, i) => ({ lane, detail: input.laneDetails[i] ?? null }))
    .sort((a, b) => a.lane.startFraction - b.lane.startFraction)
    .slice(-MAX_HISTORY)
    .map(({ lane, detail }) => ({
      id: `history:${lane.id}`,
      label: lane.label,
      // the lane's own dates already say "now" for a current engagement;
      // the word is added only when there are no dates to say it
      detail: detail ?? (lane.current ? input.currentLabel : null),
      weight: Math.max(0.2, Math.min(1, lane.endFraction - lane.startFraction + 0.2)),
      tone: lane.current ? "current" : "past",
    }));

  const work: WorldNode[] = [...new Set(input.currentWork.map((w) => w.trim()).filter(Boolean))]
    .slice(0, MAX_WORK)
    .map((org, i) => ({ id: `work:${i}`, label: org, detail: input.currentLabel, weight: 0.8, tone: "current" }));

  const maxShared = Math.max(0, ...input.directions.map((d) => d.shared));
  const next: WorldNode[] = input.directions.slice(0, MAX_NEXT).map((d) => ({
    id: `next:${d.id}`,
    label: d.label,
    detail: d.detail,
    weight: Math.max(0.3, weigh(d.shared, maxShared)),
    tone: "direction",
  }));

  const recordedEntries = input.skillBars.reduce((n, b) => n + b.entries, 0);
  const monthEntries = input.months.reduce((n, m) => n + m.entries, 0);
  const counts: Record<WorldSatelliteKey, number> = {
    work: work.length,
    skills: input.skillBars.length,
    evidence: Math.max(monthEntries, recordedEntries > 0 ? 1 : 0),
    history: input.lanes.length,
    next: next.length,
  };
  const maxCount = Math.max(0, ...Object.values(counts));
  const order: WorldSatelliteKey[] = ["next", "history", "skills", "work", "evidence"];
  const satellites: WorldSatellite[] = order.map((key) => ({
    key,
    label: input.modeLabels[key],
    count: counts[key],
    weight: weigh(counts[key], maxCount),
  }));

  return { person: input.person, satellites, work, skills, evidence: { sources, months }, history, next, words: input.words };
}
