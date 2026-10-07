"use client";

import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/Button";

/**
 * Submit buttons for native `<form action={serverAction}>` forms rendered by
 * server components (G-8). While the surrounding form's action is in flight
 * the button is disabled and `aria-busy`, so a double click / impatient second
 * press cannot run a non-idempotent write twice. Must be rendered INSIDE the
 * `<form>` (useFormStatus reads the nearest ancestor form).
 *
 * `PendingButton` = the design-system Button; `PendingNativeButton` = a bare
 * `<button>` for call sites that carry their own classes.
 */
export function PendingButton({
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button
        {...props}
        type="submit"
        disabled={pending || props.disabled}
        aria-busy={pending}
      />
      {pending && pendingLabel ? (
        <span role="status" className="sr-only">
          {pendingLabel}
        </span>
      ) : null}
    </>
  );
}

export function PendingNativeButton({
  pendingLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        {...props}
        type="submit"
        disabled={pending || props.disabled}
        aria-busy={pending}
      />
      {pending && pendingLabel ? (
        <span role="status" className="sr-only">
          {pendingLabel}
        </span>
      ) : null}
    </>
  );
}
