"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountState, SupabasePublicConfig } from "./account-server";

export type AccountInfo = AccountState & {
  supabase: SupabasePublicConfig | null;
  accessCode: { configured: boolean; unlocked: boolean };
};

let accountRequest: Promise<AccountInfo> | null = null;
let client: SupabaseClient | null = null;

/** Account state from the server. Cached for the page; pass fresh=true after signing in or out. */
export function loadAccount(fresh = false): Promise<AccountInfo> {
  if (!accountRequest || fresh) {
    accountRequest = fetch("/api/account", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Account status could not be checked.");
      return (await response.json()) as AccountInfo;
    });
    accountRequest.catch(() => {
      accountRequest = null;
    });
  }
  return accountRequest;
}

/** The browser Supabase client, or null when accounts are not set up on this deployment. */
export async function browserSupabase(): Promise<SupabaseClient | null> {
  if (client) return client;
  const account = await loadAccount();
  if (!account.supabase) return null;
  // Session cookies let the API routes see who is signed in.
  client = createBrowserClient(account.supabase.url, account.supabase.publishableKey);
  return client;
}
