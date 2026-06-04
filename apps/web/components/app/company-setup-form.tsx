"use client";

import { useActionState } from "react";

import {
  saveCompanySetupAction,
  type CompanySetupFormState,
} from "@/lib/company/setup-actions";
import type {
  CompanyRow,
  CompanyRequesterRole,
} from "@/lib/company/company-setup";

/**
 * Company profile-REQUEST form (real persistence, honest verification).
 *
 * Posts FormData to save_company_setup via the server action. Two buttons:
 *   - "Save draft" (intent=draft)   → keeps verification_status = 'draft'
 *   - "Submit request" (intent=submit) → moves to 'pending_verification'
 *
 * Neither path can create a VERIFIED company. The banner copy states plainly
 * that full company use requires verification, which is a manual human step
 * that does not happen automatically (PLATFORM_DOCTRINE §7 — no fake
 * verification, no fake AI, no fake paid claims).
 */

export interface CompanySetupFormLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly legalName: string;
  readonly legalNameHelp: string;
  readonly legalNamePlaceholder: string;
  readonly country: string;
  readonly countryPlaceholder: string;
  readonly registrationCode: string;
  readonly registrationCodeHelp: string;
  readonly address: string;
  readonly addressPlaceholder: string;
  readonly website: string;
  readonly websitePlaceholder: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly requesterRole: string;
  readonly requesterRoleOptions: Record<CompanyRequesterRole, string>;
  readonly verificationNotice: string;
  readonly saveDraft: string;
  readonly submitRequest: string;
  readonly statusDraftSaved: string;
  readonly statusSubmitted: string;
  readonly statusNeedsMigration: string;
  readonly statusInvalid: string;
  readonly statusError: string;
}

const REQUESTER_ROLE_ORDER: readonly CompanyRequesterRole[] = [
  "owner",
  "director",
  "manager",
  "hr",
  "other",
];

export function CompanySetupForm({
  existing,
  labels,
}: {
  readonly existing: CompanyRow | null;
  readonly labels: CompanySetupFormLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    CompanySetupFormState | null,
    FormData
  >(saveCompanySetupAction, null);

  const banner: { tone: "success" | "warning"; text: string } | null = (() => {
    if (!state) return null;
    if (state.ok) {
      return {
        tone: "success",
        text: state.submitted ? labels.statusSubmitted : labels.statusDraftSaved,
      };
    }
    switch (state.code) {
      case "needs_migration":
        return { tone: "warning", text: labels.statusNeedsMigration };
      case "invalid":
        return { tone: "warning", text: state.message ?? labels.statusInvalid };
      default:
        return { tone: "warning", text: state.message ?? labels.statusError };
    }
  })();

  return (
    <form className="flex flex-col gap-4" data-testid="company-setup-form">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      {/* Honest verification notice — full company use requires human
          verification that does not happen automatically. */}
      <p
        className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
        data-testid="company-setup-verification-notice"
      >
        {labels.verificationNotice}
      </p>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.legalName}</span>
        <input
          type="text"
          name="legal_name"
          required
          minLength={2}
          maxLength={200}
          defaultValue={existing?.legalName ?? ""}
          placeholder={labels.legalNamePlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="company-setup-legal-name"
        />
        <span className="text-[11px] text-text-muted">{labels.legalNameHelp}</span>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.country}</span>
        <input
          type="text"
          name="country"
          maxLength={100}
          defaultValue={existing?.country ?? ""}
          placeholder={labels.countryPlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="company-setup-country"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.registrationCode}</span>
        <input
          type="text"
          name="registration_code"
          maxLength={100}
          defaultValue={existing?.registrationCode ?? ""}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="company-setup-registration-code"
        />
        <span className="text-[11px] text-text-muted">
          {labels.registrationCodeHelp}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.address}</span>
        <input
          type="text"
          name="address"
          maxLength={300}
          defaultValue={existing?.address ?? ""}
          placeholder={labels.addressPlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="company-setup-address"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.website}</span>
        <input
          type="text"
          name="website"
          maxLength={200}
          defaultValue={existing?.website ?? ""}
          placeholder={labels.websitePlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="company-setup-website"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-secondary">{labels.contactEmail}</span>
          <input
            type="email"
            name="contact_email"
            maxLength={200}
            defaultValue={existing?.contactEmail ?? ""}
            className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="company-setup-contact-email"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-secondary">{labels.contactPhone}</span>
          <input
            type="text"
            name="contact_phone"
            maxLength={50}
            defaultValue={existing?.contactPhone ?? ""}
            className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="company-setup-contact-phone"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.requesterRole}</span>
        <select
          name="requester_role"
          defaultValue={existing?.requesterRole ?? "owner"}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="company-setup-requester-role"
        >
          {REQUESTER_ROLE_ORDER.map((role) => (
            <option key={role} value={role}>
              {labels.requesterRoleOptions[role]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="draft"
          formAction={formAction}
          disabled={isPending}
          className="rounded-md border border-border-default bg-surface-1 px-4 py-2 text-sm font-semibold text-text-primary hover:border-brand-blue disabled:opacity-50"
          data-testid="company-setup-save-draft"
        >
          {labels.saveDraft}
        </button>
        <button
          type="submit"
          name="intent"
          value="submit"
          formAction={formAction}
          disabled={isPending}
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="company-setup-submit-request"
        >
          {labels.submitRequest}
        </button>
      </div>

      {banner ? (
        <p
          className={
            banner.tone === "success"
              ? "rounded-md border border-state-success bg-state-success/10 px-3 py-2 text-xs text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          }
          role="status"
          data-testid="company-setup-result"
        >
          {banner.text}
        </p>
      ) : null}
    </form>
  );
}
