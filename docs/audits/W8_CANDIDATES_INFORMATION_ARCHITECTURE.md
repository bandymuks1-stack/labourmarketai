# W8 — `/dashboard/candidates` information architecture

**Status:** `W8_CANDIDATES_INFORMATION_ARCHITECTURE_RECONCILED`
**Date:** 2026-08-07
**Scope:** naming and framing only. No route change, no schema change, no
privacy change, no new candidate system.

---

## 1. The finding, restated precisely

The handoff recorded that `/dashboard/candidates` "currently means private
drafts of unregistered people, not *employer candidates* in the marketplace
sense", and called the naming misleading.

That is correct about the **product concept** and about the **entry points**.
It is *not* correct about the surface itself. Walking every consumer produced a
sharper statement:

> The route and its own page were already honest. The misnaming lived entirely
> in the copy that **wraps** and **points at** the surface — and one of those
> wrappers promised a capability the data model cannot deliver.

That distinction decides the correction: nothing needed re-homing or splitting,
and nothing needed a new route contract.

---

## 2. What the data actually is

| Question | Answer |
|---|---|
| Table | `public.candidate_drafts` (migration `20260609190000_candidate_provider_drafts.sql`) |
| Who creates rows | Any authenticated requester / manager / agency, by hand, in the page's own form |
| Reader | `lib/candidates/candidate-drafts.ts` → `listOwnCandidateDrafts()` |
| RLS | `owner_id = auth.uid() or is_admin()` — select **and** write |
| Grants | `select, insert, update, delete` to `authenticated`. No `SECURITY DEFINER`, no `service_role` |
| Is a row an account? | **No.** No auth user, no invite, no acceptance, no consent, no verification, no document |
| Is a row assignable to a project? | **No.** Assignment requires a real `workers.id`. `linked_profile_id` is a manual, later, operator action |
| Is there matching over these rows? | **No.** Nothing reads `candidate_drafts` for supply, ranking or scouting |

**Classification (against the four options the brief listed):** these are
**private prospect drafts**. They are not imported candidates, not registered
unregistered-people records in any shared sense, and emphatically not
marketplace candidates.

### 2.1 The finding the audit adds: the scope is PERSONAL, not organizational

`owner_id = auth.uid()` means a company manager's drafts are invisible to
**their own colleagues in the same organisation**. The surface nevertheless sits
inside a *company action room* (`companyActionRooms.candidates`, framed
"Company · Hire"), which invites the reading that it is an org-level pipeline.

The page's own body copy already said "only you (the creator) can see them".
The room copy did not. That gap is closed in §4 (B-4) — the room now states the
personal scope in the same words the page does.

This is a **real IA tension**, not merely wording: a personal notebook living
under an organisational room. Whether the drafts should *become* org-scoped is a
product decision with a migration and a privacy widening behind it, so it is
**not** taken here. It is recorded in §6 as an owner decision.

---

## 3. There are TWO "candidates" concepts, and both are real

This is the actual collision, and it is why the entry-point copy drifted.

| | **A — candidate drafts** | **B — marketplace candidates** |
|---|---|---|
| Where | `/dashboard/candidates` | `?result=candidates` → `/dashboard/company/scouting` |
| Data | `candidate_drafts`, hand-typed | Real registered supply via `runScouting` |
| Scope | One person (`owner_id`) | Organisation, RLS-scoped |
| Verified? | Nothing is verified | Real profiles, real evidence tiers |
| Matching | None | The canonical §19 comparator |
| Conversation possible? | **No** — there is no account to talk to | Yes |

The codebase had already noticed half of this: `lib/guards/w8-employer-chat-workspace.test.ts`
asserts *"the result does NOT hijack the unrelated `/dashboard/candidates`
screen"* and pins `getResult("candidates")?.advancedRoute !== "/dashboard/candidates"`.
That guard protects concept **B** from concept **A**. Nothing protected the
reverse direction — which is exactly where the misnaming accumulated.

---

## 4. Every consumer, audited

`grep` for `/dashboard/candidates` across `apps/web`, minus the route's own
files and tests:

| # | Consumer | Copy before | Verdict |
|---|---|---|---|
| — | `app/[locale]/dashboard/candidates/page.tsx` + `candidates.*` | "Candidate & provider drafts", "your private working notes — only you (the creator) can see them", full honesty note | **HONEST — unchanged** |
| — | `lib/navigation/command-registry.ts` | "Candidate drafts" | **HONEST — unchanged** |
| — | `projectOps.actions.candidates` (ops board button) | "Candidate drafts" | **HONEST — unchanged** |
| — | `setupRoleChoice.draft.*` | "Person not ready to register yet?", "A draft is never a real account…" | **HONEST — unchanged** |
| B-1 | `workforcePlanning.entries.candidates` (planning "other starting points" chip) | **"Browse candidates"** | **FIXED** → "Your candidate drafts". "Browse candidates" reads as browsing marketplace supply; it opened a personal notebook |
| B-2 | `companyActionRooms.candidates.whatBody` | **"Review candidates and shortlists for your needs."** | **FIXED** → states private notes about people incl. unregistered ones. The old line described concept **B** while sitting on concept **A** |
| B-3 | `companyActionRooms.candidates.nextLine` + `flow.step3` | **"Mark the ones who fit and start a conversation."** | **FIXED** → "When they register, link the draft to their real account." A draft has no account, so a conversation with one is impossible — the page's own honesty note said so three sections below. This was a **capability claim the data model cannot honour**, not a phrasing preference |
| B-4 | `companyActionRooms.candidates.flow.step2` | "The system keeps them private until you decide." | **FIXED** → "Only you can see these notes — they are not shared with your organisation." Privacy is permanent owner-scoped RLS, not a holding state that ends on a decision |
| B-5 | `companyActionRooms.candidates.primaryLabel` | "Find workers" → `/dashboard/company/scouting` | **FIXED (label only)** → "Find registered workers". The destination was always right — real supply *is* over there — but the unqualified label was the one place the two concepts touched with nothing distinguishing them |
| B-6 | `companyActionRooms.candidates.flow.step1` | "Add a candidate or review your drafts." | Reworded for parallelism with B-2; no claim changed |
| B-7 | `companyActionRooms.candidates.context` | "Company · Hire" | **UNCHANGED.** It is genuinely the hire room, and B-4 now carries the scope statement |

### Correction chosen

**A (rename the visible concept, keep the stable route) + C (clarify framing
copy).** Not B (nothing to re-home — the surface is already canonical for its
own concept) and not D (no second data model exists to split off).

Locale coverage: entry chip in all ten catalogs (real copy `lt/en/ru/nl/de/da`,
`[EN]` shells in `et/lv/no/pl`, matching the existing shells there); room copy in
the five active locales, which are the only catalogs carrying that block.

---

## 5. What is proven

- **Human-facing naming matches data truth.** No surviving string tells a
  person they are looking at, browsing, matching, or messaging real candidates.
- **No capability lost.** Every route, action, form field and destination is
  byte-identical. The only file kinds touched are `messages/*.json` plus a new
  guard.
- **No privacy widening.** `candidate_drafts` RLS, grants and columns are
  untouched; the change makes the *existing* scope legible rather than altering it.
- **Organisation context clear.** The room now states in its own flow that the
  notes are personal and not shared with the organisation.
- **1440 / 375 clean.** Verified in the browser on the local stack — see §7.

---

## 6. Owner decisions this audit surfaces (not taken here)

1. **Should candidate drafts become organisation-scoped?** Today a manager's
   drafts die with their account and are invisible to colleagues, while living
   under a company room. Making them org-visible is a migration **and** a
   privacy widening — owner-gated by definition.
2. **Should the drafts surface keep its own route at all**, or become a depth of
   the hire room? Out of scope for a naming reconciliation, and Product Gate
   A-09 would weigh in on any new route either way.

---

## 7. Verification

- `lib/guards/w8-candidates-information-architecture.test.ts` — pins the copy
  claims (no marketplace verbs on the drafts entry points, no conversation
  promise, the personal-scope statement present) and pins the two concepts apart.
- Full guard project + typecheck green.
- Browser: `/lt/dashboard/candidates` at 1440×900 and 375×812 — corrected copy
  rendered, no console errors, no hydration warnings, no horizontal overflow.
