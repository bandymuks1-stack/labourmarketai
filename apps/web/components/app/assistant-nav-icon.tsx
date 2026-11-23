import { AssistantMark } from "@/components/app/conversation/chat/assistant-identity";

/**
 * "My space" in the one header wears the ASSISTANT'S MARK, not a house
 * (owner P0 2026-11-23: the AI assistant clearly visible and reachable;
 * CAROUSEL_NAVIGATION_SPEC OD-2 (a), step N3). `/dashboard` IS the
 * conversation with the assistant, so the item that leads there carries the
 * same mark every assistant turn shows — one identity, no new control.
 *
 * It takes the icon props the header spreads on every nav icon
 * (`iconControl()`): the size class is kept, the stroke is not used (the mark
 * is the brand vector, not a stroke icon).
 */
export function AssistantNavIcon({ className = "" }: { className?: string; strokeWidth?: number }) {
  return <AssistantMark size="sm" className={className} testId="nav-assistant-mark" />;
}
