import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Supabase client for the browser. It carries the signed-in user's
 * session, so Row Level Security applies exactly as it does on the
 * server. Used for uploading files straight to storage, which keeps
 * large files out of the server action body.
 */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
