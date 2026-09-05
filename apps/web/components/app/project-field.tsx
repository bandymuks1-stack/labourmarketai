"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type {
  FieldLane,
  FieldReadyRow,
  FieldSlot,
  FieldToken,
  LaneEdge,
  ProjectField,
  TokenState,
} from "@/lib/projects/field-model";
import { STAGE_STATUSES, type StageStatus } from "@/lib/projects/stages-model";
import { WORK_TASK_STATUSES, type WorkTask, type WorkTaskStatus } from "@/lib/tasks/task-model";
import type { OperationalStatus, ReadinessItem, ReadinessStatus } from "@/lib/projects/operations-derive";
import { playerInitials, PLAYER_IDENTITY_AVATAR_BORDER, PLAYER_IDENTITY_FALLBACK_SURFACE } from "@/lib/identity/player-identity";
import { upsertReadinessItemAction } from "@/lib/projects/operations-actions";
import { updateStageStatusAction } from "@/lib/projects/stages-actions";
import { endAssignmentAction } from "@/lib/projects/actions";
import { sendWorkInstructionAction } from "@/lib/instructions/actions";
import { setWorkTaskStatusForChatAction } from "@/lib/tasks/task-chat-actions";
import { Card } from "@/components/ui/Card";

/**
 * THE FIELD on the operations page (frozen design contract §5 P4 — the
 * commercial subset; design system §C Project = field, §G, §P, §S, §T).
 *
 * Added ON the existing operations page (§1.5: nothing removed, no redirect).
 * Lanes = the project's stages in time; tokens = the people on the project;
 * dashed slots = missing capacity; the ready edge = people who can come;
 * a red edge = a person the checklist blocks.
 *
 * ONE BACKBONE (owner contract §1a): every control here is a REGISTERED
 * canonical action the chat already executes — the same server action, the
 * same authorisation inside its RPC, the same record, and a READBACK: after a
 * write the page is re-read (`router.refresh()`), nothing is shown from local
 * optimistic state. No drag in this subset: click / keyboard only.
 *
 *   readiness row  → upsertReadinessItemAction    (company.set-readiness-item)
 *   ask the person → sendWorkInstructionAction    (company.request-readiness)
 *   stage status   → updateStageStatusAction      (company.update-stage-status)
 *   work status    → setWorkTaskStatusForChatAction (company.update-task-status)
 *   leave project  → endAssignmentAction          (company.move-worker's 2nd step)
 *
 * Accessibility (§3 / §S): every object is a real button (≥ 44 px), state is
 * edge + text + symbol (never colour alone), Escape clears the selection, and
 * the LIST view renders the same objects with the same buttons.
 */

type Selection =
  | { kind: "token"; workerId: string }
  | { kind: "lane"; id: string }
  | { kind: "slot"; id: string }
  | { kind: "ready"; workerId: string };

function selKey(s: Selection): string {
  return `${s.kind}:${"id" in s ? s.id : s.workerId}`;
}

const EDGE_CLASS: Record<LaneEdge, string> = {
  done: "border-l-state-success",
  now: "border-l-brand-cyan",
  risk: "border-l-state-amber",
  blocked: "border-l-state-danger",
  planned: "border-l-ink-500",
  cancelled: "border-l-ink-600",
};

const EDGE_SYMBOL: Record<LaneEdge, string> = {
  done: "✓",
  now: "▶",
  risk: "!",
  blocked: "✕",
  planned: "○",
  cancelled: "—",
};

const BAR_CLASS: Record<LaneEdge, string> = {
  done: "bg-state-success/70",
  now: "bg-brand-cyan/80",
  risk: "bg-state-amber/80",
  blocked: "bg-state-danger/80",
  planned: "bg-ink-500",
  cancelled: "bg-ink-600",
};

const TOKEN_CLASS: Record<TokenState, string> = {
  clear: "border-l-state-success",
  needs: "border-l-state-amber",
  blocked: "border-l-state-danger",
  untracked: "border-l-ink-500",
};

const TOKEN_SYMBOL: Record<TokenState, string> = {
  clear: "✓",
  needs: "!",
  blocked: "✕",
  untracked: "○",
};

const OBJECT_BUTTON =
  "flex min-h-11 w-full items-center gap-2 rounded-md border border-ink-600 border-l-4 px-3 py-2 text-left transition-colors duration-fast hover:border-brand-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-cyan aria-pressed:border-brand-cyan aria-pressed:bg-ink-800";
const CONTROL =
  "inline-flex min-h-11 items-center rounded-md border border-ink-600 px-3 text-xs font-medium text-text-secondary transition-colors hover:border-brand-cyan hover:text-text-primary disabled:opacity-50";
const SELECT =
  "min-h-11 rounded-md border border-ink-600 bg-ink-800/40 px-2 text-xs text-text-primary";
const META = "font-mono text-meta uppercase tracking-label text-text-muted";

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** The projectOps labels the context panel shows — passed from the page
 *  (projectOps is not shipped to the client; the operations board does the
 *  same), so the Field and the board say the same words for the same row. */
export interface ProjectFieldLabels {
  readonly readinessStatus: Record<ReadinessStatus, string>;
  readonly operationalStatus: Record<OperationalStatus, string>;
}

export function ProjectField({
  field,
  tasks,
  projectId,
  locale,
  readAt,
  labels,
}: {
  field: ProjectField;
  /** Open work on the project (the operations centre's own bounded read). */
  tasks: readonly WorkTask[];
  projectId: string;
  locale: string;
  /** When the page read its records — the freshness line (design §P). */
  readAt: string;
  labels: ProjectFieldLabels;
}) {
  const t = useTranslations("projectField");
  const [view, setView] = useState<"field" | "list">("field");
  const [rawSelection, setSelection] = useState<Selection | null>(null);

  const tasksById = useMemo(() => new Map(tasks.map((x) => [x.id, x] as const)), [tasks]);

  // A selected object that the readback removed (e.g. the person left the
  // project) must not keep a stale context open — derived, never an effect.
  const selection: Selection | null =
    rawSelection === null
      ? null
      : (rawSelection.kind === "token" && field.people.some((p) => p.workerId === rawSelection.workerId)) ||
          (rawSelection.kind === "lane" && field.lanes.some((l) => l.id === rawSelection.id)) ||
          (rawSelection.kind === "slot" && field.slots.some((s) => s.id === rawSelection.id)) ||
          (rawSelection.kind === "ready" && field.ready.rows.some((r) => r.workerId === rawSelection.workerId))
        ? rawSelection
        : null;

  const isSel = (s: Selection): boolean => selection !== null && selKey(selection) === selKey(s);

  const toggle = (s: Selection) =>
    setSelection((cur) => (cur && selKey(cur) === selKey(s) ? null : s));

  const readTime = readAt.slice(11, 16);

  return (
    <Card compact className="flex flex-col">
    <section
      className="flex flex-col gap-4"
      data-testid="project-field"
      aria-labelledby="project-field-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && selection) {
          e.stopPropagation();
          setSelection(null);
        }
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="project-field-title" className="font-display text-lg font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="text-sm text-text-secondary">{t("intro")}</p>
          <p className={META} data-testid="project-field-meta">
            {field.window ? `${field.window.start} → ${field.window.end} · ` : ""}
            {t("objectsCount", { n: field.objects })} · {t("readAt", { time: readTime })}
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label={t("viewLabel")}>
          <button
            type="button"
            className={CONTROL}
            aria-pressed={view === "field"}
            onClick={() => setView("field")}
            data-testid="project-field-view-field"
          >
            {t("viewField")}
          </button>
          <button
            type="button"
            className={CONTROL}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            data-testid="project-field-view-list"
          >
            {t("viewList")}
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {view === "field" ? (
            <Scene field={field} isSel={isSel} toggle={toggle} />
          ) : (
            <ListEquivalent field={field} isSel={isSel} toggle={toggle} />
          )}
        </div>

        <aside
          className="flex flex-col gap-3 rounded-md border border-ink-600 p-4"
          aria-live="polite"
          aria-label={t("contextLabel")}
          data-testid="project-field-context"
        >
          {selection === null ? (
            <p className="text-sm text-text-secondary" data-testid="project-field-context-empty">
              {t("contextEmpty")}
            </p>
          ) : selection.kind === "token" ? (
            <TokenContext
              token={field.people.find((p) => p.workerId === selection.workerId)!}
              projectId={projectId}
              labels={labels}
              onLeft={() => setSelection(null)}
            />
          ) : selection.kind === "lane" ? (
            <LaneContext
              key={`${selection.id}:${field.lanes.find((l) => l.id === selection.id)?.status}:${field.lanes.find((l) => l.id === selection.id)?.blockedReason ?? ""}`}
              lane={field.lanes.find((l) => l.id === selection.id)!}
              tasksById={tasksById}
            />
          ) : selection.kind === "slot" ? (
            <SlotContext
              slot={field.slots.find((s) => s.id === selection.id)!}
              field={field}
              tasksById={tasksById}
              locale={locale}
            />
          ) : (
            <ReadyContext
              row={field.ready.rows.find((r) => r.workerId === selection.workerId)!}
              field={field}
              locale={locale}
            />
          )}
        </aside>
      </div>

      <p className="text-meta leading-relaxed text-text-muted" data-testid="project-field-note">
        {t("honestNote")}
      </p>
    </section>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Scene — lanes in time, people, slots, the ready edge                */
/* ------------------------------------------------------------------ */

function LaneButton({
  lane,
  pressed,
  onClick,
  withBar,
  todayPct,
}: {
  lane: FieldLane;
  pressed: boolean;
  onClick: () => void;
  withBar: boolean;
  todayPct: number | null;
}) {
  const t = useTranslations("projectField");
  const tStages = useTranslations("projectStages");
  const timeLabel = t(`time.${lane.time}`);
  return (
    <button
      type="button"
      className={`${OBJECT_BUTTON} ${EDGE_CLASS[lane.edge]}`}
      aria-pressed={pressed}
      onClick={onClick}
      data-testid="project-field-lane"
      data-edge={lane.edge}
      data-time={lane.time}
      aria-label={`${lane.name} · ${tStages(`statuses.${lane.status}`)} · ${timeLabel}${lane.time === "next" ? ` (${t("derivedFromDates")})` : ""}`}
    >
      <span aria-hidden className="w-4 shrink-0 text-center font-mono text-xs text-text-secondary">
        {EDGE_SYMBOL[lane.edge]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-semibold text-text-primary">{lane.name}</span>
          <span className={META}>{tStages(`statuses.${lane.status}`)}</span>
          <span className={META}>
            {timeLabel}
            {lane.time === "next" ? ` · ${t("derivedFromDates")}` : ""}
          </span>
          {lane.overdue ? <span className="font-mono text-meta uppercase tracking-label text-state-danger">{tStages("ganttOverdue")}</span> : null}
          {lane.taskIds.length > 0 ? <span className={META}>{t("laneWork", { n: lane.taskIds.length })}</span> : null}
        </span>
        {withBar ? (
          <span className="relative block h-2 w-full overflow-hidden rounded bg-ink-800" aria-hidden>
            {lane.offsetPct !== null && lane.widthPct !== null ? (
              <span
                className={`absolute inset-y-0 rounded ${BAR_CLASS[lane.edge]}`}
                style={{ left: `${lane.offsetPct}%`, width: `${lane.widthPct}%` }}
              />
            ) : null}
            {todayPct !== null ? (
              <span className="absolute inset-y-0 w-px bg-text-primary/70" style={{ left: `${todayPct}%` }} />
            ) : null}
          </span>
        ) : null}
        {lane.start ? (
          <span className="font-mono text-meta text-text-muted">
            {day(lane.start)}
            {lane.end && lane.end !== lane.start ? ` → ${day(lane.end)}` : ""}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function TokenButton({ token, pressed, onClick }: { token: FieldToken; pressed: boolean; onClick: () => void }) {
  const t = useTranslations("projectField");
  const stateLabel = t(`tokenState.${token.state}`);
  return (
    <button
      type="button"
      className={`${OBJECT_BUTTON} ${TOKEN_CLASS[token.state]} ${token.state === "untracked" ? "border-dashed" : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
      data-testid="project-field-token"
      data-state={token.state}
      aria-label={`${token.name} · ${stateLabel}${token.total > 0 ? ` · ${token.checked}/${token.total}` : ""}`}
    >
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${PLAYER_IDENTITY_AVATAR_BORDER} ${PLAYER_IDENTITY_FALLBACK_SURFACE} text-sm font-semibold`}
      >
        {playerInitials(token.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-text-primary">{token.name}</span>
        <span className={META}>
          <span aria-hidden>{TOKEN_SYMBOL[token.state]} </span>
          {stateLabel}
          {token.total > 0 ? ` · ${token.checked}/${token.total}` : ""}
        </span>
      </span>
    </button>
  );
}

function SlotButton({ slot, pressed, onClick }: { slot: FieldSlot; pressed: boolean; onClick: () => void }) {
  const t = useTranslations("projectField");
  const title = slot.kind === "no_people" ? t("slot.noPeople") : slot.title ?? "";
  return (
    <button
      type="button"
      className={`${OBJECT_BUTTON} border-dashed border-state-danger/60 border-l-state-danger`}
      aria-pressed={pressed}
      onClick={onClick}
      data-testid="project-field-slot"
      data-kind={slot.kind}
      aria-label={`${t("slot.label")} · ${title}`}
    >
      <span aria-hidden className="w-4 shrink-0 text-center font-mono text-xs text-state-danger">
        ◌
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-text-primary">{title}</span>
        <span className={META}>
          {t(`slot.kind.${slot.kind}`)}
          {slot.dueAt ? ` · ${day(slot.dueAt)}` : ""}
        </span>
      </span>
    </button>
  );
}

function ReadyButton({ row, pressed, onClick }: { row: FieldReadyRow; pressed: boolean; onClick: () => void }) {
  const t = useTranslations("projectField");
  return (
    <button
      type="button"
      className={`${OBJECT_BUTTON} border-dashed border-brand-cyan/50 border-l-brand-cyan`}
      aria-pressed={pressed}
      onClick={onClick}
      data-testid="project-field-ready"
      aria-label={`${row.label} · ${t("ready.canCome")}`}
    >
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-brand-cyan/60 ${PLAYER_IDENTITY_FALLBACK_SURFACE} text-sm font-semibold`}
      >
        {playerInitials(row.label)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-text-primary">{row.label}</span>
        <span className={META}>{t("ready.canCome")}</span>
      </span>
    </button>
  );
}

function ReadyEmpty({ field }: { field: ProjectField }) {
  const t = useTranslations("projectField");
  const k = field.ready.kind;
  return (
    <p className="text-meta text-text-muted" data-testid="project-field-ready-empty" data-kind={k}>
      {k === "ok" ? t("ready.none") : k === "no-company" ? t("ready.noCompany") : k === "empty" ? t("ready.emptyRoster") : t("ready.unavailable")}
    </p>
  );
}

function Scene({ field, isSel, toggle }: { field: ProjectField; isSel: (s: Selection) => boolean; toggle: (s: Selection) => void }) {
  const t = useTranslations("projectField");
  return (
    <div className="flex flex-col gap-4" data-testid="project-field-scene">
      <div className="flex flex-col gap-2">
        <h3 className={META}>
          {t("lanesTitle")} · {field.lanes.length}
          {field.lanesTotal > field.lanes.length ? ` (${t("moreInList", { n: field.lanesTotal - field.lanes.length })})` : ""}
        </h3>
        {!field.stagesApplied ? (
          <p className="text-sm text-text-muted" data-testid="project-field-lanes-unavailable">{t("lanesUnavailable")}</p>
        ) : field.lanes.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="project-field-lanes-empty">{t("lanesEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {field.lanes.map((lane) => (
              <li key={lane.id}>
                <LaneButton
                  lane={lane}
                  pressed={isSel({ kind: "lane", id: lane.id })}
                  onClick={() => toggle({ kind: "lane", id: lane.id })}
                  withBar={field.window !== null}
                  todayPct={field.todayPct}
                />
              </li>
            ))}
          </ul>
        )}
        {field.unplacedTaskIds.length > 0 && field.lanes.length > 0 ? (
          <p className={META} data-testid="project-field-unplaced">
            {t("unplacedWork", { n: field.unplacedTaskIds.length })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={META}>
          {t("peopleTitle")} · {field.peopleTotal}
        </h3>
        {field.people.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="project-field-people-empty">{t("peopleEmpty")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {field.people.map((p) => (
              <li key={p.workerId}>
                <TokenButton token={p} pressed={isSel({ kind: "token", workerId: p.workerId })} onClick={() => toggle({ kind: "token", workerId: p.workerId })} />
              </li>
            ))}
            {field.peopleTotal > field.people.length ? (
              <li className="flex min-h-11 items-center rounded-md border border-dashed border-ink-500 px-3 text-sm text-text-secondary" data-testid="project-field-people-cluster">
                {t("moreInList", { n: field.peopleTotal - field.people.length })}
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {field.slots.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className={META}>
            {t("slotsTitle")} · {field.slotsTotal}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {field.slots.map((s) => (
              <li key={s.id}>
                <SlotButton slot={s} pressed={isSel({ kind: "slot", id: s.id })} onClick={() => toggle({ kind: "slot", id: s.id })} />
              </li>
            ))}
          </ul>
          {field.slotsTotal > field.slots.length ? <p className={META}>{t("moreInList", { n: field.slotsTotal - field.slots.length })}</p> : null}
        </div>
      ) : !field.tasksApplied ? (
        // HONESTY (QA Q-1, doctrine §18.1): a failed / unapplied tasks read is a NAMED
        // unavailable state — never the calm "nothing is missing".
        <p className="text-sm text-text-muted" data-testid="project-field-slots-unavailable">
          {t("slotsUnavailable")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-dashed border-brand-cyan/40 pt-3" data-testid="project-field-ready-edge">
        <h3 className={META}>
          {t("readyTitle")}
          {field.ready.from && field.ready.to ? ` · ${field.ready.from} → ${field.ready.to}` : ""}
          {field.ready.rows.length > 0 ? ` · ${field.ready.rows.length}` : ""}
        </h3>
        {field.ready.rows.length === 0 ? (
          <ReadyEmpty field={field} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {field.ready.rows.map((r) => (
              <li key={r.workerId}>
                <ReadyButton row={r} pressed={isSel({ kind: "ready", workerId: r.workerId })} onClick={() => toggle({ kind: "ready", workerId: r.workerId })} />
              </li>
            ))}
          </ul>
        )}
        {field.ready.kind === "ok" ? (
          <p className="text-meta text-text-muted">
            {t("ready.why", { from: field.ready.from ?? "", to: field.ready.to ?? "" })}
            {!field.ready.absencesKnown ? ` ${t("ready.absencesUnknown")}` : ""}
            {field.ready.more > 0 ? ` ${t("ready.more", { n: field.ready.more })}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* List equivalent — the same objects, the same buttons                */
/* ------------------------------------------------------------------ */

function ListEquivalent({ field, isSel, toggle }: { field: ProjectField; isSel: (s: Selection) => boolean; toggle: (s: Selection) => void }) {
  const t = useTranslations("projectField");
  return (
    <div className="flex flex-col gap-4" data-testid="project-field-list">
      <section className="flex flex-col gap-2" aria-label={t("lanesTitle")}>
        <h3 className={META}>
          {t("lanesTitle")} · {field.lanes.length}/{field.lanesTotal}
        </h3>
        {field.lanes.length === 0 ? (
          <p className="text-sm text-text-muted">{field.stagesApplied ? t("lanesEmpty") : t("lanesUnavailable")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {field.lanes.map((lane) => (
              <li key={lane.id}>
                <LaneButton lane={lane} pressed={isSel({ kind: "lane", id: lane.id })} onClick={() => toggle({ kind: "lane", id: lane.id })} withBar={false} todayPct={null} />
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label={t("peopleTitle")}>
        <h3 className={META}>
          {t("peopleTitle")} · {field.people.length}/{field.peopleTotal}
        </h3>
        {field.people.length === 0 ? (
          <p className="text-sm text-text-muted">{t("peopleEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {field.people.map((p) => (
              <li key={p.workerId}>
                <TokenButton token={p} pressed={isSel({ kind: "token", workerId: p.workerId })} onClick={() => toggle({ kind: "token", workerId: p.workerId })} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label={t("slotsTitle")}>
        <h3 className={META}>
          {t("slotsTitle")} · {field.slots.length}/{field.slotsTotal}
        </h3>
        {field.slots.length === 0 ? (
          field.tasksApplied ? (
            <p className="text-sm text-text-muted">{t("slotsNone")}</p>
          ) : (
            <p className="text-sm text-text-muted" data-testid="project-field-slots-unavailable">
              {t("slotsUnavailable")}
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {field.slots.map((s) => (
              <li key={s.id}>
                <SlotButton slot={s} pressed={isSel({ kind: "slot", id: s.id })} onClick={() => toggle({ kind: "slot", id: s.id })} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label={t("readyTitle")}>
        <h3 className={META}>
          {t("readyTitle")} · {field.ready.rows.length}
        </h3>
        {field.ready.rows.length === 0 ? (
          <ReadyEmpty field={field} />
        ) : (
          <ul className="flex flex-col gap-2">
            {field.ready.rows.map((r) => (
              <li key={r.workerId}>
                <ReadyButton row={r} pressed={isSel({ kind: "ready", workerId: r.workerId })} onClick={() => toggle({ kind: "ready", workerId: r.workerId })} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Context — one object, its facts, its canonical actions + readback   */
/* ------------------------------------------------------------------ */

type WriteOutcome = { ok: true } | { ok: false; code?: string };

/** One transition for every write here: run the canonical action, then
 *  RE-READ (router.refresh) — the message is set only after the refresh is
 *  requested, and every fact on screen still comes from the server props. */
function useCanonicalWrite() {
  const t = useTranslations("projectField");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const run = (write: () => Promise<WriteOutcome>, after?: () => void) => {
    setMsg(null);
    startTransition(async () => {
      const r = await write();
      if (r.ok) {
        router.refresh();
        setMsg({ tone: "ok", text: t("saved") });
        after?.();
      } else {
        setMsg({
          tone: "err",
          text:
            r.code === "needs_migration"
              ? t("errors.needs_migration")
              : r.code === "not_authorized" || r.code === "auth"
                ? t("errors.not_authorized")
                : r.code === "invalid" || r.code === "invalid_transition"
                  ? t("errors.invalid")
                  : t("errors.error"),
        });
      }
    });
  };
  const Message = msg ? (
    <p
      role="status"
      className={`text-meta ${msg.tone === "ok" ? "text-state-success" : "text-state-danger"}`}
      data-testid={`project-field-write-${msg.tone}`}
    >
      {msg.text}
    </p>
  ) : null;
  return { pending, run, Message };
}

function ReadinessRow({
  item,
  token,
  projectId,
  labels,
  pending,
  run,
}: {
  item: ReadinessItem;
  token: FieldToken;
  projectId: string;
  labels: ProjectFieldLabels;
  pending: boolean;
  run: (write: () => Promise<WriteOutcome>) => void;
}) {
  const t = useTranslations("projectField");
  const set = (status: "needed" | "received" | "checked") =>
    run(() =>
      upsertReadinessItemAction({
        projectId,
        workerProfileId: token.workerProfileId,
        itemKey: item.itemKey,
        label: item.label,
        status,
      }),
    );
  const ask = () =>
    run(async () => {
      const fd = new FormData();
      fd.set("worker_profile_id", token.workerProfileId);
      fd.set("project_id", projectId);
      fd.set("body", t("askBody", { label: item.label }));
      return sendWorkInstructionAction(null, fd);
    });
  const open = item.status === "needed" || item.status === "missing";
  return (
    <li className="flex flex-col gap-2 rounded-md border border-ink-600 p-2" data-testid="project-field-readiness-row" data-status={item.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text-primary">{item.label}</span>
        <span className={META} data-testid="project-field-readiness-status">
          {labels.readinessStatus[item.status]}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {open ? (
          <button type="button" className={CONTROL} disabled={pending} onClick={ask} data-testid="project-field-ask">
            {t("actions.ask")}
          </button>
        ) : null}
        {item.status !== "received" ? (
          <button type="button" className={CONTROL} disabled={pending} onClick={() => set("received")} data-testid="project-field-mark-received">
            {t("actions.received")}
          </button>
        ) : null}
        {item.status !== "checked" ? (
          <button type="button" className={CONTROL} disabled={pending} onClick={() => set("checked")} data-testid="project-field-mark-checked">
            {t("actions.checked")}
          </button>
        ) : null}
        {item.status !== "needed" ? (
          <button type="button" className={CONTROL} disabled={pending} onClick={() => set("needed")} data-testid="project-field-mark-needed">
            {t("actions.needed")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function TokenContext({
  token,
  projectId,
  labels,
  onLeft,
}: {
  token: FieldToken;
  projectId: string;
  labels: ProjectFieldLabels;
  onLeft: () => void;
}) {
  const t = useTranslations("projectField");
  const { pending, run, Message } = useCanonicalWrite();
  const [confirmLeave, setConfirmLeave] = useState(false);
  return (
    <div className="flex flex-col gap-3" data-testid="project-field-context-token">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${PLAYER_IDENTITY_AVATAR_BORDER} ${PLAYER_IDENTITY_FALLBACK_SURFACE} text-base font-semibold`}>
          {playerInitials(token.name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-base font-semibold text-text-primary">{token.name}</h3>
          <span className={META}>
            {t(`tokenState.${token.state}`)}
            {token.operationalStatus ? ` · ${labels.operationalStatus[token.operationalStatus]}` : ""}
          </span>
        </div>
      </div>
      <p className={META}>
        {t("assignedSince", { date: day(token.assignedAt) })}
        {token.total > 0 ? ` · ${t("checklistRatio", { checked: token.checked, total: token.total })}` : ` · ${t("checklistNone")}`}
      </p>
      {token.items.length === 0 ? (
        <p className="text-sm text-text-muted">{t("checklistNoneHint")}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t("checklistTitle")}>
          {token.items.map((item) => (
            <ReadinessRow key={item.itemKey} item={item} token={token} projectId={projectId} labels={labels} pending={pending} run={run} />
          ))}
        </ul>
      )}
      {Message}
      <div className="flex flex-wrap gap-2 border-t border-ink-600 pt-3">
        {confirmLeave ? (
          <>
            <span className="text-sm text-text-secondary">{t("leaveConfirm", { name: token.name })}</span>
            <button
              type="button"
              className={`${CONTROL} border-state-danger/60 text-state-danger`}
              disabled={pending}
              onClick={() => run(() => endAssignmentAction(projectId, token.workerProfileId), onLeft)}
              data-testid="project-field-leave-confirm"
            >
              {t("actions.leaveConfirm")}
            </button>
            <button type="button" className={CONTROL} disabled={pending} onClick={() => setConfirmLeave(false)}>
              {t("actions.cancel")}
            </button>
          </>
        ) : (
          <button type="button" className={CONTROL} disabled={pending} onClick={() => setConfirmLeave(true)} data-testid="project-field-leave">
            {t("actions.leave")}
          </button>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, pending, run }: { task: WorkTask; pending: boolean; run: (write: () => Promise<WriteOutcome>) => void }) {
  const t = useTranslations("projectField");
  const tTasks = useTranslations("tasks");
  const [next, setNext] = useState<WorkTaskStatus>(task.status);
  return (
    <li className="flex flex-col gap-2 rounded-md border border-ink-600 p-2" data-testid="project-field-task-row" data-status={task.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text-primary">{task.title}</span>
        <span className={META} data-testid="project-field-task-status">
          {tTasks(`status.${task.status}`)}
          {task.dueAt ? ` · ${tTasks("dueLabel")} ${day(task.dueAt)}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="sr-only">{t("taskStatusLabel", { title: task.title })}</span>
          <select className={SELECT} value={next} disabled={pending} onChange={(e) => setNext(e.target.value as WorkTaskStatus)} data-testid="project-field-task-select">
            {WORK_TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tTasks(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={CONTROL}
          disabled={pending || next === task.status}
          onClick={() =>
            run(async () => {
              const r = await setWorkTaskStatusForChatAction({ taskId: task.id, status: next });
              return r.kind === "updated" ? { ok: true } : { ok: false, code: r.kind };
            })
          }
          data-testid="project-field-task-save"
        >
          {t("actions.save")}
        </button>
      </div>
    </li>
  );
}

function LaneContext({ lane, tasksById }: { lane: FieldLane; tasksById: ReadonlyMap<string, WorkTask> }) {
  const t = useTranslations("projectField");
  const tStages = useTranslations("projectStages");
  const { pending, run, Message } = useCanonicalWrite();
  const [next, setNext] = useState<StageStatus>(lane.status);
  const [reason, setReason] = useState(lane.blockedReason ?? "");
  const laneTasks = lane.taskIds.map((id) => tasksById.get(id)).filter((x): x is WorkTask => Boolean(x));
  return (
    <div className="flex flex-col gap-3" data-testid="project-field-context-lane">
      <h3 className="text-base font-semibold text-text-primary">{lane.name}</h3>
      <p className={META}>
        {tStages(`statuses.${lane.status}`)} · {t(`time.${lane.time}`)}
        {lane.time === "next" ? ` (${t("derivedFromDates")})` : ""}
        {lane.start ? ` · ${day(lane.start)}${lane.end && lane.end !== lane.start ? ` → ${day(lane.end)}` : ""}` : ""}
      </p>
      {lane.blockedReason ? <p className="text-sm text-text-secondary">{tStages("blockedReasonLabel")}: {lane.blockedReason}</p> : null}
      {lane.completionCriteria ? <p className="text-sm text-text-secondary">{lane.completionCriteria}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="sr-only">{tStages("statusLabel")}</span>
          <select className={SELECT} value={next} disabled={pending} onChange={(e) => setNext(e.target.value as StageStatus)} data-testid="project-field-lane-select">
            {STAGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tStages(`statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {next === "blocked" ? (
          <input
            type="text"
            className={`${SELECT} flex-1`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={tStages("blockedReasonPlaceholder")}
            aria-label={tStages("blockedReasonLabel")}
            disabled={pending}
            data-testid="project-field-lane-reason"
          />
        ) : null}
        <button
          type="button"
          className={CONTROL}
          disabled={pending || (next === lane.status && (next !== "blocked" || reason === (lane.blockedReason ?? "")))}
          onClick={() => run(() => updateStageStatusAction({ stageId: lane.id, status: next, blockedReason: next === "blocked" ? reason : undefined }))}
          data-testid="project-field-lane-save"
        >
          {t("actions.save")}
        </button>
      </div>
      {Message}

      <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
        <h4 className={META}>
          {t("laneWorkTitle")} · {laneTasks.length} · {t("derivedFromDueDates")}
        </h4>
        {laneTasks.length === 0 ? (
          <p className="text-sm text-text-muted">{t("laneWorkEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {laneTasks.map((task) => (
              <TaskRow key={`${task.id}:${task.status}`} task={task} pending={pending} run={run} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SuitablePeople({ field, locale }: { field: ProjectField; locale: string }) {
  const t = useTranslations("projectField");
  const here = field.people.filter((p) => p.state === "clear" || p.state === "untracked");
  const total = here.length + field.ready.rows.length;
  return (
    <div className="flex flex-col gap-2 border-t border-ink-600 pt-3" data-testid="project-field-suitable">
      <h4 className={META}>
        {t("suitableTitle")} · {total}
      </h4>
      {total === 0 ? (
        <p className="text-sm text-text-muted">{t("suitableNone")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {here.map((p) => (
            <li key={p.workerId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-primary">
              <span>{p.name}</span>
              <span className={META}>{t("suitable.onProject")}</span>
            </li>
          ))}
          {field.ready.rows.map((r) => (
            <li key={r.workerId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-primary">
              <span>{r.label}</span>
              <span className={META}>{t("suitable.free")}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-meta text-text-muted">
        {t("suitable.why")}
        {field.ready.kind === "ok" && !field.ready.absencesKnown ? ` ${t("ready.absencesUnknown")}` : ""}
      </p>
      <Link href={`/${locale}/dashboard/projects`} className="text-sm text-brand-cyan hover:underline" data-testid="project-field-assign-link">
        {t("assignLink")} →
      </Link>
    </div>
  );
}

function SlotContext({ slot, field, tasksById, locale }: { slot: FieldSlot; field: ProjectField; tasksById: ReadonlyMap<string, WorkTask>; locale: string }) {
  const t = useTranslations("projectField");
  const { pending, run, Message } = useCanonicalWrite();
  const task = slot.taskId ? tasksById.get(slot.taskId) ?? null : null;
  return (
    <div className="flex flex-col gap-3" data-testid="project-field-context-slot">
      <h3 className="text-base font-semibold text-text-primary">{slot.kind === "no_people" ? t("slot.noPeople") : slot.title}</h3>
      <p className={META}>{t(`slot.kind.${slot.kind}`)}</p>
      {task ? (
        <ul className="flex flex-col gap-2">
          <TaskRow key={`${task.id}:${task.status}`} task={task} pending={pending} run={run} />
        </ul>
      ) : null}
      {Message}
      <SuitablePeople field={field} locale={locale} />
    </div>
  );
}

function ReadyContext({ row, field, locale }: { row: FieldReadyRow; field: ProjectField; locale: string }) {
  const t = useTranslations("projectField");
  return (
    <div className="flex flex-col gap-3" data-testid="project-field-context-ready">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-brand-cyan/60 ${PLAYER_IDENTITY_FALLBACK_SURFACE} text-base font-semibold`}>
          {playerInitials(row.label)}
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-base font-semibold text-text-primary">{row.label}</h3>
          <span className={META}>{t("ready.canCome")}</span>
        </div>
      </div>
      <p className="text-sm text-text-secondary">
        {t("ready.why", { from: field.ready.from ?? "", to: field.ready.to ?? "" })}
        {!field.ready.absencesKnown ? ` ${t("ready.absencesUnknown")}` : ""}
      </p>
      <Link href={`/${locale}/dashboard/projects`} className="text-sm text-brand-cyan hover:underline" data-testid="project-field-assign-link">
        {t("assignLink")} →
      </Link>
    </div>
  );
}
