# The Daily Banana - AI Comic Generator

## Overview
An AI-powered web application that generates satirical, newspaper-style comic strips based on user-provided topics, stances, and news stories. Uses Google's Gemini AI for both scripting and generating panel illustrations.

## Tech Stack
- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS (via CDN in dev, CDN in prod)
- **AI:** Google Gemini (`gemini-2.5-flash` for text, `gemini-2.5-flash-image-preview` for images)
- **Image Export:** html-to-image
- **News:** NPR RSS feed via CORS proxies

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
```

## Deployment
- **Type:** Static site
- **Build:** `npm run build` → outputs to `dist/`
- Deployed via Replit static deployment

## Key Features
- Topic + stance input with news integration from NPR RSS
- Story swiping UI to select preferred comic narrative
- AI-generated panel illustrations
- Editable comic text and draggable elements
- Export comic as image
