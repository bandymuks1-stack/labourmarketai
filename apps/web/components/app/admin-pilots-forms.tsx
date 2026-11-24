"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  addPilotParticipantAction,
  createPilotAction,
  recordPilotOutcomeAction,
  removePilotParticipantAction,
  setPilotStatusAction,
  type PilotActionState,
} from "@/lib/admin/pilot-actions";
import type {
  PilotOrganisationKind,
  PilotOutcomeKind,
  PilotStatus,
} from "@/lib/admin/pilots";

/**
 * Admin pilot-cohort forms (Pilot Onboarding and Measurement v1).
 *
 * Client shells over the tagged server actions in lib/admin/pilot-actions.ts.
 * Every failure state is shown honestly (incl. the needs_migration state
 * while the owner-gated migration is unapplied); success refreshes the
 * server-rendered lists — no optimistic fake rows.
 */

const ORGANISATION_KINDS: readonly PilotOrganisationKind[] = [
  "construction",
  "staffing_agency",
  "subcontractor",
  "manufacturing",
  "services",
  "client_customer",
  "other",
  "mixed",
];

const STATUSES: readonly PilotStatus[] = ["draft", "active", "closed"];

const OUTCOMES: readonly PilotOutcomeKind[] = [
  "contact_made",
  "enquiry_made",
  "booking_accepted",
  "hire_reported",
  "no_outcome",
];

const inputCls =
  "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";
const labelCls = "flex flex-col gap-1 text-xs text-text-secondary";
const primaryBtnCls =
  "self-start rounded-md border border-brand-blue/60 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-brand-blue disabled:opacity-50";

function ActionFeedback({ state }: { state: PilotActionState | null }) {
  const t = useTranslations("adminPilots");
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="text-xs text-state-success" role="status">
        {t("saved")}
      </p>
    );
  }
  return (
    <p className="text-xs text-state-danger" role="alert">
      {t(`errors.${state.code}`)}
    </p>
  );
}

/** Wrap an action so a success also refreshes the server-rendered page. */
function useRefreshingAction(
  action: (
    prev: PilotActionState | null,
    formData: FormData,
  ) => Promise<PilotActionState>,
) {
  const router = useRouter();
  return useActionState(
    async (prev: PilotActionState | null, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.ok) router.refresh();
      return next;
    },
    null,
  );
}

export function CreatePilotForm() {
  const t = useTranslations("adminPilots");
  const [state, formAction, pending] = useRefreshingAction(createPilotAction);

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="pilot-create-form">
      <label className={labelCls}>
        {t("create.name")}
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          className={inputCls}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={labelCls}>
          {t("create.kind")}
          <select name="organisation_kind" defaultValue="mixed" className={inputCls}>
            {ORGANISATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("create.startsOn")}
          <input type="date" name="starts_on" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("create.endsOn")}
          <input type="date" name="ends_on" className={inputCls} />
        </label>
      </div>
      <button type="submit" disabled={pending} className={primaryBtnCls}>
        {pending ? t("saving") : t("create.submit")}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function PilotStatusForm({
  pilotId,
  current,
}: {
  pilotId: string;
  current: PilotStatus;
}) {
  const t = useTranslations("adminPilots");
  const [state, formAction, pending] = useRefreshingAction(setPilotStatusAction);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2"
      data-testid="pilot-status-form"
    >
      <input type="hidden" name="pilot_id" value={pilotId} />
      <label className={labelCls}>
        {t("detail.statusLabel")}
        <select name="status" defaultValue={current} className={inputCls}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={primaryBtnCls}>
        {pending ? t("saving") : t("detail.setStatus")}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function AddParticipantForm({ pilotId }: { pilotId: string }) {
  const t = useTranslations("adminPilots");
  const [state, formAction, pending] = useRefreshingAction(
    addPilotParticipantAction,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      data-testid="pilot-add-participant-form"
    >
      <input type="hidden" name="pilot_id" value={pilotId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={labelCls}>
          {t("participants.queryLabel")}
          <input
            name="profile_query"
            required
            minLength={3}
            maxLength={254}
            placeholder={t("participants.queryPlaceholder")}
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          {t("participants.joinedViaLabel")}
          <select name="joined_via" defaultValue="manual" className={inputCls}>
            <option value="manual">{t("participants.joinedVia.manual")}</option>
            <option value="invitation">
              {t("participants.joinedVia.invitation")}
            </option>
          </select>
        </label>
      </div>
      <button type="submit" disabled={pending} className={primaryBtnCls}>
        {pending ? t("saving") : t("participants.add")}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function RemoveParticipantButton({
  pilotId,
  profileId,
}: {
  pilotId: string;
  profileId: string;
}) {
  const t = useTranslations("adminPilots");
  const [state, formAction, pending] = useRefreshingAction(
    removePilotParticipantAction,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="pilot_id" value={pilotId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-state-danger/50 px-2 py-0.5 text-meta text-state-danger hover:bg-state-danger/10 disabled:opacity-50"
      >
        {t("participants.remove")}
      </button>
      {state && !state.ok ? (
        <span className="text-meta text-state-danger" role="alert">
          {t(`errors.${state.code}`)}
        </span>
      ) : null}
    </form>
  );
}

export function RecordOutcomeForm({
  pilotId,
  participants,
}: {
  pilotId: string;
  participants: readonly { profileId: string; name: string }[];
}) {
  const t = useTranslations("adminPilots");
  const [state, formAction, pending] = useRefreshingAction(
    recordPilotOutcomeAction,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      data-testid="pilot-record-outcome-form"
    >
      <input type="hidden" name="pilot_id" value={pilotId} />
      {/* Honesty label: this ledger row is an admin's observation, never a
          platform verification. */}
      <p className="text-meta text-text-muted">{t("outcomes.honesty")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={labelCls}>
          {t("outcomes.outcomeLabel")}
          <select name="outcome" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              {t("outcomes.outcomePlaceholder")}
            </option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`outcomes.values.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("outcomes.participantLabel")}
          <select name="participant_profile_id" defaultValue="" className={inputCls}>
            <option value="">{t("outcomes.wholePilot")}</option>
            {participants.map((p) => (
              <option key={p.profileId} value={p.profileId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={labelCls}>
        {t("outcomes.noteLabel")}
        <textarea
          name="note"
          maxLength={500}
          rows={2}
          placeholder={t("outcomes.notePlaceholder")}
          className={inputCls}
        />
      </label>
      <button type="submit" disabled={pending} className={primaryBtnCls}>
        {pending ? t("saving") : t("outcomes.submit")}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
