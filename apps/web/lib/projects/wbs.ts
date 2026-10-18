/**
 * Derived work-breakdown numbering — PROJECT → STAGE → TASK → SUBTASK.
 *
 * Pure, no IO. WBS numbers are NEVER stored: they are a view over
 * `project_stages.stage_order` and the sibling order of `work_tasks`
 * (created_at, then id — stable and total). A number therefore moves when a
 * stage is re-ordered and never lies about a row that no longer exists.
 *
 *   stage           "1", "2", …            (stage_order, created_at, id)
 *   task in stage   "1.1", "1.2", …
 *   subtask         "1.2.1", "1.2.2", …    (depth capped at WORK_TASK_MAX_DEPTH)
 *
 * Tasks with NO stage live in an explicit "unstaged" group and carry NO label
 * (`label: null`) — a made-up number would be a fabricated position. The same
 * goes for a subtask whose parent is not in the supplied list (hidden by RLS
 * or beyond the read limit): it is shown as an orphan with no label rather
 * than renumbered as if it were a root.
 *
 * A subtask's effective stage is its parent's (the database enforces "equal
 * or null"), so grouping follows the ROOT ancestor.
 */

/** Task depth cap mirrored by the DB trigger: task 1, subtask 2, sub-subtask 3. */
export const WORK_TASK_MAX_DEPTH = 3;

export interface WbsStageInput {
  readonly id: string;
  readonly stageOrder: number;
  readonly createdAt?: string | null;
}

export interface WbsTaskInput {
  readonly id: string;
  readonly stageId: string | null;
  readonly parentTaskId: string | null;
  readonly createdAt: string;
}

export interface WbsNode<T extends WbsTaskInput = WbsTaskInput> {
  readonly task: T;
  /** "1.2", "1.2.1" … or null (unstaged / orphan — never a fake number). */
  readonly label: string | null;
  /** 1 = task, 2 = subtask, 3 = sub-subtask. */
  readonly depth: number;
  /** Parent not present in the supplied list. */
  readonly orphan: boolean;
  readonly children: readonly WbsNode<T>[];
}

export interface WbsStageGroup<T extends WbsTaskInput = WbsTaskInput> {
  readonly stageId: string;
  /** "1", "2", … */
  readonly label: string;
  readonly roots: readonly WbsNode<T>[];
}

export interface WbsResult<T extends WbsTaskInput = WbsTaskInput> {
  readonly stages: readonly WbsStageGroup<T>[];
  /** Tasks with no (known) stage — explicit group, no numbering. */
  readonly unstaged: readonly WbsNode<T>[];
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpTime(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  const na = Number.isNaN(ta);
  const nb = Number.isNaN(tb);
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  return ta - tb;
}

/** Stable sibling order: created_at ascending, id as the tie-break. */
function compareTasks(a: WbsTaskInput, b: WbsTaskInput): number {
  return cmpTime(a.createdAt, b.createdAt) || cmpStr(a.id, b.id);
}

/** Stage order: stage_order, then created_at, then id. */
export function sortStagesForWbs<S extends WbsStageInput>(stages: readonly S[]): S[] {
  return [...stages].sort(
    (a, b) =>
      a.stageOrder - b.stageOrder ||
      cmpTime(a.createdAt, b.createdAt) ||
      cmpStr(a.id, b.id),
  );
}

export function deriveWbs<T extends WbsTaskInput>(
  stages: readonly WbsStageInput[],
  tasks: readonly T[],
): WbsResult<T> {
  const byId = new Map<string, T>();
  for (const t of tasks) byId.set(t.id, t);

  const childrenOf = new Map<string, T[]>();
  const rootsAll: T[] = [];
  for (const t of tasks) {
    if (t.parentTaskId && byId.has(t.parentTaskId) && t.parentTaskId !== t.id) {
      const list = childrenOf.get(t.parentTaskId) ?? [];
      list.push(t);
      childrenOf.set(t.parentTaskId, list);
    } else {
      rootsAll.push(t);
    }
  }

  const orphanIds = new Set(
    rootsAll.filter((t) => t.parentTaskId !== null).map((t) => t.id),
  );

  const sortedStages = sortStagesForWbs(stages);
  const stageIds = new Set(sortedStages.map((s) => s.id));

  /** Build one subtree. `prefix === null` means "no number" (unstaged/orphan). */
  const build = (
    task: T,
    prefix: string | null,
    index: number,
    depth: number,
    seen: ReadonlySet<string>,
  ): WbsNode<T> => {
    const label = prefix === null ? null : `${prefix}.${index}`;
    const nextSeen = new Set(seen).add(task.id);
    const kids =
      depth >= WORK_TASK_MAX_DEPTH
        ? []
        : (childrenOf.get(task.id) ?? [])
            .filter((c) => !nextSeen.has(c.id))
            .sort(compareTasks);
    return {
      task,
      label,
      depth,
      orphan: orphanIds.has(task.id),
      children: kids.map((c, i) => build(c, label, i + 1, depth + 1, nextSeen)),
    };
  };

  const buildRoots = (
    roots: readonly T[],
    stageLabel: string | null,
  ): WbsNode<T>[] => {
    const sorted = [...roots].sort(compareTasks);
    // Orphans never take a sibling index: they would shift real numbers.
    let n = 0;
    return sorted.map((t) => {
      if (orphanIds.has(t.id)) return build(t, null, 0, 1, new Set());
      n += 1;
      return build(t, stageLabel, n, 1, new Set());
    });
  };

  const stageGroups: WbsStageGroup<T>[] = sortedStages.map((s, i) => {
    const label = String(i + 1);
    const roots = rootsAll.filter((t) => t.stageId === s.id);
    return { stageId: s.id, label, roots: buildRoots(roots, label) };
  });

  const unstagedRoots = rootsAll.filter(
    (t) => !t.stageId || !stageIds.has(t.stageId),
  );
  return {
    stages: stageGroups,
    // No stage → no number, by design.
    unstaged: buildRoots(unstagedRoots, null),
  };
}

/** Depth-first flatten (render order). */
export function flattenWbs<T extends WbsTaskInput>(
  nodes: readonly WbsNode<T>[],
): WbsNode<T>[] {
  const out: WbsNode<T>[] = [];
  const walk = (list: readonly WbsNode<T>[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Parent candidates for a task: same project, not itself, not a descendant,
 * and shallow enough that the moved subtree still fits under the depth cap.
 * Advisory only — the RPC re-validates.
 */
export function parentCandidates<T extends WbsTaskInput & { readonly projectId?: string | null }>(
  tasks: readonly T[],
  self: { readonly id: string; readonly projectId: string | null },
): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depthOf = (t: T): number => {
    let d = 1;
    let cur: T | undefined = t;
    const seen = new Set<string>();
    while (cur?.parentTaskId && byId.has(cur.parentTaskId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentTaskId);
      d += 1;
    }
    return d;
  };
  const childrenOf = new Map<string, T[]>();
  for (const t of tasks) {
    if (t.parentTaskId) {
      const l = childrenOf.get(t.parentTaskId) ?? [];
      l.push(t);
      childrenOf.set(t.parentTaskId, l);
    }
  }
  const heightBelow = (id: string, guard = 0): number => {
    if (guard > WORK_TASK_MAX_DEPTH) return 0;
    const kids = childrenOf.get(id) ?? [];
    return kids.length === 0
      ? 0
      : 1 + Math.max(...kids.map((k) => heightBelow(k.id, guard + 1)));
  };
  const descendants = new Set<string>();
  const collect = (id: string, guard = 0) => {
    if (guard > WORK_TASK_MAX_DEPTH + 1) return;
    for (const k of childrenOf.get(id) ?? []) {
      if (descendants.has(k.id)) continue;
      descendants.add(k.id);
      collect(k.id, guard + 1);
    }
  };
  collect(self.id);
  const h = heightBelow(self.id);
  return tasks
    .filter(
      (t) =>
        t.id !== self.id &&
        !descendants.has(t.id) &&
        (t.projectId ?? null) === self.projectId &&
        depthOf(t) + 1 + h <= WORK_TASK_MAX_DEPTH,
    )
    .sort(compareTasks);
}
