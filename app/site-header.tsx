"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type SiteHeaderProps = {
  children: ReactNode;
  brandHref?: string;
  onBrandClick?: () => void;
};

export default function SiteHeader({ children, brandHref, onBrandClick }: SiteHeaderProps) {
  const brandArtwork = (
    <span className="brand-lockup">
      <Image
        className="brand-logo brand-logo-header"
        src="/brand/ebstudio-pro-metallic-wordmark-v2.png"
        alt="EBStudioPro — Innovate, Create, Elevate"
        width="2048"
        height="682"
        priority
      />
    </span>
  );

  return (
    <header className="topbar">
      {brandHref ? (
        <Link className="brand" href={brandHref} aria-label="Go to EB Studio Pro">
          {brandArtwork}
        </Link>
      ) : (
        <button className="brand" type="button" onClick={onBrandClick} aria-label="Go to creator">
          {brandArtwork}
        </button>
      )}
      {children}
    </header>
  );
}
