import type { Metadata } from "next";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/cinzel/400.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/courier-prime/700.css";
import "@fontsource/great-vibes/400.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/playfair-display/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "EB Studio Pro | AI Ebook Generator",
  description:
    "AI Ebook Creation Suite for long-form books, visual mini ebooks, comics, and graphic stories with publication-ready exports.",
  manifest: "/manifest.webmanifest",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      {
        url: "/brand/ebstudio-pro-favicon-64.png",
        sizes: "64x64",
        type: "image/png",
      },
      {
        url: "/brand/ebstudio-pro-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    shortcut: "/brand/ebstudio-pro-favicon-64.png",
    apple: [
      {
        url: "/brand/ebstudio-pro-apple-touch-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "EB Studio Pro",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
