\pset format unaligned
\pset fieldsep '|'
\pset tuples_only on
select
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as identity,
  pg_get_userbyid(p.proowner) as owner,
  (exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'))::int as pub,
  has_function_privilege('anon',          p.oid, 'EXECUTE')::int as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')::int as auth,
  has_function_privilege('service_role',  p.oid, 'EXECUTE')::int as svc,
  has_function_privilege('postgres',      p.oid, 'EXECUTE')::int as pg,
  (p.proacl is null)::int as acl_null
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 1;
