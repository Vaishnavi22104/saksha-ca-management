-- =====================================================================
-- CA Office OS — Migration 2: Workflow templates and workflow runs
--
-- Adds:
--   workflow_templates       reusable checklists, one per service
--   workflow_template_steps  the ordered steps of a template
--   workflow_runs            one concrete cycle: client + service + period
--   tasks.workflow_run_id    now a real foreign key
--   tasks.workflow_step_no   position of the task inside its run
--   tasks.needs_document     step asked for a client document
--
-- Same security model as migration 1: reads go through RLS, every write
-- goes through a SECURITY DEFINER function that checks permissions,
-- enforces the business rules and writes the activity log in the same
-- transaction.
--
-- Historical rule: generating a run COPIES the step titles into tasks,
-- so editing a template later never rewrites work that already exists.
-- =====================================================================

create type public.workflow_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.workflow_templates (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null references public.firms (id),
  service_id   uuid not null references public.services (id),
  name         text not null check (length(trim(name)) > 0),
  description  text,
  is_active    boolean not null default true,
  created_by   uuid not null references public.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint workflow_templates_firm_name_unique unique (firm_id, name),
  constraint workflow_templates_id_firm_unique unique (id, firm_id)
);
create index workflow_templates_firm_idx on public.workflow_templates (firm_id);

create table public.workflow_template_steps (
  id                 uuid primary key default gen_random_uuid(),
  template_id        uuid not null references public.workflow_templates (id) on delete cascade,
  position           int not null check (position between 1 and 30),
  title              text not null check (length(trim(title)) > 0),
  requires_document  boolean not null default false,
  requires_review    boolean not null default false,
  due_offset_days    int not null default 0 check (due_offset_days between 0 and 365),
  constraint workflow_template_steps_order_unique unique (template_id, position)
);
create index workflow_template_steps_template_idx on public.workflow_template_steps (template_id);

create table public.workflow_runs (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references public.firms (id),
  client_id       uuid not null,
  template_id     uuid references public.workflow_templates (id),
  service_id      uuid not null references public.services (id),
  template_name   text not null,          -- snapshot: survives template edits
  financial_year  text not null check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  period          text not null check (length(trim(period)) > 0),
  status          public.workflow_status not null default 'ACTIVE',
  created_by      uuid not null references public.users (id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  constraint workflow_runs_client_same_firm foreign key (client_id, firm_id) references public.clients (id, firm_id),
  constraint workflow_runs_id_firm_unique unique (id, firm_id)
);
create index workflow_runs_firm_idx on public.workflow_runs (firm_id);
create index workflow_runs_client_idx on public.workflow_runs (client_id);

-- One live cycle per client + service + financial year + period.
-- Cancelled runs are ignored, so a cycle can be redone after cancelling.
create unique index workflow_runs_cycle_unique
  on public.workflow_runs (client_id, service_id, financial_year, lower(trim(period)))
  where status <> 'CANCELLED';

-- ---------------------------------------------------------------------
-- Tasks join the workflow
-- ---------------------------------------------------------------------
alter table public.tasks
  add constraint tasks_workflow_run_fk
  foreign key (workflow_run_id, firm_id) references public.workflow_runs (id, firm_id);

alter table public.tasks add column workflow_step_no int;
alter table public.tasks add column needs_document boolean not null default false;
create index tasks_workflow_run_idx on public.tasks (workflow_run_id);

-- Workflows can appear in the activity log.
alter table public.activity_logs drop constraint activity_logs_entity_type_check;
alter table public.activity_logs add constraint activity_logs_entity_type_check
  check (entity_type in ('client', 'task', 'user', 'workflow', 'workflow_template'));

-- ---------------------------------------------------------------------
-- Row Level Security — read policies only
-- ---------------------------------------------------------------------
alter table public.workflow_templates      enable row level security;
alter table public.workflow_template_steps enable row level security;
alter table public.workflow_runs           enable row level security;

-- Templates are internal: clients never see how the firm organises work.
create policy workflow_templates_select on public.workflow_templates for select to authenticated
  using (firm_id = public.app_user_firm() and public.app_user_role() in ('ADMIN', 'STAFF'));

create policy workflow_template_steps_select on public.workflow_template_steps for select to authenticated
  using (exists (
    select 1 from workflow_templates t
    where t.id = template_id
      and t.firm_id = public.app_user_firm()
      and public.app_user_role() in ('ADMIN', 'STAFF')
  ));

create policy workflow_runs_select on public.workflow_runs for select to authenticated
  using (
    firm_id = public.app_user_firm()
    and (
      public.app_is_admin()
      or (public.app_user_role() = 'STAFF'  and public.app_is_assigned(client_id))
      or (public.app_user_role() = 'CLIENT' and client_id = public.app_client_id())
    )
  );

-- ---------------------------------------------------------------------
-- Internal: validate and store the steps of a template.
-- p_steps is a JSON array:
--   [{"title": "...", "requires_document": true,
--     "requires_review": false, "due_offset_days": 0}, ...]
-- ---------------------------------------------------------------------
create function public.app_save_template_steps(p_template_id uuid, p_steps jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'The steps are in the wrong format';
  end if;
  select jsonb_array_length(p_steps) into v_count;
  if v_count < 1 then
    raise exception 'Add at least one step';
  end if;
  if v_count > 30 then
    raise exception 'A template can have at most 30 steps';
  end if;
  if exists (select 1 from jsonb_array_elements(p_steps) s where length(trim(coalesce(s->>'title', ''))) = 0) then
    raise exception 'Every step needs a title';
  end if;

  delete from workflow_template_steps where template_id = p_template_id;

  insert into workflow_template_steps (template_id, position, title, requires_document, requires_review, due_offset_days)
  select
    p_template_id,
    ordinality,
    left(trim(s->>'title'), 200),
    coalesce((s->>'requires_document')::boolean, false),
    coalesce((s->>'requires_review')::boolean, false),
    least(greatest(coalesce((s->>'due_offset_days')::int, 0), 0), 365)
  from jsonb_array_elements(p_steps) with ordinality as t(s, ordinality);
end $$;

-- ---------------------------------------------------------------------
-- Business operations (RPC)
-- ---------------------------------------------------------------------
create function public.create_workflow_template(
  p_name text, p_service_id uuid, p_description text, p_steps jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can create workflow templates';
  end if;
  if not exists (select 1 from services where id = p_service_id and is_active) then
    raise exception 'Choose a service';
  end if;

  insert into workflow_templates (firm_id, service_id, name, description, created_by)
  values (public.app_user_firm(), p_service_id, trim(p_name), nullif(trim(p_description), ''), auth.uid())
  returning id into v_id;

  perform public.app_save_template_steps(v_id, p_steps);
  perform public.app_log(null, 'workflow_template', v_id, 'TEMPLATE_CREATED',
    format('Created workflow template "%s"', trim(p_name)));
  return v_id;
exception when unique_violation then
  raise exception 'A template with this name already exists';
end $$;

create function public.update_workflow_template(
  p_template_id uuid, p_name text, p_description text, p_steps jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_template workflow_templates;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can edit workflow templates';
  end if;
  select * into v_template from workflow_templates
  where id = p_template_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Template not found';
  end if;

  update workflow_templates
  set name = trim(p_name), description = nullif(trim(p_description), ''), updated_at = now()
  where id = p_template_id;

  perform public.app_save_template_steps(p_template_id, p_steps);
  -- Workflows already generated keep their own copies of the old steps.
  perform public.app_log(null, 'workflow_template', p_template_id, 'TEMPLATE_UPDATED',
    format('Updated workflow template "%s"', trim(p_name)));
exception when unique_violation then
  raise exception 'A template with this name already exists';
end $$;

create function public.set_workflow_template_active(p_template_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_template workflow_templates;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can archive workflow templates';
  end if;
  select * into v_template from workflow_templates
  where id = p_template_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Template not found';
  end if;

  update workflow_templates set is_active = p_active, updated_at = now() where id = p_template_id;
  perform public.app_log(null, 'workflow_template', p_template_id,
    case when p_active then 'TEMPLATE_RESTORED' else 'TEMPLATE_ARCHIVED' end,
    format('%s workflow template "%s"',
           case when p_active then 'Restored' else 'Archived' end, v_template.name));
end $$;

-- Generates one workflow run: the run row plus one task per template step.
-- Step titles, review flags and document flags are copied into the tasks.
create function public.generate_workflow(
  p_template_id uuid, p_client_id uuid, p_financial_year text, p_period text,
  p_due_date timestamptz, p_assigned_to uuid, p_allow_duplicate boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_template workflow_templates;
  v_client   clients;
  v_existing workflow_runs;
  v_assignee text;
  v_run_id   uuid;
  v_steps    int;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can generate workflows';
  end if;

  select * into v_template from workflow_templates
  where id = p_template_id and firm_id = public.app_user_firm();
  if not found then
    raise exception 'Template not found';
  end if;
  if not v_template.is_active then
    raise exception 'This template is archived. Restore it before generating work.';
  end if;

  select * into v_client from clients where id = p_client_id and firm_id = public.app_user_firm();
  if not found then
    raise exception 'Client not found';
  end if;
  if v_client.status <> 'ACTIVE' then
    raise exception 'This client is inactive';
  end if;

  select count(*) into v_steps from workflow_template_steps where template_id = p_template_id;
  if v_steps = 0 then
    raise exception 'This template has no steps yet';
  end if;

  -- Duplicate protection: the same cycle is never generated silently twice.
  select * into v_existing from workflow_runs
  where client_id = p_client_id
    and service_id = v_template.service_id
    and financial_year = p_financial_year
    and lower(trim(period)) = lower(trim(p_period))
    and status <> 'CANCELLED';
  if found and not p_allow_duplicate then
    raise exception 'A % workflow already exists for % (% %). Open it, or choose "Create another workflow".',
      v_template.name, v_client.name, p_period, p_financial_year;
  end if;

  if p_assigned_to is not null then
    select u.name into v_assignee
    from client_staff cs join users u on u.id = cs.staff_id
    where cs.client_id = p_client_id and cs.staff_id = p_assigned_to and u.is_active;
    if v_assignee is null then
      raise exception 'That staff member is not assigned to this client';
    end if;
  end if;

  insert into workflow_runs (firm_id, client_id, template_id, service_id, template_name,
                             financial_year, period, created_by)
  values (v_client.firm_id, p_client_id, p_template_id, v_template.service_id, v_template.name,
          p_financial_year, trim(p_period), auth.uid())
  returning id into v_run_id;

  insert into tasks (firm_id, client_id, service_id, workflow_run_id, workflow_step_no, needs_document,
                     financial_year, period, title, assigned_to, priority, requires_review, due_date, created_by)
  select
    v_client.firm_id, p_client_id, v_template.service_id, v_run_id, s.position, s.requires_document,
    p_financial_year, trim(p_period), s.title, p_assigned_to, 'MEDIUM'::task_priority,
    s.requires_review, p_due_date + make_interval(days => s.due_offset_days), auth.uid()
  from workflow_template_steps s
  where s.template_id = p_template_id
  order by s.position;

  perform public.app_log(p_client_id, 'workflow', v_run_id, 'WORKFLOW_GENERATED',
    format('Generated %s for %s (%s, %s): %s task(s)%s',
           v_template.name, v_client.name, trim(p_period), p_financial_year, v_steps,
           coalesce(format(', assigned to %s', v_assignee), '')),
    jsonb_build_object('template_id', p_template_id, 'tasks', v_steps, 'duplicate', coalesce(p_allow_duplicate, false)));
  return v_run_id;
end $$;

-- Closing never silently completes the remaining tasks: p_force just
-- records that the CA closed the cycle with work still open.
create function public.close_workflow_run(p_run_id uuid, p_force boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_run workflow_runs; v_open int; v_client text;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can close workflows';
  end if;
  select * into v_run from workflow_runs where id = p_run_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Workflow not found';
  end if;
  if v_run.status <> 'ACTIVE' then
    raise exception 'This workflow is already %', lower(v_run.status::text);
  end if;

  select count(*) into v_open from tasks
  where workflow_run_id = p_run_id and status not in ('COMPLETED', 'CANCELLED');
  if v_open > 0 and not p_force then
    raise exception '% task(s) in this workflow are not finished yet.', v_open;
  end if;

  update workflow_runs set status = 'COMPLETED', completed_at = now() where id = p_run_id;
  select name into v_client from clients where id = v_run.client_id;
  perform public.app_log(v_run.client_id, 'workflow', p_run_id, 'WORKFLOW_CLOSED',
    format('Closed %s for %s (%s)%s', v_run.template_name, v_client, v_run.period,
           case when v_open > 0 then format(' with %s task(s) unfinished', v_open) else '' end),
    jsonb_build_object('unfinished', v_open));
end $$;

-- Cancelling a workflow cancels the work it created that nobody finished.
create function public.cancel_workflow_run(p_run_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_run workflow_runs; v_cancelled int; v_client text;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can cancel workflows';
  end if;
  select * into v_run from workflow_runs where id = p_run_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Workflow not found';
  end if;
  if v_run.status = 'CANCELLED' then
    return;
  end if;

  with cancelled as (
    update tasks set status = 'CANCELLED', updated_at = now()
    where workflow_run_id = p_run_id and status not in ('COMPLETED', 'CANCELLED')
    returning 1
  )
  select count(*) into v_cancelled from cancelled;

  update workflow_runs set status = 'CANCELLED', completed_at = now() where id = p_run_id;
  select name into v_client from clients where id = v_run.client_id;
  perform public.app_log(v_run.client_id, 'workflow', p_run_id, 'WORKFLOW_CANCELLED',
    format('Cancelled %s for %s (%s), including %s open task(s)',
           v_run.template_name, v_client, v_run.period, v_cancelled),
    jsonb_build_object('cancelled_tasks', v_cancelled));
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on function public.app_save_template_steps(uuid, jsonb) from public, anon, authenticated;

grant execute on function
  public.create_workflow_template(text, uuid, text, jsonb),
  public.update_workflow_template(uuid, text, text, jsonb),
  public.set_workflow_template_active(uuid, boolean),
  public.generate_workflow(uuid, uuid, text, text, timestamptz, uuid, boolean),
  public.close_workflow_run(uuid, boolean),
  public.cancel_workflow_run(uuid)
to authenticated;

revoke insert, update, delete on all tables in schema public from anon, authenticated;
