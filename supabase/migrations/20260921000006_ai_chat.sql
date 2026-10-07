-- =====================================================================
-- SAKSHA — Migration 6: AI conversations
--
-- The assistant becomes one chat instead of four forms. Conversations
-- are stored so the CA can come back to them, and so every answer the
-- assistant gave is auditable after the fact.
--
-- A conversation belongs to ONE person. Even another admin in the same
-- firm cannot read it: what you asked the assistant is yours.
-- =====================================================================

create type public.ai_role as enum ('USER', 'ASSISTANT');

create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references public.firms (id),
  user_id     uuid not null references public.users (id),
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ai_conversations (id) on delete cascade,
  user_id          uuid not null references public.users (id),
  role             public.ai_role not null,
  content          text not null check (length(trim(content)) > 0),
  -- which tool produced this answer, and the data it used: this is what
  -- makes an answer checkable weeks later.
  tool             text,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- Row Level Security: your own conversations only
-- ---------------------------------------------------------------------
alter table public.ai_conversations enable row level security;
alter table public.ai_messages      enable row level security;

create policy ai_conversations_select on public.ai_conversations for select to authenticated
  using (user_id = auth.uid() and firm_id = public.app_user_firm());

create policy ai_messages_select on public.ai_messages for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------
create function public.start_ai_conversation(p_title text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can use the assistant';
  end if;

  insert into ai_conversations (firm_id, user_id, title)
  values (public.app_user_firm(), auth.uid(), coalesce(nullif(left(trim(p_title), 80), ''), 'New conversation'))
  returning id into v_id;
  return v_id;
end $$;

create function public.append_ai_message(
  p_conversation_id uuid, p_role public.ai_role, p_content text,
  p_tool text default null, p_meta jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_count int;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can use the assistant';
  end if;
  if not exists (
    select 1 from ai_conversations
    where id = p_conversation_id and user_id = auth.uid() and firm_id = public.app_user_firm()
  ) then
    raise exception 'Conversation not found';
  end if;

  insert into ai_messages (conversation_id, user_id, role, content, tool, meta)
  values (p_conversation_id, auth.uid(), p_role, left(trim(p_content), 8000), p_tool, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;

  -- The first thing you asked becomes the conversation's name.
  select count(*) into v_count from ai_messages where conversation_id = p_conversation_id;
  update ai_conversations set
    updated_at = now(),
    title = case
      when v_count = 1 and p_role = 'USER' then left(trim(p_content), 80)
      else title
    end
  where id = p_conversation_id;

  return v_id;
end $$;

-- Clearing a conversation is a real delete: the CA asked for it to go.
create function public.delete_ai_conversation(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from ai_conversations
  where id = p_conversation_id and user_id = auth.uid() and firm_id = public.app_user_firm();
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
grant execute on function
  public.start_ai_conversation(text),
  public.append_ai_message(uuid, public.ai_role, text, text, jsonb),
  public.delete_ai_conversation(uuid)
to authenticated;

revoke insert, update, delete on all tables in schema public from anon, authenticated;
