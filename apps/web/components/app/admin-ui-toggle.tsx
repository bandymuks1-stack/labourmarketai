"use client";

import { useTransition } from "react";

import { setAdminUiHiddenAction } from "@/lib/auth/admin-ui-actions";
import { Button } from "@/components/ui/Button";

/**
 * Account-page control for the admin-UI visibility preference (Fix D).
 * Permissions are never touched — this only shows/hides admin chrome on normal
 * surfaces so an admin can work/test as a normal user. Admin routes stay
 * protected and reachable if opened directly.
 */
export function AdminUiToggle({
  hidden,
  labels,
}: {
  hidden: boolean;
  labels: {
    title: string;
    description: string;
    statusShown: string;
    statusHidden: string;
    show: string;
    hide: string;
  };
}) {
  const [pending, start] = useTransition();
  return (
    <section
      className="card-border flex flex-col gap-2 p-4"
      data-testid="admin-ui-toggle"
    >
      <h2 className="font-display text-base font-semibold text-text-primary">
        {labels.title}
      </h2>
      <p className="text-xs leading-relaxed text-text-secondary">
        {labels.description}
      </p>
      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {hidden ? labels.statusHidden : labels.statusShown}
      </p>
      <Button
        type="button"
        size="sm"
        variant={hidden ? "primary" : "ghost"}
        disabled={pending}
        className="self-start"
        onClick={() => start(() => void setAdminUiHiddenAction(!hidden))}
      >
        {hidden ? labels.show : labels.hide}
      </Button>
    </section>
  );
}
