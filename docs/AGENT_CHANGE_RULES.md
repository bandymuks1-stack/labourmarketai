# Agent change rules — no second implementation of anything

> **SUPPORTING — NOT THE CANONICAL ARCHITECTURE.** The architecture is
> [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](OWNER_TARGET_ARCHITECTURE_V1.md).
> This file is the binding pre-build check for every agent and every PR. It
> makes `AGENTS.md` → "Before you modify or create a material product
> capability", step 10 ("search for an existing implementation before creating
> a new one"), concrete and reviewable. It is **not** a second coordination
> system: it uses the existing capability register, the existing lane register,
> the existing reviewers and the existing PR flow.

Owner order 2026-11-23 (P0 architecture audit, issue #3679, item 8): *"Skirtingiems
agentams draudžiama nepriklausomai kurti tos pačios funkcijos, nežinant apie
kitų darbą."*

## 1. The check, before any new function, page, route, component, navigation, store, API/RPC, SQL function, table, agent tool or AI assistant

| # | Step | Where | What the PR body must show |
|---|---|---|---|
| 1 | Find the capability in the function register | `apps/web/lib/product-gate/capability-register.ts` (executable) + `docs/CAPABILITY_INVENTORY.md` §6 (reasoning); `node .github/scripts/product-truth.mjs` | The capability id(s) touched, or "none — new capability" |
| 2 | Find similar existing implementations | `git grep` for the user action, route segment, component name, RPC/SQL name and i18n keys; `docs/audits/DUPLICATION_AUDIT.md`; `docs/architecture/TECHNICAL_ARCHITECTURE_MAP.md` | The files found and why each one does or does not fit |
| 3 | Check open PRs and other lanes' work | Open PRs touching the same paths (`gh api repos/<repo>/pulls?state=open` or the PR list) and the active coordination issue (currently #3679; lane register #3265) | The overlapping PRs, or "none found" with the query used |
| 4 | Check approved decisions | `docs/OWNER_TARGET_ARCHITECTURE_V1.md`, `docs/DECISIONS/*.md`, `docs/PLATFORM_DOCTRINE.md`; for navigation `docs/design/CAROUSEL_NAVIGATION_SPEC.md` | The decision(s) that govern the change |
| 5 | Decide extend vs new | Classification from `AGENTS.md`: `CONNECT` · `FIX` · `EXTEND` · `REPLACE` · `NEW` | The class, and for `EXTEND` the existing module extended |
| 6 | `NEW` only with proof | — | Why each existing implementation from step 2 cannot be extended without degrading UX, architecture or security (decision 0016), and the new capability id added to the register **in the same PR** |

A PR that adds a structure of the kinds listed in the heading and has no
completed "Reuse check" section (`.github/pull_request_template.md`) is not
reviewable. R, R2 and R3 answer it with **Blocks merge: yes** until the section
is filled with evidence.

## 2. One owner, one module, one change path

- **One owner per capability during a work window.** The coordinator assigns
  each capability or document to exactly one lane on the active coordination
  issue. Another lane that needs a change there sends it to that owner
  (`send_message`) instead of opening a parallel PR.
- **One module.** A capability has one canonical module; the register's
  `anchors` name it. New surfaces call that module; they do not copy it.
- **One change path.** Code reaches `main` only through a reviewed PR
  (GREEN: independent review on the current head + green required checks;
  RED: draft + `needs-human-gate` + owner approval). No direct pushes that
  bypass review, no second branch carrying the same change.
- **Collision rule.** If step 3 finds another open PR on the same capability,
  stop and ask the coordinator which one continues. The other is closed or
  rebased onto it — never merged in parallel.

## 3. Structures that may exist only once

A second instance of any of these is a defect unless an owner decision names
the reason:

| Structure | The one place | Source |
|---|---|---|
| Architecture | `docs/OWNER_TARGET_ARCHITECTURE_V1.md` | CLAUDE.md, ARCH precedence |
| Function register | `lib/product-gate/capability-register.ts` + `CAPABILITY_INVENTORY.md` §6 | AGENTS.md |
| Main navigation | the three-level carousel system in `docs/design/CAROUSEL_NAVIGATION_SPEC.md` | owner design principle, #3679 item 4 |
| Long-term memory / AI context | canonical tables under RLS | decision 0024 |
| A person's professional history | `lib/journal/professional-experience.ts` | decision 0025 |
| Living CV inference | the Living CV readers | decision 0023 |
| Production acceptance evidence | `docs/qa/PRODUCTION_ACCEPTANCE_MATRIX.md` | #3679 item 10F |
| Duplicate register | `docs/audits/DUPLICATION_AUDIT.md` | #3679 item 10C |
| Internal authority term | `lib/authority/internal-authority-validity.mjs` | owner P0 2026-10-22 |

## 4. Removing or merging something

Before a PR deletes, merges or changes a shared interface, it proves in its body:

1. **No function is lost** — every caller (import graph, routes, RPC callers,
   MCP tools) is listed and moved or kept.
2. **No data is lost** — no table, column or row loses its reader or writer;
   destructive SQL follows the migration rules in `CLAUDE.md` and is RED.
3. **No access is lost** — every role that reached the function still reaches
   it, and deep links still resolve (redirect if the path moves).
4. **A guard protects it** — a regression test that fails if the removed
   duplicate comes back or the kept path breaks.

A capability that is withdrawn gets a `RETIRED` record in the register; ids are
permanent.

## 5. Reviewer duties

R, R2 and R3 check, on every PR that adds a structure from §1:

- the Reuse check is filled with real paths and queries, not "n/a";
- the class (`CONNECT`/`FIX`/`EXTEND`/`REPLACE`/`NEW`) matches the diff;
- for `NEW`, the register entry is in the diff and the proof in step 6 holds;
- no structure from §3 is duplicated.

A missing or false Reuse check is **Blocks merge: yes**.
