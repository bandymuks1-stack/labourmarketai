import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { setOnboardingItemStatusAction } from "@/lib/lifecycle/lifecycle-actions";
import {
  WORKER_CONFIRMABLE_KINDS,
  deriveRunProgress,
  type LifecycleNotice,
} from "@/lib/lifecycle/lifecycle-model";
import { getMyOnboardingRuns } from "@/lib/lifecycle/lifecycle";

/**
 * Worker-side "my onboarding" checklist (EC-canonical lifecycle v1) on the
 * start hub — the page a new person lands on. NOT a new route (constitution:
 * expansion inside an existing surface, the approvals-on-network precedent).
 *
 * Plain-language, honest: the worker sees the real checklist their employer
 * started, may confirm the items that are genuinely theirs (reading a
 * document, a training note, a custom step, or an item assigned to them),
 * and sees which items wait on the employer. The SQL enforces the same
 * split — this UI never widens it. When nothing is running, the section
 * renders nothing at all (no empty shell).
 */
export async function MyOnboardingSection({
  locale,
  notice,
}: {
  locale: string;
  notice: LifecycleNotice | null;
}) {
  const t = await getTranslations("lifecycle");
  const result = await getMyOnboardingRuns();
  if (result.status === "not-authed" || result.status === "needs-migration") {
    return null;
  }
  if (result.status === "none" && !notice) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id ?? "";

  const noticeBanner = notice ? (
    <p
      role="status"
      className={`rounded-md border px-3 py-2 text-sm ${
        ["updated", "completed"].includes(notice)
          ? "border-state-success/50 bg-state-success/10 text-state-success"
          : "border-state-warning/50 bg-state-warning/10 text-text-primary"
      }`}
      data-testid={`my-onboarding-notice-${notice}`}
    >
      {t(`notice.${notice}`)}
    </p>
  ) : null;

  return (
    <section
      id="lifecycle"
      className="card-border flex flex-col gap-3 p-5 scroll-mt-20"
      data-testid="my-onboarding"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("worker.title")}
        </h2>
        <p className="text-xs text-text-muted">{t("worker.intro")}</p>
      </div>
      {noticeBanner}

      {result.status === "none" ? (
        <p className="text-sm text-text-muted">{t("worker.empty")}</p>
      ) : (
        result.runs.map((run) => {
          const progress = deriveRunProgress(run.items);
          return (
            <div
              key={run.id}
              className="flex flex-col gap-2 rounded-md border border-ink-600 p-3"
              data-testid="my-onboarding-run"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-text-primary">
                  {run.templateName ?? t("runs.onboardingTitle")}
                </p>
                <p className="text-xs text-text-secondary">
                  {t("runs.progress", {
                    done: progress.done,
                    total: progress.total,
                  })}
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {run.items.map((item) => {
                  const mine =
                    (WORKER_CONFIRMABLE_KINDS as readonly string[]).includes(
                      item.kind,
                    ) ||
                    (item.responsibleProfileId !== null &&
                      item.responsibleProfileId === myId);
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-ink-700 px-2 py-1.5"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span
                          className={`truncate text-sm ${
                            item.status === "done"
                              ? "text-text-muted line-through"
                              : "text-text-primary"
                          }`}
                        >
                          {item.title}
                        </span>
                        {item.description ? (
                          <span className="text-[11px] text-text-muted">
                            {item.description}
                          </span>
                        ) : null}
                      </div>
                      {item.status !== "done" ? (
                        mine ? (
                          <form action={setOnboardingItemStatusAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="back" value="start" />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="status" value="done" />
                            <Button type="submit" size="sm" variant="outline">
                              {t("worker.done")}
                            </Button>
                          </form>
                        ) : (
                          <span className="text-[11px] text-text-muted">
                            {t("worker.managerHint")}
                          </span>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
