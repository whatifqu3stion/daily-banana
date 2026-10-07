// services/newsService.ts
// Fetches today's top news headlines using Gemini with Google Search grounding.
// Results are cached in localStorage keyed by calendar date so repeated opens
// of the NewsSelector within the same day reuse one API call. Concurrent
// callers share a single in-flight promise (inflightRequest deduplication).
import { NewsStory } from '../types';

let aiPromise: Promise<import('@google/genai').GoogleGenAI> | null = null;

const getAi = () => {
    aiPromise ??= import('@google/genai').then(
        ({ GoogleGenAI }) => new GoogleGenAI({ apiKey: process.env.API_KEY })
    );
    return aiPromise;
};

const CACHE_KEY = 'dailyBanana_news';

interface NewsCache {
    date: string;
    stories: NewsStory[];
}

function todayKey(): string {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function loadCache(): NewsStory[] | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cache: NewsCache = JSON.parse(raw);
        if (cache.date === todayKey() && Array.isArray(cache.stories) && cache.stories.length > 0) {
            return cache.stories;
        }
    } catch {
        // ignore corrupt cache
    }
    return null;
}

function saveCache(stories: NewsStory[]): void {
    try {
        const cache: NewsCache = { date: todayKey(), stories };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // ignore storage errors (e.g. private mode quota)
    }
}

// Deduplicates concurrent callers — if two calls arrive before the first
// resolves (e.g. idle prefetch races a manual open), only one API request is made.
let inflightRequest: Promise<NewsStory[]> | null = null;

/**
 * Fetches today's top news headlines using the Gemini API with Google Search grounding.
 * Results are cached in localStorage for the rest of the calendar day to avoid
 * redundant API calls.
 */
export const getTopStories = async (): Promise<NewsStory[]> => {
    const cached = loadCache();
    if (cached) return cached;

    if (inflightRequest) return inflightRequest;

    inflightRequest = (async () => {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const prompt = `Today is ${today}. Use Google Search to find the top 10 news headlines from today.

Focus on: politics, government, business, science, technology, international affairs, and cultural events.
Avoid: sports scores, celebrity gossip, and purely local crime stories.

Return your answer as a valid JSON array only, with no other text before or after it.
Each item must have exactly two fields:
- "title": a concise headline, max 120 characters
- "description": 2-3 sentences (max 500 characters) that include at least one of the following if the story contains it: a specific dollar figure or statistic, a named individual or organisation and what they said or did, or a short direct quote (max 15 words). The goal is to give enough concrete detail that a satirist could write a joke grounded in a real fact — not just a vague summary.

Example format:
[
  {"title": "Congress Passes Major Climate Bill", "description": "The Senate approved sweeping new emissions targets in an 87-12 bipartisan vote late Thursday, the largest climate package since 2022. The bill mandates a 40% reduction in industrial emissions by 2035 and allocates $180 billion for clean energy infrastructure."},
  {"title": "Tech Giant Reports Record Profits", "description": "A major Silicon Valley firm posted $34.2 billion in quarterly profit, up 28% year-on-year, even as it announced 6,000 layoffs earlier in the month. CEO Jensen Huang called the results 'a testament to disciplined cost management.'"}
]`;

        const result = await (await getAi()).models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.1,
            }
        });

        const text = result.text?.trim() ?? '';

        // Extract the JSON array from the response (handles cases where the model adds extra text)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error("Gemini news response did not contain a JSON array:", text);
            throw new Error("Could not parse news headlines from the AI response.");
        }

        let stories: NewsStory[];
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                throw new Error("Parsed result is not a non-empty array.");
            }
            stories = parsed
                .filter((item: any) => typeof item?.title === 'string' && typeof item?.description === 'string')
                .slice(0, 10)
                .map((item: any) => ({
                    title: item.title.trim(),
                    description: item.description.trim(),
                }));
        } catch (e) {
            console.error("Failed to parse news JSON:", e, "\nRaw text:", text);
            throw new Error("The AI returned an unexpected format for the news headlines.");
        }

        if (stories.length === 0) {
            throw new Error("No usable news stories were returned. Please try again.");
        }

        saveCache(stories);
        return stories;
    })().finally(() => {
        inflightRequest = null;
    });

    return inflightRequest;
};
