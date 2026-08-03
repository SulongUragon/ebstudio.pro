# EB Studio Pro

EB Studio Pro is an AI ebook creation suite for generating complete fiction and
non-fiction books chapter by chapter. Authors can preview the finished book and
export a KDP production package with a Kindle Create DOCX, reflowable EPUB,
1600 × 2560 JPEG cover, PDF reference copy, and upload guide.

## Features

- Fiction and non-fiction creation modes
- Structured introduction, chapters, and conclusion
- OpenAI generation with optional Anthropic fallback
- Chapter-by-chapter progress and preview
- KDP preflight status before EPUB and package export
- Kindle Create-ready DOCX with semantic chapter headings, true italics, and linked Contents
- Reflowable EPUB 3 with HTML TOC, logical navigation, NCX fallback, metadata, and internal cover declaration
- Separate 1600 × 2560 KDP marketing cover JPEG
- Complete KDP ZIP package plus PDF reference copy and upload guide
- Responsive interface for desktop and mobile

## Local setup

1. Install Node.js 22 or newer.
2. Install dependencies with `npm ci`.
3. Copy `.env.example` to `.env.local`.
4. Add at least one AI provider key.
5. Start the development server with `npm run dev`.

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
```

Never commit real API keys.

## Vercel

Import this repository in Vercel and add the same environment variables under
Project Settings. The included `vercel.json` runs the standard Next.js
production build.

## Cloudflare domain

After Vercel accepts the custom domain, add the DNS records provided by Vercel
to the domain's Cloudflare DNS zone. Keep SSL/TLS encryption set to Full.

## Technology

Next.js, React, TypeScript, OpenAI Responses API, Anthropic Messages API,
JSZip, jsPDF, and DOCX.
