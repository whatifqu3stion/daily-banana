// components/ComicStrip.tsx
// The fully-generated comic strip. Renders all panels in a CSS-grid layout,
// provides per-panel editing controls (regenerate / refine / drag bubbles),
// and handles PNG export and Twitter sharing.
import React, { useRef, useState } from 'react';
import * as htmlToImage from 'html-to-image';
import { ComicStripData, PanelData } from '../types';
import { embedGoogleFonts } from '../utils/fontUtils';
import { extractDomain } from '../utils/urlUtils';
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
  /** Displayed in the comic's printed footer — rendered into the exported PNG. */
  footerDisclaimer: string;
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
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!comicRef.current) return;
    setDownloadError(null);

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
      setDownloadError('Download failed — the image could not be exported. Try again in a moment.');
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
            {comicData.contextSources && comicData.contextSources.length > 0 && (
              <p className="mt-2 text-xs font-special-elite text-gray-500">
                {'Sources: '}
                {comicData.contextSources.map((s, i) => (
                  <React.Fragment key={s.url}>
                    {i > 0 && ' · '}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-black transition-colors"
                      style={{ textDecoration: 'none' }}
                    >
                      {extractDomain(s.url)}
                    </a>
                  </React.Fragment>
                ))}
              </p>
            )}
          </div>
        )}
        <footer className="text-center pt-8 mt-4 border-t-2 border-black font-special-elite space-y-1">
          <p className="text-[10px] text-gray-500 whitespace-nowrap">
            {footerDisclaimer}
          </p>
          <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
            Tech. by
            <TwitterIcon className="w-3 h-3 inline-block" />
            @SummitSatoshi
          </p>
        </footer>
      </div>
      
      {downloadError && (
        <p className="w-full text-center text-sm font-special-elite text-red-800 bg-red-50 border border-red-300 rounded-md px-4 py-2">
          ⚠ {downloadError}
        </p>
      )}
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
        <Tooltip text="Write a brand-new story from scratch (same topic, new script and panels)">
          <button
            onClick={onRegenerateComic}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
          >
            <RefreshIcon className="w-5 h-5" />
            New Story
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