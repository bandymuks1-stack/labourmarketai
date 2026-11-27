// Synthetic-only behavioural proof using the existing DB-proof fixtures and canonical SQL.
// Start a throwaway local PostgreSQL cluster; set LM_TEST_PSQL_BIN / LM_TEST_PG_PORT if needed.
// Creates its own uniquely named test database; never connects to a remote host.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync,execFile}=require('node:child_process');
(async()=>{
const root=require('node:path').resolve(__dirname,'../..');
const psql=process.env.LM_TEST_PSQL_BIN || 'psql';
const args=['-X','-h','127.0.0.1','-p',process.env.LM_TEST_PG_PORT || '55492','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const dbName='timesheet_schedule_proof_'+Date.now();
const run=(s,db=dbName)=>execFileSync(psql,[...args,'-d',db],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim().replaceAll('\r\n','\n');
const file=p=>fs.readFileSync(root+'/'+p,'utf8');
const json=s=>JSON.parse(run(s));
const O='01000000-0000-4000-8000-000000000001',U='a5000000-0000-4000-8000-00000000000a',A='a1000000-0000-4000-8000-00000000000a',M='a4000000-0000-4000-8000-00000000000a',X='a8000000-0000-4000-8000-00000000000a';
const as=(u,s,role='authenticated')=>run(`begin;set local role ${role};select set_config('request.jwt.claims','${JSON.stringify({...u?{sub:u}:{},role})}',true);${s};commit;`).split('\n').slice(1).join('\n');
const denied=(u,s,role='authenticated')=>{let ok=false;try{as(u,s,role)}catch(e){ok=/permission denied|Not allowed/.test(String(e.stderr))}assert(ok,s)};
const fn=(p,name)=>{const s=file(p),i=s.indexOf('create or replace function public.'+name+'(');assert(i>=0);return s.slice(i,s.indexOf('$$;',i)+3)};
const migration=file('supabase/migrations/20261127163000_timesheet_schedules_v1.sql');
const rollback=file('supabase/rollbacks/20261127163000_timesheet_schedules_v1.down.sql');
if(!run(`select datname from pg_database where datname='${dbName}'`,'postgres'))run('create database '+dbName,'postgres');
run(file('scripts/db-proof/workflow-engine-v1.prelude.sql'));
run(file('scripts/db-proof/workflow-engine-v1.seed.sql'));
run(file('scripts/db-proof/timesheets-v1.prelude.sql'));
run(file('scripts/db-proof/timesheets-v1.seed.sql'));
run(file('scripts/db-proof/m3-timesheet-compute-allocations.prelude.sql').replaceAll('create table public.','create table if not exists public.'));
run(`alter table public.journal_entries add column engagement_context_id uuid;
alter table public.journal_entry_metrics add column source text;
alter table public.projects add column organization_id uuid;
update public.journal_entries set engagement_context_id=(select id from public.engagement_contexts where profile_id='${U}' limit 1);
update public.projects set organization_id='${O}';
insert into public.journal_entry_metrics(entry_id,metric_slug,value_numeric,unit_slug,source) values('e0000001-0000-4000-8000-00000000000e','quantity',5,'hours','worker_input');
create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') $$;
grant execute on function auth.role() to anon,authenticated,service_role;`);
run(file('supabase/migrations/20260817130000_workflow_engine_v1.sql'));
run(file('supabase/migrations/20260817170000_timesheets_v1.sql'));
run(fn('supabase/migrations/20260831170000_timesheet_compute_allocations_v1.sql','timesheet_compute_lines_v1'));
run(fn('supabase/migrations/20261002141500_work_task_authz_null_safe_v1.sql','start_workflow_instance_v1'));
run(migration);
// Empty rollback returns the previous schema exactly.
run(rollback);assert.equal(run("select to_regclass('public.timesheet_schedules')"),'');run(migration);
const steps=JSON.stringify([{name:'Approval',approval_mode:'single',approver_rule:{kind:'org_role',roles:['owner','admin']}}]);
assert.equal(as(A,`select public.create_workflow_definition_v1('${O}','Timesheet approval','timesheet_approval_standard','timesheet','${steps}'::jsonb)`),'created');
const D=run("select id from public.workflow_definitions where slug='timesheet_approval_standard'");
const V=run(`select id from public.workflow_definition_versions where definition_id='${D}'`);
assert.equal(as(A,`select public.publish_workflow_version_v1('${V}')`),'published');
const save=(u,extra={})=>as(u,`select public.save_timesheet_schedule_v1('${extra.org??O}','${extra.def??D}','${extra.frequency??'monthly'}','${extra.time??'09:00'}','${extra.zone??'Europe/Vilnius'}',1::smallint,true)`);
assert.equal(save(X),'not_allowed');assert.equal(save(U,{org:'02000000-0000-4000-8000-000000000002'}),'not_allowed');
assert.equal(save(U,{zone:'Invalid/Zone'}),'invalid');assert.equal(save(U,{time:'25:00'}),'invalid');
assert.equal(save(U),'saved');
assert.equal(as(U,'select count(*) from public.timesheet_schedules'),'1');assert.equal(as(A,'select count(*) from public.timesheet_schedules'),'0');
denied(U,'update public.timesheet_schedules set enabled=true');denied(U,'select public.run_due_timesheet_schedules_v1()');denied('',`select * from public.timesheet_schedules`,'anon');
const cron=()=>JSON.parse(as('',"select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.run_due_timesheet_schedules_v1() t",'service_role'));
assert.equal(cron().length,0,'future settings cannot run early');
const S=run(`select id from public.timesheet_schedules where profile_id='${U}'`);
run(`update public.timesheet_schedules set next_run_at='2026-09-01T06:00:00Z' where id='${S}'`);
const first=cron();assert.equal(first.length,1);assert.equal(first[0].outcome,'submitted');
const T=run(`select last_timesheet_id from public.timesheet_schedules where id='${S}'`),I=first[0].instance_id;
assert.equal(run(`select status||':'||period_start||':'||period_end from public.timesheets where id='${T}'`),'submitted:2026-08-01:2026-08-31');
assert.equal(Number(run(`select lines_snapshot->'totals'->>'totalHours' from public.timesheets where id='${T}'`)),5);
assert.equal(run(`select requester_profile_id from public.workflow_instances where id='${I}'`),U);
assert.equal(run(`select status from public.workflow_instances where id='${I}'`),'pending');
assert.equal(run(`select count(*) from public.timesheet_events where timesheet_id='${T}' and actor_profile_id='${U}'`),'2');
assert.equal(cron().length,0,'pending notification prevents repeat generation');
const retained=JSON.parse(as('',"select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.pending_timesheet_schedule_notifications_v1() t",'service_role'));assert.equal(retained[0].instance_id,I);
as('',`select public.ack_timesheet_schedule_notification_v1('${S}','${I}',true)`,'service_role');
assert.equal(cron()[0].outcome,'empty','catch-up next month has no work');
// Verify exact-period already-submitted handling and context restoration inside the same call.
run(`update public.timesheet_schedules set next_run_at='2026-09-01T06:00:00Z' where id='${S}'`);
const restored=as('',`select outcome from public.run_due_timesheet_schedules_v1();select auth.role()||':'||coalesce(auth.uid()::text,'none')`,'service_role');
assert.equal(restored,'already_submitted\nservice_role:none');
// A manual draft stays a draft; scheduling pauses rather than seizing it.
assert.match(as(U,`select public.create_timesheet_v1('${O}','2026-09-01','2026-09-30')`),/^[a-f0-9-]{36}$/);
assert.equal(cron()[0].outcome,'overlap');assert.equal(run(`select enabled from public.timesheet_schedules where id='${S}'`),'f');
assert.equal(run("select count(*) from public.timesheets where status='draft'"),'1');
// Opt-in does not outlive membership. Disabling remains possible after revocation.
save(U);run(`update public.timesheet_schedules set next_run_at=now()-interval '1 minute' where id='${S}';update public.engagement_contexts set status='revoked' where profile_id='${U}'`);
assert.equal(cron()[0].outcome,'not_allowed');
assert.equal(as(U,`select public.save_timesheet_schedule_v1('${O}',null,null,null,null,null,false)`),'saved');
run(`update public.engagement_contexts set status='active' where profile_id='${U}'`);
// DST gaps/folds yield one run per LOCAL day; month includes leap February.
const next=(f,t,z,a)=>run(`select public.timesheet_schedule_next_v1('${f}','${t}','${z}',1::smallint,'${a}') at time zone 'UTC'`);
assert.equal(next('daily','03:30','Europe/Vilnius','2026-03-28T02:00:00Z'),'2026-03-29 01:30:00');
assert.equal(next('daily','03:30','Europe/Vilnius','2026-03-29T01:30:00Z'),'2026-03-30 00:30:00');
assert.equal(next('daily','03:30','Europe/Vilnius','2026-10-25T01:30:00Z'),'2026-10-26 01:30:00');
assert.equal(next('monthly','09:00','Europe/Vilnius','2028-02-01T07:00:00Z'),'2028-03-01 07:00:00');
// Failed workflow creation must roll back the new report and its events too.
run(`insert into public.engagement_contexts(id,profile_id,organization_id,status) values('eeee0001-0000-4000-8000-000000000001','${M}','${O}','active');
insert into public.journal_entries(id,worker_id,engagement_context_id,original_text,created_at) values('eeee0002-0000-4000-8000-000000000002','aaaa0002-0000-4000-8000-00000000000a','eeee0001-0000-4000-8000-000000000001','Recorded task','2026-09-03T12:00:00Z');
insert into public.journal_entry_metrics(entry_id,metric_slug,value_numeric,unit_slug,source) values('eeee0002-0000-4000-8000-000000000002','quantity',2,'hours','worker_input');`);
assert.equal(save(M,{frequency:'weekly'}),'saved');
const SM=run(`select id from public.timesheet_schedules where profile_id='${M}'`);
run(`update public.timesheet_schedules set next_run_at='2026-09-08T06:00:00Z' where id='${SM}';update public.company_memberships set status='revoked' where organization_id='${O}' and role in ('owner','admin')`);
assert.equal(cron()[0].outcome,'error');
assert.equal(run(`select count(*) from public.timesheets where worker_id='aaaa0002-0000-4000-8000-00000000000a'`),'0');
assert.equal(run(`select count(*) from public.workflow_instances where requester_profile_id='${M}'`),'0');
run(`update public.company_memberships set status='active' where profile_id in ('${A}','a2000000-0000-4000-8000-00000000000a');update public.timesheet_schedules set retry_after=now()-interval '1 minute' where id='${SM}'`);
const parallelRun=()=>new Promise((resolve,reject)=>{
 const p=execFile(psql,[...args,'-d',dbName],{encoding:'utf8'},(error,stdout,stderr)=>error?reject(new Error(stderr)):resolve(JSON.parse(stdout.trim())));
 p.stdin.end(`begin;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.run_due_timesheet_schedules_v1() t;commit;`);
});
const parallel=await Promise.all([parallelRun(),parallelRun()]);
assert.equal(parallel.flat().length,1);assert.equal(parallel.flat()[0].outcome,'submitted');
const IM=parallel.flat()[0].instance_id;
as('',`select public.ack_timesheet_schedule_notification_v1('${SM}','${IM}',false)`,'service_role');
assert.equal(as('',`select count(*) from public.pending_timesheet_schedule_notifications_v1()`,'service_role'),'0');
run(`update public.timesheet_schedules set retry_after=now()-interval '1 minute' where id='${SM}'`);
assert.equal(as('',`select count(*) from public.pending_timesheet_schedule_notifications_v1()`,'service_role'),'1');
// Nonempty rollback denies execution but preserves all settings/history/approvals.
const before=json("select json_build_object('settings',(select count(*) from public.timesheet_schedules),'sheets',(select count(*) from public.timesheets),'events',(select count(*) from public.timesheet_events),'instances',(select count(*) from public.workflow_instances))");
run(rollback);denied('',"select public.run_due_timesheet_schedules_v1()",'service_role');denied(U,`select public.save_timesheet_schedule_v1('${O}',null,null,null,null,null,false)`);
const after=json("select json_build_object('settings',(select count(*) from public.timesheet_schedules),'sheets',(select count(*) from public.timesheets),'events',(select count(*) from public.timesheet_events),'instances',(select count(*) from public.workflow_instances))");assert.deepEqual(after,before);
const proof={localOnly:true,syntheticOnly:true,postgres:run('show server_version'),canonicalJournalHours:5,selfOnlyRls:true,serviceOnlyExecution:true,membershipRechecked:true,manualDraftPreserved:true,atomicSubmission:true,failedWorkflowRollsBackReport:true,concurrentDispatchOnce:true,notificationRetryRetained:true,notificationRetryBackoff:true,contextRestored:true,dst:true,leapYear:true,rollbackEmptyAndNonempty:true,historyPreserved:after};
console.log(JSON.stringify(proof));
})().catch(e=>{console.error(e);process.exitCode=1});
