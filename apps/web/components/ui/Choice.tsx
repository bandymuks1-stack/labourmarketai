import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const BOX =
  "mt-0.5 h-5 w-5 shrink-0 accent-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const ROW =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-1 py-2.5 text-sm text-text-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

function ChoiceText({ label, hint }: { label: ReactNode; hint?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span>{label}</span>
      {hint && <span className="text-xs leading-snug text-text-muted">{hint}</span>}
    </span>
  );
}

/**
 * ONE CHECKBOX — a native checkbox with its label as the 44px hit area.
 * Works in a plain form (`name` + `value`) and as a controlled input.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "children"> & {
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className={cn(ROW, className)}>
      <input type="checkbox" className={BOX} {...props} />
      <ChoiceText label={label} hint={hint} />
    </label>
  );
}

export type RadioOption = {
  readonly value: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly disabled?: boolean;
};

/**
 * ONE RADIO GROUP as a plain list — a `fieldset` with its `legend`, native
 * radios (arrow keys work without code). For a small set shown as cards use
 * `OptionCards`; this is the compact list form.
 */
export function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  error,
  className,
}: {
  legend: ReactNode;
  name: string;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: ReactNode;
  className?: string;
}) {
  const errorId = `${useId()}-error`;
  return (
    <fieldset
      className={cn("flex min-w-0 flex-col", className)}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1 font-mono text-xs uppercase tracking-label text-text-muted">
        {legend}
      </legend>
      {options.map((o) => (
        <label key={o.value} className={ROW}>
          <input
            type="radio"
            name={name}
            value={o.value}
            disabled={o.disabled}
            className={BOX}
            {...(value !== undefined
              ? { checked: value === o.value, onChange: () => onChange?.(o.value) }
              : { defaultChecked: defaultValue === o.value, onChange: () => onChange?.(o.value) })}
          />
          <ChoiceText label={o.label} hint={o.hint} />
        </label>
      ))}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium leading-snug text-state-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
