// utils/fontUtils.ts — font embedding utilities for canvas / image export.

/**
 * Fetches a Google Fonts CSS file, resolves every `url(...)` font reference
 * inside it, downloads each font file, and replaces the remote URLs with
 * Base64 data URIs.
 *
 * The resulting CSS string can be passed to html-to-image's `fontEmbedCSS`
 * option so that exported PNG images include the correct typefaces even when
 * the user is offline or the CDN is unavailable at capture time.
 *
 * @param fontUrl - A fully-qualified Google Fonts CSS2 URL.
 * @returns A CSS string with all font files embedded as Base64 data URIs,
 *          or an empty string if the fetch fails (html-to-image will fall
 *          back to system fonts in that case).
 */
export async function embedGoogleFonts(fontUrl: string): Promise<string> {
  try {
    const cssResponse = await fetch(fontUrl);
    if (!cssResponse.ok) {
      throw new Error(`Failed to fetch font CSS: ${cssResponse.statusText}`);
    }
    let cssText = await cssResponse.text();

    // Find every font file URL referenced inside url(...) declarations.
    const fontUrlRegex = /url\((https?:\/\/[^)]+)\)/g;
    const fontUrls = Array.from(cssText.matchAll(fontUrlRegex), m => m[1]);

    // Fetch all font files in parallel and convert to Base64 data URIs.
    const fontPromises = fontUrls.map(async (url) => {
      const fontResponse = await fetch(url);
      if (!fontResponse.ok) {
        console.warn(`Failed to fetch font file: ${url}`);
        return { originalUrl: url, dataUrl: url }; // Fallback: keep the original URL
      }
      const blob = await fontResponse.blob();
      return new Promise<{ originalUrl: string; dataUrl: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ originalUrl: url, dataUrl: reader.result as string });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    });

    const fontDataUrls = await Promise.all(fontPromises);

    // Swap remote URLs for data URIs in the CSS text.
    for (const { originalUrl, dataUrl } of fontDataUrls) {
      cssText = cssText.replace(originalUrl, dataUrl);
    }

    return cssText;
  } catch (error) {
    console.error('Error embedding Google Fonts:', error);
    // Return empty string — html-to-image will fall back to system fonts.
    return '';
  }
}
