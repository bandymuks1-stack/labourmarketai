"use client";

import { useEffect } from "react";
import { useAuth, type Notification } from "@/lib/auth/context";

/**
 * Client half of the streamed notification spine: receives the
 * server-derived signals from `SpineStream` and pushes them into the
 * auth context (bell + nav badges). Renders nothing.
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
    applySpine(notifications, badges);
  }, [applySpine, notifications, badges]);
  return null;
}
