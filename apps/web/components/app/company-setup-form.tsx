"use client";

import { useActionState, useRef } from "react";

import { Link } from "@/lib/i18n/navigation";
import {
  saveCompanySetupAction,
  type CompanySetupFormState,
} from "@/lib/company/setup-actions";
import {
  COMPANY_COUNTRY_CODES,
  COMPANY_TYPES,
  type CompanyType,
} from "@/lib/company/company-profile-shared";
import { OptionCards } from "@/components/ui/OptionCards";
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
  readonly companyType: string;
  readonly companyTypeHelp: string;
  readonly companyTypeOptions: Record<CompanyType, string>;
  readonly country: string;
  readonly countryPlaceholder: string;
  /** countries.code → localized country name (only seeded codes). */
  readonly countryOptions: Record<string, string>;
  readonly statusInvalidCountry: string;
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
  /** Shown above the legal fields when the company is VERIFIED and its
   *  legal-registry data is locked (read-only) against silent overwrite. */
  readonly legalLockedNotice: string;
  readonly saveDraft: string;
  readonly submitRequest: string;
  readonly statusDraftSaved: string;
  readonly statusSubmitted: string;
  /** The door after a successful save — the company workspace. */
  readonly goToWorkspace: string;
  /** Shown when the first-run education preset could not be recorded. */
  readonly capabilityNotDeclared: string;
  readonly statusNeedsMigration: string;
  readonly statusInvalid: string;
  /** M-P0-2: same creator already has a company with this canonical name. */
  readonly statusDuplicateCompany: string;
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
  targetCompanyId,
  presetCompanyType,
  presetCapability,
  firstSetup = false,
}: {
  readonly existing: CompanyRow | null;
  readonly labels: CompanySetupFormLabels;
  /** M-P0-2 explicit save target, posted as the hidden `company_id` field:
   *  "new" = create a NEW company (insert-only), a uuid = edit exactly that
   *  company (server re-verifies ownership), undefined = legacy singleton
   *  behaviour. Editing pages pass `existing.id`; the create entry passes
   *  "new" so a second organization NEVER renames the first. */
  readonly targetCompanyId?: string;
  /** First-run router presets: pre-select the company type (agency intent)
   *  and carry a capability to declare once the company exists (education
   *  intent). Presets never override an EXISTING company's stored type. */
  readonly presetCompanyType?: CompanyType;
  readonly presetCapability?: "training_provider";
  /** The row being edited is an unnamed SHELL from onboarding (first setup):
   *  the first-run preset is the person's actual choice, the shell's stored
   *  default type is not — so the preset wins here and only here. */
  readonly firstSetup?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    CompanySetupFormState | null,
    FormData
  >(saveCompanySetupAction, null);

  // Which button was pressed must reach the server action. In React 19 the
  // submitter button's name/value is NOT carried into a function `formAction`,
  // so we drive the intent through a hidden field set on click instead.
  const intentRef = useRef<HTMLInputElement>(null);
  const setIntent = (v: "draft" | "submit") => {
    if (intentRef.current) intentRef.current.value = v;
  };

  // Verified companies have LOCKED legal-registry fields (legal name,
  // country, registration code, address): rendered read-only so a normal
  // user can't overwrite verified data. Contacts / website / type / role
  // stay editable. The server (saveCompanySetup) enforces this too.
  const legalLocked = existing?.verificationStatus === "verified";
  const lockedInputCls = legalLocked
    ? "cursor-not-allowed border-border-default bg-ink-800 text-text-muted"
    : "border-border-default bg-surface-1 text-text-primary focus:border-brand-blue";

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
      case "invalid_country":
        return { tone: "warning", text: labels.statusInvalidCountry };
      case "duplicate_company":
        return { tone: "warning", text: labels.statusDuplicateCompany };
      default:
        // Always the calm localized text — raw technical messages never
        // reach this banner (owner smoke: organizations_country_fkey).
        return { tone: "warning", text: labels.statusError };
    }
  })();

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      data-testid="company-setup-form"
    >
      <input type="hidden" name="intent" ref={intentRef} defaultValue="draft" />
      {presetCapability ? (
        <input type="hidden" name="capability" value={presetCapability} readOnly />
      ) : null}
      {targetCompanyId !== undefined ? (
        <input type="hidden" name="company_id" value={targetCompanyId} readOnly />
      ) : null}
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

      {legalLocked ? (
        <p
          className="rounded-md border border-state-success/40 bg-state-success/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          data-testid="company-setup-legal-locked-notice"
        >
          {labels.legalLockedNotice}
        </p>
      ) : null}

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
          readOnly={legalLocked}
          aria-readonly={legalLocked}
          className={`rounded-md border px-3 py-2 text-sm outline-none ${lockedInputCls}`}
          data-testid="company-setup-legal-name"
        />
        <span className="text-meta text-text-muted">{labels.legalNameHelp}</span>
      </label>

      {/* One canonical company profile. The field is the org's PRIMARY ACTIVITY,
          not a permanent identity — copy says plainly it does not lock the org in,
          and the per-project role is chosen later on each need. Agency stays a
          companyType ('staffing_agency'), never a separate root role/mode.
          Radio cards replace the clumsy mobile <select> (one-tap, no native modal). */}
      <fieldset className="flex flex-col gap-1.5 text-xs">
        <legend className="text-text-secondary">{labels.companyType}</legend>
        <OptionCards
          name="company_type"
          ariaLabel={labels.companyType}
          defaultValue={
            (firstSetup
              ? (presetCompanyType ?? existing?.companyType)
              : (existing?.companyType ?? presetCompanyType)) ?? "other"
          }
          testId="company-setup-company-type"
          options={COMPANY_TYPES.map((type) => ({
            value: type,
            label: labels.companyTypeOptions[type],
          }))}
        />
        <span className="text-meta text-text-muted">
          {labels.companyTypeHelp}
        </span>
      </fieldset>

      {/* Country is a SELECT over the seeded countries — free text here used
          to crash with a raw FK error (owner smoke). NO silent default (PR-G):
          with no saved country the select shows a placeholder and the user
          must actively choose; an unchosen country posts as empty and the
          server stores NULL (honest absence), never Lithuania. */}
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.country}</span>
        <select
          name="country"
          defaultValue={existing?.country ?? ""}
          disabled={legalLocked}
          aria-disabled={legalLocked}
          className={`rounded-md border px-3 py-2 text-sm outline-none ${lockedInputCls}`}
          data-testid="company-setup-country"
        >
          <option value="" disabled>
            {labels.countryPlaceholder}
          </option>
          {COMPANY_COUNTRY_CODES.map((code) => (
            <option key={code} value={code}>
              {labels.countryOptions[code] ?? code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.registrationCode}</span>
        <input
          type="text"
          name="registration_code"
          maxLength={100}
          defaultValue={existing?.registrationCode ?? ""}
          readOnly={legalLocked}
          aria-readonly={legalLocked}
          className={`rounded-md border px-3 py-2 text-sm outline-none ${lockedInputCls}`}
          data-testid="company-setup-registration-code"
        />
        <span className="text-meta text-text-muted">
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
          readOnly={legalLocked}
          aria-readonly={legalLocked}
          className={`rounded-md border px-3 py-2 text-sm outline-none ${lockedInputCls}`}
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

      <fieldset className="flex flex-col gap-1.5 text-xs">
        <legend className="text-text-secondary">{labels.requesterRole}</legend>
        <OptionCards
          name="requester_role"
          ariaLabel={labels.requesterRole}
          defaultValue={existing?.requesterRole ?? "owner"}
          columns={3}
          testId="company-setup-requester-role"
          options={REQUESTER_ROLE_ORDER.map((role) => ({
            value: role,
            label: labels.requesterRoleOptions[role],
          }))}
        />
      </fieldset>

      <div className="flex flex-wrap gap-3">
        {/* AUTOMATIC-FIRST: the primary action saves the company as usable
            now (active_unverified / needs_checks). Requesting a manual review
            is an OPTIONAL secondary action, never required to use the company. */}
        <button
          type="submit"
          onClick={() => setIntent("draft")}
          disabled={isPending}
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="company-setup-save-draft"
        >
          {labels.saveDraft}
        </button>
        <button
          type="submit"
          onClick={() => setIntent("submit")}
          disabled={isPending}
          className="rounded-md border border-border-default bg-surface-1 px-4 py-2 text-sm font-medium text-text-secondary hover:border-brand-blue disabled:opacity-50"
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
      {/* "Company saved" used to be a dead end — the person had to find the
          workspace themselves. Offer the one next door, and say plainly when
          the education preset did not land (the capability card in the
          workspace is where it is declared; nothing is faked). */}
      {state?.ok ? (
        <div className="flex flex-col gap-2" data-testid="company-setup-next">
          {state.capabilityDeclared === false ? (
            <p className="text-xs leading-relaxed text-state-warning" role="status">
              {labels.capabilityNotDeclared}
            </p>
          ) : null}
          <Link
            href="/dashboard/company"
            className="inline-flex w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            data-testid="company-setup-go-workspace"
          >
            {labels.goToWorkspace} →
          </Link>
        </div>
      ) : null}
    </form>
  );
}
