import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EB Studio Pro | AI Ebook Generator",
  description:
    "AI Ebook Creation Suite for complete fiction and non-fiction books with EPUB, PDF, and DOCX export.",
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
