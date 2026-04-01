// services/newsService.ts
import { GoogleGenAI } from "@google/genai";
import { NewsStory } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Fetches today's top news headlines using the Gemini API with Google Search grounding.
 * This approach is far more reliable than CORS proxies since the search happens
 * server-side via the Gemini API, with no third-party proxy dependencies.
 */
export const getTopStories = async (): Promise<NewsStory[]> => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `Today is ${today}. Use Google Search to find the top 10 news headlines from today.

Focus on: politics, government, business, science, technology, international affairs, and cultural events.
Avoid: sports scores, celebrity gossip, and purely local crime stories.

Return your answer as a valid JSON array only, with no other text before or after it.
Each item must have exactly two fields: "title" (a concise headline, max 120 characters) and "description" (a one-sentence summary, max 200 characters).

Example format:
[
  {"title": "Congress Passes Major Climate Bill", "description": "Legislators approved sweeping new emissions targets in a bipartisan vote late Thursday."},
  {"title": "Tech Giant Reports Record Profits", "description": "A major Silicon Valley company announced quarterly earnings that far exceeded analyst expectations."}
]`;

    const result = await ai.models.generateContent({
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

    return stories;
};
