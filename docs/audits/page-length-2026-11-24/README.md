# Page length audit, 2026-11-24 (decision 0034)

`page-length.tsv` ranks every static signed-in dashboard route by its document height divided by the viewport
height ("screens"), per role, at 390 × 844 and 1440 × 900. Routes a role is turned away from are listed at the
end as not reached.

- Build: `main` at `24be4a0`, local production build plus local Supabase.
- Roles: worker, learner, institution, company, agency and buyer. They are local QA-SYNTHETIC accounts; the buyer
  was made through the real onboarding and buyer-setup form.
- Re-run: `node apps/web/scripts/measure-page-length.mjs --state role=storage-state.json ...`.
- Not measured: routes with an `[id]` segment, and `/dashboard` itself, which scrolls inside the conversation
  pane, so its document is always about one screen.
