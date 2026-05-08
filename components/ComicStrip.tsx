import React, { useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import { ComicStripData, PanelData } from '../types';
import Panel from './Panel';
import NewComicIcon from './icons/NewComicIcon';
import DownloadIcon from './icons/DownloadIcon';
import TwitterIcon from './icons/TwitterIcon';
import Tooltip from './Tooltip';
import RefreshIcon from './icons/RefreshIcon';

interface ComicStripProps {
  comicData: ComicStripData;
  onUpdatePanel: (panelIndex: number, updatedData: Partial<PanelData>) => void;
  onRegeneratePanelImage: (panelIndex: number) => void;
  onRefinePanelImage: (panelIndex: number, refinementPrompt: string) => void;
  onStartNew: () => void;
  onRegenerateComic: () => void;
  isPanelLoading: (panelIndex: number) => boolean;
  footerDisclaimer: string;
}

/**
 * Fetches Google Fonts CSS, parses it, fetches the font files,
 * and embeds them as Base64 data URLs.
 * @param fontUrl The URL of the Google Fonts CSS file.
 * @returns A CSS string with embedded fonts.
 */
async function embedGoogleFonts(fontUrl: string): Promise<string> {
  try {
    const cssResponse = await fetch(fontUrl);
    if (!cssResponse.ok) {
      throw new Error(`Failed to fetch font CSS: ${cssResponse.statusText}`);
    }
    let cssText = await cssResponse.text();

    const fontUrlRegex = /url\((https?:\/\/[^)]+)\)/g;
    const fontUrls = Array.from(cssText.matchAll(fontUrlRegex), m => m[1]);

    const fontPromises = fontUrls.map(async (url) => {
      const fontResponse = await fetch(url);
      if (!fontResponse.ok) {
        console.warn(`Failed to fetch font file: ${url}`);
        return { originalUrl: url, dataUrl: url }; // Fallback
      }
      const blob = await fontResponse.blob();
      return new Promise<{ originalUrl: string; dataUrl: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({ originalUrl: url, dataUrl: reader.result as string });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    });

    const fontDataUrls = await Promise.all(fontPromises);

    for (const { originalUrl, dataUrl } of fontDataUrls) {
      cssText = cssText.replace(originalUrl, dataUrl);
    }

    return cssText;
  } catch (error) {
      console.error("Error embedding Google Fonts:", error);
      // Return an empty string or the original (likely failing) CSS as a fallback.
      return '';
  }
}


const ComicStrip: React.FC<ComicStripProps> = ({
  comicData,
  onUpdatePanel,
  onRegeneratePanelImage,
  onRefinePanelImage,
  onStartNew,
  onRegenerateComic,
  isPanelLoading,
  footerDisclaimer,
}) => {
  const comicRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!comicRef.current) return;

    try {
      const fontCssUrl = 'https://fonts.googleapis.com/css2?family=Bangers&family=Lora:wght@400;700&family=Special+Elite&display=swap';
      const fontEmbedCss = await embedGoogleFonts(fontCssUrl);

      const dataUrl = await htmlToImage.toPng(comicRef.current, {
        quality: 1,
        pixelRatio: 2,
        fontEmbedCSS: fontEmbedCss,
        filter: (node) => {
          if (node instanceof HTMLElement) {
            return !node.classList.contains('no-export');
          }
          return true;
        }
      });

      const link = document.createElement('a');
      link.download = `${comicData.title.replace(/\s+/g, '_').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
      alert('Could not download the comic. Font embedding might have failed. Please check the console.');
    }
  };
  
  const handleShare = () => {
    if (!comicData) return;
    
    const tweetText = `Check out the comic I made: "${comicData.title}"! Created with The Daily Banana.`;
    const appUrl = window.location.href;
    
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(appUrl)}`;
    
    window.open(twitterIntentUrl, '_blank', 'width=600,height=400,resizable=yes,scrollbars=yes');
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-8">
      <div ref={comicRef} className="w-full bg-paper-light p-4 md:p-8 border-3 border-black shadow-xl rounded-lg">
        <h2 className="text-4xl md:text-5xl font-bangers text-center tracking-wider mb-8 text-black">
          {comicData.title}
        </h2>
        <p className="text-center text-xs font-special-elite text-gray-400 mb-4 no-export">
          Drag speech bubbles &amp; captions to arrange your comic. Hover a panel to edit or regenerate it.
        </p>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="grid grid-cols-6 gap-4 items-stretch min-w-[560px]">
          {comicData.panels.map((panel, index) => (
            <Panel
              key={panel.id}
              panelData={panel}
              panelIndex={index}
              onUpdatePanel={onUpdatePanel}
              onRegenerateImage={onRegeneratePanelImage}
              onRefineImage={onRefinePanelImage}
              isLoading={isPanelLoading(index)}
            />
          ))}
        </div>
        </div>
        {comicData.context && (
          <div className="mt-6 pt-4 border-t-2 border-dashed border-black">
            <h4 className="font-special-elite text-lg font-bold text-black">A Note from the Archives:</h4>
            <p className="font-lora text-base text-gray-800 mt-2">{comicData.context}</p>
          </div>
        )}
        <footer className="text-center pt-8 mt-4 border-t-2 border-black font-special-elite">
          <p className="text-base text-gray-600">
            {footerDisclaimer}
          </p>
        </footer>
      </div>
      
      <div className="w-full flex flex-wrap justify-center items-center gap-4 pt-4">
        <Tooltip text="Start a new comic from scratch">
          <button
            onClick={onStartNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
          >
            <NewComicIcon className="w-5 h-5" />
            Create New
          </button>
        </Tooltip>
        <Tooltip text="Generate a new comic with the same prompt">
          <button
            onClick={onRegenerateComic}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
          >
            <RefreshIcon className="w-5 h-5" />
            Regenerate
          </button>
        </Tooltip>
        <Tooltip text="Download comic as a PNG image">
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white font-bold border-2 border-black hover:bg-gray-800 transition-colors rounded-md"
          >
            <DownloadIcon className="w-5 h-5" />
            Download
          </button>
        </Tooltip>
        <Tooltip text="Share on X (Twitter)">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
            aria-label="Share on Twitter"
          >
            <TwitterIcon className="w-5 h-5" />
            Share
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default ComicStrip;