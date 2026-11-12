import { ACCESS_COOKIE, accessToken } from "../../app/api-access";

export const TEST_ACCESS_CODE = "test-access-code";

/** Sets the access code for this test process and returns a Request carrying a valid cookie. */
export async function authorizedRequest(url: string, init: RequestInit = {}) {
  process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
  const headers = new Headers(init.headers);
  headers.set("cookie", `${ACCESS_COOKIE}=${await accessToken(TEST_ACCESS_CODE)}`);
  return new Request(url, { ...init, headers });
}
