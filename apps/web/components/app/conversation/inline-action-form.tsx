"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import {
  type FieldSpec,
  type FormState,
  type WorkerFormSpec,
} from "@/lib/conversation/worker-forms";
import { dispatchWorkerAction } from "@/lib/conversation/dispatch";
import { ChatAction, ChatActionRow } from "@/components/app/conversation/chat/chat-action";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

type Phase =
  | { kind: "form" }
  | { kind: "review" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * Inline conversation action form (Phase B). Renders a structured, deterministic
 * form for a reversible worker action, shows a clear REVIEW summary before the
 * write, then executes through the server dispatcher and shows the REAL result.
 * Works fully with AI OFF. Back/cancel at every step; no free-text-only fields.
 */
export function InlineActionForm({
  spec,
  locale,
  onClose,
}: {
  spec: WorkerFormSpec;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState<FormState>({});
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [saving, start] = useTransition();

  const inputCls =
    "w-full rounded-control border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  function set(name: string, v: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  function requiredMissing(): boolean {
    return spec.fields.some(
      (f) =>
        "required" in f &&
        f.required &&
        (values[f.name] == null || String(values[f.name]).trim() === ""),
    );
  }

  function toReview() {
    if (requiredMissing()) {
      setPhase({ kind: "error", message: t("conversation.forms.ui.errorInvalid") });
      return;
    }
    setPhase({ kind: "review" });
  }

  function save() {
    start(async () => {
      const input = spec.build(values);
      const res = await dispatchWorkerAction(spec.actionId, input, { locale });
      if (res.ok) {
        trackFunnel(FUNNEL_EVENTS.profileSaved, {
          surface: "conversation",
          role_context: "worker",
          success: true,
        });
        setPhase({ kind: "done" });
        router.refresh();
      } else {
        const message =
          res.code === "invalid"
            ? t("conversation.forms.ui.errorInvalid")
            : res.code === "needs_migration"
              ? t("conversation.forms.ui.errorNeedsMigration")
              : res.code === "conflict"
                ? t("conversation.forms.ui.errorConflict")
                : t("conversation.forms.ui.errorGeneric");
        setPhase({ kind: "error", message });
      }
    });
  }

  if (phase.kind === "done") {
    return (
      <div
        // A REAL status change just landed — the one place the spring belongs.
        className="ua-confirmed flex items-center justify-between gap-3 rounded-card border border-state-success/40 bg-state-success/5 px-4 py-3"
        data-testid="inline-action-done"
      >
        <span className="text-sm font-semibold text-state-success">
          {t("conversation.forms.ui.saved")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-support font-semibold text-brand-blue hover:underline"
        >
          {t("conversation.forms.ui.addAnother")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 px-4 py-3"
      data-testid={`inline-action-form-${spec.actionId}`}
    >
      <h3 className="font-display text-card-title font-semibold text-text-primary">{t(spec.titleKey)}</h3>

      {phase.kind === "review" ? (
        <div className="flex flex-col gap-2" data-testid="inline-action-review">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("conversation.forms.ui.reviewTitle")}
          </p>
          <dl className="flex flex-col gap-1 rounded-control border border-ink-600 p-3 text-sm">
            {spec.fields
              .filter((f) => {
                const v = values[f.name];
                return f.kind === "checkbox" ? v === true : v != null && String(v).trim() !== "";
              })
              .map((f) => (
                <div key={f.name} className="flex justify-between gap-3">
                  <dt className="text-text-muted">{t(f.labelKey)}</dt>
                  <dd className="text-text-primary">{displayValue(f, values[f.name], t)}</dd>
                </div>
              ))}
          </dl>
          <ChatActionRow>
            {/* `loading` renders a spinner and sets aria-busy, so "saving" is
                distinguishable from "disabled" without perceiving colour. */}
            <ChatAction tone="primary" loading={saving} testId="inline-action-save" onClick={save}>
              {saving ? t("conversation.forms.ui.working") : t("conversation.forms.ui.save")}
            </ChatAction>
            <ChatAction tone="secondary" disabled={saving} onClick={() => setPhase({ kind: "form" })}>
              {t("conversation.forms.ui.back")}
            </ChatAction>
          </ChatActionRow>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {spec.fields.map((f) => (
            <Field key={f.name} f={f} value={values[f.name]} onChange={set} t={t} inputCls={inputCls} />
          ))}
          <ChatActionRow>
            <ChatAction tone="primary" testId="inline-action-continue" onClick={toReview}>
              {t("conversation.forms.ui.continue")}
            </ChatAction>
            <ChatAction tone="secondary" onClick={onClose}>
              {t("conversation.forms.ui.cancel")}
            </ChatAction>
          </ChatActionRow>
        </div>
      )}

      {phase.kind === "error" && (
        <p role="alert" aria-live="polite" className="text-support text-state-danger" data-testid="inline-action-error">
          {phase.message}
        </p>
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function displayValue(f: FieldSpec, v: string | boolean | undefined, t: T): string {
  if (f.kind === "checkbox") return v === true ? "✓" : "—";
  if (f.kind === "tristate") return t(`conversation.forms.tristate.${v === "yes" ? "yes" : v === "no" ? "no" : "notStated"}`);
  if (f.kind === "select") {
    const opt = f.options.find((o) => o.value === v);
    return opt ? (opt.labelKey ? t(opt.labelKey) : opt.label ?? String(v)) : String(v ?? "");
  }
  return String(v ?? "");
}

function Field({
  f,
  value,
  onChange,
  t,
  inputCls,
}: {
  f: FieldSpec;
  value: string | boolean | undefined;
  onChange: (name: string, v: string | boolean) => void;
  t: T;
  inputCls: string;
}) {
  const label = t(f.labelKey);
  if (f.kind === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(f.name, e.target.checked)}
          data-testid={`field-${f.name}`}
        />
        {label}
      </label>
    );
  }
  if (f.kind === "tristate") {
    const cur = typeof value === "string" ? value : "";
    return (
      <div className="flex flex-col gap-1">
        <span className="text-meta text-text-muted">{label}</span>
        <div className="flex gap-1" role="group" aria-label={label}>
          {(["yes", "no"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(f.name, cur === opt ? "not_stated" : opt)}
              aria-pressed={cur === opt}
              data-testid={`field-${f.name}-${opt}`}
              className={`min-h-11 flex-1 rounded-control border px-3 text-support font-medium ${
                cur === opt
                  ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                  : "border-ink-500 text-text-secondary hover:bg-ink-700"
              }`}
            >
              {t(`conversation.forms.tristate.${opt}`)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (f.kind === "select") {
    return (
      <label className="flex flex-col gap-1 text-meta text-text-muted">
        {label}
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(f.name, e.target.value)}
          data-testid={`field-${f.name}`}
          className={inputCls}
        >
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.labelKey ? t(o.labelKey) : o.label ?? o.value}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (f.kind === "textarea") {
    return (
      <label className="flex flex-col gap-1 text-meta text-text-muted">
        {label}
        <textarea
          rows={3}
          maxLength={f.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(f.name, e.target.value)}
          placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
          data-testid={`field-${f.name}`}
          className={inputCls}
        />
      </label>
    );
  }
  // text | number
  return (
    <label className="flex flex-col gap-1 text-meta text-text-muted">
      {label}
      <input
        type={f.kind === "number" ? "number" : "text"}
        inputMode={f.kind === "number" ? "numeric" : undefined}
        min={f.kind === "number" ? f.min : undefined}
        max={f.kind === "number" ? f.max : undefined}
        maxLength={f.kind === "text" ? f.maxLength : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(f.name, e.target.value)}
        placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
        data-testid={`field-${f.name}`}
        className={inputCls}
      />
    </label>
  );
}
