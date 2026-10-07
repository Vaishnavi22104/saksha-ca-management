-- Removes ALL demo data created by scripts/seed.mjs (accounts ending in .test).
-- Run in Supabase Dashboard -> SQL Editor. Development only.
--
-- After this, run `npm run seed` again to rebuild the demo from scratch.
begin;

alter table public.activity_logs disable trigger activity_logs_immutable;
alter table public.messages      disable trigger messages_immutable;

-- Note on the uploaded files: Supabase refuses `delete from storage.objects`
-- in SQL ("Direct deletion from storage tables is not allowed"), because
-- removing the row would leave the actual file orphaned in the bucket. So
-- the bucket is emptied by scripts/seed.mjs instead, through the Storage
-- API, before it uploads the new demo files. There is nothing to do here.

-- Children before parents: AI messages hang off conversations, messages and
-- documents point at tasks, tasks point at workflow runs, everything points
-- at the client.
delete from public.ai_messages       where conversation_id in (
  select id from public.ai_conversations where firm_id in (
    select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.')));
delete from public.ai_conversations  where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.notifications     where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.activity_logs     where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.messages          where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.documents         where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.document_requests where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.tasks             where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.workflow_runs     where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.workflow_template_steps where template_id in (select id from public.workflow_templates where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.')));
delete from public.workflow_templates where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.client_staff  where client_id in (select id from public.clients where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.')));
delete from public.client_users  where client_id in (select id from public.clients where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.')));
delete from public.clients       where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.users         where firm_id in (select id from public.firms where name in ('Sharma & Associates', 'Kapoor & Co.'));
delete from public.firms         where name in ('Sharma & Associates', 'Kapoor & Co.');
delete from auth.users           where email like '%.test';

alter table public.activity_logs enable trigger activity_logs_immutable;
alter table public.messages      enable trigger messages_immutable;

commit;
