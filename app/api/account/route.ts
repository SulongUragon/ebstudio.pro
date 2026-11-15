import { accountForRequest, supabasePublicConfig } from "../../account-server";
import { accessConfigured, hasApiAccess } from "../../api-access";

export const dynamic = "force-dynamic";

/** Sign-in settings for the browser and the current account state. Holds no secrets. */
export async function GET(request: Request) {
  const config = supabasePublicConfig();
  const account = await accountForRequest(request);
  return Response.json(
    {
      ...account,
      supabase: config,
      accessCode: { configured: accessConfigured(), unlocked: await hasApiAccess(request) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
