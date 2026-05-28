"use client";

import { useActionState } from "react";

import {
  saveBuyerSetupAction,
  type BuyerSetupFormState,
} from "@/lib/buyer/actions";
import type { CustomerRow } from "@/lib/buyer/customers";

/**
 * Stage 2 PR 1 — Buyer / customer setup form (real persistence).
 *
 * Posts FormData to the save_customer_setup RPC via the server action.
 * Renders an honest result banner per outcome. The parent server
 * component supplies the existing row (when present) so the form
 * pre-fills with the current saved values; the RPC is idempotent
 * (upsert) so resubmitting only updates changed fields.
 */

export interface BuyerSetupFormLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly contactName: string;
  readonly contactNameHelp: string;
  readonly customerType: string;
  readonly customerTypeOptions: {
    readonly individual: string;
    readonly small_business: string;
    readonly nonprofit: string;
    readonly other: string;
  };
  readonly country: string;
  readonly countryPlaceholder: string;
  readonly market: string;
  readonly marketPlaceholder: string;
  readonly needSummary: string;
  readonly needSummaryHelp: string;
  readonly contactPreference: string;
  readonly contactPreferenceOptions: {
    readonly email: string;
    readonly phone: string;
    readonly platform_message: string;
  };
  readonly manualReviewNote: string;
  readonly manualReviewNoteHelp: string;
  readonly submit: string;
  readonly statusSaved: string;
  readonly statusNeedsMigration: string;
  readonly statusInvalid: string;
  readonly statusError: string;
}

export function BuyerSetupForm({
  existing,
  labels,
}: {
  readonly existing: CustomerRow | null;
  readonly labels: BuyerSetupFormLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    BuyerSetupFormState | null,
    FormData
  >(saveBuyerSetupAction, null);

  const banner: { tone: "success" | "warning"; text: string } | null = (() => {
    if (!state) return null;
    if (state.ok) return { tone: "success", text: labels.statusSaved };
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
    <form
      action={formAction}
      className="flex flex-col gap-4"
      data-testid="buyer-setup-form"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.contactName}</span>
        <input
          type="text"
          name="contact_name"
          required
          minLength={2}
          maxLength={200}
          defaultValue={existing?.contactName ?? ""}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="buyer-setup-contact-name"
        />
        <span className="text-[11px] text-text-muted">{labels.contactNameHelp}</span>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.customerType}</span>
        <select
          name="customer_type"
          defaultValue={existing?.customerType ?? "individual"}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="buyer-setup-customer-type"
        >
          <option value="individual">{labels.customerTypeOptions.individual}</option>
          <option value="small_business">{labels.customerTypeOptions.small_business}</option>
          <option value="nonprofit">{labels.customerTypeOptions.nonprofit}</option>
          <option value="other">{labels.customerTypeOptions.other}</option>
        </select>
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
          data-testid="buyer-setup-country"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.market}</span>
        <input
          type="text"
          name="market"
          maxLength={200}
          defaultValue={existing?.market ?? ""}
          placeholder={labels.marketPlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="buyer-setup-market"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.needSummary}</span>
        <textarea
          name="need_summary"
          rows={3}
          maxLength={2000}
          defaultValue={existing?.needSummary ?? ""}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="buyer-setup-need-summary"
        />
        <span className="text-[11px] text-text-muted">{labels.needSummaryHelp}</span>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.contactPreference}</span>
        <select
          name="contact_preference"
          defaultValue={existing?.contactPreference ?? "platform_message"}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="buyer-setup-contact-preference"
        >
          <option value="email">{labels.contactPreferenceOptions.email}</option>
          <option value="phone">{labels.contactPreferenceOptions.phone}</option>
          <option value="platform_message">
            {labels.contactPreferenceOptions.platform_message}
          </option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">{labels.manualReviewNote}</span>
        <textarea
          name="manual_review_note"
          rows={2}
          maxLength={1000}
          defaultValue={existing?.manualReviewNote ?? ""}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
          data-testid="buyer-setup-manual-review-note"
        />
        <span className="text-[11px] text-text-muted">
          {labels.manualReviewNoteHelp}
        </span>
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
        data-testid="buyer-setup-submit"
      >
        {labels.submit}
      </button>

      {banner ? (
        <p
          className={
            banner.tone === "success"
              ? "rounded-md border border-state-success bg-state-success/10 px-3 py-2 text-xs text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          }
          role="status"
          data-testid="buyer-setup-result"
        >
          {banner.text}
        </p>
      ) : null}
    </form>
  );
}
