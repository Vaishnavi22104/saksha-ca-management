-- ---------------------------------------------------------------------
-- Deleting an uploaded version.
--
-- A practice management system lives on its audit trail, so this is
-- deliberately narrow:
--   * a version the CA has ACCEPTED can never be deleted — it is part of
--     the record of the engagement;
--   * the CA (ADMIN) may delete any other version;
--   * anyone else may delete only a version they uploaded themselves;
--   * the deletion itself is written to the activity log.
--
-- The stored object is removed by the server with the service-role key
-- afterwards, so no delete policy is added to storage.objects: nobody
-- can remove a file straight from the bucket.
-- ---------------------------------------------------------------------
create or replace function public.delete_document(p_document_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_doc     documents;
  v_req     document_requests;
  v_who     text;
  v_newest  documents;
  v_left    int;
begin
  select * into v_doc from documents
  where id = p_document_id and firm_id = public.app_user_firm() for update;
  if not found or not public.app_can_view_client(v_doc.client_id) then
    raise exception 'Document not found';
  end if;

  if v_doc.status = 'ACCEPTED' then
    raise exception 'An accepted document cannot be deleted. It is part of the record.';
  end if;

  if not public.app_is_admin() and v_doc.uploaded_by <> auth.uid() then
    raise exception 'You can only delete a file you uploaded yourself';
  end if;

  select * into v_req from document_requests where id = v_doc.request_id for update;
  if v_req.status = 'CANCELLED' then
    raise exception 'This request was cancelled';
  end if;

  delete from documents where id = p_document_id;

  -- The request's status has to follow whatever is left behind.
  select count(*) into v_left from documents where request_id = v_doc.request_id;

  if v_left = 0 then
    update document_requests
    set status = 'REQUESTED', rejection_reason = null, updated_at = now()
    where id = v_doc.request_id;
  else
    select * into v_newest from documents
    where request_id = v_doc.request_id
    order by version desc limit 1;

    -- A version that was only superseded by the one just removed is
    -- live again, and goes back in front of the CA for review.
    if v_newest.status = 'SUPERSEDED' then
      update documents set status = 'UPLOADED' where id = v_newest.id;
      update document_requests
      set status = 'UPLOADED', rejection_reason = null, updated_at = now()
      where id = v_doc.request_id;
    else
      update document_requests set
        status = case v_newest.status
                   when 'ACCEPTED' then 'ACCEPTED'
                   when 'REJECTED' then 'REJECTED'
                   else 'UPLOADED'
                 end::document_request_status,
        rejection_reason = v_newest.rejection_reason,
        updated_at = now()
      where id = v_doc.request_id;
    end if;
  end if;

  select name into v_who from users where id = auth.uid();
  perform public.app_log(v_doc.client_id, 'document_request', v_doc.request_id, 'DOCUMENT_DELETED',
    format('%s deleted version %s of "%s"', coalesce(v_who, 'Someone'), v_doc.version, v_req.title),
    jsonb_build_object('version', v_doc.version, 'file_name', v_doc.file_name));

  -- Handed back so the server can remove the object from the bucket.
  return v_doc.storage_path;
end $$;

grant execute on function public.delete_document(uuid) to authenticated;

-- A client who deletes their own upload should see that on their
-- timeline, so the whitelist of actions they may read gains one entry.
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
                         'DOCUMENT_REQUESTED', 'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED',
                         'DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED', 'DOCUMENT_REQUEST_CANCELLED'))
    )
  );
