// services/newsService.ts
import { NewsStory } from '../types';

const RSS_FEED_URL = 'https://feeds.npr.org/1001/rss.xml';
// FIX: Switched to a different CORS proxy to resolve "Failed to fetch" errors.
const PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(RSS_FEED_URL)}`;

/**
 * A client-side utility to strip HTML tags and then decode any leftover HTML entities.
 * This is a browser-only implementation that uses a textarea element for reliable decoding.
 * @param html The raw string from the RSS feed.
 * @returns A clean, human-readable string.
 */
const cleanAndDecodeHtml = (html: string): string => {
    // First, strip out any HTML tags
    const noTags = html.replace(/<[^>]*>?/gm, '');
    // Then, use the browser's built-in capabilities to decode entities like &amp; or &#8217;
    const ta = document.createElement('textarea');
    ta.innerHTML = noTags;
    return ta.value;
};

export const getTopStories = async (): Promise<NewsStory[]> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

    try {
        const response = await fetch(PROXY_URL, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Failed to fetch news feed. Status: ${response.statusText}`);
        }
        
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');

        const parseError = xml.querySelector('parsererror');
        if (parseError) {
            console.error('XML Parsing Error:', parseError.textContent);
            throw new Error('Failed to parse the news feed. The format may be invalid.');
        }
        
        const items = Array.from(xml.querySelectorAll('item'));
        const stories: NewsStory[] = items.slice(0, 10).map(item => { // Limit to 10 stories
            const title = item.querySelector('title')?.textContent || 'No Title';
            const description = item.querySelector('description')?.textContent || 'No Description';
            return {
                title: cleanAndDecodeHtml(title),
                description: cleanAndDecodeHtml(description),
            };
        });

        if (stories.length === 0) {
            throw new Error('No news stories found in the feed.');
        }

        return stories;

    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('The request for news stories timed out.');
        }
        // Re-throw other errors, including the custom ones from above
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};