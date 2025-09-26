// services/newsService.ts
import { NewsStory } from '../types';

const RSS_FEED_URL = 'https://feeds.npr.org/1001/rss.xml';

// A list of public CORS proxies. We'll try them all and use the first one that works.
const PROXY_URLS = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(RSS_FEED_URL)}`,
    `https://corsproxy.io/?${encodeURIComponent(RSS_FEED_URL)}`,
    `https://proxy.cors.sh/${RSS_FEED_URL}`,
    `https://cors-anywhere.ai-studio-collab.com/${RSS_FEED_URL}`,
];

// FIX: Add a polyfill for `Promise.any` to support environments where it's not available.
// This resolves the "Property 'any' does not exist on type 'PromiseConstructor'" error
// by providing a compatible implementation.
function promiseAny<T>(promises: Array<Promise<T>>): Promise<T> {
  return new Promise((resolve, reject) => {
    let hasResolved = false;
    let rejectedCount = 0;
    const errors: any[] = [];
    const totalPromises = promises.length;

    if (totalPromises === 0) {
      const err = new Error('All promises were rejected');
      (err as any).errors = [];
      return reject(err);
    }

    promises.forEach((promise, index) => {
      promise.then(value => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(value);
        }
      }).catch(error => {
        if (hasResolved) return; // another promise already resolved
        errors[index] = error;
        rejectedCount++;
        if (rejectedCount === totalPromises) {
          const err = new Error("All promises were rejected");
          (err as any).errors = errors;
          reject(err);
        }
      });
    });
  });
}

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
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout for the entire operation

    const fetchPromises = PROXY_URLS.map(url =>
        fetch(url, { signal: controller.signal })
            .then(response => {
                if (!response.ok) {
                    // Throw an error to signal that this promise should be rejected by Promise.any
                    throw new Error(`Proxy ${url} failed with status: ${response.status}`);
                }
                return response.text();
            })
    );

    try {
        // Promise.any resolves with the value of the first promise that fulfills.
        const text = await promiseAny(fetchPromises);
        
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
        // If Promise.any fails, it means all proxies failed.
        console.error("All CORS proxies failed:", error);
        throw new Error('Failed to fetch news feed from all available sources. Please try again later.');
    } finally {
        clearTimeout(timeoutId);
    }
};