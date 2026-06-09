# Work Instructions — Project/Object/Site-Scoped Permissions (Design + Audit, v1)

**Slice:** `instructions-project-scope-audit-v1` (PR F3)
**Status:** **AUDIT / DESIGN ONLY** — project/site-scoped enforcement is **not yet
implemented** because the assignment data + write flow are missing (see §3). The
current send gate stays **roster-scoped** and is now **labelled honestly** in the
UI. No migration, no RLS change.

> Goal context: before adding a real translation provider, tighten Work
> Instruction permissions from roster-level to **project/object/site-level** —
> but only where the data model supports it **safely**, with **no fake precision**
> and **no invented assignment state**.

---

## 1. Audit — what the data model already provides

The project/object/site/work-assignment layer **exists and is applied to prod**
(`gorgitwvdzxbnaxhrsrw`, migrations `20260601090000` + `20260601091000` +
`20260530120100`):

| Object | Purpose | RLS / helper |
|--------|---------|--------------|
| `public.projects` | a project (org-owned: `organization_id`; legacy `company_id` kept) | RLS keyed on `company_id` (org-based RLS deferred — see §3) |
| `public.project_worker_assignments` | a worker placed on a project (`project_id`, `worker_id`, `status active/ended`) | `SELECT`: `owns_worker(worker_id) OR can_manage_project(project_id)`; `ALL`: `can_manage_project(project_id)` |
| `public.project_members` | manager/foreman membership of a project | `can_manage_project` |
| `public.can_manage_project(uuid)` | **the project-ownership gate** | `owns_company(company_id) OR manages_organization(organization_id) OR is_admin()` |
| `public.journal_entry_work_items` | journal entries ↔ work items/objects | — |

So the **safest existing relationship to scope a manager's instruction to a
worker in a specific project** is:

```
worker W is in project P  ⇔  EXISTS project_worker_assignments(project_id=P, worker_id=W, status='active')
manager may manage P      ⇔  can_manage_project(P)   -- owns_company OR manages_organization OR admin
```

This is **strictly tighter** than the current roster gate (whole-company
`company_workers`/`agency_workers`).

**Prod verification (2026-06-09):** `projects = 1 row`, **`project_worker_assignments = 0 rows`**,
`can_manage_project()` present, `projects.organization_id` present, PWA RLS =
`SELECT (owns_worker OR can_manage_project)` / `ALL (can_manage_project)` — correct,
not weakened.

---

## 2. Why this is NOT implemented as a hard gate yet

`project_worker_assignments` is **empty (0 rows)** and there is **no write flow**
that assigns a worker to a project (`lib/company/project-context.ts` is read-only:
*"NOTHING is auto-filled … 0 until the owner creates one in a future
write-enabled slice"*). Therefore a project-scoped instruction gate would:

- **block every send** (no assignment row would ever match), or
- require **fabricating an assignment** to make it pass — which is exactly the
  *fake project assignment state / fake precision* the goal forbids.

So enforcing project scope now would be **dishonest precision**, not real safety.

---

## 3. The MISSING primitive (must land before §4 enforcement)

**A worker → project assignment write flow** that populates
`public.project_worker_assignments` with real, RLS-checked rows:

1. **Project creation** for an org the manager owns (1 project exists, but the
   create flow is not app-wired for workers/managers generally).
2. **Assign-worker-to-project** action — manager (`can_manage_project`) adds a
   worker from their active roster to a project (`status='active'`). This is the
   single missing primitive that makes project scope real.
3. (Supporting) finish the **org-based `projects` RLS** reroute noted in
   `20260530120100` (projects RLS is still keyed on the legacy `company_id` while
   the table was dormant).

Until (2) exists, there is no real project membership to gate against.

---

## 4. Forward design — the project-scoped gate to add once assignments exist

When `project_worker_assignments` carries real rows, tighten instructions with an
**additive, optional** project scope (no destructive change, no RLS loosening):

```sql
-- additive: which project an instruction is about (nullable; null = roster-level)
alter table public.conversation_messages
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- extend the SECURITY DEFINER sender with an OPTIONAL project scope. When
-- p_project_id is provided, gate STRICTLY on an ACTIVE assignment + can_manage_project;
-- when null, fall back to the existing roster gate (labelled "roster-level").
create or replace function public.send_work_instruction(
  p_worker_profile_id text, p_body text,
  p_original_language text default null, p_project_id text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare ... pid uuid := nullif(p_project_id,'')::uuid; begin
  ...
  if pid is not null then
    -- PROJECT/SITE SCOPE: worker actively assigned to THIS project AND caller manages it
    if not (exists (select 1 from public.project_worker_assignments pwa
                     where pwa.project_id = pid and pwa.worker_id = w_id
                       and pwa.status = 'active' and public.can_manage_project(pid))
            or public.is_admin()) then
      raise exception 'Not authorized to instruct this worker on this project' using errcode='42501';
    end if;
  else
    -- ROSTER SCOPE (current fallback) — active company_workers/agency_workers under owns_*
    ... (unchanged roster gate) ...
  end if;
  ... insert conversation_message with project_id = pid ...
end; $$;
```

Properties (must be re-verified on apply): SECURITY DEFINER + `search_path=public`;
EXECUTE `authenticated` only (no PUBLIC/anon); `conversation_messages` RLS
unchanged (participant-scoped → **worker cannot see cross-project/cross-company
instructions**); original `body` never overwritten; clarification flow unchanged;
attention surfacing unchanged.

### Tests/guards to ship WITH §4 (proving the gate)
- manager can instruct only a worker with an **ACTIVE** assignment to a project
  they `can_manage_project` (positive);
- **unrelated worker** (no active assignment) → `42501`;
- **unrelated manager** (cannot manage the project) → `42501`;
- **cross-project/cross-company read** blocked by the unchanged participant RLS;
- **anon/PUBLIC** still cannot execute the RPC nor read `conversation_messages`.

---

## 5. What PR F3 ships now (honest, no migration)

1. **Honest scope labelling** in the manager composer: the current scope is
   **roster-level (whole team)**, and project/site precision activates once
   workers are assigned to projects. No fake project precision is claimed.
2. **This design/audit doc** — names the missing primitive (§3) and the exact
   forward gate (§4) so the follow-up is a small, reviewed change.
3. A guard (`work-instructions-scope-honesty`) pinning: the send gate is
   roster-scoped + relationship-checked, anon/PUBLIC cannot execute, RLS is not
   weakened, and the composer copy honestly labels the roster scope.

Unchanged: original-preserving instruction behaviour, the clarification flow, and
the attention surfacing in "Mano pranešimai / Kas dabar svarbu".

---

## 6. Next slice (after the missing primitive lands)
`PR F4 — assign-worker-to-project write flow` → then `PR F5 — project-scoped
instruction gate (§4)` with the guards in §4 → then the real translation provider
behind a safe service layer (the `translated_text` / `target_language` /
`translation_status` columns are already in place).
