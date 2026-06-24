# Contact / permission / quota bridge audit (v1)

**Purpose:** before a marker action sheet (or any "Kreiptis / Rašyti" button) shows an
**enabled** contact action, prove the permission bridge exists. **No invented billing
or quota.** If logic is missing, the action is hidden or shown disabled with an honest
reason — never a fake "free contacts left".

**Base:** main `7325a49`.

Status: `active` · `partial` · `missing bridge` · `missing execution`

| Question the UI must answer | Real bridge today | Status | Decision for the action sheet |
|---|---|---|---|
| Can this user contact this person/company? | `evaluateCommunicationRequest()` (`communication-eligibility.ts`) — **default-closed**, gates a **company → scouted-worker** in-app conversation on `ownsDemand && shortlisted && canContact`. **Scoped to the scouting/shortlist flow**, not arbitrary map contact. | **partial** | Use this bridge where it applies (company↔scouted worker). For arbitrary map markers there is **no** general contact bridge → **omit/disable with honest reason**. |
| Is contact direct or request-based? | `lib/communication/direct-conversation.ts` (direct) + `request-worker-conversation.ts` (request) | **partial** | Reflect the real path where eligibility resolves it; do not invent a path otherwise. |
| Does this workspace have permission? | `active_role`/RLS gate the dashboard; no per-marker workspace-permission model | **partial** | Gate by the existing eligibility + RLS; otherwise honest "not available for this workspace". |
| Are free contact allowances remaining? | **none** — no quota / allowance / "free contacts" logic exists anywhere in the repo | **missing bridge** | **Never show "free contacts left."** Omit any quota counter entirely. |
| Is this action blocked, and why? | `CommunicationRequestDecision` returns `not_owner` / `not_shortlisted` / `not_contactable` | **partial** | When blocked, show the honest reason from this enum; never a generic fake "limit reached". |
| Is messaging enabled for this relationship? | Eligibility above + `lib/communication/*` actions | **partial** | Enable only when eligibility = `allowed`; else hidden/disabled. |
| Is profile visibility allowed? | `lib/scouting/scout-safe-view.ts` (privacy-safe scouting view) | **partial** | Use the safe view where it exists; do not expose fields it withholds. |
| Phone / email reveal | **none** — eligibility explicitly notes "no phone/email"; in-app only | **missing bridge** | **Omit** any phone/email reveal; in-app conversation only. |

## Conclusion

- **Real, usable bridge:** in-app conversation eligibility for the **company →
  scouted-worker** relationship (`communication-eligibility.ts`, default-closed), plus
  direct/request conversation primitives. Where this applies, the action sheet may show
  a real, eligibility-gated "Kreiptis / Rašyti", and the honest blocked-reason when denied.
- **Missing bridge (do not fake):** general per-marker contact permission, free-contact
  **quota / allowance**, per-workspace contact permission, phone/email reveal. These do
  **not** exist. The UI must **omit them or show an honest unavailable state**.
- **Quota is explicitly forbidden to fabricate:** no "free contacts left" counter may be
  rendered, because no such logic exists.

Because there are no cross-user map markers yet (see
`market-map-visual-action-bridge-v1.md`), there is no surface in PR B that needs an
enabled contact action; this audit defines the rules for when that surface is built in
a future PR (only after the cross-user geo + a real permission/quota model exist).
