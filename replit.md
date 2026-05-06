# The Daily Banana - AI Comic Generator

## Overview
An AI-powered web application that generates satirical, newspaper-style comic strips based on user-provided topics, stances, and news stories. Uses Google's Gemini AI for both scripting and generating panel illustrations.

## Tech Stack
- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS (via CDN in dev, CDN in prod)
- **AI:** Google Gemini (`gemini-2.5-flash` for text, `gemini-3.1-flash-image-preview` for images)
- **Image Export:** html-to-image
- **News:** Google Search grounding via Gemini API (cached in localStorage per day)

## Project Structure
```
/
├── App.tsx              # Main app entry and state orchestrator
├── index.tsx            # React DOM root
├── index.html           # HTML template (Tailwind CDN, importmap, Google Fonts)
├── types.ts             # Shared TypeScript interfaces
├── constants.ts         # Illustration style options
├── vite.config.ts       # Vite config (port 5000, host 0.0.0.0, allowedHosts: true)
├── components/          # UI components (ComicForm, ComicStrip, Panel, etc.)
├── services/            # API services (geminiService, newsService)
├── hooks/               # useComicGeneration custom hook
└── utils/               # fileUtils, layoutAdapter
```

## Environment Variables
- `GEMINI_API_KEY` (secret) — Google Gemini API key, required for AI features

## Running the App
```bash
npm install
npm run dev   # Starts on http://0.0.0.0:5000
npm run build # Vite production build → dist/
```

## Image Pricing
Hard-coded in `constants.ts` (`pricePerImage`). Estimates shown in the UI are based on Google's published rates as of May 2026 — verify at https://ai.google.dev/gemini-api/docs/pricing if needed.

## Deployment
- **Type:** Static site
- **Build:** `npm run build` → outputs to `dist/`
- Deployed via Replit static deployment

## Key Features
- Topic + stance input with news integration from NPR RSS
- Story swiping UI to select preferred comic narrative
- AI-generated panel illustrations with comedic-role-aware named layout templates
- Editable comic text and draggable elements
- Export comic as image

## Layout System (`utils/layoutAdapter.ts`)
Replaces the old generic row-packer with curated named templates chosen by reading
`comedic_role` and `size` from the AI plan. Templates per panel count:

| Count | Template | Layout | Trigger |
|---|---|---|---|
| 1 | `single` | 6-col 16:9 | always |
| 2 | `split` | 3+3 sq | default |
| 2 | `feature-left` | 4+2 sq | panel 0 establish+large |
| 2 | `feature-right` | 2+4 sq | panel 1 punchline+large |
| 3 | `triplet` | 2+2+2 sq | default |
| 3 | `cinematic-open-3` | 6 (16:9) / 3+3 sq | panel 0 establish+large |
| 3 | `wide-punchline-3` | 3+3 sq / 6 (16:9) | panel 2 punchline+large |
| 4 | `quad-equal` | 3+3 / 3+3 sq | default |
| 4 | `cinematic-open-4` | 6 (16:9) / 2+2+2 sq | panel 0 establish+large |
| 4 | `wide-punchline-4` | 2+2+2 sq / 6 (16:9) | panel 3 punchline+large |

`AspectRatio` type (`'1:1' | '16:9' | '4:3' | '9:16'`) lives in `types.ts`.
Only full-width (col-span-6) panels get 16:9 — avoids row-height mismatches.
`Panel.tsx` renders the aspect ratio via Tailwind class or inline `aspect-ratio` style.
