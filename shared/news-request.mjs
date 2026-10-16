// One budget for both Pages and server transports, plus delivery allowance.
// Initial values to validate against real Google latency, not a latency promise.
export const NEWS_TIMEOUT_MS = 60_000;
export const NEWS_REQUEST_DEADLINE_MS = 75_000;

export function newsParams(now, signal, timeout) {
  return {
    model: 'gemini-2.5-flash',
    contents: `Use Google Search to find up to 10 recent news headlines reported in the past 24 hours.
Current time (UTC): ${new Date(now).toISOString()}.
Aim for an even mix of U.S.-focused and international stories: about five of each when returning ten.
Cover distinct events; do not count the same event in both groups or pad the list to meet that balance.
Focus on politics, government, business, science, technology, international affairs and cultural events.
Avoid sports scores, celebrity gossip and purely local crime. Prefer original reporting and identifiable publishers.
Only include claims supported by the search results. Do not invent events, statistics, quotes, sources or dates.
Return fewer than 10 if there are not enough usable, recent, distinct stories.
Return a JSON array, optionally in a JSON code fence, with these fields per story:
"title": a concise headline (at most 120 characters);
"description": 1-2 factual sentences (at most 350 characters), with a specific detail where supported;
"source_urls": URLs of actual search results supporting this story.
Do not include any unsourced story. Attribute each story's claims to its sources.`,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1,
      thinkingConfig: { thinkingBudget: 1024 }, abortSignal: signal,
      httpOptions: { timeout, retryOptions: { attempts: 1 } } },
  };
}

