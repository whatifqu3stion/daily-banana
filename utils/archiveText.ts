/** Remove model citation syntax from prose; real links come from grounding metadata. */
export function cleanArchiveText(text: string): string {
  return text
    .replace(/\[(?:cite|citation)\s*:[^\]\r\n]*\]/gi, '')
    .replace(/\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]/g, '')
    .replace(/cite[^]*/g, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
