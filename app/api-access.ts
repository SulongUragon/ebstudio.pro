/**
 * Owner access code for the endpoints that spend the OpenAI, Anthropic, and
 * Moonshot API keys. The code lives only in the APP_ACCESS_CODE environment
 * variable; the browser keeps an HttpOnly cookie holding an HMAC of it, never
 * the code itself.
 */
import { accountForRequest } from "./account-server";

export const ACCESS_COOKIE = "eb_access";
export const ACCESS_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;
const TOKEN_CONTEXT = "eb-studio-pro-api-access-v1";

function configuredCode() {
  return process.env.APP_ACCESS_CODE?.trim() ?? "";
}

export function accessConfigured() {
  return configuredCode().length > 0;
}

async function hmacHex(key: string, message: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Comparison that takes the same time whether the first or last character differs. */
export function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function accessToken(code = configuredCode()) {
  return hmacHex(code, TOKEN_CONTEXT);
}

export async function codeMatches(candidate: string) {
  const code = configuredCode();
  if (!code) return false;
  // Compare HMACs so the comparison length never reveals the code length.
  return safeEqual(await hmacHex(TOKEN_CONTEXT, candidate.trim()), await hmacHex(TOKEN_CONTEXT, code));
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function hasApiAccess(request: Request) {
  if (!accessConfigured()) return false;
  const cookie = readCookie(request, ACCESS_COOKIE);
  return cookie.length > 0 && safeEqual(cookie, await accessToken());
}

/**
 * Returns a Response to send back when the request may not use the API keys,
 * or null when it may continue. A signed-in account the owner approved may
 * continue; so may a browser unlocked with the owner access code.
 */
export async function denyWithoutApiAccess(request: Request): Promise<Response | null> {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json(
      { error: "Requests from other sites are not allowed.", code: "cross_site_blocked" },
      { status: 403 },
    );
  }
  if (await hasApiAccess(request)) return null;

  const account = await accountForRequest(request);
  if (account.approved) return null;
  if (account.signedIn) {
    return Response.json(
      {
        error: "Your account is signed in but not approved for the AI tools yet. Your books still sync to your account.",
        code: "account_not_approved",
      },
      { status: 403 },
    );
  }
  if (account.configured) {
    return Response.json(
      { error: "Sign in to your EB Studio Pro account to continue.", code: "sign_in_required" },
      { status: 401 },
    );
  }
  if (!accessConfigured()) {
    console.error("Neither accounts nor APP_ACCESS_CODE are set; AI endpoints are locked.");
    return Response.json(
      {
        error: "EB Studio Pro is locked until the owner sets up accounts or APP_ACCESS_CODE in the hosting settings.",
        code: "access_not_configured",
      },
      { status: 503 },
    );
  }
  return Response.json(
    { error: "Enter your EB Studio Pro access code to continue.", code: "access_required" },
    { status: 401 },
  );
}

export function accessCookieHeader(token: string, secure: boolean) {
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${ACCESS_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearAccessCookieHeader(secure: boolean) {
  return [`${ACCESS_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax", secure ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
}
