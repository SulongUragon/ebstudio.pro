import {
  accessConfigured,
  accessCookieHeader,
  accessToken,
  clearAccessCookieHeader,
  codeMatches,
  hasApiAccess,
} from "../../api-access";

export const dynamic = "force-dynamic";

function isSecure(request: Request) {
  return new URL(request.url).protocol === "https:";
}

/** Whether this browser is unlocked. Never reveals anything about the code. */
export async function GET(request: Request) {
  return Response.json(
    { configured: accessConfigured(), unlocked: await hasApiAccess(request) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Requests from other sites are not allowed." }, { status: 403 });
  }
  if (!accessConfigured()) {
    return Response.json(
      { error: "Set APP_ACCESS_CODE in the hosting settings first.", code: "access_not_configured" },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const candidate = typeof body.code === "string" ? body.code.slice(0, 200) : "";
  if (!candidate || !(await codeMatches(candidate))) {
    // A short pause makes guessing the code slow.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return Response.json({ error: "That access code is not right.", code: "access_denied" }, { status: 401 });
  }
  return Response.json(
    { unlocked: true },
    { headers: { "Set-Cookie": accessCookieHeader(await accessToken(), isSecure(request)), "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  return Response.json(
    { unlocked: false },
    { headers: { "Set-Cookie": clearAccessCookieHeader(isSecure(request)), "Cache-Control": "no-store" } },
  );
}
