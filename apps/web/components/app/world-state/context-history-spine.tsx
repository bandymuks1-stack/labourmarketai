import type { ContextHistoryEntry } from "@/lib/world-state/entity-context";
import {
  PlaceTimeStamp,
  WorkSpine,
  WorkSpineNode,
} from "@/components/app/work-world/primitives";

/**
 * The selected object's history as ONE work spine (work-world grammar) — the
 * same line identity, journal and history draw, so what the conversation is
 * looking at reads like the rest of the world. Same entries, same words; a
 * node per real event, its real time as a mono stamp only when the source
 * states one. Presentational: nothing here reads, routes or decides.
 */
export function ContextHistorySpine({ history }: { history: readonly ContextHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <div className="mt-1.5" data-testid="context-panel-history">
      <WorkSpine>
        {history.map((h) => (
          <WorkSpineNode key={`${h.at ?? ""}|${h.text}`}>
            <span className="flex flex-col gap-0.5 text-basis text-text-secondary">
              {h.at ? <PlaceTimeStamp>{h.at}</PlaceTimeStamp> : null}
              <span>{h.text}</span>
            </span>
          </WorkSpineNode>
        ))}
      </WorkSpine>
    </div>
  );
}
