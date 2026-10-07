-- =====================================================================
-- CA Office OS — Migration 3: Document requests, private uploads,
--                             review and versioning
--
-- Adds:
--   document_requests   what the firm needs from a client
--   documents           each uploaded version of that file
--   storage bucket      "client-documents", private
--
-- Rules (all enforced here, not in the UI):
--   * A rejected request is never re-created. The client uploads
--     version 2 against the SAME request.
--   * Rejecting requires a reason.
--   * Only the newest version can be reviewed, and only once.
--   * Files live in private storage; access follows the same
--     firm / role / assignment rules as every other record.
-- =====================================================================

create type public.document_request_status as enum
  ('REQUESTED', 'UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED');

create type public.document_status as enum
  ('UPLOADED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.document_requests (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references public.firms (id),
  client_id         uuid not null,
  task_id           uuid references public.tasks (id),
  workflow_run_id   uuid,
  financial_year    text check (financial_year is null or financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  period            text,
  title             text not null check (length(trim(title)) > 0),
  description       text,
  due_date          timestamptz,
  status            public.document_request_status not null default 'REQUESTED',
  rejection_reason  text,
  created_by        uuid not null references public.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint document_requests_client_same_firm foreign key (client_id, firm_id) references public.clients (id, firm_id),
  constraint document_requests_run_same_firm foreign key (workflow_run_id, firm_id) references public.workflow_runs (id, firm_id),
  constraint document_requests_id_firm_unique unique (id, firm_id)
);
create index document_requests_firm_idx on public.document_requests (firm_id);
create index document_requests_client_idx on public.document_requests (client_id);
create index document_requests_task_idx on public.document_requests (task_id);

-- A task never collects the same document twice (workflow generation included).
create unique index document_requests_task_title_unique
  on public.document_requests (task_id, lower(trim(title)))
  where task_id is not null and status <> 'CANCELLED';

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references public.firms (id),
  request_id        uuid not null,
  client_id         uuid not null,
  version           int not null check (version > 0),
  file_name         text not null check (length(trim(file_name)) > 0),
  storage_path      text not null unique,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  status            public.document_status not null default 'UPLOADED',
  uploaded_by       uuid not null references public.users (id),
  uploaded_at       timestamptz not null default now(),
  reviewed_by       uuid references public.users (id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  constraint documents_request_same_firm foreign key (request_id, firm_id) references public.document_requests (id, firm_id),
  constraint documents_client_same_firm foreign key (client_id, firm_id) references public.clients (id, firm_id),
  constraint documents_request_version_unique unique (request_id, version)
);
create index documents_request_idx on public.documents (request_id);
create index documents_client_idx on public.documents (client_id);

-- Workflow tasks can point at the request they are waiting for.
alter table public.activity_logs drop constraint activity_logs_entity_type_check;
alter table public.activity_logs add constraint activity_logs_entity_type_check
  check (entity_type in ('client', 'task', 'user', 'workflow', 'workflow_template', 'document_request', 'document'));

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.document_requests enable row level security;
alter table public.documents         enable row level security;

create policy document_requests_select on public.document_requests for select to authenticated
  using (firm_id = public.app_user_firm() and public.app_can_view_client(client_id));

create policy documents_select on public.documents for select to authenticated
  using (firm_id = public.app_user_firm() and public.app_can_view_client(client_id));

-- Clients should see document activity on their own timeline too.
drop policy activity_select on public.activity_logs;
create policy activity_select on public.activity_logs for select to authenticated
  using (
    firm_id = public.app_user_firm()
    and (
      public.app_is_admin()
      or (public.app_user_role() = 'STAFF'
          and ((client_id is not null and public.app_is_assigned(client_id)) or user_id = auth.uid()))
      or (public.app_user_role() = 'CLIENT'
          and client_id = public.app_client_id()
          and action in ('CLIENT_CREATED', 'TASK_CREATED', 'TASK_STATUS_CHANGED',
                         'DOCUMENT_REQUESTED', 'DOCUMENT_UPLOADED',
                         'DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED', 'DOCUMENT_REQUEST_CANCELLED'))
    )
  );

-- ---------------------------------------------------------------------
-- Private storage
-- Paths are <client_id>/<request_id>/<version>-<random>.<ext>, built by
-- the server: never from a user-supplied file name.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents', 'client-documents', false, 52428800,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv', 'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first folder of the object name is the client id. Anything that is
-- not a uuid resolves to NULL, which no policy accepts.
create function public.app_storage_client(p_name text) returns uuid
language plpgsql immutable as $$
declare v_id uuid;
begin
  v_id := (storage.foldername(p_name))[1]::uuid;
  return v_id;
exception when others then
  return null;
end $$;

create policy documents_read on storage.objects for select to authenticated
  using (
    bucket_id = 'client-documents'
    and public.app_can_view_client(public.app_storage_client(name))
  );

create policy documents_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-documents'
    and public.app_can_view_client(public.app_storage_client(name))
  );

-- No update or delete policy: uploaded files are never replaced in place.

-- ---------------------------------------------------------------------
-- Business operations (RPC)
-- ---------------------------------------------------------------------
create function public.create_document_request(
  p_client_id uuid, p_title text, p_description text default null,
  p_task_id uuid default null, p_due_date timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_client clients; v_task tasks; v_id uuid; v_run uuid; v_fy text; v_period text;
begin
  if public.app_user_role() not in ('ADMIN', 'STAFF') then
    raise exception 'Only the firm can request documents';
  end if;
  if not public.app_can_view_client(p_client_id) then
    raise exception 'Client not found';
  end if;
  select * into v_client from clients where id = p_client_id and firm_id = public.app_user_firm();
  if v_client.status <> 'ACTIVE' then
    raise exception 'This client is inactive';
  end if;

  if p_task_id is not null then
    select * into v_task from tasks where id = p_task_id and client_id = p_client_id;
    if not found then
      raise exception 'That task does not belong to this client';
    end if;
    v_run := v_task.workflow_run_id;
    v_fy := v_task.financial_year;
    v_period := v_task.period;
  end if;

  insert into document_requests (firm_id, client_id, task_id, workflow_run_id, financial_year, period,
                                 title, description, due_date, created_by)
  values (v_client.firm_id, p_client_id, p_task_id, v_run, v_fy, v_period,
          trim(p_title), nullif(trim(p_description), ''), p_due_date, auth.uid())
  returning id into v_id;

  perform public.app_log(p_client_id, 'document_request', v_id, 'DOCUMENT_REQUESTED',
    format('Requested "%s" from %s', trim(p_title), v_client.name));
  return v_id;
exception when unique_violation then
  raise exception 'This document has already been requested for that task';
end $$;

-- Called by the server right after the file lands in private storage.
create function public.record_document_upload(
  p_request_id uuid, p_storage_path text, p_file_name text,
  p_mime_type text default null, p_size_bytes bigint default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_req document_requests; v_version int; v_id uuid; v_who text;
begin
  select * into v_req from document_requests
  where id = p_request_id and firm_id = public.app_user_firm() for update;
  if not found or not public.app_can_view_client(v_req.client_id) then
    raise exception 'Document request not found';
  end if;
  if v_req.status = 'CANCELLED' then
    raise exception 'This request was cancelled';
  end if;
  if v_req.status = 'ACCEPTED' then
    raise exception 'This document has already been accepted';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from documents where request_id = p_request_id;

  -- Anything still awaiting review is replaced by this newer version.
  update documents set status = 'SUPERSEDED'
  where request_id = p_request_id and status = 'UPLOADED';

  insert into documents (firm_id, request_id, client_id, version, file_name, storage_path,
                         mime_type, size_bytes, uploaded_by)
  values (v_req.firm_id, p_request_id, v_req.client_id, v_version, left(trim(p_file_name), 200),
          p_storage_path, p_mime_type, p_size_bytes, auth.uid())
  returning id into v_id;

  update document_requests
  set status = 'UPLOADED', rejection_reason = null, updated_at = now()
  where id = p_request_id;

  select name into v_who from users where id = auth.uid();
  perform public.app_log(v_req.client_id, 'document_request', p_request_id, 'DOCUMENT_UPLOADED',
    format('%s uploaded version %s of "%s"', coalesce(v_who, 'Someone'), v_version, v_req.title),
    jsonb_build_object('document_id', v_id, 'version', v_version));
  return v_id;
end $$;

-- Accept or reject the newest uploaded version. Rejection needs a reason.
create function public.review_document(p_document_id uuid, p_accept boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_doc documents; v_req document_requests; v_latest int;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can accept or reject documents';
  end if;
  select * into v_doc from documents where id = p_document_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Document not found';
  end if;
  if v_doc.status <> 'UPLOADED' then
    raise exception 'This version has already been reviewed';
  end if;

  select max(version) into v_latest from documents where request_id = v_doc.request_id;
  if v_doc.version <> v_latest then
    raise exception 'A newer version has been uploaded. Review that one instead.';
  end if;

  if not p_accept and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Give the client a reason for the rejection';
  end if;

  select * into v_req from document_requests where id = v_doc.request_id for update;

  update documents set
    status = case when p_accept then 'ACCEPTED' else 'REJECTED' end::document_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = case when p_accept then null else trim(p_reason) end
  where id = p_document_id;

  update document_requests set
    status = case when p_accept then 'ACCEPTED' else 'REJECTED' end::document_request_status,
    rejection_reason = case when p_accept then null else trim(p_reason) end,
    updated_at = now()
  where id = v_doc.request_id;

  perform public.app_log(v_doc.client_id, 'document_request', v_doc.request_id,
    case when p_accept then 'DOCUMENT_ACCEPTED' else 'DOCUMENT_REJECTED' end,
    case when p_accept
      then format('Accepted version %s of "%s"', v_doc.version, v_req.title)
      else format('Rejected version %s of "%s" — %s', v_doc.version, v_req.title, trim(p_reason))
    end,
    jsonb_build_object('document_id', p_document_id, 'version', v_doc.version));
end $$;

create function public.cancel_document_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_req document_requests;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can cancel a document request';
  end if;
  select * into v_req from document_requests
  where id = p_request_id and firm_id = public.app_user_firm() for update;
  if not found then
    raise exception 'Document request not found';
  end if;
  if v_req.status = 'ACCEPTED' then
    raise exception 'An accepted request cannot be cancelled';
  end if;
  if v_req.status = 'CANCELLED' then
    return;
  end if;

  update document_requests set status = 'CANCELLED', updated_at = now() where id = p_request_id;
  perform public.app_log(v_req.client_id, 'document_request', p_request_id, 'DOCUMENT_REQUEST_CANCELLED',
    format('Cancelled the request for "%s"', v_req.title));
end $$;

-- ---------------------------------------------------------------------
-- Workflow generation now also creates the document requests its
-- template steps asked for (plan §57 and §59).
-- ---------------------------------------------------------------------
create or replace function public.generate_workflow(
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
  v_requests int;
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

  -- One request per step that needs a file, linked to the task it blocks.
  insert into document_requests (firm_id, client_id, task_id, workflow_run_id, financial_year, period,
                                 title, description, due_date, created_by)
  select
    v_client.firm_id, p_client_id, t.id, v_run_id, p_financial_year, trim(p_period),
    t.title, format('Needed for %s (%s)', v_template.name, trim(p_period)), t.due_date, auth.uid()
  from tasks t
  where t.workflow_run_id = v_run_id and t.needs_document;
  get diagnostics v_requests = row_count;

  perform public.app_log(p_client_id, 'workflow', v_run_id, 'WORKFLOW_GENERATED',
    format('Generated %s for %s (%s, %s): %s task(s), %s document request(s)%s',
           v_template.name, v_client.name, trim(p_period), p_financial_year, v_steps, v_requests,
           coalesce(format(', assigned to %s', v_assignee), '')),
    jsonb_build_object('template_id', p_template_id, 'tasks', v_steps, 'requests', v_requests,
                       'duplicate', coalesce(p_allow_duplicate, false)));
  return v_run_id;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on function public.app_storage_client(text) from public, anon;
grant execute on function public.app_storage_client(text) to authenticated;

grant execute on function
  public.create_document_request(uuid, text, text, uuid, timestamptz),
  public.record_document_upload(uuid, text, text, text, bigint),
  public.review_document(uuid, boolean, text),
  public.cancel_document_request(uuid)
to authenticated;

revoke insert, update, delete on all tables in schema public from anon, authenticated;
