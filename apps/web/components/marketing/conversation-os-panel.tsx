import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";

/**
 * PR-H global landing — section G: "Conversation as the operating system".
 *
 * HONESTY (§18): the capability list splits into what the in-product
 * conversation can do TODAY (capabilities wired in
 * lib/conversation/action-registry.ts: CV/profile updates, work-day logging,
 * finding work + expressing interest, publishing a company need, responding
 * to bookings, contacting a candidate) and what is IN PREPARATION (ordering a
 * service through chat, generating documents, automations). Nothing else is
 * shown. Invoice generation and outbound email sending do NOT exist and are
 * deliberately NOT listed at all.
 *
 * The chat composition on the right is a token-styled STATIC illustration of
 * the real confirm-before-save flow — visually marked with the concept label,
 * with no interactive elements (no fake working buttons).
 */
export async function ConversationOsPanel() {
  const t = await getTranslations("landing.conv");
  const live = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;
  const coming = ["k1", "k2", "k3"] as const;

  return (
    <section id="conversation" className="mt-16 scroll-mt-24">
      <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
        <span className="live-dot" aria-hidden />
        {t("eyebrow")}
      </p>
      <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
        {t("title")}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
        {t("subcopy")}
      </p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Capability lists — real today vs. honestly "in preparation" */}
        <Reveal>
          <div className="flex flex-col gap-5">
            <div className="card-border p-5 sm:p-6">
              <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-state-success">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-state-success"
                  aria-hidden
                />
                {t("liveLabel")}
              </p>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {live.map((k) => (
                  <li
                    key={k}
                    className="flex items-start gap-2 text-sm text-text-secondary"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cyan"
                      aria-hidden
                    />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-border p-5 sm:p-6">
              <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-state-amber">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-state-amber"
                  aria-hidden
                />
                {t("comingLabel")}
              </p>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {coming.map((k) => (
                  <li
                    key={k}
                    className="flex items-start gap-2 text-sm text-text-muted"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-state-amber/70"
                      aria-hidden
                    />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        {/* Static chat composition — concept-marked, non-interactive */}
        <Reveal delay={0.1}>
          <div className="card-border relative overflow-hidden p-5 sm:p-6">
            <p className="inline-flex items-center gap-2 rounded-sm border border-ink-600/70 bg-ink-800/70 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("conceptLabel")}
            </p>
            <div className="mt-4 flex flex-col gap-3" aria-hidden>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-brand-blue/30 bg-brand-blue/10 px-4 py-3 text-sm leading-relaxed text-text-primary">
                {t("mockUser")}
              </div>
              <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-ink-500 bg-ink-800/60 px-4 py-3 text-sm leading-relaxed text-text-secondary">
                {t("mockAssistant")}
                <div className="mt-3 flex gap-2">
                  <span className="inline-flex items-center rounded-md border border-state-success/50 bg-state-success/10 px-3 py-1.5 text-xs font-semibold text-state-success">
                    {t("mockConfirm")}
                  </span>
                  <span className="inline-flex items-center rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-muted">
                    {t("mockEdit")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
