/**
 * CommunicationStart — the single place a conversation begins.
 *
 * There is exactly one communication area in the product. This is the entry
 * point for starting a thread; there is no separate inbox / messages / DM
 * surface and there must never be one.
 */
import { SAMPLE_NOTICE } from "@/lib/sample-data";
import type { CommunicationThreadStart } from "@/lib/types";

export function CommunicationStart({
  recent,
}: {
  recent: CommunicationThreadStart[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="glass p-6">
        <h3 className="text-lg font-semibold">Start a thread</h3>
        <p className="mt-1 text-sm text-fg-dim">
          One entry point. Pick who, attach the context, send the first
          message — the thread is born here.
        </p>

        <form className="mt-6 space-y-4">
          <Field label="To">
            <input
              disabled
              placeholder="Select a player card…"
              className="lm-input"
            />
          </Field>
          <Field label="Context">
            <input
              disabled
              placeholder="e.g. Hiring need — Senior Welder"
              className="lm-input"
            />
          </Field>
          <Field label="Opening message">
            <textarea
              disabled
              rows={4}
              placeholder="Keep it specific and human…"
              className="lm-input resize-none"
            />
          </Field>
          <button
            type="button"
            disabled
            className="cta cta-primary w-full justify-center opacity-60"
          >
            Send opener
          </button>
          <p className="text-center text-[0.7rem] text-fg-mute">
            Structure only — sending is not wired in this foundation.
          </p>
        </form>
      </div>

      <div className="glass p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent openers</h3>
          <span className="chip">{SAMPLE_NOTICE}</span>
        </div>
        <ul className="mt-5 space-y-3">
          {recent.map((thread) => (
            <li
              key={thread.id}
              className="rounded-xl border border-line/60 bg-fg/[0.02] p-4"
            >
              <p className="text-xs uppercase tracking-wider text-fg-mute">
                {thread.context}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                {thread.openingMessage}
              </p>
              <p className="mt-3 text-[0.7rem] text-fg-mute">
                {thread.createdAt}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[0.7rem] uppercase tracking-wider text-fg-mute">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
