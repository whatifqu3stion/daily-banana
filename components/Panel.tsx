import React, { useRef, useState, useEffect } from 'react';
import { PanelData, TextElementData, BubbleData } from '../types';
import Draggable from './Draggable';
import Bubble from './Bubble';
import EditableText from './EditableText';
import RefreshIcon from './icons/RefreshIcon';
import SparklesIcon from './icons/SparklesIcon';
import Tooltip from './Tooltip';
import TextScaler from './TextScaler';

interface PanelProps {
  panelData: PanelData;
  panelIndex: number;
  onUpdatePanel: (panelIndex: number, updatedData: Partial<PanelData>) => void;
  onRegenerateImage: (panelIndex: number) => void;
  onRefineImage: (panelIndex: number, refinementPrompt: string) => void;
  isLoading: boolean;
}

const Panel: React.FC<PanelProps> = ({
  panelData,
  panelIndex,
  onUpdatePanel,
  onRegenerateImage,
  onRefineImage,
  isLoading,
}) => {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const committedTags = panelData.user_consistency_tags.join(', ');
  const [tagsInput, setTagsInput] = useState(committedTags);

  useEffect(() => {
    setTagsInput(committedTags);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedTags]);

  const handleUpdateTextElement = (elementId: string, updatedData: Partial<TextElementData>) => {
    const updatedElements = panelData.text_elements.map(el =>
      el.id === elementId ? { ...el, ...updatedData } : el
    );
    onUpdatePanel(panelIndex, { text_elements: updatedElements });
  };
  
  const handleUserTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTagsInput(e.target.value);
  };

  const handleUserTagsBlur = () => {
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(Boolean);
    onUpdatePanel(panelIndex, { user_consistency_tags: tags });
  };
  
  const colSpanClasses: { [key: number]: string } = {
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
    6: 'col-span-6',
  };
  const gridClass = colSpanClasses[panelData.layoutProps.gridCols] || 'col-span-2';

  // Map the stored aspect ratio to Tailwind classes / inline styles.
  const aspectRatioTailwind: { [key: string]: string } = {
    '1:1':  'aspect-square',
    '16:9': 'aspect-video',
  };
  const aspectRatioInline: { [key: string]: React.CSSProperties } = {
    '4:3':  { aspectRatio: '4 / 3' },
    '9:16': { aspectRatio: '9 / 16' },
  };
  const ar = panelData.layoutProps.aspectRatio ?? '1:1';
  const arClass = aspectRatioTailwind[ar] ?? 'aspect-square';
  const arStyle = aspectRatioInline[ar] ?? {};

  const renderTextElement = (element: TextElementData) => {
    const handleSave = (newText: string) => {
        handleUpdateTextElement(element.id, { text: newText });
    };

    if (element.role === 'speech' || element.role === 'thought') {
      return (
        <Bubble
          bubbleData={element as BubbleData}
          onUpdate={(updatedBubbleData) => handleUpdateTextElement(element.id, updatedBubbleData)}
        >
          <TextScaler>
            <EditableText
              initialText={element.text}
              onSave={handleSave}
              className={`text-center font-bangers tracking-wider ${element.invertedColors ? 'text-white' : 'text-black'}`}
            />
          </TextScaler>
        </Bubble>
      );
    }
    
    if (element.role === 'sfx') {
        const sfxStyle: React.CSSProperties = {
            WebkitTextStroke: '2px black',
            paintOrder: 'stroke fill',
            textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
        };
        return (
            <TextScaler>
                <EditableText
                    initialText={element.text}
                    onSave={handleSave}
                    className="text-center font-bangers text-yellow-400 font-bold"
                    style={sfxStyle}
                />
            </TextScaler>
        );
    }

    if (element.role === 'caption') {
        return (
            <TextScaler>
                <EditableText
                    initialText={element.text}
                    onSave={handleSave}
                    className="text-center font-special-elite text-black bg-white border-2 border-black px-2 py-1"
                />
            </TextScaler>
        );
    }

    return (
      <TextScaler>
        <EditableText
          initialText={element.text}
          onSave={handleSave}
        />
      </TextScaler>
    );
  };
  
  return (
    <div className={`relative group border-2 border-black ${gridClass}`}>
      <div className={`relative w-full ${arClass}`} style={arStyle}>
        <div ref={boundaryRef} className="absolute inset-0 w-full h-full">
          {panelData.failed ? (
            <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center gap-3 p-4"
              style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.05) 8px, rgba(0,0,0,0.05) 16px)' }}>
              <p className="font-special-elite text-sm text-center text-gray-700 px-2">
                {panelData.panelError || 'Generation failed'}
              </p>
              <button
                onClick={() => onRegenerateImage(panelIndex)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-banana border-2 border-black font-bangers text-sm tracking-wide rounded hover:bg-yellow-300 disabled:opacity-50 transition-colors"
              >
                <RefreshIcon className="w-4 h-4" />
                Retry
              </button>
            </div>
          ) : (
            <>
              <img
                src={`data:image/png;base64,${panelData.image}`}
                alt={panelData.visual_prompt}
                className="w-full h-full object-cover"
              />
              {/* Per-panel error from a failed regenerate/refine attempt on an existing image.
                  Anchored at the TOP of the panel so it is never covered by the hover
                  toolbar which lives at bottom-0. Always visible without hovering. */}
              {panelData.panelError && (
                <div className="no-export absolute top-0 left-0 right-0 bg-red-700/90 text-white text-xs font-special-elite px-2 py-1.5 z-30 flex items-start gap-1.5">
                  <span className="flex-shrink-0 mt-px">⚠</span>
                  <span>{panelData.panelError}</span>
                </div>
              )}
            </>
          )}
          {isLoading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-black"></div>
            </div>
          )}
          
          {panelData.text_elements.map(element => (
            <Draggable
              key={element.id}
              initialPosition={element.position}
              initialSize={element.size}
              onPositionChange={(pos) => handleUpdateTextElement(element.id, { position: pos })}
              onSizeChange={(size) => handleUpdateTextElement(element.id, { size: size })}
              boundaryRef={boundaryRef}
            >
              {renderTextElement(element)}
            </Draggable>
          ))}
        </div>
      </div>

      <div className="no-export absolute bottom-0 left-0 right-0 bg-black/60 p-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center gap-2">
        <input
          type="text"
          value={tagsInput}
          onChange={handleUserTagsChange}
          onBlur={handleUserTagsBlur}
          placeholder="e.g., 'wearing a red hat', 'add a dog'"
          className="w-full text-xs p-1 bg-gray-100 border border-gray-300 rounded-md focus:ring-1 focus:ring-black focus:outline-none text-black placeholder:text-gray-500"
        />
        {/* Refine is only meaningful when there is an existing image to build on */}
        {!panelData.failed && (
          <Tooltip text="Refine image (small changes)" position="top-left">
              <button
                onClick={() => {
                  // Commit the live input value immediately — don't rely on blur firing first
                  const committed = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
                  onUpdatePanel(panelIndex, { user_consistency_tags: committed });
                  onRefineImage(panelIndex, tagsInput);
                }}
                disabled={isLoading}
                className="p-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                <SparklesIcon className="w-4 h-4 text-black" />
              </button>
          </Tooltip>
        )}
        <Tooltip text="Regenerate image (major changes)" position="top-right">
            <button onClick={() => onRegenerateImage(panelIndex)} disabled={isLoading} className="p-1.5 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50">
              <RefreshIcon className="w-4 h-4 text-black" />
            </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default Panel;