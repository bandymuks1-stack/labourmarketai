"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { WORKSPACE_ACCENT_DOT } from "@/components/app/conversation/chat/workspace-chip";
import { workspaceAccentIndex } from "@/lib/company/organization-switch";
import {
  acknowledgeAssetAction,
  createAssetAction,
  issueAssetAction,
  returnAssetAction,
  transferAssetAction,
} from "@/lib/assets/assets-actions";
import {
  ASSET_CONDITIONS,
  ASSET_TYPES,
  type AssetRow,
  type AssetsOverview,
  type AssetType,
  type AssetCondition,
  type MyAssignedAssets,
  type ProjectOption,
  type WorkerOption,
} from "@/lib/assets/assets-model";

function useReport() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return {
    msg,
    report: (m: string) => {
      setMsg(m);
      router.refresh();
    },
  };
}

/** One issue/transfer target picker: a project OR a worker. */
function TargetPicker({
  projects,
  workers,
  projectId,
  workerId,
  onProject,
  onWorker,
  t,
}: {
  projects: ProjectOption[];
  workers: WorkerOption[];
  projectId: string;
  workerId: string;
  onProject: (v: string) => void;
  onWorker: (v: string) => void;
  t: (k: string) => string;
}) {
  return (
    <>
      <select aria-label={t("projectLabel")} value={projectId} onChange={(e) => onProject(e.target.value)}
        className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="asset-project">
        <option value="">{t("noProject")}</option>
        {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
      </select>
      <select aria-label={t("workerLabel")} value={workerId} onChange={(e) => onWorker(e.target.value)}
        className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="asset-worker">
        <option value="">{t("noWorker")}</option>
        {workers.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
      </select>
    </>
  );
}

function AssetManagerRow({
  asset,
  projects,
  workers,
  onDone,
  orgLabel,
}: {
  /** Workspace context (rebuild W6): the owning org's name + accent, shown
   *  ONLY when the caller manages more than one org (no chip when
   *  unambiguous) — same rule as the journal stream and the project map. */
  orgLabel?: { name: string; dot: string } | null;
  asset: AssetRow;
  projects: ProjectOption[];
  workers: WorkerOption[];
  onDone: (m: string) => void;
}) {
  const t = useTranslations("assets");
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "issue" | "return" | "transfer">("none");
  const [projectId, setProjectId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [condition, setCondition] = useState<AssetCondition>("good");

  const run = (fn: () => Promise<{ ok: boolean; code?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      onDone(res.ok ? t("outcome.saved") : t(`outcome.${res.code}`));
      setMode("none");
    });

  const a = asset.activeAssignment;
  return (
    <li className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3" data-testid="asset-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text-primary">{asset.name}</span>
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t(`types.${asset.assetType}`)}</span>
        <span className="font-mono text-meta uppercase tracking-label text-text-secondary">{t(`conditions.${asset.condition}`)}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${asset.availability === "available" ? "border-state-success/40 text-state-success" : "border-ink-500 text-text-muted"}`}>
          {t(`availability.${asset.availability}`)}
        </span>
        {orgLabel ? (
          <span className="inline-flex items-center gap-1.5 text-meta text-text-muted" data-testid={`asset-org-context-${asset.id}`}>
            <span className={`size-2 flex-none rounded-full ${orgLabel.dot}`} aria-hidden />
            {orgLabel.name}
          </span>
        ) : null}
      </div>

      {a ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>{t("assignedTo")}: {a.workerName ?? a.projectTitle ?? t("noWorker")}</span>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t(`assignmentStatus.${a.status}`)}</span>
          <button type="button" disabled={pending} onClick={() => setMode(mode === "return" ? "none" : "return")}
            className="rounded-md border border-ink-500 px-2 py-1 text-meta hover:border-brand-blue" data-testid="asset-return-toggle">{t("return")}</button>
          <button type="button" disabled={pending} onClick={() => setMode(mode === "transfer" ? "none" : "transfer")}
            className="rounded-md border border-ink-500 px-2 py-1 text-meta hover:border-brand-blue" data-testid="asset-transfer-toggle">{t("transfer")}</button>
        </div>
      ) : (
        <button type="button" disabled={pending} onClick={() => setMode(mode === "issue" ? "none" : "issue")}
          className="w-fit rounded-md border border-brand-blue/50 px-2 py-1 text-meta text-brand-blue hover:border-brand-blue" data-testid="asset-issue-toggle">{t("issue")}</button>
      )}

      {mode === "issue" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-2">
          <TargetPicker projects={projects} workers={workers} projectId={projectId} workerId={workerId} onProject={setProjectId} onWorker={setWorkerId} t={t} />
          <select aria-label={t("conditionLabel")} value={condition} onChange={(e) => setCondition(e.target.value as AssetCondition)}
            className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="asset-issue-condition">
            {ASSET_CONDITIONS.map((c) => (<option key={c} value={c}>{t(`conditions.${c}`)}</option>))}
          </select>
          <Button type="button" size="sm" disabled={pending || (!projectId && !workerId)}
            onClick={() => run(() => issueAssetAction({ assetId: asset.id, projectId: projectId || undefined, workerId: workerId || undefined, conditionAtIssue: condition }))}
            data-testid="asset-issue-submit">{t("issue")}</Button>
        </div>
      )}

      {mode === "return" && a && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-2">
          <span className="text-meta text-text-secondary">{t("conditionAtReturn")}</span>
          <select aria-label={t("conditionLabel")} value={condition} onChange={(e) => setCondition(e.target.value as AssetCondition)}
            className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="asset-return-condition">
            {ASSET_CONDITIONS.map((c) => (<option key={c} value={c}>{t(`conditions.${c}`)}</option>))}
          </select>
          <Button type="button" size="sm" disabled={pending}
            onClick={() => run(() => returnAssetAction({ assignmentId: a.id, conditionAtReturn: condition }))}
            data-testid="asset-return-submit">{t("return")}</Button>
        </div>
      )}

      {mode === "transfer" && a && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-2">
          <TargetPicker projects={projects} workers={workers} projectId={projectId} workerId={workerId} onProject={setProjectId} onWorker={setWorkerId} t={t} />
          <Button type="button" size="sm" disabled={pending || (!projectId && !workerId)}
            onClick={() => run(() => transferAssetAction({ assignmentId: a.id, newProjectId: projectId || undefined, newWorkerId: workerId || undefined }))}
            data-testid="asset-transfer-submit">{t("transfer")}</Button>
        </div>
      )}
    </li>
  );
}

export function AssetsRegistry({ data }: { data: AssetsOverview }) {
  const t = useTranslations("assets");
  const { msg, report } = useReport();
  const [pending, startTransition] = useTransition();
  const [orgId, setOrgId] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("tool");
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");

  const effectiveOrg = orgId || (data.applied && data.orgs[0]?.id) || "";

  function create() {
    if (!effectiveOrg || !name.trim()) {
      report(t("outcome.invalid"));
      return;
    }
    startTransition(async () => {
      const res = await createAssetAction({ organizationId: effectiveOrg, assetType, name: name.trim(), serialOrReg: serial.trim() || undefined });
      if (res.ok) { setName(""); setSerial(""); report(t("outcome.saved")); }
      else report(t(`outcome.${res.code}`));
    });
  }

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="assets-registry">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("registryTitle")}</h2>
        <p className="text-meta leading-relaxed text-text-muted">{t("honestNote")}</p>
      </header>

      {!data.applied ? (
        <p className="text-sm text-text-muted" data-testid="assets-preapply">{t("preApply")}</p>
      ) : data.orgs.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="assets-no-org">{t("noOrg")}</p>
      ) : (
        <>
          {data.assets.length === 0 ? (
            <p className="text-sm text-text-secondary" data-testid="assets-empty">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="assets-list">
              {data.assets.map((asset) => {
                const org =
                  data.orgs.length > 1
                    ? data.orgs.find((o) => o.id === asset.organizationId)
                    : undefined;
                return (
                  <AssetManagerRow
                    key={asset.id}
                    asset={asset}
                    projects={data.projects}
                    workers={data.workers}
                    onDone={report}
                    orgLabel={
                      org
                        ? {
                            name: org.name,
                            dot: WORKSPACE_ACCENT_DOT[
                              workspaceAccentIndex(org.id) % WORKSPACE_ACCENT_DOT.length
                            ],
                          }
                        : null
                    }
                  />
                );
              })}
            </ul>
          )}

          <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("addHeading")}</span>
            <div className="flex flex-wrap items-center gap-2">
              {data.orgs.length > 1 && (
                <select aria-label={t("orgLabel")} value={effectiveOrg} onChange={(e) => setOrgId(e.target.value)}
                  className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="asset-org">
                  {data.orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
                </select>
              )}
              <select aria-label={t("typeLabel")} value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="asset-type">
                {ASSET_TYPES.map((ty) => (<option key={ty} value={ty}>{t(`types.${ty}`)}</option>))}
              </select>
              <input aria-label={t("nameLabel")} value={name} maxLength={160} onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")} className="min-w-40 flex-1 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="asset-name" />
              <input aria-label={t("serialLabel")} value={serial} maxLength={120} onChange={(e) => setSerial(e.target.value)}
                placeholder={t("serialPlaceholder")} className="w-40 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="asset-serial" />
              <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={create} data-testid="asset-create">{pending ? t("saving") : t("add")}</Button>
            </div>
          </div>
        </>
      )}
      {msg && <p className="text-xs text-text-secondary" data-testid="assets-msg">{msg}</p>}
    </section>
  );
}

export function MyAssignedAssetsPanel({ data }: { data: MyAssignedAssets }) {
  const t = useTranslations("assets");
  const { msg, report } = useReport();
  const [pending, startTransition] = useTransition();

  // Rebuild W5 (audit A11): an APPLIED module with zero rows renders an
  // honest empty state, never nothing — an invisible panel taught users the
  // feature does not exist. Unapplied stays silent (the registry panel
  // already explains pre-apply state once per page).
  if (!data.applied) return null;
  if (data.assignments.length === 0) {
    return (
      <p className="text-sm text-text-secondary" data-testid="my-assets-empty">
        {t("myEmpty")}
      </p>
    );
  }

  function ack(id: string) {
    startTransition(async () => {
      const res = await acknowledgeAssetAction({ assignmentId: id });
      report(res.ok ? t("outcome.acknowledged") : t(`outcome.${res.code}`));
    });
  }

  return (
    <section className="card-border flex flex-col gap-3 p-5" data-testid="my-assets-panel">
      <h2 className="font-display text-lg font-semibold text-text-primary">{t("myAssetsTitle")}</h2>
      <ul className="flex flex-col gap-2" data-testid="my-assets-list">
        {data.assignments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 p-3">
            <span className="text-sm text-text-primary">{a.assetName}</span>
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t(`assignmentStatus.${a.status}`)}</span>
            {a.status === "issued" && (
              <Button type="button" size="sm" disabled={pending} onClick={() => ack(a.id)} data-testid="asset-acknowledge">{t("acknowledge")}</Button>
            )}
          </li>
        ))}
      </ul>
      {msg && <p className="text-xs text-text-secondary" data-testid="my-assets-msg">{msg}</p>}
    </section>
  );
}
