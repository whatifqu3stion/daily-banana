import { newsError } from './news-errors.mjs';

/** @param {unknown} value
 * @returns {import('../types').NewsSource | null} */
export function validNewsSource(value) {
  if (!value || typeof value !== 'object') return null;
  const source = /** @type {Record<string, unknown>} */ (value);
  if (typeof source.url !== 'string' || source.url.length > 2048 || typeof source.title !== 'string') return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { url: url.href, title: source.title.trim().slice(0, 180) || url.hostname };
  } catch { return null; }
}

/** @param {unknown} value
 * @returns {import('../types').NewsStory[]} */
export function normalizeNewsStories(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const stories = [];
  for (const item of value.slice(0, 100)) {
    if (!item || typeof item.title !== 'string' || typeof item.description !== 'string') continue;
    const title = item.title.replace(/\s+/g, ' ').trim().slice(0, 120);
    const description = item.description.replace(/\s+/g, ' ').trim().slice(0, 500);
    const identity = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const sources = Array.isArray(item.sources) ? item.sources.slice(0, 50).map(validNewsSource).filter(Boolean) : [];
    const uniqueSources = sources.filter((source, index) => sources.findIndex(other => other.url === source.url) === index).slice(0, 4);
    if (!identity || !description || !uniqueSources.length || seen.has(identity)) continue;
    seen.add(identity);
    stories.push({ title, description, sources: uniqueSources });
    if (stories.length === 10) break;
  }
  return stories;
}

// Bounded balanced-JSON extraction preserves item spans for citations.
function extractNewsItems(text) {
  let candidates = 0;
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '[') continue;
    if (++candidates > 100) break;
    let quoted = false, escaped = false, depth = 0, objectStart = -1;
    const spans = [];
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
            const parsed = JSON.parse(text.slice(start, end + 1));
            if (Array.isArray(parsed) && (parsed.length === 0 || spans.length > 0)) {
              return spans.slice(0, 100).map(span => ({ ...span, value: JSON.parse(text.slice(span.start, span.end)) }));
            }
          } catch { /* Try the next array; never manufacture stories. */ }
          break;
        }
      }
    }
  }
  throw newsError('format', 'Google returned unreadable headlines', 'The news response could not be read safely. Try again; no incomplete stories were saved.');
}

/** @param {import('@google/genai').GenerateContentResponse} result
 * @returns {{stories: import('../types').NewsStory[], searchSuggestions?: string}} */
export function parseGroundedNews(result) {
  const candidate = result?.candidates?.[0];
  if (result?.promptFeedback?.blockReason || ['SAFETY', 'RECITATION'].includes(candidate?.finishReason || '')) {
    throw newsError('blocked', 'Google declined this news search', 'Try another lookup or use your own topic. No headlines were saved.', null);
  }
  const metadata = candidate?.groundingMetadata;
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const sources = chunks.slice(0, 50).map(chunk => validNewsSource({ url: chunk?.web?.uri, title: chunk?.web?.title || '' }));
  if (!sources.some(Boolean)) throw newsError('grounding', 'Could not verify the news sources', 'Google did not return usable search sources. Try again; unsourced headlines will not be shown as current news.');
  let offset = 0;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const fragments = parts.slice(0, 100).map((part, index) => {
    const text = part?.thought || typeof part?.text !== 'string' ? '' : part.text;
    if (text.length + offset > 50_000) throw newsError('format', 'News response was too large', 'Google returned an unexpectedly large response. No headlines were saved.');
    const fragment = { index, text, offset, bytes: new TextEncoder().encode(text) };
    offset += text.length;
    return fragment;
  });
  const items = extractNewsItems(fragments.map(fragment => fragment.text).join(''));
  const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports.slice(0, 500) : [];
  const stories = items.map(item => {
    const indices = new Set();
    for (const support of supports) {
      const fragment = fragments.find(fragment => fragment.index === (support?.segment?.partIndex ?? 0));
      const segment = support?.segment;
      if (!fragment || !Number.isInteger(segment?.startIndex ?? 0) || !Number.isInteger(segment?.endIndex) ||
          segment.endIndex <= (segment.startIndex ?? 0) || (segment.startIndex ?? 0) < 0 || segment.endIndex > fragment.bytes.length) continue;
      // Google offsets are UTF-8 bytes within a Part, not JS characters.
      const start = fragment.offset + new TextDecoder().decode(fragment.bytes.slice(0, segment.startIndex ?? 0)).length;
      const end = fragment.offset + new TextDecoder().decode(fragment.bytes.slice(0, segment.endIndex)).length;
      if (start < item.end && end > item.start && Array.isArray(support.groundingChunkIndices)) {
        for (const index of support.groundingChunkIndices.slice(0, 50)) if (Number.isInteger(index) && index >= 0 && index < sources.length) indices.add(index);
      }
    }
    if (Array.isArray(item.value.source_urls)) {
      for (const url of item.value.source_urls.slice(0, 50)) {
        const index = sources.findIndex(source => source?.url === url);
        if (index >= 0) indices.add(index);
      }
    }
    return { ...item.value, sources: [...indices].map(index => sources[index]).filter(Boolean) };
  });
  const normalized = normalizeNewsStories(stories);
  if (!normalized.length) throw newsError('empty', 'No usable sourced headlines found', 'Google did not return readable, source-backed stories. Try again, or start with your own idea.');
  const html = metadata?.searchEntryPoint?.renderedContent;
  return { stories: normalized, searchSuggestions: typeof html === 'string' && html.length <= 100_000 ? html : undefined };
}
