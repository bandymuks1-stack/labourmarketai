"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChatAction, ChatActionRow } from "@/components/app/conversation/chat/chat-action";
import { Clock } from "lucide-react";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { prepareConfirmationAction, dispatchWorkerAction } from "@/lib/conversation/dispatch";
import {
  listWorkLogEngagements,
  type WorkLogEngagement,
} from "@/lib/conversation/worklog-engagements";
import type { WorkLogParse } from "@/lib/conversation/worklog-extract";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

export type WorkLogLabels = {
  understood: string;
  loading: string;
  noContext: string;
  noContextCta: string;
  noWorker: string;
  notAuthed: string;
  labelDate: string;
  labelTime: string;
  labelBreak: string;
  labelHours: string;
  labelSite: string;
  labelNotes: string;
  labelContext: string;
  save: string;
  cancel: string;
  working: string;
  confirmTitle: string;
  saved: string;
  errorGeneric: string;
  minutesUnit: string;
  // PR-C "what changed" — the completion message lists the REAL pipeline
  // outcome (skills added / strengthened, candidates awaiting confirmation)
  // plus the truthful CV + matching consequences.
  addedSkillPrefix: string;
  strengthenedSkillPrefix: string;
  pendingConfirmPrefix: string;
  cvUpdatedNote: string;
  matchingNote: string;
  pipelineFailedNote: string;
};

/** The subset of the awaited server pipeline result the chat surface shows.
 *  Parsed defensively from the dispatcher's `data.skills` — anything missing
 *  or malformed renders as "no outcome details", never as invented facts. */
type WorkLogSkillsOutcome = {
  status: "completed" | "partial" | "failed";
  addedSkills: string[];
  strengthenedSkills: string[];
  pendingCandidates: { label: string; slug: string | null; kind: string }[];
  cvUpdated: boolean;
};

function parseSkillsOutcome(data: unknown): WorkLogSkillsOutcome | null {
  if (typeof data !== "object" || data === null) return null;
  const s = (data as { skills?: unknown }).skills;
  if (typeof s !== "object" || s === null) return null;
  const o = s as Record<string, unknown>;
  const status =
    o.status === "completed" || o.status === "partial" || o.status === "failed"
      ? o.status
      : null;
  if (!status) return null;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const candidates = Array.isArray(o.pendingCandidates)
    ? o.pendingCandidates
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map((c) => ({
          label: typeof c.label === "string" ? c.label : "",
          slug: typeof c.slug === "string" ? c.slug : null,
          kind: typeof c.kind === "string" ? c.kind : "",
        }))
        .filter((c) => c.label.length > 0)
    : [];
  return {
    status,
    addedSkills: strings(o.addedSkills),
    strengthenedSkills: strings(o.strengthenedSkills),
    pendingCandidates: candidates,
    cvUpdated: o.cvUpdated === true,
  };
}

type Phase =
  | { kind: "loading" }
  | { kind: "blocked"; reason: "no-context" | "no-worker" | "not-authed" }
  | { kind: "ready"; token: null }
  | { kind: "confirm"; token: string }
  | { kind: "done"; skills: WorkLogSkillsOutcome | null }
  | { kind: "error"; message: string };

/**
 * Conversation-first work-log (Phase 3). The worker types a natural sentence
 * ("šiandien dirbau nuo 8 iki 17, montavau langus"); the deterministic
 * extractor already parsed it into `draft`. This component:
 *   1. loads the worker's REAL writable engagement contexts (a journal entry
 *      must pin to one — doctrine §5.5). No context → an HONEST blocker with the
 *      real next step, never a fake save;
 *   2. shows the parse as a preview the worker can correct (date / site / the
 *      evidence notes) and pick the context;
 *   3. saves ONLY after an explicit confirmation, through the server dispatcher
 *      with a one-time token → the canonical `createJournalEntry`;
 *   4. shows the REAL server outcome (never a fabricated success — §7).
 *
 * Times/break/hours are shown as a read-only parse summary: they already live
 * in the evidence notes, so they are not persisted as separate claims.
 */
export function WorkerWorkLogFlow({
  draft,
  locale,
  labels,
  onClose,
}: {
  draft: WorkLogParse;
  locale: string;
  labels: WorkLogLabels;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [engagements, setEngagements] = useState<WorkLogEngagement[]>([]);
  const [engagementId, setEngagementId] = useState<string>("");
  const [workDate, setWorkDate] = useState(draft.date);
  const [site, setSite] = useState(draft.site ?? "");
  const [notes, setNotes] = useState(draft.notes);
  const [pending, start] = useTransition();
  // Localized taxonomy skill names for the completion summary (slug → name,
  // falling back to the raw slug so an uncatalogued name never blanks a fact).
  const tSkill = useTranslations("skillNames");
  const skillName = (slug: string): string => {
    try {
      const v = tSkill(slug);
      if (v && v !== slug && !v.startsWith("skillNames.")) return v;
    } catch {
      /* fall through */
    }
    return slug;
  };

  useEffect(() => {
    let alive = true;
    listWorkLogEngagements()
      .then((res) => {
        if (!alive) return;
        if (res.kind === "ok") {
          setEngagements(res.engagements);
          // Context Intelligence (rebuild phase 3): the server orders the
          // list ACTIVE-WORKSPACE-first (then primary), so the first entry IS
          // the resolved default context — the user re-picks only on real
          // ambiguity, never re-states what the workspace already says.
          setEngagementId(res.engagements[0].id);
          setPhase({ kind: "ready", token: null });
        } else if (res.kind === "no-context") {
          setPhase({ kind: "blocked", reason: "no-context" });
        } else if (res.kind === "no-worker") {
          setPhase({ kind: "blocked", reason: "no-worker" });
        } else {
          setPhase({ kind: "blocked", reason: "not-authed" });
        }
      })
      .catch(() => alive && setPhase({ kind: "error", message: labels.errorGeneric }));
    return () => {
      alive = false;
    };
  }, [labels.errorGeneric]);

  function input() {
    return {
      engagementContextId: engagementId,
      notes: notes.trim(),
      workDate,
      siteName: site.trim() || null,
    };
  }

  function beginConfirm() {
    if (!engagementId || notes.trim().length < 3) {
      setPhase({ kind: "error", message: labels.errorGeneric });
      return;
    }
    start(async () => {
      const prep = await prepareConfirmationAction("worker.log-work", input());
      if (!prep.ok) {
        setPhase({ kind: "error", message: labels.errorGeneric });
        return;
      }
      setPhase({ kind: "confirm", token: prep.token });
    });
  }

  function confirm() {
    if (phase.kind !== "confirm") return;
    const token = phase.token;
    start(async () => {
      const res = await dispatchWorkerAction("worker.log-work", input(), {
        locale,
        confirmationToken: token,
      });
      if (res.ok) {
        trackFunnel(FUNNEL_EVENTS.journalEntrySaved, {
          surface: "conversation",
          role_context: "worker",
          success: true,
        });
        setPhase({ kind: "done", skills: parseSkillsOutcome(res.data) });
        router.refresh();
      } else {
        setPhase({ kind: "error", message: res.message || labels.errorGeneric });
      }
    });
  }

  // ── loading ───────────────────────────────────────────────────────────────
  if (phase.kind === "loading") {
    return (
      <div className="rounded-card border border-ink-600 bg-surface-1/40 px-4 py-3 text-support text-text-muted" data-testid="worklog-loading">
        {labels.loading}
      </div>
    );
  }

  // ── honest blocker (real precondition, no fake save) ───────────────────────
  if (phase.kind === "blocked") {
    return (
      <div className="rounded-card border border-state-warning/40 bg-state-warning/5 px-4 py-3 text-support text-text-primary" data-testid="worklog-blocked">
        <p>{phase.reason === "no-context" ? labels.noContext : phase.reason === "no-worker" ? labels.noWorker : labels.notAuthed}</p>
        {phase.reason === "no-context" && (
          <Link href="/dashboard/advanced" className="mt-2 inline-flex min-h-11 items-center rounded-control border border-brand-blue/50 bg-brand-blue/10 px-3 text-support font-semibold text-brand-blue hover:bg-brand-blue/20">
            {labels.noContextCta}
          </Link>
        )}
      </div>
    );
  }

  // ── done — the REAL "what changed" outcome (§7: facts only) ────────────────
  if (phase.kind === "done") {
    const skills = phase.skills;
    // Only genuinely confirmable candidates (fuzzy/ambiguous) — free-text
    // claims are persisted as self-declared claims, not queued confirmations.
    const awaiting =
      skills?.pendingCandidates.filter((c) => c.kind !== "claim") ?? [];
    const skillsTouched =
      (skills?.addedSkills.length ?? 0) + (skills?.strengthenedSkills.length ?? 0) > 0;
    return (
      <div className="flex flex-col gap-2 rounded-card border border-state-success/40 bg-state-success/5 px-4 py-3 text-support" data-testid="worklog-done">
        <p className="font-semibold text-state-success">{labels.saved}</p>
        {skills && (skillsTouched || awaiting.length > 0 || skills.status === "failed") && (
          <ul className="flex flex-col gap-1 text-text-primary" data-testid="worklog-outcome">
            {skills.addedSkills.map((slug) => (
              <li key={`added-${slug}`} data-testid={`worklog-added-${slug}`}>
                {labels.addedSkillPrefix}: {skillName(slug)}
              </li>
            ))}
            {skills.strengthenedSkills.map((slug) => (
              <li key={`str-${slug}`} data-testid={`worklog-strengthened-${slug}`}>
                {labels.strengthenedSkillPrefix}: {skillName(slug)}
              </li>
            ))}
            {awaiting.map((c) => (
              <li key={`pend-${c.slug ?? c.label}`} className="text-text-muted" data-testid="worklog-pending-candidate">
                {labels.pendingConfirmPrefix}: {c.slug ? skillName(c.slug) : c.label}
              </li>
            ))}
            {skills.status === "failed" && (
              <li className="text-text-muted">{labels.pipelineFailedNote}</li>
            )}
          </ul>
        )}
        {/* "CV papildytas" is truthful: the CV export derives directly from
            worker_skills + journal_entry_skills rows this save just wrote. */}
        {skills?.cvUpdated && (
          <p className="text-text-muted" data-testid="worklog-cv-updated">{labels.cvUpdatedNote}</p>
        )}
        {/* Honest matching phrasing: recommendations are computed from the
            worker's current skills at read time (no persisted score), so new
            skills flow into the next computation — nothing is "pushed". */}
        {skillsTouched && (
          <p className="text-text-muted" data-testid="worklog-matching-note">{labels.matchingNote}</p>
        )}
      </div>
    );
  }

  const confirming = phase.kind === "confirm";

  return (
    <div className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 p-4" data-testid="worklog-flow">
      <p className="flex items-center gap-1.5 text-support font-semibold text-text-primary">
        <Clock className="size-4 text-brand-blue" aria-hidden /> {labels.understood}
      </p>

      {/* Parse summary — read-only display of what was understood. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-support">
        <Field label={labels.labelDate}>
          <input
            type="date"
            value={workDate}
            disabled={confirming || pending}
            onChange={(e) => setWorkDate(e.target.value)}
            data-testid="worklog-date"
            className="w-full rounded border border-ink-500 bg-ink-800 px-2 py-1 text-support text-text-primary"
          />
        </Field>
        {draft.start && draft.end && (
          <Row k={labels.labelTime} v={`${draft.start}–${draft.end}`} />
        )}
        {draft.breakMinutes > 0 && (
          <Row k={labels.labelBreak} v={`${draft.breakMinutes} ${labels.minutesUnit}`} />
        )}
        {draft.hoursLabel && <Row k={labels.labelHours} v={draft.hoursLabel} />}
      </dl>

      <label className="flex flex-col gap-1 text-support">
        <span className="text-text-muted">{labels.labelSite}</span>
        <input
          type="text"
          value={site}
          disabled={confirming || pending}
          onChange={(e) => setSite(e.target.value)}
          data-testid="worklog-site"
          className="rounded border border-ink-500 bg-ink-800 px-2 py-1.5 text-support text-text-primary"
        />
      </label>

      <label className="flex flex-col gap-1 text-support">
        <span className="text-text-muted">{labels.labelNotes}</span>
        <textarea
          value={notes}
          disabled={confirming || pending}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          data-testid="worklog-notes"
          className="resize-none rounded border border-ink-500 bg-ink-800 px-2 py-1.5 text-support text-text-primary"
        />
      </label>

      {engagements.length > 1 && (
        <label className="flex flex-col gap-1 text-support">
          <span className="text-text-muted">{labels.labelContext}</span>
          <select
            value={engagementId}
            disabled={confirming || pending}
            onChange={(e) => setEngagementId(e.target.value)}
            data-testid="worklog-context"
            className="rounded border border-ink-500 bg-ink-800 px-2 py-1.5 text-support text-text-primary"
          >
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-control border border-state-warning/40 bg-state-warning/5 p-3">
          <p className="font-display text-card-title font-semibold text-text-primary">{labels.confirmTitle}</p>
          <ChatActionRow>
            <ChatAction tone="primary" loading={pending} testId="worklog-confirm" onClick={confirm}>
              {pending ? labels.working : labels.save}
            </ChatAction>
            <ChatAction
              tone="secondary"
              disabled={pending}
              onClick={() => setPhase({ kind: "ready", token: null })}
            >
              {labels.cancel}
            </ChatAction>
          </ChatActionRow>
        </div>
      ) : (
        <ChatActionRow>
          <ChatAction tone="primary" disabled={pending} testId="worklog-save" onClick={beginConfirm}>
            {labels.save}
          </ChatAction>
          {onClose && (
            <ChatAction tone="secondary" disabled={pending} onClick={onClose}>
              {labels.cancel}
            </ChatAction>
          )}
        </ChatActionRow>
      )}

      {phase.kind === "error" && (
        <p role="alert" className="text-support text-state-danger" data-testid="worklog-error">
          {phase.message}
        </p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-text-muted">{k}</dt>
      <dd className="text-right font-medium text-text-primary">{v}</dd>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="flex items-center text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
