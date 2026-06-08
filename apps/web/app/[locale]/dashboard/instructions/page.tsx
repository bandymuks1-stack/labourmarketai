import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  listWorkerInstructions,
  listManagedWorkers,
} from "@/lib/instructions/instructions";
import {
  WorkerInstructionCard,
  type InstructionCardLabels,
} from "@/components/app/worker-instruction-card";
import {
  ManagerInstructionComposer,
  type ComposerLabels,
} from "@/components/app/manager-instruction-composer";
import { type Role } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * Work instructions (slice work-instructions-v1) — the multilingual instruction
 * channel. Role-aware:
 *   - manager/foreman (company/agency): "Nurodymas darbuotojui" composer.
 *   - worker: "Mano nurodymai" — instructions addressed to them, original always
 *     preserved + honest translation state + clarification reply.
 *
 * Reuses the secure, participant-scoped communication tables (0021); no fake
 * translation / delivery / read state.
 */
export default async function InstructionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("instructions");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role = (profile?.active_role as Role) ?? "worker";
  const isManager = MANAGER_ROLES.has(role);

  const Header = (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {isManager ? t("managerTitle") : t("workerTitle")}
      </h1>
      <p className="text-sm leading-relaxed text-text-secondary">
        {isManager ? t("managerIntro") : t("workerIntro")}
      </p>
    </header>
  );

  if (isManager) {
    const workers = await listManagedWorkers();
    const labels: ComposerLabels = {
      workerLabel: t("manager.workerLabel"),
      workerPlaceholder: t("manager.workerPlaceholder"),
      bodyLabel: t("manager.bodyLabel"),
      bodyPlaceholder: t("manager.bodyPlaceholder"),
      languageNote: t("manager.languageNote"),
      send: t("manager.send"),
      sending: t("manager.sending"),
      sent: t("manager.sent"),
      notAuthorized: t("manager.notAuthorized"),
      needsMigration: t("needsMigration"),
      errorMsg: t("manager.error"),
      noWorkers: t("manager.noWorkers"),
    };
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        {Header}
        <ManagerInstructionComposer
          workers={workers}
          defaultLanguage={locale}
          labels={labels}
        />
      </div>
    );
  }

  // Worker view.
  const read = await listWorkerInstructions();
  const cardLabels: InstructionCardLabels = {
    autoTranslation: t("card.autoTranslation"),
    translationUnavailable: t("card.translationUnavailable"),
    showOriginal: t("card.showOriginal"),
    hideOriginal: t("card.hideOriginal"),
    originalLabel: t("card.originalLabel"),
    originalLanguagePrefix: t("card.originalLanguagePrefix"),
    clarify: t("card.clarify"),
    clarifyBody: t("card.clarifyBody"),
    clarifySent: t("card.clarifySent"),
    clarifySending: t("card.clarifySending"),
    safetyNote: t("card.safetyNote"),
    helpLine: t("card.helpLine"),
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {Header}
      {read.kind === "needs-migration" ? (
        <p className="card-border p-4 text-sm text-text-secondary">
          {t("needsMigration")}
        </p>
      ) : read.instructions.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary" data-testid="instructions-empty">
          {t("worker.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {read.instructions.map((ins) => (
            <li key={ins.id}>
              <WorkerInstructionCard instruction={ins} labels={cardLabels} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
