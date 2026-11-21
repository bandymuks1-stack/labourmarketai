"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import type { PartnershipActionState } from "@/lib/agency/partnerships-actions";

/**
 * One partnership action: a form with its hidden ids, optional visible fields,
 * one button, and the database's answer in one line under it.
 */
const IDLE: PartnershipActionState = { status: "idle" };

export function PartnershipActionForm({
  action,
  hidden,
  submit,
  pending,
  done,
  errors,
  testId,
  variant = "secondary",
  children,
}: {
  action: (prev: PartnershipActionState, form: FormData) => Promise<PartnershipActionState>;
  hidden: Readonly<Record<string, string>>;
  submit: string;
  pending: string;
  done: string | null;
  errors: Readonly<Record<string, string>>;
  testId: string;
  variant?: "primary" | "secondary" | "ghost";
  children?: React.ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-2" data-testid={testId}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} size="sm" disabled={isPending} data-testid={`${testId}-submit`}>
          {isPending ? pending : submit}
        </Button>
        {state.status === "ok" && done ? (
          <p role="status" className="text-sm text-text-secondary" data-testid={`${testId}-done`}>
            {done}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-state-danger" data-testid={`${testId}-error`} data-code={state.code}>
            {errors[state.code] ?? errors.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
