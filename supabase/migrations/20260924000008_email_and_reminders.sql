-- =====================================================================
-- SAKSHA — Migration 8: Email notifications and due-date reminders
--
-- Notifications already exist (migration 5). This adds:
--   * notifications.emailed_at   - when a notification went out by email
--   * users.email_notifications  - each person can switch email off
--   * reminders_sent             - so a reminder goes out once per day
--   * send_due_reminders()       - creates "due soon" and "overdue"
--                                  notifications; called once a day by
--                                  the app's /api/cron/notify route
--
-- Safe to run more than once.
-- =====================================================================

alter table public.notifications
  add column if not exists emailed_at timestamptz;

-- Everything that exists today predates email, so it is never sent.
update public.notifications set emailed_at = now() where emailed_at is null;

create index if not exists notifications_unemailed_idx
  on public.notifications (created_at) where emailed_at is null;

alter table public.users
  add column if not exists email_notifications boolean not null default true;

-- One row per reminder per day. No policies on purpose: only the server's
-- service role ever touches this table.
create table if not exists public.reminders_sent (
  entity_type text not null check (entity_type in ('task', 'document_request')),
  entity_id   uuid not null,
  sent_on     date not null,
  primary key (entity_type, entity_id, sent_on)
);
alter table public.reminders_sent enable row level security;

-- ---------------------------------------------------------------------
-- Reminders
--   Tasks:     open, assigned, due within 24 hours or already overdue
--              (but not more than 30 days overdue) -> the assignee
--   Documents: still owed by the client on the same terms -> the client
-- A given task or request is reminded at most once per day (India time).
-- ---------------------------------------------------------------------
create or replace function public.send_due_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_watcher uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_count integer := 0;
begin
  for r in
    select t.id, t.firm_id, t.title, t.period, t.assigned_to, t.due_date, c.name as client_name
    from tasks t join clients c on c.id = t.client_id
    where t.status not in ('COMPLETED', 'CANCELLED')
      and t.assigned_to is not null
      and c.status = 'ACTIVE'
      and t.due_date <= now() + interval '24 hours'
      and t.due_date > now() - interval '30 days'
  loop
    insert into reminders_sent (entity_type, entity_id, sent_on) values ('task', r.id, v_today)
      on conflict do nothing;
    if found then
      perform public.app_notify(
        r.assigned_to, r.firm_id,
        case when r.due_date < now() then 'Task overdue' else 'Task due soon' end,
        format('%s — %s (%s) %s %s', r.client_name, r.title, r.period,
               case when r.due_date < now() then 'was due' else 'is due' end,
               to_char(r.due_date at time zone 'Asia/Kolkata', 'DD Mon')),
        'task', r.id);
      v_count := v_count + 1;
    end if;
  end loop;

  for r in
    select d.id, d.firm_id, d.client_id, d.title, d.due_date
    from document_requests d join clients c on c.id = d.client_id
    where d.status in ('REQUESTED', 'REJECTED')
      and d.due_date is not null
      and c.status = 'ACTIVE'
      and d.due_date <= now() + interval '24 hours'
      and d.due_date > now() - interval '30 days'
  loop
    insert into reminders_sent (entity_type, entity_id, sent_on) values ('document_request', r.id, v_today)
      on conflict do nothing;
    if found then
      for v_watcher in select * from public.app_client_watchers(r.client_id) loop
        perform public.app_notify(
          v_watcher, r.firm_id,
          case when r.due_date < now() then 'Document overdue' else 'Document due soon' end,
          format('"%s" %s %s', r.title,
                 case when r.due_date < now() then 'was due' else 'is due' end,
                 to_char(r.due_date at time zone 'Asia/Kolkata', 'DD Mon')),
          'document_request', r.id);
      end loop;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;

-- Only the server (service role) may run it; signed-in users may not.
revoke all on function public.send_due_reminders() from public, anon, authenticated;
grant execute on function public.send_due_reminders() to service_role;
