-- =====================================================================
-- CA Office OS — Migration 1: Foundation
-- Tables: firms, users, clients, client_users, client_staff, services,
--         tasks, activity_logs
-- Later migrations add workflow templates/runs, documents, messages,
-- notifications.
--
-- Security model
--   * Every business table has RLS enabled.
--   * Authenticated users only get SELECT policies.
--   * All writes go through SECURITY DEFINER functions below, which
--     check permissions, validate business rules and write the activity
--     log in the same transaction.
--   * Account provisioning (auth.users) is done by the Next.js server
--     with the service-role key, after checking the caller is an admin.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role     as enum ('ADMIN', 'STAFF', 'CLIENT');
create type public.client_status as enum ('ACTIVE', 'INACTIVE');
create type public.task_status   as enum ('TODO', 'IN_PROGRESS', 'WAITING_FOR_CLIENT', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED');
create type public.task_priority as enum ('LOW', 'MEDIUM', 'HIGH');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.firms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per login. id = auth.users.id
create table public.users (
  id                    uuid primary key references auth.users (id) on delete restrict,
  firm_id               uuid not null references public.firms (id),
  name                  text not null check (length(trim(name)) > 0),
  email                 text not null unique,
  role                  public.user_role not null,
  is_active             boolean not null default true,
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index users_firm_idx on public.users (firm_id);

create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references public.firms (id),
  name           text not null check (length(trim(name)) > 0),
  email          text not null,
  phone          text,
  pan            text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  gstin          text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  business_type  text,
  status         public.client_status not null default 'ACTIVE',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint clients_firm_email_unique unique (firm_id, email),
  constraint clients_id_firm_unique unique (id, firm_id)   -- target for composite FKs
);
create index clients_firm_idx on public.clients (firm_id);

-- Primary key on user_id => a client login maps to exactly one client.
create table public.client_users (
  user_id     uuid primary key references public.users (id),
  client_id   uuid not null references public.clients (id),
  created_at  timestamptz not null default now()
);
create index client_users_client_idx on public.client_users (client_id);

create table public.client_staff (
  client_id    uuid not null references public.clients (id),
  staff_id     uuid not null references public.users (id),
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references public.users (id),
  primary key (client_id, staff_id)
);
create index client_staff_staff_idx on public.client_staff (staff_id);

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

insert into public.services (name, description) values
  ('GST', 'Goods and Services Tax compliance work'),
  ('Income Tax', 'Income tax return work'),
  ('TDS', 'Tax deducted at source work'),
  ('Bookkeeping', 'Accounting and bookkeeping'),
  ('Audit', 'Audit engagements'),
  ('Payroll', 'Payroll processing'),
  ('MCA / ROC Compliance', 'Company law filings'),
  ('Other', 'Other professional services');

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid not null references public.firms (id),
  client_id        uuid not null,
  service_id       uuid not null references public.services (id),
  workflow_run_id  uuid,  -- FK added by the workflow migration
  financial_year   text not null check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  period           text not null check (length(trim(period)) > 0),
  title            text not null check (length(trim(title)) > 0),
  description      text,
  assigned_to      uuid references public.users (id),
  status           public.task_status not null default 'TODO',
  priority         public.task_priority not null default 'MEDIUM',
  requires_review  boolean not null default true,
  due_date         timestamptz not null,
  created_by       uuid not null references public.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  -- a task can never point at a client from another firm
  constraint tasks_client_same_firm foreign key (client_id, firm_id) references public.clients (id, firm_id)
);
create index tasks_firm_idx on public.tasks (firm_id);
create index tasks_client_idx on public.tasks (client_id);
create index tasks_assignee_idx on public.tasks (assigned_to);

create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null references public.firms (id),
  user_id      uuid references public.users (id),
  client_id    uuid references public.clients (id),
  entity_type  text check (entity_type in ('client', 'task', 'user')),
  entity_id    uuid,
  action       text not null,
  description  text not null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index activity_firm_created_idx on public.activity_logs (firm_id, created_at desc);
create index activity_entity_idx on public.activity_logs (entity_type, entity_id);
create index activity_client_idx on public.activity_logs (client_id);

-- Activity logs are append-only, even for privileged roles.
create function public.prevent_activity_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Activity logs cannot be modified or deleted';
end $$;

create trigger activity_logs_immutable
  before update or delete on public.activity_logs
  for each row execute function public.prevent_activity_change();

-- ---------------------------------------------------------------------
-- Identity helpers (used by RLS and RPCs)
-- An inactive user, or one who still has a temporary password, resolves
-- to NULL here, so they can read no business data at all.
-- ---------------------------------------------------------------------
create function public.app_user_firm() returns uuid
language sql stable security definer set search_path = public as $$
  select firm_id from users
  where id = auth.uid() and is_active and not must_change_password
$$;

create function public.app_user_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from users
  where id = auth.uid() and is_active and not must_change_password
$$;

create function public.app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_user_role() = 'ADMIN', false)
$$;

create function public.app_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select cu.client_id
  from client_users cu
  join clients c on c.id = cu.client_id
  where cu.user_id = auth.uid() and c.status = 'ACTIVE'
$$;

create function public.app_is_assigned(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from client_staff
    where client_id = p_client_id and staff_id = auth.uid()
  )
$$;

create function public.app_can_view_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c
    where c.id = p_client_id
      and c.firm_id = public.app_user_firm()
      and (
        public.app_is_admin()
        or (public.app_user_role() = 'STAFF'  and public.app_is_assigned(c.id))
        or (public.app_user_role() = 'CLIENT' and c.id = public.app_client_id())
      )
  )
$$;

create function public.task_status_label(s public.task_status) returns text
language sql immutable as $$
  select case s
    when 'TODO' then 'To do'
    when 'IN_PROGRESS' then 'In progress'
    when 'WAITING_FOR_CLIENT' then 'Waiting for client'
    when 'UNDER_REVIEW' then 'Under review'
    when 'COMPLETED' then 'Completed'
    when 'CANCELLED' then 'Cancelled'
  end
$$;

-- Internal: write an activity entry as the current user.
create function public.app_log(
  p_client_id uuid, p_entity_type text, p_entity_id uuid,
  p_action text, p_description text, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into activity_logs (firm_id, user_id, client_id, entity_type, entity_id, action, description, metadata)
  values (public.app_user_firm(), auth.uid(), p_client_id, p_entity_type, p_entity_id, p_action, p_description, p_metadata)
$$;

-- ---------------------------------------------------------------------
-- Row Level Security — read policies only
-- ---------------------------------------------------------------------
alter table public.firms          enable row level security;
alter table public.users          enable row level security;
alter table public.clients        enable row level security;
alter table public.client_users   enable row level security;
alter table public.client_staff   enable row level security;
alter table public.services       enable row level security;
alter table public.tasks          enable row level security;
alter table public.activity_logs  enable row level security;

create policy firms_select on public.firms for select to authenticated
  using (id = public.app_user_firm());

-- Everyone can read their own row (needed for the password-change flow).
-- Admins read everyone in the firm; staff read other internal users only.
create policy users_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or (
      firm_id = public.app_user_firm()
      and (public.app_is_admin() or (public.app_user_role() = 'STAFF' and role <> 'CLIENT'))
    )
  );

create policy clients_select on public.clients for select to authenticated
  using (public.app_can_view_client(id));

create policy client_users_select on public.client_users for select to authenticated
  using (user_id = auth.uid() or (public.app_is_admin() and public.app_can_view_client(client_id)));

create policy client_staff_select on public.client_staff for select to authenticated
  using (public.app_user_role() in ('ADMIN', 'STAFF') and public.app_can_view_client(client_id));

create policy services_select on public.services for select to authenticated
  using (true);

create policy tasks_select on public.tasks for select to authenticated
  using (
    firm_id = public.app_user_firm()
    and (
      public.app_is_admin()
      or (public.app_user_role() = 'STAFF' and (assigned_to = auth.uid() or public.app_is_assigned(client_id)))
      or (public.app_user_role() = 'CLIENT' and client_id = public.app_client_id())
    )
  );

create policy activity_select on public.activity_logs for select to authenticated
  using (
    firm_id = public.app_user_firm()
    and (
      public.app_is_admin()
      or (public.app_user_role() = 'STAFF'
          and ((client_id is not null and public.app_is_assigned(client_id)) or user_id = auth.uid()))
      or (public.app_user_role() = 'CLIENT'
          and client_id = public.app_client_id()
          and action in ('CLIENT_CREATED', 'TASK_CREATED', 'TASK_STATUS_CHANGED'))
    )
  );

-- ---------------------------------------------------------------------
-- Business operations (RPC). Each runs as one transaction.
-- Error messages are written for end users; the app shows them as-is.
-- ---------------------------------------------------------------------

create function public.create_client(
  p_name text, p_email text, p_phone text, p_pan text, p_gstin text, p_business_type text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can add clients';
  end if;
  insert into clients (firm_id, name, email, phone, pan, gstin, business_type)
  values (public.app_user_firm(), trim(p_name), lower(trim(p_email)),
          nullif(trim(p_phone), ''), nullif(upper(trim(p_pan)), ''),
          nullif(upper(trim(p_gstin)), ''), nullif(trim(p_business_type), ''))
  returning id into v_id;
  perform public.app_log(v_id, 'client', v_id, 'CLIENT_CREATED', format('Created client %s', trim(p_name)));
  return v_id;
exception when unique_violation then
  raise exception 'A client with this email already exists';
end $$;

create function public.update_client(
  p_client_id uuid, p_name text, p_email text, p_phone text, p_pan text, p_gstin text, p_business_type text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_old clients;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can edit clients';
  end if;
  select * into v_old from clients where id = p_client_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Client not found';
  end if;
  update clients set
    name = trim(p_name),
    email = lower(trim(p_email)),
    phone = nullif(trim(p_phone), ''),
    pan = nullif(upper(trim(p_pan)), ''),
    gstin = nullif(upper(trim(p_gstin)), ''),
    business_type = nullif(trim(p_business_type), ''),
    updated_at = now()
  where id = p_client_id;
  perform public.app_log(p_client_id, 'client', p_client_id, 'CLIENT_UPDATED',
    format('Updated details of %s', trim(p_name)),
    jsonb_build_object('old', to_jsonb(v_old) - 'created_at' - 'updated_at'));
exception when unique_violation then
  raise exception 'A client with this email already exists';
end $$;

create function public.set_client_active(p_client_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_client clients;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can change client status';
  end if;
  select * into v_client from clients where id = p_client_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Client not found';
  end if;
  update clients set status = case when p_active then 'ACTIVE' else 'INACTIVE' end::client_status, updated_at = now()
  where id = p_client_id;
  -- the client's portal logins follow the client's status
  update users set is_active = p_active, updated_at = now()
  where id in (select user_id from client_users where client_id = p_client_id);
  perform public.app_log(p_client_id, 'client', p_client_id,
    case when p_active then 'CLIENT_REACTIVATED' else 'CLIENT_DEACTIVATED' end,
    format('%s client %s', case when p_active then 'Reactivated' else 'Deactivated' end, v_client.name));
end $$;

create function public.set_staff_active(p_user_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_user users;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can change staff status';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own status';
  end if;
  select * into v_user from users
  where id = p_user_id and firm_id = public.app_user_firm() and role = 'STAFF' for update;
  if not found then
    raise exception 'Staff member not found';
  end if;
  update users set is_active = p_active, updated_at = now() where id = p_user_id;
  perform public.app_log(null, 'user', p_user_id,
    case when p_active then 'USER_REACTIVATED' else 'USER_DEACTIVATED' end,
    format('%s staff member %s', case when p_active then 'Reactivated' else 'Deactivated' end, v_user.name));
end $$;

create function public.assign_staff(p_client_id uuid, p_staff_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_client clients; v_staff users;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can assign staff';
  end if;
  select * into v_client from clients
  where id = p_client_id and firm_id = public.app_user_firm() and status = 'ACTIVE';
  if not found then
    raise exception 'Client not found or inactive';
  end if;
  select * into v_staff from users
  where id = p_staff_id and firm_id = public.app_user_firm() and role = 'STAFF' and is_active;
  if not found then
    raise exception 'Staff member not found or inactive';
  end if;
  insert into client_staff (client_id, staff_id, assigned_by)
  values (p_client_id, p_staff_id, auth.uid())
  on conflict do nothing;
  if found then
    perform public.app_log(p_client_id, 'client', p_client_id, 'STAFF_ASSIGNED',
      format('Assigned %s to %s', v_staff.name, v_client.name), jsonb_build_object('staff_id', p_staff_id));
  end if;
end $$;

create function public.unassign_staff(p_client_id uuid, p_staff_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_client clients; v_staff users; v_open int;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can remove staff';
  end if;
  select * into v_client from clients where id = p_client_id and firm_id = public.app_user_firm();
  select * into v_staff from users where id = p_staff_id and firm_id = public.app_user_firm();
  if v_client.id is null or v_staff.id is null then
    raise exception 'Assignment not found';
  end if;
  select count(*) into v_open from tasks
  where client_id = p_client_id and assigned_to = p_staff_id
    and status not in ('COMPLETED', 'CANCELLED');
  if v_open > 0 then
    raise exception '% has % open task(s) for this client. Reassign them first.', v_staff.name, v_open;
  end if;
  delete from client_staff where client_id = p_client_id and staff_id = p_staff_id;
  if found then
    perform public.app_log(p_client_id, 'client', p_client_id, 'STAFF_UNASSIGNED',
      format('Removed %s from %s', v_staff.name, v_client.name), jsonb_build_object('staff_id', p_staff_id));
  end if;
end $$;

create function public.create_task(
  p_client_id uuid, p_service_id uuid, p_title text, p_financial_year text, p_period text,
  p_due_date timestamptz, p_priority public.task_priority, p_assigned_to uuid,
  p_requires_review boolean, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_client clients; v_id uuid; v_assignee text;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can create tasks';
  end if;
  select * into v_client from clients where id = p_client_id and firm_id = public.app_user_firm();
  if not found then
    raise exception 'Client not found';
  end if;
  if v_client.status <> 'ACTIVE' then
    raise exception 'This client is inactive';
  end if;
  if p_assigned_to is not null then
    select u.name into v_assignee
    from client_staff cs join users u on u.id = cs.staff_id
    where cs.client_id = p_client_id and cs.staff_id = p_assigned_to and u.is_active;
    if v_assignee is null then
      raise exception 'That staff member is not assigned to this client';
    end if;
  end if;

  insert into tasks (firm_id, client_id, service_id, financial_year, period, title, description,
                     assigned_to, priority, requires_review, due_date, created_by)
  values (v_client.firm_id, p_client_id, p_service_id, p_financial_year, trim(p_period), trim(p_title),
          nullif(trim(p_description), ''), p_assigned_to, p_priority, p_requires_review, p_due_date, auth.uid())
  returning id into v_id;

  perform public.app_log(p_client_id, 'task', v_id, 'TASK_CREATED',
    format('Created task "%s"', trim(p_title)) || coalesce(format(' and assigned it to %s', v_assignee), ''),
    jsonb_build_object('assigned_to', p_assigned_to));
  return v_id;
end $$;

create function public.reassign_task(p_task_id uuid, p_assigned_to uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_task tasks; v_old text; v_new text;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can reassign tasks';
  end if;
  select * into v_task from tasks where id = p_task_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if v_task.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Finished tasks cannot be reassigned';
  end if;
  if v_task.assigned_to is not distinct from p_assigned_to then
    return;
  end if;
  if p_assigned_to is not null then
    select u.name into v_new
    from client_staff cs join users u on u.id = cs.staff_id
    where cs.client_id = v_task.client_id and cs.staff_id = p_assigned_to and u.is_active;
    if v_new is null then
      raise exception 'That staff member is not assigned to this client';
    end if;
  end if;
  select name into v_old from users where id = v_task.assigned_to;

  update tasks set assigned_to = p_assigned_to, updated_at = now() where id = p_task_id;
  perform public.app_log(v_task.client_id, 'task', p_task_id, 'TASK_ASSIGNED',
    format('Reassigned "%s": %s to %s', v_task.title, coalesce(v_old, 'Unassigned'), coalesce(v_new, 'Unassigned')),
    jsonb_build_object('old_assignee', v_task.assigned_to, 'new_assignee', p_assigned_to));
end $$;

create function public.change_task_status(p_task_id uuid, p_status public.task_status) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
  v_role user_role := public.app_user_role();
  v_move text;
begin
  select * into v_task from tasks where id = p_task_id and firm_id = public.app_user_firm() for update;
  if not found or v_role is null or v_role = 'CLIENT' then
    raise exception 'You do not have permission to change this task';
  end if;
  if v_role = 'STAFF' and v_task.assigned_to is distinct from auth.uid() then
    raise exception 'Only the assigned staff member can change this task';
  end if;

  v_move := v_task.status::text || '>' || p_status::text;
  if not v_move = any (array[
    'TODO>IN_PROGRESS', 'TODO>CANCELLED',
    'IN_PROGRESS>WAITING_FOR_CLIENT', 'IN_PROGRESS>UNDER_REVIEW', 'IN_PROGRESS>COMPLETED', 'IN_PROGRESS>CANCELLED',
    'WAITING_FOR_CLIENT>IN_PROGRESS', 'WAITING_FOR_CLIENT>CANCELLED',
    'UNDER_REVIEW>COMPLETED', 'UNDER_REVIEW>IN_PROGRESS', 'UNDER_REVIEW>CANCELLED'
  ]) then
    raise exception 'A task cannot move from % to %', public.task_status_label(v_task.status), public.task_status_label(p_status);
  end if;

  if v_role = 'STAFF' then
    if p_status = 'CANCELLED' then
      raise exception 'Only the CA can cancel tasks';
    end if;
    if v_task.status = 'UNDER_REVIEW' then
      raise exception 'Only the CA can approve or return reviewed work';
    end if;
    if v_move = 'IN_PROGRESS>COMPLETED' and v_task.requires_review then
      raise exception 'This task needs CA review. Submit it for review instead.';
    end if;
  end if;

  update tasks set
    status = p_status,
    updated_at = now(),
    started_at = case when p_status = 'IN_PROGRESS' then coalesce(started_at, now()) else started_at end,
    completed_at = case when p_status = 'COMPLETED' then now() else completed_at end
  where id = p_task_id;

  perform public.app_log(v_task.client_id, 'task', p_task_id, 'TASK_STATUS_CHANGED',
    format('Changed "%s" from %s to %s', v_task.title,
           public.task_status_label(v_task.status), public.task_status_label(p_status)),
    jsonb_build_object('old_status', v_task.status, 'new_status', p_status));
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

revoke execute on function public.app_log(uuid, text, uuid, text, text, jsonb) from authenticated;

grant execute on function
  public.app_user_firm(), public.app_user_role(), public.app_is_admin(), public.app_client_id(),
  public.app_is_assigned(uuid), public.app_can_view_client(uuid), public.task_status_label(public.task_status),
  public.create_client(text, text, text, text, text, text),
  public.update_client(uuid, text, text, text, text, text, text),
  public.set_client_active(uuid, boolean),
  public.set_staff_active(uuid, boolean),
  public.assign_staff(uuid, uuid),
  public.unassign_staff(uuid, uuid),
  public.create_task(uuid, uuid, text, text, text, timestamptz, public.task_priority, uuid, boolean, text),
  public.reassign_task(uuid, uuid),
  public.change_task_status(uuid, public.task_status)
to authenticated;

-- Direct table writes are not allowed for signed-in users (no policies),
-- but remove the grants too so intent is explicit.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
