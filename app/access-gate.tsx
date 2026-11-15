"use client";

import { LoaderCircle, LockKeyhole, LogOut, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { clearDeviceLibrary, deviceOwner, setDeviceOwner, syncDeviceLibraryNow } from "./device-library";
import { browserSupabase, loadAccount, type AccountInfo } from "./supabase-browser";

/** Pages anyone can open without signing in (Google checks these links). */
const PUBLIC_PATHS = new Set(["/privacy", "/terms"]);

type GateState = "checking" | "sign-in" | "access-code" | "not-configured" | "ready";

/**
 * Accounts first: the app opens once the user is signed in, and their library
 * follows them to every device. When accounts are not set up on a deployment,
 * the owner access code still guards the AI tools.
 */
export default function AccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC_PATHS.has(pathname ?? "")) return <>{children}</>;
  return <AccountGate>{children}</AccountGate>;
}

function AccountGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        // Finishing a Google or email-link sign-in happens inside browserSupabase().auth.
        const supabase = await browserSupabase();
        if (supabase) {
          const params = new URLSearchParams(window.location.search);
          const { data } = await supabase.auth.getSession();
          if (params.has("code") || params.has("error_description")) {
            window.history.replaceState(null, "", window.location.pathname + window.location.hash);
          }
          const userId = data.session?.user.id;
          if (userId) {
            const owner = deviceOwner();
            // Another account used this browser before: start clean so their books stay theirs.
            if (owner && owner !== userId) await clearDeviceLibrary();
            setDeviceOwner(userId);
          }
        }
        // Always ask again: the session cookies may have just been written.
        const info = await loadAccount(true);
        if (!active) return;
        setAccount(info);
        if (info.supabase) setState(info.signedIn ? "ready" : "sign-in");
        else if (info.accessCode.unlocked) setState("ready");
        else setState(info.accessCode.configured ? "access-code" : "not-configured");
      } catch {
        // If the check itself fails, let the app load; the API still enforces access.
        if (active) setState("ready");
      }
    }

    void check();
    let unsubscribe = () => {};
    void browserSupabase().then((supabase) => {
      if (!supabase || !active) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") void check();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (state === "ready") {
    return (
      <>
        {children}
        {account?.signedIn ? <AccountChip email={account.email} approved={account.approved} /> : null}
      </>
    );
  }

  return (
    <main className="access-gate">
      <section aria-labelledby="access-gate-title">
        {state === "checking" ? (
          <LoaderCircle className="spin" size={22} aria-label="Checking your account" />
        ) : (
          <>
            <LockKeyhole size={22} />
            <h1 id="access-gate-title">EB Studio Pro</h1>
            {state === "sign-in" ? (
              <SignInForm />
            ) : state === "access-code" ? (
              <AccessCodeForm onUnlocked={() => setState("ready")} />
            ) : (
              <p>The AI tools are locked until the owner sets up accounts in the hosting settings.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState<"" | "email" | "google">("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("error_description") ?? "";
  });

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || sending) return;
    setSending("email");
    setError("");
    try {
      const supabase = await browserSupabase();
      if (!supabase) throw new Error("Sign-in is not available right now.");
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: window.location.origin },
      });
      if (signInError) throw signInError;
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The sign-in link could not be sent.");
    } finally {
      setSending("");
    }
  }

  async function google() {
    if (sending) return;
    setSending("google");
    setError("");
    try {
      const supabase = await browserSupabase();
      if (!supabase) throw new Error("Sign-in is not available right now.");
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (signInError) throw signInError;
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "Google sign-in could not start.");
      setSending("");
    }
  }

  if (sent) {
    return (
      <div className="access-gate-sent" role="status">
        <Mail size={20} />
        <p>
          Check <strong>{email.trim()}</strong> for your sign-in link. Open it on this device and your library
          opens here.
        </p>
        <button type="button" className="access-gate-link" onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="access-gate-signin">
      <p className="access-gate-note">Sign in once. Your books follow you to every computer and phone.</p>
      <button type="button" className="access-gate-google" onClick={google} disabled={Boolean(sending)}>
        {sending === "google" ? <LoaderCircle className="spin" size={16} /> : <UserRound size={16} />}
        Continue with Google
      </button>
      <div className="access-gate-divider"><span>or</span></div>
      <form onSubmit={sendLink}>
        <label htmlFor="account-email">Email</label>
        <input
          id="account-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={Boolean(sending)}
          placeholder="you@example.com"
        />
        <button type="submit" disabled={Boolean(sending) || !email.trim()}>
          {sending === "email" ? <LoaderCircle className="spin" size={16} /> : <Mail size={16} />}
          {sending === "email" ? "Sending" : "Email me a sign-in link"}
        </button>
      </form>
      {error ? <p className="access-gate-error" role="alert">{error}</p> : null}
      <p className="access-gate-legal">
        By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}

function AccessCodeForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      onUnlocked();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "That access code is not right.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
  );
}

function AccountChip({ email, approved }: { email: string | null; approved: boolean }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setMessage("");
    try {
      const synced = await syncDeviceLibraryNow().catch(() => false);
      if (
        !synced &&
        !window.confirm(
          "Some books on this device could not reach your account just now. Sign out anyway? Their offline copies on this device will be removed.",
        )
      ) {
        setMessage("Still signed in. Check your connection and try again.");
        return;
      }
      await clearDeviceLibrary();
      const supabase = await browserSupabase();
      await supabase?.auth.signOut();
      window.location.reload();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className={`account-chip${open ? " open" : ""}`}>
      <button type="button" className="account-chip-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <UserRound size={15} />
        <span>{email ?? "Signed in"}</span>
      </button>
      {open ? (
        <div className="account-chip-menu">
          <p>{approved ? "AI tools on. Your library syncs to this account." : "Your library syncs to this account. AI tools need owner approval."}</p>
          <button type="button" onClick={signOut} disabled={signingOut}>
            {signingOut ? <LoaderCircle className="spin" size={14} /> : <LogOut size={14} />}
            {signingOut ? "Saving and signing out" : "Sign out"}
          </button>
          {message ? <p className="account-chip-message" role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
