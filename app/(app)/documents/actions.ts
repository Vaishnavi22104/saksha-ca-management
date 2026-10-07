"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dueDateFromInput } from "@/lib/format";
import { ALLOWED_LABEL, DOCUMENT_BUCKET, MAX_UPLOAD_BYTES, resolveMimeType, storagePath } from "@/lib/documents";
import { documentRequestSchema, fieldErrors, rejectionSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function createRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN", "STAFF"]);
  const parsed = documentRequestSchema.safeParse({
    client_id: formData.get("client_id"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    task_id: formData.get("task_id"),
    due: formData.get("due"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_document_request", {
    p_client_id: d.client_id,
    p_title: d.title,
    p_description: d.description ?? null,
    p_task_id: d.task_id,
    p_due_date: d.due ? dueDateFromInput(d.due) : null,
  });
  if (error || !id) return { error: friendlyError(error, "The request could not be created.") };

  revalidatePath("/documents");
  redirect(`/documents/${id}`);
}

type OpenRequest = { error?: string; request?: { id: string; client_id: string; status: string } };

/** Checks a request is one this user may still upload to, and returns it. */
async function openRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string,
): Promise<OpenRequest> {
  // RLS: a request the signed-in user may not see simply isn't found.
  const { data } = await supabase
    .from("document_requests")
    .select("id, client_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!data) return { error: "Document request not found." };
  if (data.status === "ACCEPTED") return { error: "This document has already been accepted." };
  if (data.status === "CANCELLED") return { error: "This request was cancelled." };
  return { request: data as { id: string; client_id: string; status: string } };
}

export interface PrepareUpload {
  error?: string;
  /** Where the file goes in the private bucket. */
  path?: string;
  /** Short-lived permission to write exactly that one object. */
  token?: string;
  /** The type the file will be stored as, which may correct the browser's. */
  contentType?: string;
}

/**
 * Step one of an upload: check the file is one we accept, then hand the
 * browser a one-object upload ticket. The file itself never passes
 * through the server, so it is not bound by the server action body
 * limit and a 40 MB scan uploads as happily as a 40 KB one.
 */
export async function prepareUploadAction(input: {
  requestId: string;
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<PrepareUpload> {
  await requireUser(["ADMIN", "STAFF", "CLIENT"]);

  if (!input.size) return { error: "That file is empty." };
  if (input.size > MAX_UPLOAD_BYTES) return { error: `That file is too large. Allowed: ${ALLOWED_LABEL}.` };
  const contentType = resolveMimeType(input.fileName, input.mimeType);
  if (!contentType) return { error: `That file type isn't accepted. Allowed: ${ALLOWED_LABEL}.` };

  const supabase = await createClient();
  const found = await openRequest(supabase, input.requestId);
  if (found.error || !found.request) return { error: found.error ?? "Document request not found." };

  const path = storagePath(found.request.client_id, input.requestId, contentType);
  // The ticket is issued under the user's own session, so storage RLS
  // decides whether they may write to this client's folder at all.
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error(error);
    return { error: "Storage could not be reached. Please try again." };
  }
  return { path: data.path, token: data.token, contentType };
}

/**
 * Step two: the file is in the bucket, so write the version row. If this
 * fails the stored object is orphaned but unreachable — no row points at
 * it and nobody can list the bucket.
 */
export async function recordUploadAction(input: {
  requestId: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<ActionState> {
  await requireUser(["ADMIN", "STAFF", "CLIENT"]);

  const supabase = await createClient();
  const found = await openRequest(supabase, input.requestId);
  if (found.error || !found.request) return { error: found.error ?? "Document request not found." };

  // The path must be one we would have issued for this very request, so a
  // returned ticket cannot be used to claim somebody else's object.
  if (!input.path.startsWith(`${found.request.client_id}/${input.requestId}/`)) {
    return { error: "That upload does not belong to this request." };
  }

  const { error } = await supabase.rpc("record_document_upload", {
    p_request_id: input.requestId,
    p_storage_path: input.path,
    p_file_name: input.fileName.slice(0, 200),
    p_mime_type: input.mimeType,
    p_size_bytes: input.size,
  });
  if (error) return { error: friendlyError(error, "The upload could not be saved.") };

  revalidatePath("/documents");
  revalidatePath(`/documents/${input.requestId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Uploaded. Your CA will review it." };
}

/**
 * Removes an uploaded version. The database decides who may: an accepted
 * document can never be deleted, the CA may delete anything else, and
 * everyone else only what they uploaded themselves. It hands back the
 * object path so the file can be cleared from the bucket as well —
 * with the service key, because the bucket has no delete policy at all.
 */
export async function deleteDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN", "STAFF", "CLIENT"]);
  const documentId = String(formData.get("document_id") ?? "");
  const requestId = String(formData.get("request_id") ?? "");

  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("delete_document", { p_document_id: documentId });
  if (error) return { error: friendlyError(error, "The file could not be deleted.") };

  if (typeof path === "string" && path) {
    const { error: removeError } = await createAdminClient().storage.from(DOCUMENT_BUCKET).remove([path]);
    // The row is already gone, so a stranded object is invisible to
    // everyone. Worth a log, not worth failing the action.
    if (removeError) console.error("Stored file left behind:", path, removeError);
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${requestId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Deleted." };
}

export async function reviewDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const documentId = String(formData.get("document_id") ?? "");
  const requestId = String(formData.get("request_id") ?? "");
  const accept = String(formData.get("accept")) === "true";

  let reason: string | null = null;
  if (!accept) {
    const parsed = rejectionSchema.safeParse({ reason: formData.get("reason") });
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
    reason = parsed.data.reason;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_document", {
    p_document_id: documentId,
    p_accept: accept,
    p_reason: reason,
  });
  if (error) return { error: friendlyError(error, "The review could not be saved.") };

  revalidatePath("/documents");
  revalidatePath(`/documents/${requestId}`);
  return { ok: true, message: accept ? "Document accepted." : "Rejected. The client can upload a new version." };
}

export async function cancelRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const requestId = String(formData.get("request_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_document_request", { p_request_id: requestId });
  if (error) return { error: friendlyError(error, "The request could not be cancelled.") };

  revalidatePath("/documents");
  revalidatePath(`/documents/${requestId}`);
  return { ok: true, message: "Request cancelled." };
}
