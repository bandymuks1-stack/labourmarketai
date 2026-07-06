import { getTranslations } from "next-intl/server";

import {
  listMyPendingWorkerInvitations,
  type PendingWorkerInvitation,
} from "@/lib/worker/invitations";
import { WorkerInvitations } from "./worker-invitations";

/**
 * Server entry-point for the worker invitations surface. Fetches the caller's
 * pending company/agency invitations (RLS-scoped to their email) and renders
 * the acceptance UI. Renders nothing when there are none — so it is safe to
 * mount unconditionally on the dashboard (no empty placeholder).
 *
 * `preloaded` lets the dashboard fetch the list ONCE (it also needs the count
 * for the state-driven top slot) and pass it down — no duplicate read.
 */
export async function WorkerInvitationsCard({
  preloaded,
}: {
  preloaded?: readonly PendingWorkerInvitation[];
} = {}) {
  const invitations = preloaded ?? (await listMyPendingWorkerInvitations());
  if (invitations.length === 0) return null;

  const t = await getTranslations("workerInvitations");
  return (
    <WorkerInvitations
      invitations={invitations}
      labels={{
        title: t("title"),
        body: t("body"),
        companyLabel: t("companyLabel"),
        agencyLabel: t("agencyLabel"),
        accept: t("accept"),
        accepting: t("accepting"),
        noteLabel: t("noteLabel"),
        outcomeLinked: t("outcomeLinked"),
        outcomeAlreadyLinked: t("outcomeAlreadyLinked"),
        outcomeNoInvitation: t("outcomeNoInvitation"),
        outcomeNoWorker: t("outcomeNoWorker"),
        outcomeError: t("outcomeError"),
        outcomeNeedsMigration: t("outcomeNeedsMigration"),
      }}
    />
  );
}
