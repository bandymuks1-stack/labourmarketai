-- Rollback for 20260906120000_professions_catalogue_office_v1.sql
--
-- Removes ONLY the rows that migration seeds, and ONLY where nothing a person
-- or an institution created references them (guarded deletes — a profession
-- a worker selected, a journal entry names, a template scopes or an education
-- program targets is user data and is NOT removed; a skill a worker evidenced
-- is NOT removed). Re-applying the forward migration after this rollback is
-- safe (ON CONFLICT DO NOTHING).
--
-- RISK STATED: if a row survives because it is referenced, its
-- profession_skills links are still removed in step 1 (that is the seed's own
-- data, not the person's). Re-apply the forward migration to restore them.

-- 1. Links first — the new professions' links, and links from any profession
--    to the new skills.
delete from public.profession_skills ps
 using public.professions p
 where ps.profession_id = p.id
   and p.slug in (
     'accountant','finance_specialist','lawyer','engineer','designer',
     'consultant','project_manager','marketing_specialist','sales_specialist'
   );

delete from public.profession_skills ps
 using public.skills s
 where ps.skill_id = s.id
   and s.slug in (
     'financial-reporting','payroll','financial-analysis','budgeting',
     'tax-accounting','legal-advice','contract-drafting','technical-design',
     'cad-drafting','interior-design','business-consulting',
     'project-management','b2b-sales','digital-marketing','content-writing'
   );

-- 2. Professions — only when no worker, journal entry, template or education
--    program references them (every FK into professions that is RESTRICT /
--    NO ACTION in production; profession_skills and market_rate_averages
--    cascade).
delete from public.professions p
 where p.slug in (
     'accountant','finance_specialist','lawyer','engineer','designer',
     'consultant','project_manager','marketing_specialist','sales_specialist'
   )
   and not exists (select 1 from public.worker_professions wp where wp.profession_id = p.id)
   and not exists (select 1 from public.journal_entries je where je.profession_id = p.id)
   and not exists (select 1 from public.profession_templates pt where pt.profession_id = p.id)
   and not exists (select 1 from public.education_programs ep where ep.target_profession_slug = p.slug);

-- 3. Skills — only when neither worker_skills nor journal evidence references
--    them.
delete from public.skills s
 where s.slug in (
     'financial-reporting','payroll','financial-analysis','budgeting',
     'tax-accounting','legal-advice','contract-drafting','technical-design',
     'cad-drafting','interior-design','business-consulting',
     'project-management','b2b-sales','digital-marketing','content-writing'
   )
   and not exists (select 1 from public.worker_skills ws where ws.skill_id = s.id)
   and not exists (select 1 from public.journal_entry_skills jes where jes.skill_id = s.id);
