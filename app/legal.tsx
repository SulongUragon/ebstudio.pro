import Link from "next/link";
import type { ReactNode } from "react";

/** The address shown on the privacy and terms pages for account and data requests. */
export const LEGAL_CONTACT_EMAIL = "support@robanostudio.com";
export const LEGAL_UPDATED = "November 15, 2026";

/** Shared layout for the public legal pages. These pages never need a sign-in. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <article>
        <p className="legal-kicker">EB Studio Pro</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>
        {children}
        <nav className="legal-links" aria-label="Legal">
          <Link href="/">Open EB Studio Pro</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </article>
    </main>
  );
}

export function ContactLink() {
  return <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;
}
