-- =====================================================================
-- CA Office OS — Migration 4: Client portal messaging
--
-- One thread per client: the CA firm on one side, the client on the
-- other. A message can optionally point at the task it is about.
--
-- Deliberately NOT built (plan §45): attachments, reactions, threads,
-- read receipts, group chats. Files go through document requests.
-- =====================================================================

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references public.firms (id),
  client_id   uuid not null,
  task_id     uuid references public.tasks (id),
  sender_id   uuid not null references public.users (id),
  message     text not null check (length(trim(message)) > 0 and length(message) <= 2000),
  created_at  timestamptz not null default now(),
  constraint messages_client_same_firm foreign key (client_id, firm_id) references public.clients (id, firm_id)
);
create index messages_client_created_idx on public.messages (client_id, created_at);
create index messages_task_idx on public.messages (task_id);

-- A sent message is a record of what was said: never edited, never deleted.
create function public.prevent_message_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Messages cannot be edited or deleted';
end $$;

create trigger messages_immutable
  before update or delete on public.messages
  for each row execute function public.prevent_message_change();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.messages enable row level security;

create policy messages_select on public.messages for select to authenticated
  using (firm_id = public.app_user_firm() and public.app_can_view_client(client_id));

-- ---------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------
create function public.send_message(
  p_client_id uuid, p_message text, p_task_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_client clients; v_role user_role := public.app_user_role(); v_id uuid; v_text text;
begin
  if v_role is null then
    raise exception 'You do not have permission to send messages';
  end if;
  if not public.app_can_view_client(p_client_id) then
    raise exception 'Client not found';
  end if;

  select * into v_client from clients where id = p_client_id and firm_id = public.app_user_firm();
  if not found then
    raise exception 'Client not found';
  end if;
  if v_client.status <> 'ACTIVE' then
    raise exception 'This client is inactive';
  end if;

  v_text := trim(p_message);
  if length(v_text) = 0 then
    raise exception 'Write a message first';
  end if;
  if length(v_text) > 2000 then
    raise exception 'Messages are limited to 2000 characters';
  end if;

  -- A linked task must belong to the same client, whoever is writing.
  if p_task_id is not null and not exists (
    select 1 from tasks where id = p_task_id and client_id = p_client_id
  ) then
    raise exception 'That task does not belong to this client';
  end if;

  insert into messages (firm_id, client_id, task_id, sender_id, message)
  values (v_client.firm_id, p_client_id, p_task_id, auth.uid(), v_text)
  returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
grant execute on function public.send_message(uuid, text, uuid) to authenticated;

revoke insert, update, delete on all tables in schema public from anon, authenticated;
