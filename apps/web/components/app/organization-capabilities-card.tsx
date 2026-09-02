"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  partitionCapabilities,
  type CapabilityChoice,
} from "@/lib/organizations/capability-choices";
import { declareOrganizationCapabilities } from "@/lib/organizations/capability-actions";

/**
 * "What does your organization do?" — one question, several honest answers.
 *
 * ── WHY THIS SCREEN EXISTS ─────────────────────────────────────────────────
 * `organization_roles` went live with no way for a person to reach it, so an
 * education institution could hold the education capability in the database
 * and had no screen on which to claim it. Before that table it could not even
 * be true: `organization_type` was one closed value and an institution's only
 * options were to call itself a company or not exist.
 *
 * ── WHAT IT REFUSES TO BE ──────────────────────────────────────────────────
 * An administration console. It asks ONE question in the words an institution
 * administrator already uses, and it never shows them a slug. It also does not
 * duplicate the industry question (`company_type`): what an organization DOES
 * is a different, many-valued axis from which industry it is in.
 *
 * ── WHY DECLARED CAPABILITIES ARE NOT CHECKBOXES ───────────────────────────
 * The write path can grant a capability and cannot revoke one — withdrawing
 * one has consequences for everyone who relied on it, and that decision was
 * left out of the minimum slice rather than guessed at. So an already-declared
 * capability renders as SETTLED, never as a ticked box that silently refuses
 * to untick. A control that cannot be turned off must not look like one.
 */
export function OrganizationCapabilitiesCard({
  organizationId,
  declared,
}: {
  readonly organizationId: string;
  readonly declared: readonly string[];
}) {
  const t = useTranslations();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error" | "denied">(
    "idle",
  );

  const { settled, offered } = partitionCapabilities(declared);

  function toggle(slug: string) {
    setState("idle");
    setPicked((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function save() {
    if (picked.length === 0) return;
    start(async () => {
      const res = await declareOrganizationCapabilities(organizationId, picked);
      if (res.ok) {
        setPicked([]);
        setState("saved");
        return;
      }
      setState(res.code === "not-permitted" ? "denied" : "error");
    });
  }

  const label = (c: CapabilityChoice) => t(c.labelKey);
  const hint = (c: CapabilityChoice) => t(c.hintKey);

  return (
    <section
      className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 p-4"
      data-testid="org-capabilities-card"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-support font-medium text-text-primary">
          {t("organizationCapabilities.title")}
        </h2>
        <p className="text-meta text-text-muted">
          {t("organizationCapabilities.help")}
        </p>
      </div>

      {settled.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5"
          data-testid="org-capabilities-settled"
        >
          {settled.map((c) => (
            <li
              key={c.slug}
              data-testid={`org-capability-settled-${c.slug}`}
              className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-meta text-text-secondary"
            >
              {label(c)}
            </li>
          ))}
        </ul>
      )}

      {offered.length > 0 ? (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">
              {t("organizationCapabilities.title")}
            </legend>
            {offered.map((c) => (
              <label
                key={c.slug}
                className="flex cursor-pointer items-start gap-2 rounded border border-ink-600 px-3 py-2 text-support hover:border-ink-500"
                data-testid={`org-capability-option-${c.slug}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={picked.includes(c.slug)}
                  disabled={pending}
                  onChange={() => toggle(c.slug)}
                  data-testid={`org-capability-checkbox-${c.slug}`}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-text-primary">{label(c)}</span>
                  <span className="text-meta text-text-muted">{hint(c)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending || picked.length === 0}
              data-testid="org-capabilities-save"
              className="rounded border border-ink-500 bg-ink-800 px-3 py-1.5 text-support text-text-primary disabled:opacity-50"
            >
              {t("organizationCapabilities.save")}
            </button>
            {state === "saved" && (
              <span
                className="text-meta text-text-secondary"
                data-testid="org-capabilities-saved"
                role="status"
              >
                {t("organizationCapabilities.saved")}
              </span>
            )}
            {state === "denied" && (
              <span className="text-meta text-state-danger" role="alert">
                {t("organizationCapabilities.notPermitted")}
              </span>
            )}
            {state === "error" && (
              <span className="text-meta text-state-danger" role="alert">
                {t("organizationCapabilities.error")}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-meta text-text-muted">
          {t("organizationCapabilities.allDeclared")}
        </p>
      )}
    </section>
  );
}
