/**
 * Turns an OpenAI Images API failure into the real reason, so the author sees
 * "credits are used up" instead of a vague "busy or usage limit" message.
 */
export type OpenAIImageErrorPayload = {
  error?: { message?: string; code?: string | null; type?: string | null };
};

export type ImageFailureKind = "credits" | "busy" | "verification" | "access" | "safety" | "timeout" | "other";

export type ImageFailure = {
  kind: ImageFailureKind;
  code: string;
  status: number;
  retryable: boolean;
  message: string;
};

const BILLING_URL = "platform.openai.com > Settings > Billing";

export function classifyOpenAIImageError(status: number, payload: OpenAIImageErrorPayload, subject = "image"): ImageFailure {
  const code = String(payload.error?.code ?? payload.error?.type ?? "").trim();
  const text = `${code} ${payload.error?.type ?? ""} ${payload.error?.message ?? ""}`.toLowerCase();

  if (/insufficient_quota|billing_hard_limit|billing_not_active|exceeded your current quota|check your plan and billing/.test(text)) {
    return {
      kind: "credits",
      code: code || "insufficient_quota",
      status: 402,
      retryable: false,
      message: `OpenAI credits are used up or the spending limit was reached, so the ${subject} could not be generated. Add credits at ${BILLING_URL}, then try again.`,
    };
  }
  if (/verif/.test(text)) {
    return {
      kind: "verification",
      code: code || "organization_verification_required",
      status: 403,
      retryable: false,
      message: "OpenAI requires organization verification before image generation can be used.",
    };
  }
  if (status === 401 || status === 403 || /invalid_api_key|permission|not allowed|model_not_found/.test(text)) {
    return {
      kind: "access",
      code: code || "image_access_denied",
      status: status === 401 ? 401 : 403,
      retryable: false,
      message: "OpenAI image generation is not enabled for this API key or project.",
    };
  }
  if (status === 400 && /(safety|policy|moderation|violation|rejected|image_generation_user_error)/.test(text)) {
    return {
      kind: "safety",
      code: code || "content_policy",
      status: 400,
      retryable: false,
      message: `OpenAI declined this ${subject} request under its content policy. Adjust the direction and try again.`,
    };
  }
  if (status === 429 || /rate_limit/.test(text)) {
    return {
      kind: "busy",
      code: code || "rate_limit_exceeded",
      status: 429,
      retryable: true,
      message: `OpenAI is busy right now, so the ${subject} could not be generated. Wait a minute, then try again.`,
    };
  }
  if (status === 408 || status === 504 || /timed out|timeout/.test(text)) {
    return {
      kind: "timeout",
      code: code || "timeout",
      status: 504,
      retryable: true,
      message: `OpenAI took too long to return the ${subject}. Try again.`,
    };
  }
  return {
    kind: "other",
    code: code || "image_request_failed",
    status: status >= 400 ? status : 502,
    retryable: status >= 500,
    message: `The ${subject} could not be generated. Your manuscript is safe.`,
  };
}

/** Seconds to wait before one retry: Retry-After when given, otherwise 2, never more than 10. */
export function retryDelayMs(retryAfter: string | null) {
  const seconds = Number(retryAfter);
  return Math.min(10, Number.isFinite(seconds) && seconds > 0 ? seconds : 2) * 1000;
}
