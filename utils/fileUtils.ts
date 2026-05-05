// utils/fileUtils.ts — browser file utilities.

/**
 * Reads a File object and resolves with its base64-encoded contents and MIME
 * type, ready to pass directly to the Gemini API's `inlineData` image format.
 */
export const toBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = (error) => reject(error);
  });
