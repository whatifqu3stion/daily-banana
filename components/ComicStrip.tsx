// components/ComicStrip.tsx
// The fully-generated comic strip. Renders all panels in a CSS-grid layout,
// provides per-panel editing controls (regenerate / refine / drag bubbles),
// and handles PNG export and Twitter sharing.
import React, { useRef, useState } from 'react';
import { ComicStripData, PanelData } from '../types';
import { embedGoogleFonts } from '../utils/fontUtils';
import { extractDomain } from '../utils/urlUtils';
import { cleanArchiveText } from '../utils/archiveText';
import Panel from './Panel';
import NewComicIcon from './icons/NewComicIcon';
import DownloadIcon from './icons/DownloadIcon';
import TwitterIcon from './icons/TwitterIcon';
import Tooltip from './Tooltip';
import RefreshIcon from './icons/RefreshIcon';
import StoryCheck from './StoryCheck';
import { checkArchiveAmounts, stripAsNumericPlan } from '../services/numericFacts';

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
  const downloadInFlightRef = useRef(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const numericPlan = stripAsNumericPlan(comicData);
  const archiveText = cleanArchiveText(comicData.context || '');
  const archiveWarning = comicData.archiveWarning || (archiveText ? checkArchiveAmounts(archiveText, numericPlan) : undefined);
  const concerns = [archiveWarning, ...comicData.panels.map((panel, index) =>
    panel.continuityWarning ? `Panel ${index + 1}: ${panel.continuityWarning}` : undefined)].filter((item): item is string => Boolean(item));

  const handleDownload = async () => {
    if (!comicRef.current || downloadInFlightRef.current) return;
    downloadInFlightRef.current = true;
    setDownloadError(null);
    setIsDownloading(true);

    try {
      const fontCssUrl = 'https://fonts.googleapis.com/css2?family=Bangers&family=Lora:wght@400;700&family=Special+Elite&display=swap';
      const fontEmbedCss = await embedGoogleFonts(fontCssUrl);
      const excludedNodes = Array.prototype.slice.call(
        comicRef.current.querySelectorAll<HTMLElement>('.no-export')
      ) as HTMLElement[];
      const previousDisplays = excludedNodes.map(node => node.style.display);

      try {
        // Hide editor-only UI before html-to-image measures the canvas. Filtering
        // only the cloned nodes preserves the original height and leaves a blank
        // band at the bottom of the exported page.
        excludedNodes.forEach(node => {
          node.style.display = 'none';
        });
        await document.fonts.ready;
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(comicRef.current, {
          quality: 1,
          pixelRatio: 2,
          fontEmbedCSS: fontEmbedCss,
        });

        const link = document.createElement('a');
        link.download = `${comicData.title.replace(/\s+/g, '_').toLowerCase()}.png`;
        link.href = dataUrl;
        link.click();
      } finally {
        excludedNodes.forEach((node, index) => {
          node.style.display = previousDisplays[index];
        });
      }
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadError('Download failed — the image could not be exported. Try again in a moment.');
    } finally {
      downloadInFlightRef.current = false;
      setIsDownloading(false);
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
       <div ref={comicRef} data-testid="comic-export" className="w-full bg-paper-light px-4 py-5 sm:p-6 md:p-8 border-3 border-black shadow-xl rounded-lg">
         <div className="no-export mb-5 flex flex-col gap-2 border-b-2 border-black pb-4 sm:flex-row sm:items-end sm:justify-between">
           <div>
             <p className="text-xs font-open-sans font-bold uppercase tracking-[0.18em] text-gray-500">Final edition</p>
             <p className="mt-1 text-sm font-open-sans text-gray-700">Click text to edit. Focus a panel to reveal its image tools.</p>
           </div>
           <span className="text-xs font-special-elite text-gray-600">{comicData.panels.length} {comicData.panels.length === 1 ? 'panel' : 'panels'}</span>
         </div>
         <h2 className="mx-auto mb-6 max-w-[18ch] text-balance text-center font-bangers text-4xl tracking-wider text-black md:mb-8 md:text-5xl">
          {comicData.title}
        </h2>
         <p className="text-center text-sm font-open-sans text-gray-600 mb-4 no-export">
           Select text to edit it. On desktop, focus or hover a panel for image tools.
        </p>
         <div className="-mx-4 px-4 md:mx-0 md:px-0">
         <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 items-stretch min-w-0">
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
          {archiveText && !archiveWarning && (
           <aside className="mt-7 grid gap-3 border-y border-black/50 py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6 md:py-5">
             <div>
               <h4 className="font-special-elite text-lg font-bold leading-tight text-black">A Note from the Archives</h4>
               {comicData.brief && <p className="mt-2 font-open-sans text-sm leading-5 text-gray-700">
                 Later research, {comicData.brief.sourceKind === 'provided-context' ? 'starting from your supplied background' : 'related to your topic'}. Not a record of the planner’s sources.
               </p>}
            {comicData.contextSources && comicData.contextSources.length > 0 && (
               <p className="mt-3 break-words text-sm font-open-sans leading-5 text-gray-700">
                {'Sources: '}
                {comicData.contextSources.map((s, i) => (
                  <React.Fragment key={s.url}>
                    {i > 0 && ' · '}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                       className="underline decoration-black/30 underline-offset-2 transition-colors hover:text-black"
                    >
                      {extractDomain(s.url)}
                    </a>
                  </React.Fragment>
                ))}
              </p>
            )}
             </div>
             <p className="max-w-[72ch] font-lora text-base leading-7 text-gray-800">{archiveText}</p>
           </aside>
        )}
         <footer className="-mx-4 mt-6 border-t-2 border-black px-4 pt-5 font-special-elite sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
           <div className="flex flex-col items-center justify-between gap-3 text-center text-sm leading-5 text-gray-700 sm:flex-row sm:items-start sm:text-left md:text-base md:leading-6">
             <p className="max-w-[68ch]">{footerDisclaimer}</p>
             <p className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap font-bold text-black">
               <span>Tech. by</span>
               <TwitterIcon className="h-4 w-4 flex-shrink-0" />
               <span>@SummitSatoshi</span>
             </p>
           </div>
        </footer>
      </div>
      
      {downloadError && (
        <p className="w-full text-center text-sm font-special-elite text-red-800 bg-red-50 border border-red-300 rounded-md px-4 py-2">
           Export issue: {downloadError}
        </p>
      )}
      <div className="no-export w-full">
         <StoryCheck plan={numericPlan} additionalConcerns={concerns} archiveSources={archiveWarning ? comicData.contextSources : undefined} />
      </div>
      <div className="w-full flex flex-wrap justify-center items-center gap-4 pt-4">
         <Tooltip text="Start with a new topic and settings">
          <button
            onClick={onStartNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
          >
            <NewComicIcon className="w-5 h-5" />
            Create New
          </button>
        </Tooltip>
         <Tooltip text="Keep the topic and settings, but write a new story">
          <button
            onClick={onRegenerateComic}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
          >
            <RefreshIcon className="w-5 h-5" />
            New Story
          </button>
        </Tooltip>
         <Tooltip text="Download this comic as a PNG image">
          <button
            onClick={handleDownload}
             disabled={isDownloading}
             aria-busy={isDownloading}
             className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white font-bold border-2 border-black hover:bg-gray-800 transition-colors rounded-md disabled:cursor-wait disabled:opacity-65"
          >
             <DownloadIcon className={`w-5 h-5 ${isDownloading ? 'animate-pulse' : ''}`} />
             {isDownloading ? 'Exporting…' : 'Download'}
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
