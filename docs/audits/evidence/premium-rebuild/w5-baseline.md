# W5 — WORK JOURNAL / EVIDENCE / SKILLS PIPELINE: BASELINE (acceptance stage, not a rebuild)

Opened 2026-08-01, immediately after
`W4_PROFESSIONAL_IDENTITY_COMPLETE_WITH_OWNER_GATED_ITEMS` (main `426e87aa`).
W5's job is to ACCEPT the existing journal → evidence → skills →
verification chain, complete PARTIAL rows, and build only launch-critical
MISSING rows. The owner directive stands: **the conversation IS the work
journal** — never a second journal surface.

Classification: `FULL` · `PARTIAL` · `MISSING` · `BLOCKED` · `DUPLICATE` ·
`OBSOLETE` · `PRODUCTION_PROVEN`, with `PENDING_AUDIT` + exact probe where
this baseline could not verify without guessing.

## Carried in verified (evidence in the W3/W4 records)

| Capability | State | Evidence |
|---|---|---|
| Journal → capability-extraction → confirm loop | PARTIAL | exists since W1/W2; W4 audit left which claims surface on the card vs lack evidence links unmapped |
| Skill verification honesty | FULL (as of #963) | strict verified rule unified; admin blanket-verification deleted; both pinning guards flipped |
| #candidate-skills anchor | FULL (as of #963) | deep link lands on the skill list, not the clarify form |
| Skills clarify flow | DEFECTIVE (carried) | W4 audit: a write-only sink — entries go in, nothing consumes them |
| `candidate_skills` store | PARTIAL (carried) | read-only ghost consumed by both matching engines; no write path audit yet |
| Journal `visibility_scope` column | OBSOLETE (carried) | consulted by no policy (W4 audit) — removal needs the W3 deletion method |
| Work-Journal-First stages A–H | BLOCKED (design) | owner-directed architecture; Draft PR #867 never merged — W5 must reconcile it against what shipped since, not assume it |

## PENDING_AUDIT — exact probes (first W5 work items)

| Capability | Probe |
|---|---|
| Journal write path (conversation) | Where does a chat message become a journal row? Map the actual write chain and its tests |
| Structured journal | Do structured entries (task/duration/site) exist, or is it free text only? Read the journal schema + entry forms |
| Capability extraction quality | Run the extraction on a real local journal fixture; verify claims carry evidence pointers and are labelled unverified |
| Confirmation flow (manager/employer) | Who confirms a claim, through which surface, writing which row? Verify the confirm write end-to-end locally |
| Evidence links on the Player Card | Which skill claims render with evidence links; which render bare (the W4 leftover) |
| Journal-derived objective evidence (W6 boundary) | What already exists that W6 reputation would consume — inventory only, no reputation building in W5 |
| Four skills stores | catalogue / declared / candidate / confirmed — map every write and read; name DUPLICATE rows for the W3 deletion method |
| Voice journal | 7 migrations live per programme record — is the transcribe service deployed and the path usable, or dormant? |

## Rules carried forward

- ONE journal (the conversation), ONE skills truth chain — no parallel stores without a deletion plan for the loser.
- No fabricated verification; claims stay visibly unverified until a real confirmation row exists.
- Row-by-row browser assertions before any deletion/port; mobile 375px + keyboard/accessible-name legs on accepted rows.
- Production acceptance stays local-stack until the owner provisions `PROD_QA_*` (standing).
