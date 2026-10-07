-- =====================================================================
-- Authorization checks. Run in Supabase SQL Editor AFTER `npm run seed`.
-- Each block impersonates one user, runs queries, and rolls back.
-- Compare the output with the EXPECT comments. Keep screenshots as
-- testing evidence (plan sections 176-179).
-- =====================================================================

-- Helper: impersonate a user by email inside the current transaction
create or replace function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text,
    true);
  execute 'set local role authenticated';
end $$;

-- 1. Staff sees only assigned clients --------------------------------
begin;
select pg_temp.act_as('rahul@sharma-associates.test');
select name from public.clients order by name;
-- EXPECT: ABC Traders, XYZ Pvt Ltd   (not Raj Enterprises, not Om Services)
rollback;

-- 2. Client sees only their own client and tasks ---------------------
begin;
select pg_temp.act_as('meera@xyzpvt.test');
select name from public.clients;
-- EXPECT: XYZ Pvt Ltd only
select distinct client_id = (select client_id from public.client_users where user_id = auth.uid()) as own_only
from public.tasks;
-- EXPECT: a single row: true
rollback;

-- 3. Cross-firm isolation --------------------------------------------
begin;
select pg_temp.act_as('neha@kapoor-co.test');
select name from public.clients;
-- EXPECT: Kapoor Textiles only
select count(*) as sharma_tasks_visible from public.tasks
where firm_id = (select id from public.firms where name = 'Sharma & Associates');
-- EXPECT: 0
rollback;

-- 4. Temporary-password account sees no business data ----------------
begin;
select pg_temp.act_as('rajesh@abctraders.test');
select count(*) as clients_visible from public.clients;
-- EXPECT: 0 (until the password is changed)
rollback;

-- 5. Direct writes are refused ---------------------------------------
begin;
select pg_temp.act_as('rahul@sharma-associates.test');
update public.tasks set status = 'COMPLETED';
-- EXPECT: ERROR permission denied for table tasks
rollback;

-- 6. Staff cannot approve reviewed work ------------------------------
begin;
select pg_temp.act_as('rahul@sharma-associates.test');
select public.change_task_status(
  (select id from public.tasks where title = 'Prepare GST data' and status = 'UNDER_REVIEW' limit 1),
  'COMPLETED');
-- EXPECT: ERROR Only the CA can approve or return reviewed work
rollback;

-- 7. Invalid status transition ---------------------------------------
begin;
select pg_temp.act_as('anil@sharma-associates.test');
select public.change_task_status(
  (select id from public.tasks where title = 'File GSTR-3B' limit 1),
  'COMPLETED');
-- EXPECT: ERROR A task cannot move from To do to Completed
rollback;

-- 8. Staff cannot run admin operations -------------------------------
begin;
select pg_temp.act_as('priya@sharma-associates.test');
select public.create_client('Hack Co', 'hack@x.test', '', '', '', 'Other');
-- EXPECT: ERROR Only the CA can add clients
rollback;

-- 9. Activity logs are immutable -------------------------------------
begin;
delete from public.activity_logs;
-- EXPECT: ERROR Activity logs cannot be modified or deleted (even as postgres)
rollback;
