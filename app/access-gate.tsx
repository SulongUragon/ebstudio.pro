"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type GateState = "checking" | "locked" | "unlocked" | "not-configured";

/**
 * Asks for the owner's access code once per browser before the AI tools can be
 * used. The code is checked on the server and remembered in an HttpOnly cookie.
 */
export default function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/access", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { configured?: boolean; unlocked?: boolean }) => {
        if (!active) return;
        setState(data.unlocked ? "unlocked" : data.configured === false ? "not-configured" : "locked");
      })
      // If the check itself fails, let the app load; the API still enforces access.
      .catch(() => active && setState("unlocked"));
    return () => {
      active = false;
    };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That access code is not right.");
      setCode("");
      setState("unlocked");
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "That access code is not right.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "unlocked") return <>{children}</>;

  return (
    <main className="access-gate">
      <section aria-labelledby="access-gate-title">
        {state === "checking" ? (
          <LoaderCircle className="spin" size={22} aria-label="Checking access" />
        ) : (
          <>
            <LockKeyhole size={22} />
            <h1 id="access-gate-title">EB Studio Pro</h1>
            {state === "not-configured" ? (
              <p>The AI tools are locked until the owner sets APP_ACCESS_CODE in the hosting settings.</p>
            ) : (
              <form onSubmit={unlock}>
                <label htmlFor="access-code">Access code</label>
                <input
                  id="access-code"
                  type="password"
                  autoComplete="current-password"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={submitting}
                  autoFocus
                />
                <button type="submit" disabled={submitting || !code.trim()}>
                  {submitting ? <LoaderCircle className="spin" size={16} /> : null}
                  {submitting ? "Checking" : "Unlock"}
                </button>
                {error ? <p className="access-gate-error" role="alert">{error}</p> : null}
                <p className="access-gate-note">Entered once per browser. It stays unlocked for 180 days.</p>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
