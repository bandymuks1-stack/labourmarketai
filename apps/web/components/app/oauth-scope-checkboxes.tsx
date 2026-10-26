import type { ProductScope } from "@/lib/mcp/scopes";

/**
 * THE PER-PERMISSION CHOICE (B3) — one checkbox per LabourMarket.ai product
 * scope, used by the consent screen (server component) and by Connected apps
 * → "Change permissions" (client component). No hooks and no submit button
 * here, so it renders in either and the form owns the submit.
 *
 * Every box posts `name="scope"`; the server action normalises the values
 * (`normalizeProductScopes`) and the database function refuses anything that
 * is not a product scope. The visible label is the plain-words meaning and
 * the exact scope code is shown beside it, so nothing is hidden. A scope the
 * client asked for but the person has not granted is marked as requested —
 * never pre-ticked on the client's behalf.
 */
export type ScopeOption = {
  readonly scope: ProductScope;
  readonly label: string;
};

export function OauthScopeCheckboxes({
  legend,
  hint,
  options,
  checked,
  requested,
  requestedLabel,
  idPrefix,
}: {
  legend: string;
  hint: string;
  options: readonly ScopeOption[];
  checked: readonly ProductScope[];
  requested?: readonly ProductScope[];
  requestedLabel?: string;
  idPrefix: string;
}) {
  const on = new Set(checked);
  const asked = new Set(requested ?? []);
  return (
    <fieldset className="flex flex-col gap-2" data-testid="oauth-scope-checkboxes">
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-text-muted">{hint}</p>
      {options.map(({ scope, label }) => {
        const id = `${idPrefix}-${scope.replace(/[^a-z]/g, "-")}`;
        return (
          <div key={scope} className="flex items-start gap-2">
            <input
              id={id}
              type="checkbox"
              name="scope"
              value={scope}
              defaultChecked={on.has(scope)}
              className="mt-1"
              data-scope={scope}
            />
            <label htmlFor={id} className="text-sm leading-snug">
              {label} <code className="text-xs text-text-muted">{scope}</code>
              {asked.has(scope) && !on.has(scope) && requestedLabel && (
                <span className="ml-1 text-xs text-state-warning">({requestedLabel})</span>
              )}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
