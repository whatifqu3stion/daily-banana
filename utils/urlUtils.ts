/**
 * Extracts the bare hostname from a URL, stripping the leading "www." if present.
 * Used to render source credits in the explainer box — readable as plain text
 * in both the web view and exported PNG.
 *
 * @example extractDomain("https://www.reuters.com/article/...") → "reuters.com"
 */
export const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
