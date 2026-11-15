import type { Metadata } from "next";
import { ContactLink, LegalPage } from "../legal";

export const metadata: Metadata = { title: "Privacy Policy | EB Studio Pro" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        EB Studio Pro helps you write, design, and export books. This page explains what we collect, why, and the
        choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> Your email address. If you sign in with Google, we also receive the name
          and profile picture on your Google account. We do not receive your Google password.
        </li>
        <li>
          <strong>Your work.</strong> The books and projects you create: briefs, outlines, chapters, notes, writing
          voice samples, covers, and images.
        </li>
        <li>
          <strong>Sign-in cookies.</strong> Small cookies that keep you signed in. We do not use advertising or
          tracking cookies.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and keep your library in sync across your devices.</li>
        <li>To generate text and images when you ask for them.</li>
        <li>To keep the service secure and working.</li>
      </ul>
      <p>We do not sell your information, and we do not use it for advertising.</p>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <strong>Supabase</strong> stores your account and your library on servers in the United States.
        </li>
        <li>
          <strong>Vercel</strong> hosts the app.
        </li>
        <li>
          <strong>AI providers.</strong> When you generate or revise text or images, the content needed for that
          request is sent to the provider that does the work: OpenAI, Anthropic, Moonshot AI (Kimi), or Cloudflare
          Workers AI. Each provider handles it under its own policies.
        </li>
        <li>
          <strong>Google</strong>, only if you choose to sign in with Google.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Delete any book from your library at any time.</li>
        <li>
          To delete your account and everything in it, or to get a copy of your data, email <ContactLink />. We
          handle requests within 30 days.
        </li>
        <li>Signing out removes the offline copy of your library from that device. Your account copy stays.</li>
      </ul>

      <h2>Children</h2>
      <p>EB Studio Pro is not meant for children under 13, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we will update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>
        Questions: <ContactLink />
      </p>
    </LegalPage>
  );
}
