import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  listWorkerInstructions,
  listManagedWorkers,
} from "@/lib/instructions/instructions";
import { listManagedProjects } from "@/lib/projects/projects";
import { loadOwnProjectAsks } from "@/lib/projects/worker-project-access";
import { loadOwnProjectLedgers } from "@/lib/player-card/requirement-ledger-server";
import type { RequirementLedger } from "@/lib/player-card/requirement-ledger";
import {
  InstructionProjectAsks,
  type InstructionLedgerLabels,
  type InstructionProjectAsksLabels,
} from "@/components/app/instruction-project-asks";
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

/** How many instruction projects get a full requirement ledger on one page
 *  load (bounded — the shared person reads are request-cached, so each extra
 *  project costs its own checklist read only). */
const LEDGER_PROJECT_LIMIT = 5;

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
      <p
        className="mt-1 text-meta leading-relaxed text-text-muted"
        data-testid="instructions-foundation-note"
      >
        {t("foundationNote")}
      </p>
    </header>
  );

  if (isManager) {
    const [workers, projects] = await Promise.all([
      listManagedWorkers(),
      listManagedProjects(),
    ]);
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
      selectWorkerError: t("manager.selectWorkerError"),
      noWorkers: t("manager.noWorkers"),
      scopeNote: t("manager.scopeNote"),
      projectScopeLabel: t("manager.projectScopeLabel"),
      teamLevelOption: t("manager.teamLevelOption"),
    };
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-6">
        {Header}
        <ManagerInstructionComposer
          workers={workers}
          projects={projects}
          defaultLanguage={locale}
          labels={labels}
        />
      </div>
    );
  }

  // Worker view.
  const read = await listWorkerInstructions();
  // §11/§12 — what each instruction's project still needs from THIS person,
  // the SAME domain read the chat's "mano projektai" renders (visual parity).
  const asks =
    read.kind === "ok"
      ? await loadOwnProjectAsks(read.instructions.map((i) => i.projectId).filter((id): id is string => Boolean(id))).catch(() => new Map())
      : new Map();
  const asksLabels: InstructionProjectAsksLabels = {
    title: t("card.asksTitle"),
    ownReady: t("card.ownReady"),
    ownExpiring: t("card.ownExpiring"),
    ownNone: t("card.ownNone"),
    blocked: t("card.blocked"),
    record: t("card.record"),
  };

  // P3 — the contextual requirement ledger per instruction project (frozen
  // design contract §5): the SAME person, the project as the context. One
  // ledger per distinct project (bounded), rendered where the asks already
  // render; a read that does not answer leaves the asks alone.
  let ledgers = new Map<string, RequirementLedger>();
  if (read.kind === "ok") {
    const threadByProject = new Map<string, string>();
    for (const ins of read.instructions) {
      if (ins.projectId && !threadByProject.has(ins.projectId)) threadByProject.set(ins.projectId, ins.conversationId);
    }
    ledgers = await loadOwnProjectLedgers(
      [...threadByProject.entries()].slice(0, LEDGER_PROJECT_LIMIT).map(([projectId, conversationId]) => ({ projectId, conversationId })),
    ).catch(() => new Map<string, RequirementLedger>());
  }
  const tDocs = await getTranslations("documents");
  const tSkills = await getTranslations("skills");
  const tLm = await getTranslations("labourMarket");
  const countryName = (c: string | null): string => (c && tLm.has(`countryNames.${c}`) ? tLm(`countryNames.${c}`) : (c ?? ""));
  const ledgerLabels: InstructionLedgerLabels = {
    ratio: (have, total) => t("card.ledger.ratio", { have, total }),
    state: {
      valid: t("card.ledger.state.valid"),
      expiring: t("card.ledger.state.expiring"),
      missing: t("card.ledger.state.missing"),
      unknown: t("card.ledger.state.unknown"),
    },
    why: (row, country) => t(`card.ledger.why.${row.reason}`, { country: countryName(country) }),
    stateFrom: (row) => {
      const p = row.provenance;
      switch (p.source) {
        case "own_document":
          return p.validUntil ? t("card.ledger.from.ownDocumentUntil", { date: p.validUntil }) : t("card.ledger.from.ownDocument");
        case "own_skill":
          return t(p.verified ? "card.ledger.from.ownSkillConfirmed" : "card.ledger.from.ownSkill");
        case "own_language":
          return t("card.ledger.from.ownLanguage", { level: p.level });
        case "own_profile":
          return t("card.ledger.from.ownProfile");
        case "manager_checklist":
          return t("card.ledger.from.manager", { status: t(`card.ledger.managerStatus.${p.status}`) });
        case "not_readable":
          return t("card.ledger.from.notReadable");
        case "none":
          return t("card.ledger.from.none");
      }
    },
    level: { recommended: t("card.ledger.level.recommended"), conditional: t("card.ledger.level.conditional") },
    availability: t("card.ledger.availability"),
    documentType: (slug) => (tDocs.has(`types.${slug}`) ? tDocs(`types.${slug}`) : slug.replace(/_/g, " ")),
    skill: (slug) => (tSkills.has(slug) ? tSkills(slug) : slug.replace(/[-_]/g, " ")),
    resolution: (r) => {
      switch (r.kind) {
        case "add_document":
          return t("card.ledger.resolution.addDocument");
        case "issuing_authority":
          return t("card.ledger.resolution.issuingAuthority", { title: r.title });
        case "training_program":
          return t("card.ledger.resolution.trainingProgram", { title: r.title });
        case "service_offering":
          return r.rateText
            ? t("card.ledger.resolution.serviceOfferingRate", { title: r.title, rate: r.rateText })
            : t("card.ledger.resolution.serviceOffering", { title: r.title });
        case "add_evidence":
          return t("card.ledger.resolution.addEvidence");
        case "set_availability":
          return t("card.ledger.resolution.setAvailability");
        case "ask":
          return t("card.ledger.resolution.ask");
      }
    },
    resolutionWhy: (r) => {
      if (r.kind === "training_program") return t(`card.ledger.resolutionWhy.${r.why === "assigned_to_you" ? "assignedToYou" : "nameMatches"}`);
      if (r.kind === "service_offering") return t("card.ledger.resolutionWhy.nameMatches");
      return null;
    },
    rejected: (count) => t("card.ledger.rejected", { count }),
  };
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
    clarifyError: t("card.clarifyError"),
    clarifyViewThread: t("card.clarifyViewThread"),
    safetyNote: t("card.safetyNote"),
    helpLine: t("card.helpLine"),
  };

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
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
            <li key={ins.id} className="flex flex-col gap-2">
              <WorkerInstructionCard instruction={ins} labels={cardLabels} />
              {ins.projectId ? (
                <InstructionProjectAsks
                  asks={asks.get(ins.projectId)?.asks ?? []}
                  labels={asksLabels}
                  ledger={ledgers.get(ins.projectId) ?? null}
                  ledgerLabels={ledgerLabels}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
