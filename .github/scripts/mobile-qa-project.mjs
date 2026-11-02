#!/usr/bin/env node
// SYNTHETIC PROJECT for the mobile review identity, so the signed-in journeys
// can open a project's detail on a device (worker.projects.list → project).
//
// Idempotent; runs right after `mobile-qa-credential.mjs issue`. Everything
// goes through the product's own capability door (/api/mcp), as the review
// identity itself, inside the identity's OWN synthetic company
// "QA-SYNTHETIC Alfa" — the same legitimate chain a real owner and worker
// walk, with no table touched directly:
//   1. switch the workspace to Alfa (the identity owns it);
//   2. if the identity is not yet on Alfa's roster: the owner invites the
//      worker (the identity's own address; the platform sends no e-mail),
//      then — back in the personal workspace — the worker accepts;
//   3. the marked project exists in Alfa, or project.create makes it;
//   4. the identity is actively assigned to it (assignment.create).
// The workspace the identity was in before is restored at the end, so the
// journeys start where they always did.
//
// Env: MOBILE_QA_EMAIL, MOBILE_QA_PASSWORD (one-run password), ANON_KEY
// (public), ORIGIN (default https://labourmarket.ai). Prints step outcomes
// only — never the address, a token or an id (the repository is public).
const COMPANY = "QA-SYNTHETIC Alfa (testinis subjektas)";
const TITLE = "QA-SYNTHETIC mobile parity project";
const { MOBILE_QA_EMAIL: email, MOBILE_QA_PASSWORD: password, ANON_KEY: anon } = process.env;
const origin = (process.env.ORIGIN || "https://labourmarket.ai").replace(/\/$/, "");
if (!email || !password || !anon) {
  console.error("::error::review identity or anon key not configured — no synthetic project prepared");
  process.exit(1);
}
const ref = JSON.parse(Buffer.from(anon.split(".")[1] || "", "base64url").toString() || "{}").ref;
const auth = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!auth.ok) {
  console.error(`::error::synthetic project: sign-in refused (HTTP ${auth.status})`);
  process.exit(1);
}
const { access_token: token } = await auth.json();

let rpcId = 0;
/** One capability call; returns the result payload (`data` unwrapped). */
async function call(capability, args = {}) {
  const name = capability.replaceAll(".", "_");
  const r = await fetch(`${origin}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await r.text();
  const body = JSON.parse(text.startsWith("event:") ? text.split("data: ").pop() : text);
  const res = body.result ?? {};
  const out = res.structuredContent ?? JSON.parse(res.content?.[0]?.text ?? "{}");
  const payload = out?.data ?? out;
  if (res.isError || out?.ok === false) {
    const code = out?.code ?? out?.error?.code ?? "refused";
    throw new Error(`${capability}: ${code}`);
  }
  return payload ?? {};
}
/**
 * draft/prepare → confirm, the person's two steps. The shapes differ per
 * door: a capability pair takes its fields flat on both legs ("flat"); a
 * chat-action pair takes them flat on prepare and as `{input}` on confirm
 * ("action"), except one whose input is a union, `{input}` on both legs
 * ("wrapped").
 */
async function twoStep(prepare, confirm, input, shape) {
  const d = await call(prepare, shape === "wrapped" ? { input } : input);
  const confirmationToken = d.confirmationToken;
  if (!confirmationToken) throw new Error(`${prepare}: no confirmation token`);
  return call(confirm, shape === "flat" ? { ...input, confirmationToken } : { input, confirmationToken });
}
const assignedProject = (wp) =>
  (wp.projects ?? []).find((p) => p.title === TITLE && (p.assignmentStatus ?? "active") === "active");

const steps = [];
let restoreTo = null;
try {
  const already = await call("worker.projects.list");
  if (assignedProject(already)) {
    console.log("synthetic project: already assigned (nothing changed)");
    process.exit(0);
  }
  const me = await call("profile.get");
  const profileId = me.profile?.id;
  if (!profileId) throw new Error("profile.get: no profile");

  const ctx = await call("context.list");
  restoreTo = ctx.activeWorkspaceId ?? "personal";
  const alfa = (ctx.workspaces ?? []).find((w) => w.kind === "organization" && String(w.label).startsWith("QA-SYNTHETIC Alfa"));
  if (!alfa) throw new Error("context.list: the synthetic company is not among the identity's workspaces");
  const switched = await call("context.switch", { workspace: alfa.id });
  if (switched.status === "workspace_choice_required") throw new Error("context.switch: not switched");

  const roster = await call("roster.list");
  if (!(roster.people ?? []).some((p) => p.workerProfileId === profileId)) {
    await twoStep("company.invite-worker_prepare", "company.invite-worker_confirm", { email, note: `${TITLE} — review identity` }, "action");
    steps.push("invited");
    await call("context.switch", { workspace: "personal" });
    const inv = await call("invitations.list");
    const item = (inv.items ?? []).find((i) => i.ref?.source === "company_roster" && String(i.organizationName ?? "").startsWith("QA-SYNTHETIC Alfa"));
    if (!item) throw new Error("invitations.list: the roster invitation did not arrive");
    await twoStep("worker.respond-invitation_prepare", "worker.respond-invitation_confirm", { ...item.ref, decision: "accepted" }, "wrapped");
    steps.push("accepted");
    await call("context.switch", { workspace: alfa.id });
  }

  const projects = await call("projects.list");
  let project = (projects.projects ?? []).find((p) => p.title === TITLE && p.status !== "completed");
  if (!project) {
    const created = await twoStep("project.create_draft", "project.create_confirm", { title: TITLE, city: "Kaunas" }, "flat");
    const id = created.projectId ?? created.readBack?.id;
    project = id ? { id } : null;
    if (!project) {
      const again = await call("projects.list");
      project = (again.projects ?? []).find((p) => p.title === TITLE && p.status !== "completed") ?? null;
    }
    if (!project) throw new Error("project.create_confirm: created project not found");
    steps.push("project created");
  }
  await twoStep("assignment.create_draft", "assignment.create_confirm", { projectId: project.id, workerProfileId: profileId }, "flat");
  steps.push("assigned");

  const check = await call("worker.projects.list");
  if (!assignedProject(check)) throw new Error("worker.projects.list: the assignment does not read back");
  console.log(`synthetic project: ready (${steps.join(", ")})`);
} catch (e) {
  console.error(`::error::synthetic project not prepared — ${e instanceof Error ? e.message : "failed"} (done before it: ${steps.join(", ") || "nothing"})`);
  process.exitCode = 1;
} finally {
  if (restoreTo) {
    try {
      await call("context.switch", { workspace: restoreTo === "personal" ? "personal" : restoreTo });
    } catch {
      console.error("::warning::synthetic project: the previous workspace could not be restored");
    }
  }
}
