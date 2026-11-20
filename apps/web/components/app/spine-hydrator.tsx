"use client";

import { startTransition, useEffect } from "react";
import { useAuth, type Notification } from "@/lib/auth/context";

/**
 * Client half of the streamed notification spine: receives the
 * server-derived signals from `SpineStream` and pushes them into the
 * auth context (bell + nav badges). Renders nothing.
 *
 * THE UPDATE IS A TRANSITION. The spine usually resolves before a slow page
 * (scouting reads a dozen sources), and the page is still streaming inside the
 * layout's Suspense boundary. Every context consumer re-renders on this
 * update, and the page holds some (forms read the displayed workspace through
 * `useAuthOptional`). An urgent update that reaches a boundary which has not
 * finished hydrating makes React give the boundary up and client-render it;
 * the server HTML that arrives afterwards is then never swapped in and stays
 * in the document as a hidden `div#S:n` copy of the whole page (seen for
 * minutes in role-journeys J-DEC, #3487). A transition lets React finish
 * hydrating first. The bell and badges are not urgent: a few hundred ms later
 * is the same truth.
 */
export function SpineHydrator({
  notifications,
  badges,
}: {
  notifications: Notification[];
  badges: Partial<Record<string, number>>;
}) {
  const { applySpine } = useAuth();
  useEffect(() => {
    startTransition(() => {
      applySpine(notifications, badges);
    });
  }, [applySpine, notifications, badges]);
  return null;
}
