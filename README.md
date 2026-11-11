# EB Studio Pro

EB Studio Pro is an AI ebook creation suite for generating complete fiction and
non-fiction books chapter by chapter. Authors can preview the finished book and
export a KDP production package with a Kindle Create DOCX, reflowable EPUB,
1600 × 2560 JPEG cover, print-ready paperback interior PDF, narration script,
PDF reference copy, and upload guide.

## Features

- Fiction and non-fiction creation modes
- Visual Mini eBook mode with exact 5, 7, or 10-page storyboards
- Comics and Graphic Story mode with 1 to 4 editable panels per page
- Character and palette locking for recurring image consistency
- Separate editable dialogue, captions, sound effects, and text-free AI artwork
- Page-by-page image regeneration plus visual PDF and JPEG page ZIP exports
- Structured introduction, chapters, and conclusion
- OpenAI generation with optional Anthropic and Kimi fallback
- Chapter-by-chapter progress and preview
- KDP preflight status before EPUB and package export
- Kindle Create-ready DOCX with semantic chapter headings, true italics, and linked Contents
- Reflowable EPUB 3 with HTML TOC, logical navigation, NCX fallback, metadata, and internal cover declaration
- Separate 1600 × 2560 KDP marketing cover JPEG
- Print-ready KDP paperback interior PDF in 6 × 9, 5.5 × 8.5, or 5 × 8 in, with
  mirrored margins, a gutter sized to the final page count, chapters opening on
  right-hand pages, running heads, page-numbered Contents, and embedded EB Garamond
- Prompter-style narration script DOCX with one sentence per line, pause cues,
  and runtime estimates at 150 words per minute
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
MOONSHOT_API_KEY=
KIMI_API_BASE=https://api.moonshot.ai/v1
KIMI_MODEL=moonshot-v1-32k
```

Never commit real API keys.

Kimi uses Moonshot's OpenAI-compatible chat completions endpoint. Keep
`KIMI_API_BASE` on the international `.ai` host unless your Moonshot account
uses the China `.cn` platform.

The provider selector applies to writing. AI cover and page artwork still use
the configured OpenAI image service.

## Print fonts

The paperback interior embeds EB Garamond from `public/fonts/eb-garamond`,
licensed under the SIL Open Font License 1.1 (see `OFL.txt` in that folder).
The fonts are fetched only when a paperback is exported.

## Vercel

Import this repository in Vercel and add the same environment variables under
Project Settings. The included `vercel.json` runs the standard Next.js
production build.

## Cloudflare domain

After Vercel accepts the custom domain, add the DNS records provided by Vercel
to the domain's Cloudflare DNS zone. Keep SSL/TLS encryption set to Full.

## Technology

Next.js, React, TypeScript, OpenAI Responses API, Anthropic Messages API, Kimi Chat Completions API,
JSZip, jsPDF, and DOCX.
