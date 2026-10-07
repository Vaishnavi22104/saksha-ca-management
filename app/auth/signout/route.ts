import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get("reason") === "inactive" ? "inactive" : "signedout";
  return NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url), { status: 303 });
}

// POST from the sidebar button; GET is used by server redirects for inactive accounts.
export const POST = signOut;
export const GET = signOut;
