"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const emailSchema = z.string().trim().toLowerCase().email();

/** Where the emailed link should land: the configured site, else the host that made this request. */
async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address." } };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Rate limits are the one failure worth telling the person about.
  if (error?.status === 429) {
    return { error: "Too many requests. Wait a few minutes and try again." };
  }
  if (error) console.error("resetPasswordForEmail:", error.message);

  // Same answer whether or not the address has an account, so this page
  // can't be used to find out who is a client of the firm.
  return {
    ok: true,
    message: "If that email belongs to an account, a reset link is on its way. It works for one hour.",
  };
}
