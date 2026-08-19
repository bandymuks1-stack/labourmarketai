"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import {
  saveVacancyAction,
  unsaveVacancyAction,
} from "@/app/[locale]/(marketing)/jobs/[id]/actions";

/**
 * SAVE / SAVED / UNSAVE for one public vacancy — a PRIVATE BOOKMARK.
 *
 * Owner decision 2026-08-19: this is not an application, not a shortlist, not
 * employer interest, not candidate disclosure. The copy says so in every
 * locale — the note under the control is not decoration, it is the thing that
 * stops a worker believing they have applied. #1193 fixed a funnel that
 * silently did nothing; a "Save" a worker mistakes for "Apply" would be the
 * same defect wearing a different label.
 *
 * State comes from the SERVER on load (`initiallySaved`, read under RLS). The
 * optimistic flip is reverted on any non-ok result, so the button can never sit
 * in a state the database does not hold.
 */
export type SaveVacancyCopy = {
  readonly save: string;
  readonly saved: string;
  readonly unsave: string;
  readonly note: string;
  readonly failed: string;
  readonly closed: string;
};

export function SaveVacancyButton({
  vacancyId,
  initiallySaved,
  copy,
}: {
  vacancyId: string;
  initiallySaved: boolean;
  copy: SaveVacancyCopy;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [hovering, setHovering] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next); // optimistic
    setProblem(null);
    startTransition(async () => {
      const result = next
        ? await saveVacancyAction(vacancyId)
        : await unsaveVacancyAction(vacancyId);
      if (result.kind === "ok") return;
      setSaved(!next); // the write did not happen — say so, do not pretend
      setProblem(result.kind === "not-open" ? copy.closed : copy.failed);
    });
  }

  // Saved + hover/focus reads "Unsave", so the destructive meaning is visible
  // before the click rather than discovered after it.
  const label = saved ? (hovering ? copy.unsave : copy.saved) : copy.save;

  return (
    <div className="mt-6">
      <Button
        type="button"
        variant={saved ? "secondary" : "primary"}
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
      >
        {label}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">{copy.note}</p>
      {problem && (
        <p className="mt-1 text-xs text-destructive" role="status">
          {problem}
        </p>
      )}
    </div>
  );
}
