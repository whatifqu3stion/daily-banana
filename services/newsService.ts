// services/newsService.ts
import { NewsStory } from '../types';

const RSS_FEED_URL = 'https://feeds.npr.org/1001/rss.xml';
// Using corsproxy.io as a more reliable CORS proxy.
const PROXY_URL = `https://corsproxy.io/?${encodeURIComponent(RSS_FEED_URL)}`;

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
            throw new Error(`Failed to fetch news feed. Status: ${response.status}`);
        }
        
        const xmlString = await response.text();

        if (!xmlString) {
            throw new Error("Proxy did not return content from the news feed.");
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        
        const errorNode = xmlDoc.querySelector("parsererror");
        if (errorNode) {
            console.error("XML Parsing Error:", errorNode.textContent);
            throw new Error("Failed to parse the news feed XML.");
        }

        const items = Array.from(xmlDoc.querySelectorAll("item")).slice(0, 10);
        
        const stories: NewsStory[] = items.map(item => {
            const title = item.querySelector("title")?.textContent?.trim() || 'Untitled Story';
            
            // Look for description, with a fallback to content:encoded for wider RSS compatibility.
            const rawDescription = item.querySelector("description")?.textContent?.trim() 
                                || item.querySelector("content\\:encoded")?.textContent?.trim() 
                                || 'No description available.';
            
            const description = cleanAndDecodeHtml(rawDescription);

            return { title, description };
        });

        if (stories.length === 0) {
            throw new Error("No news stories were found in the feed.");
        }

        return stories;

    } catch (error: any) {
        console.error("Error fetching or parsing news stories:", error);
        if (error.name === 'AbortError') {
             throw new Error("The request for news stories timed out. Please try again.");
        }
        throw new Error("Could not fetch top stories. Please try again later or enter a topic manually.");
    } finally {
        clearTimeout(timeoutId);
    }
};