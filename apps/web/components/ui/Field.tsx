import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/utils";

/** What a control needs to be wired to its label, hint and error. */
export type FieldControlProps = {
  readonly id: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
};

/**
 * ONE FORM FIELD — label, control, hint and error, wired together.
 *
 * The shared `Input`, `Select` and `DarkListbox` style the control; this
 * component is the part every hand-built form was missing: the label is
 * bound to the control, the hint and the error are announced with it
 * (`aria-describedby`), and an error marks the control invalid. The error is
 * text, never colour alone.
 *
 *   <Field label={t("email")} hint={t("emailHint")} error={errors.email}>
 *     {(control) => <Input type="email" name="email" {...control} />}
 *   </Field>
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (control: FieldControlProps) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {hint && (
        <p id={hintId} className="text-xs leading-snug text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium leading-snug text-state-danger">
          {error}
        </p>
      )}
    </div>
  );
}
