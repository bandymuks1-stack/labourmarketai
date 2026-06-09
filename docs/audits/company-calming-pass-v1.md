# Company / Agency Calming Pass (Design + first slice, v1)

**Slice:** `company-calming-pass-v1` (plan step G — the LAST slice, after the
worker-first / project-scope path).
**Status:** design + one safe copy slice. The cockpit is reframed calmer at the
**copy** level only — **no structural / visual redesign** (that would be a
radical change, RED, and needs the owner's eyes).

---

## 1. Audit — the company/agency cockpit today
`/dashboard` (role ≠ worker) is already **data-driven and honest**:
- a single, clear **Next Action** (entries waiting → review; nothing waiting →
  invite/open team), degrading to an honest "nothing waiting" when the RPC isn't
  applied;
- a secondary chain-actions index ("all steps");
- **demand read-back** of the org's own submitted requests — honest status only,
  **no matching, no fabricated demand**;
- the shared `CurrentSpaceHeader`.

So the cockpit is structurally sound and truthful. What it lacked was the calm,
human *framing* the worker sprint gave "Mano erdvė".

## 2. This slice (copy-only, non-radical)
A single calm framing line under the cockpit header (`company.calmNote`,
`data-testid="company-calm-note"`), mirroring the worker `foundationNote`:
- LT: *"Po vieną aiškų žingsnį. Statusas tikras — poreikiai ir atitikmenys
  nepramanyti."*
- EN: *"One clear step at a time. The status is real — demand and matches are
  never fabricated."*

It reassures (one step at a time) **and** restates the honesty contract (status
real, nothing fabricated). No layout, component, or flow change.

## 3. Safe follow-up calming slices (copy-level, each its own PR)
1. Warm the chain-actions step labels + the Next-Action microcopy.
2. Calm the demand read-back empty state ("nothing submitted yet — here's the one
   useful next step").
3. Humanise the verification-status copy (calm, never implying fake verification).
4. Calm the workers/agency roster section intros + empty states.

## 4. Explicitly NOT done (owner-gated)
- Any radical visual / brand / product-direction change of the cockpit (RED #10).
- Any change to the honest data model, the verification ladder, or status logic.

## 5. Plan position
This closes the 30+ step autopilot plan's section G as a safe first pass. The
broader calming (follow-ups above) continues as small copy PRs under the standing
autonomous-merge policy.
