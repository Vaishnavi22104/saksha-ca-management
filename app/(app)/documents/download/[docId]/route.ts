import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_BUCKET } from "@/lib/documents";

/**
 * Hands out a short-lived signed URL instead of the file itself.
 * Access is decided by Row Level Security on `documents`: a user who may
 * not see the row gets the same "not found" as a wrong id, and the bucket
 * stays private.
 *
 * `?mode=view` signs the URL without a download disposition, so the
 * browser renders the file in place — that is what the preview pane and
 * the "Open" link use. Without it the browser is told to save the file.
 */
export async function GET(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.is_active || user.must_change_password) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { docId } = await params;
  const inline = new URL(request.url).searchParams.get("mode") === "view";

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("storage_path, file_name")
    .eq("id", docId)
    .maybeSingle();
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Five minutes: long enough for a large PDF to finish loading in the
  // viewer, short enough that a copied link is not a way in.
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(
      document.storage_path as string,
      300,
      inline ? undefined : { download: document.file_name as string },
    );
  if (error || !data?.signedUrl) {
    console.error(error);
    return NextResponse.json({ error: "The file could not be opened" }, { status: 500 });
  }

  const response = NextResponse.redirect(data.signedUrl);
  // The signed URL is single-use in spirit; never let a proxy keep it.
  response.headers.set("cache-control", "private, no-store");
  return response;
}
