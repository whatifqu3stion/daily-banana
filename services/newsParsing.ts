import type { GenerateContentResponse } from '@google/genai';
import type { NewsSource, NewsStory } from '../types';
import { newsError } from './newsErrors';

export function validNewsSource(value: unknown): NewsSource | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (typeof source.url !== 'string' || source.url.length > 2048 || typeof source.title !== 'string') return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { url: url.href, title: source.title.trim().slice(0, 180) || url.hostname };
  } catch { return null; }
}

export function normalizeNewsStories(value: unknown): NewsStory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const stories: NewsStory[] = [];
  for (const item of value) {
    if (!item || typeof item.title !== 'string' || typeof item.description !== 'string') continue;
    const title = item.title.replace(/\s+/g, ' ').trim().slice(0, 120);
    const description = item.description.replace(/\s+/g, ' ').trim().slice(0, 500);
    const identity = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const sources: NewsSource[] = Array.isArray(item.sources)
      ? item.sources.map(validNewsSource).filter((source: NewsSource | null): source is NewsSource => source !== null) : [];
    const uniqueSources = sources.filter((source, index) => sources.findIndex(other => other.url === source.url) === index).slice(0, 4);
    if (!identity || !description || !uniqueSources.length || seen.has(identity)) continue;
    seen.add(identity);
    stories.push({ title, description, sources: uniqueSources });
    if (stories.length === 10) break;
  }
  return stories;
}

// Locate balanced JSON without greedily consuming citation brackets or brackets
// inside quoted descriptions. Keep item spans for per-story citation attribution.
function extractNewsItems(text: string): { value: Record<string, unknown>; start: number; end: number }[] {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '[') continue;
    let quoted = false, escaped = false, depth = 0, objectStart = -1;
    const spans: { start: number; end: number }[] = [];
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{' || char === '[') {
        if (char === '{' && depth === 1) objectStart = end;
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        if (char === '}' && depth === 1 && objectStart >= 0) {
          spans.push({ start: objectStart, end: end + 1 });
          objectStart = -1;
        }
        if (depth === 0) {
          try {
            const parsed: unknown = JSON.parse(text.slice(start, end + 1));
            if (Array.isArray(parsed) && (parsed.length === 0 || spans.length > 0)) {
              return spans.map(span => ({ ...span, value: JSON.parse(text.slice(span.start, span.end)) }));
            }
          } catch { /* Try the next balanced array, never manufacture stories. */ }
          break;
        }
      }
    }
  }
  throw newsError('format', 'Google returned unreadable headlines', 'The news response could not be read safely. Try again; no incomplete stories were saved.');
}

export function parseGroundedNews(result: GenerateContentResponse): { stories: NewsStory[]; searchSuggestions?: string } {
  const candidate = result.candidates?.[0];
  if (result.promptFeedback?.blockReason || ['SAFETY', 'RECITATION'].includes(candidate?.finishReason || '')) {
    throw newsError('blocked', 'Google declined this news search', 'Try another lookup or use your own topic. No headlines were saved.', null);
  }
  const metadata = candidate?.groundingMetadata;
  const sources = (metadata?.groundingChunks || []).slice(0, 50).map(chunk => validNewsSource({
    url: chunk.web?.uri, title: chunk.web?.title || '',
  }));
  if (!sources.some(Boolean)) {
    throw newsError('grounding', 'Could not verify the news sources', 'Google did not return usable search sources. Try again; unsourced headlines will not be shown as current news.');
  }
  let offset = 0;
  const fragments = (candidate?.content?.parts || []).map((part, index) => {
    const text = part.thought ? '' : part.text || '';
    const fragment = { index, text, offset, bytes: new TextEncoder().encode(text) };
    offset += text.length;
    return fragment;
  });
  const text = fragments.map(fragment => fragment.text).join('');
  if (text.length > 50_000) throw newsError('format', 'News response was too large', 'Google returned an unexpectedly large response. Try again; no headlines were saved.');
  const items = extractNewsItems(text);
  const stories = items.map(item => {
    const indices = new Set<number>();
    for (const support of metadata?.groundingSupports || []) {
      const fragment = fragments.find(fragment => fragment.index === (support.segment?.partIndex ?? 0));
      if (!fragment) continue;
      const segment = support.segment;
      // Grounding offsets are UTF-8 bytes within a Part, not JS character indices.
      const start = fragment.offset + new TextDecoder().decode(fragment.bytes.slice(0, segment?.startIndex ?? 0)).length;
      const end = fragment.offset + new TextDecoder().decode(fragment.bytes.slice(0, segment?.endIndex ?? 0)).length;
      if (start < item.end && end > item.start) {
        for (const index of support.groundingChunkIndices || []) indices.add(index);
      }
    }
    // Explicit URLs are accepted only when they also occur in Google metadata.
    if (Array.isArray(item.value.source_urls)) {
      for (const url of item.value.source_urls) {
        const index = sources.findIndex(source => source?.url === url);
        if (index >= 0) indices.add(index);
      }
    }
    return { ...item.value, sources: [...indices].map(index => sources[index]).filter(Boolean) };
  });
  const normalized = normalizeNewsStories(stories);
  if (!normalized.length) {
    throw newsError('empty', 'No usable sourced headlines found', 'Google did not return readable, source-backed stories for this lookup. Try again, or start with your own idea.');
  }
  const html = metadata?.searchEntryPoint?.renderedContent;
  return { stories: normalized, searchSuggestions: typeof html === 'string' && html.length <= 100_000 ? html : undefined };
}
