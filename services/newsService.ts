// services/newsService.ts
import { NewsStory } from '../types';

const RSS_FEED_URL = 'https://feeds.npr.org/1001/rss.xml';
// Using corsproxy.io as a more reliable CORS proxy.
const PROXY_URL = `https://corsproxy.io/?${encodeURIComponent(RSS_FEED_URL)}`;

export const getTopStories = async (): Promise<NewsStory[]> => {
    try {
        const response = await fetch(PROXY_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch news feed. Status: ${response.status}`);
        }
        // corsproxy.io returns the raw XML text directly.
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
            const description = item.querySelector("description")?.textContent?.trim() || 'No description available.';
            // Clean up description from HTML tags that often appear in RSS feeds.
            const cleanedDescription = description.replace(/<[^>]*>?/gm, '');

            return { title, description: cleanedDescription };
        });

        if (stories.length === 0) {
            throw new Error("No news stories were found in the feed.");
        }

        return stories;

    } catch (error) {
        console.error("Error fetching or parsing news stories:", error);
        throw new Error("Could not fetch top stories. Please try again later or enter a topic manually.");
    }
};