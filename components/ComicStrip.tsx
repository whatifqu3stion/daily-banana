import React, { useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import { ComicStripData, PanelData } from '../types';
import Panel from './Panel';
import NewComicIcon from './icons/NewComicIcon';
import DownloadIcon from './icons/DownloadIcon';

interface ComicStripProps {
  comicData: ComicStripData;
  onUpdatePanel: (panelIndex: number, updatedData: Partial<PanelData>) => void;
  onRegeneratePanelImage: (panelIndex: number) => void;
  onStartNew: () => void;
  isPanelLoading: (panelIndex: number) => boolean;
}

const ComicStrip: React.FC<ComicStripProps> = ({
  comicData,
  onUpdatePanel,
  onRegeneratePanelImage,
  onStartNew,
  isPanelLoading,
}) => {
  const comicRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!comicRef.current) return;

    try {
      // Fetch the font CSS as text to embed it and avoid CORS issues.
      const fontCssUrl = 'https://fonts.googleapis.com/css2?family=Bangers&family=Lora:wght@400;700&family=Special+Elite&display=swap';
      const cssResponse = await fetch(fontCssUrl);
      const fontEmbedCss = await cssResponse.text();

      const dataUrl = await htmlToImage.toPng(comicRef.current, {
        quality: 1,
        pixelRatio: 2,
        fontEmbedCSS: fontEmbedCss,
      });

      const link = document.createElement('a');
      link.download = `${comicData.title.replace(/\s+/g, '_').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
      alert('Could not download the comic. Please check the console for more details.');
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-8">
       <div className="w-full flex justify-center md:justify-end items-center gap-4">
        <button
          onClick={onStartNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded"
        >
          <NewComicIcon className="w-5 h-5" />
          Create New
        </button>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white font-bold border-2 border-black hover:bg-gray-800 transition-colors rounded"
        >
          <DownloadIcon className="w-5 h-5" />
          Download
        </button>
      </div>

      <div ref={comicRef} className="w-full bg-gray-100 p-4 md:p-8">
        <h1 className="text-4xl md:text-5xl font-bangers text-center tracking-wider mb-8">
          {comicData.title}
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {comicData.panels.map((panel, index) => (
            <Panel
              key={panel.id}
              panelData={panel}
              panelIndex={index}
              onUpdatePanel={onUpdatePanel}
              onRegenerateImage={onRegeneratePanelImage}
              isLoading={isPanelLoading(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ComicStrip;