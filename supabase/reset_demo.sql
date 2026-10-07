-- Removes ALL demo data created by scripts/seed.mjs (accounts ending in .test).
-- Run in Supabase Dashboard -> SQL Editor. Development only.
begin;

alter table public.activity_logs disable trigger activity_logs_immutable;

delete from public.activity_logs where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.tasks         where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.client_staff  where client_id in (select id from public.clients where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.')));
delete from public.client_users  where client_id in (select id from public.clients where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.')));
delete from public.clients       where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.users         where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.firms         where name in ('Sharma & Associates', 'Kapoor & Co.');
delete from auth.users           where email like '%.test';

alter table public.activity_logs enable trigger activity_logs_immutable;

commit;
