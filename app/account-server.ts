import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account sign-in runs on Supabase. The project URL and publishable key are
 * public by design (row level security protects the data), so the browser
 * receives them from /api/account at run time instead of at build time.
 */
export type SupabasePublicConfig = { url: string; publishableKey: string };

export type AccountState = {
  configured: boolean;
  signedIn: boolean;
  approved: boolean;
  email: string | null;
};

export function supabasePublicConfig(): SupabasePublicConfig | null {
  const url = (process.env.SUPABASE_URL?.trim() ?? "").replace(/\/+$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !publishableKey) return null;
  return { url, publishableKey };
}

/** A Supabase client acting as the user whose session cookies came with the request. */
export function supabaseForRequest(request: Request, config = supabasePublicConfig()): SupabaseClient | null {
  if (!config) return null;
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      // The browser refreshes the session and rewrites its own cookies.
      setAll() {},
    },
  });
}

/** Who is signed in on this request, and whether the owner approved them to use the AI tools. */
export async function accountForRequest(request: Request): Promise<AccountState> {
  const supabase = supabaseForRequest(request);
  if (!supabase) return { configured: false, signedIn: false, approved: false, email: null };

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { configured: true, signedIn: false, approved: false, email: null };
    const { data: profile } = await supabase
      .from("profiles")
      .select("approved")
      .eq("id", data.user.id)
      .maybeSingle();
    return {
      configured: true,
      signedIn: true,
      approved: profile?.approved === true,
      email: data.user.email ?? null,
    };
  } catch {
    return { configured: true, signedIn: false, approved: false, email: null };
  }
}
