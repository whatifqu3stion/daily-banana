export function newsParams(now, signal, timeout) {
  return {
    model: 'gemini-2.5-flash',
    contents: `Use Google Search to find up to 10 recent news headlines reported in the past 24 hours.
Current time (UTC): ${new Date(now).toISOString()}.
Focus on politics, government, business, science, technology, international affairs and cultural events.
Avoid sports scores, celebrity gossip and purely local crime. Prefer original reporting and identifiable publishers.
Only include claims supported by the search results. Do not invent events, statistics, quotes, sources or dates.
Return fewer than 10 if there are not enough usable, recent, distinct stories.
Return a JSON array, optionally in a JSON code fence, with these fields per story:
"title": a concise headline (at most 120 characters);
"description": 2-3 factual sentences (at most 500 characters), with a specific detail where supported;
"source_urls": URLs of actual search results supporting this story.
Do not include any unsourced story. Attribute each story's claims to its sources.`,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1, abortSignal: signal,
      httpOptions: { timeout, retryOptions: { attempts: 1 } } },
  };
}

