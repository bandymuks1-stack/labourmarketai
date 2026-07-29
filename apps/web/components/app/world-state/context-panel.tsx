"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Info, X } from "lucide-react";

import { WorkerInterestButton } from "@/components/app/worker-interest-button";
import { iconControl } from "@/components/app/conversation/chat/icon-scale";
import {
  loadEntityContext,
  loadWorkContext,
} from "@/lib/world-state/context-actions";
import type {
  ContextFact,
  ContextRecommendation,
  EntityContextView,
} from "@/lib/world-state/entity-context";
import type { WorkContextView } from "@/lib/world-state/work-context-server";
import { entityKey } from "@/lib/world-state/world-state";
import { useWorldState } from "./world-state-provider";
import { WorkspaceMap } from "./workspace-map";

/**
 * THE CONTEXT PANEL (W3) — the third part of the one workspace.
 *
 * Owner lock, `WORLD_STATE_UX_ARCHITECTURE_V1`:
 *   "Paspaudus objektą NEATIDAROMAS NAUJAS PUSLAPIS. NEVYKSTA NAVIGACIJA.
 *    Atidaroma Context Panel."
 *
 * WHAT IT IS. A persistent region of the workspace that always answers one
 * question: what is in front of me right now? With nothing selected that is the
 * person's real work context (today's commitments, conflicts, overdue tasks,
 * the next deadline). With an entity selected it is that entity — its facts,
 * requirements, history, related objects, the deterministic next steps, and the
 * real actions available on it.
 *
 * WHAT IT IS NOT.
 *  - NOT a dialog. It is never modal, never traps focus, never covers the
 *    conversation and never blocks the page. It is a complementary landmark,
 *    and the guard forbids the modal roles outright: a modal would make the
 *    workspace two places at once.
 *  - NOT navigation. Nothing in this component links, routes or pushes. Opening
 *    a related entity is another `open_object` on the SAME state.
 *  - NOT a second implementation of anything. Every action it offers is an
 *    existing canonical control: the interest button is the marketplace's own
 *    one-write-path component, and every other action is dispatched into the
 *    conversation's existing chip handler.
 *
 * HONESTY. It renders what the server sent and computes nothing. An unknown
 * fact says "not stated" in muted type; an unavailable capability says why; an
 * empty work context says the window is quiet. It never fills space.
 */
export function ContextPanel({
  locale,
  onChip,
  className = "",
}: {
  /** The active locale — passed to the canonical interest control unchanged. */
  locale: string;
  /** Dispatch into the conversation's EXISTING chip handler. The panel owns no
   *  action of its own — a recommendation acts by asking the chat to do the
   *  thing it already does. */
  onChip: (chipId: string) => void;
  className?: string;
}) {
  const t = useTranslations("workspace.panel");
  const { state, closeEntity } = useWorldState();
  const panel = state.contextPanel;

  /** Starts TRUE: a read is always pending on mount, so the first paint says
   *  "reading" instead of showing an empty body for one frame. An empty shell
   *  reads as "there is nothing", which is a claim the panel has not earned
   *  yet. */
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState<EntityContextView | null>(null);
  const [work, setWork] = useState<WorkContextView | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  /** Small screens open the panel on demand; from `lg` it is always open. */
  const [expanded, setExpanded] = useState(false);

  // One request wins: a fast second selection must never be overwritten by the
  // slower first response.
  const requestRef = useRef(0);
  const selectionKey = panel.mode === "entity" ? entityKey(panel.ref) : "work_context";

  useEffect(() => {
    const token = ++requestRef.current;
    let cancelled = false;
    setLoading(true);
    setUnavailable(null);

    const request =
      panel.mode === "entity"
        ? loadEntityContext(panel.ref).then((res) => {
            if (cancelled || token !== requestRef.current) return;
            setWork(null);
            if (res.kind === "context") setEntity(res.view);
            else {
              setEntity(null);
              setUnavailable(res.reason);
            }
          })
        : loadWorkContext().then((res) => {
            if (cancelled || token !== requestRef.current) return;
            setEntity(null);
            if (res.kind === "context") setWork(res.view);
            else {
              setWork(null);
              setUnavailable(res.reason);
            }
          });

    request
      .catch(() => {
        if (cancelled || token !== requestRef.current) return;
        // A failed read is stated, never silently rendered as emptiness.
        setEntity(null);
        setWork(null);
        setUnavailable(t("unavailableGeneric"));
      })
      .finally(() => {
        if (!cancelled && token === requestRef.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `selectionKey` is the identity of what must be shown; `t` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // Selecting something is what makes the panel worth looking at on a phone,
  // so a new selection opens it. Closing it again is the person's choice.
  useEffect(() => {
    if (panel.mode === "entity") setExpanded(true);
  }, [selectionKey, panel.mode]);

  const title = panel.mode === "entity" ? (entity?.title ?? t("loading")) : t("workTitle");

  return (
    <aside
      // A complementary landmark, NOT a dialog: the conversation stays fully
      // usable while this is open, which is the whole point of the workspace.
      aria-label={t("regionLabel")}
      data-testid="context-panel"
      data-panel-mode={panel.mode}
      className={`flex flex-none flex-col border-t border-ink-600 bg-ink-900/60 lg:h-full lg:w-[22rem] lg:flex-none lg:border-l lg:border-t-0 ${className}`}
    >
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <Info {...iconControl("flex-none text-brand-blue")} aria-hidden />
        {/* The name gets the whole row. The trust badge sits on its own line
            below: squeezing both into 22rem truncated real company names to
            "Dev Con…", and a name the reader cannot finish is not an answer. */}
        <h2 className="min-w-0 flex-1 truncate font-display text-card-title font-semibold text-text-primary">
          {title}
        </h2>
        {panel.mode === "entity" ? (
          <button
            type="button"
            onClick={closeEntity}
            data-testid="context-panel-close"
            aria-label={t("close")}
            className="flex size-11 flex-none items-center justify-center rounded-full border border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            <X {...iconControl()} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="context-panel-body"
          data-testid="context-panel-toggle"
          className="flex size-11 flex-none items-center justify-center rounded-full border border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary lg:hidden"
        >
          {expanded ? <ChevronDown {...iconControl()} aria-hidden /> : <ChevronUp {...iconControl()} aria-hidden />}
          <span className="sr-only">{expanded ? t("collapse") : t("expand")}</span>
        </button>
      </div>

      {entity?.badge ? (
        <p className="px-4 pt-1.5">
          <span
            data-testid="context-panel-badge"
            className="rounded-sm border border-state-success/40 bg-state-success/10 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-success"
          >
            {entity.badge}
          </span>
        </p>
      ) : null}

      <div
        id="context-panel-body"
        className={`mt-2.5 min-h-0 flex-1 overflow-y-auto px-4 pb-4 ${expanded ? "block max-h-[45dvh]" : "hidden"} lg:block lg:max-h-none`}
      >
        {/* W6 — THE MAP, inside the one workspace. It subscribes to the SAME
            World State: the selection flies it to the entity's place, and
            clicking a marker opens that entity here. Not a separate screen. */}
        <WorkspaceMap className="mb-4" />
        {loading ? (
          <p className="text-basis text-text-muted" data-testid="context-panel-loading">
            {t("loading")}
          </p>
        ) : unavailable ? (
          <p className="text-basis text-text-secondary" data-testid="context-panel-unavailable">
            {unavailable}
          </p>
        ) : entity ? (
          <EntityBody view={entity} locale={locale} onChip={onChip} />
        ) : work ? (
          <WorkBody view={work} onChip={onChip} />
        ) : null}
      </div>
    </aside>
  );
}

// ── sections ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 font-mono text-meta uppercase tracking-label text-text-muted">
      {children}
    </h3>
  );
}

function Facts({ facts }: { facts: readonly ContextFact[] }) {
  return (
    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{f.label}</dt>
          {/* An unknown value is muted so a gap can never be mistaken for data. */}
          <dd className={`text-basis ${f.unknown ? "text-text-muted" : "text-text-primary"}`}>
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Recommendations({
  items,
  onChip,
  actLabel,
}: {
  items: readonly ContextRecommendation[];
  onChip: (chipId: string) => void;
  actLabel: string;
}) {
  return (
    <ul className="mt-1.5 flex flex-col gap-2" data-testid="context-panel-recommendations">
      {items.map((r) => (
        <li key={r.text} className="rounded-card border border-ink-500 bg-ink-800/50 p-3">
          <p className="text-basis text-text-primary">{r.text}</p>
          {/* The basis is not decoration: a recommendation that cannot state
              the fact it came from is the fabricated-AI this platform bans. */}
          <p className="mt-1 text-meta text-text-muted">{r.basis}</p>
          {r.chipId ? (
            <button
              type="button"
              onClick={() => onChip(r.chipId as string)}
              data-testid="context-panel-recommendation-action"
              className="mt-2 min-h-11 rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
            >
              {actLabel}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function EntityBody({
  view,
  locale,
  onChip,
}: {
  view: EntityContextView;
  locale: string;
  onChip: (chipId: string) => void;
}) {
  const t = useTranslations("workspace.panel");
  const met = view.requirements.filter((r) => r.met);
  const unmet = view.requirements.filter((r) => !r.met);

  return (
    <div className="flex flex-col">
      {view.description ? (
        <p className="text-basis text-text-secondary" data-testid="context-panel-description">
          {view.description}
        </p>
      ) : null}

      {view.facts.length > 0 && (
        <>
          <SectionTitle>{t("sectionFacts")}</SectionTitle>
          <Facts facts={view.facts} />
        </>
      )}

      {view.requirements.length > 0 && (
        <>
          <SectionTitle>{t("sectionRequirements")}</SectionTitle>
          <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="context-panel-requirements">
            {met.map((r) => (
              <span
                key={`met-${r.label}`}
                className="rounded-md border border-state-success/30 bg-state-success/10 px-2 py-0.5 text-meta text-state-success"
              >
                ✓ {r.label}
              </span>
            ))}
            {unmet.map((r) => (
              <span
                key={`unmet-${r.label}`}
                className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-meta text-state-amber"
              >
                {t("requirementMissing")} {r.label}
              </span>
            ))}
          </div>
        </>
      )}

      {view.recommendations.length > 0 && (
        <>
          <SectionTitle>{t("sectionRecommendations")}</SectionTitle>
          <Recommendations items={view.recommendations} onChip={onChip} actLabel={t("act")} />
        </>
      )}

      {view.history.length > 0 && (
        <>
          <SectionTitle>{t("sectionHistory")}</SectionTitle>
          <ul className="mt-1.5 flex flex-col gap-1" data-testid="context-panel-history">
            {view.history.map((h) => (
              <li key={h.text} className="text-basis text-text-secondary">
                {h.at ? `${h.at} — ${h.text}` : h.text}
              </li>
            ))}
          </ul>
        </>
      )}

      {view.related.length > 0 && (
        <>
          <SectionTitle>{t("sectionRelated")}</SectionTitle>
          <ul className="mt-1.5 flex flex-col gap-1" data-testid="context-panel-related">
            {view.related.map((r) => (
              <li key={r.label} className="text-basis text-text-secondary">
                {r.label}
              </li>
            ))}
          </ul>
        </>
      )}

      {view.actions.length > 0 && (
        <>
          <SectionTitle>{t("sectionActions")}</SectionTitle>
          <div className="mt-1.5 flex flex-col gap-2" data-testid="context-panel-actions">
            {view.actions.map((a) =>
              a.kind === "express_interest" ? (
                <WorkerInterestButton
                  key={`interest-${a.requestId}`}
                  locale={locale}
                  requestId={a.requestId}
                  initialStatus={a.initialStatus}
                  labels={a.labels}
                />
              ) : (
                <button
                  key={`chip-${a.chipId}`}
                  type="button"
                  onClick={() => onChip(a.chipId)}
                  className="min-h-11 rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
                >
                  {a.label}
                </button>
              ),
            )}
          </div>
        </>
      )}

      {/* Contact is platform-workflow-only. Saying so is part of the contract —
          the panel must never look like it is withholding contact details. */}
      <p className="mt-4 text-meta text-text-muted" data-testid="context-panel-contact-note">
        {view.contactNote}
      </p>
    </div>
  );
}

function WorkBody({
  view,
  onChip,
}: {
  view: WorkContextView;
  onChip: (chipId: string) => void;
}) {
  const t = useTranslations("workspace.panel");
  return (
    <div className="flex flex-col" data-testid="context-panel-work">
      <p className="text-basis text-text-secondary">{view.headline}</p>
      {view.facts.length > 0 && <Facts facts={view.facts} />}
      {view.recommendations.length > 0 && (
        <>
          <SectionTitle>{t("sectionRecommendations")}</SectionTitle>
          <Recommendations items={view.recommendations} onChip={onChip} actLabel={t("act")} />
        </>
      )}
    </div>
  );
}
