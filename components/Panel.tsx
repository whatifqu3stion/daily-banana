import React, { useState, useRef, useCallback } from 'react';
import { PanelData, BubbleData, SfxData, ElementPosition, ElementSize } from '../types';
import Transformable from './Draggable';
import RefreshIcon from './icons/RefreshIcon';
import WandIcon from './icons/WandIcon';
import Tooltip from './Tooltip';

interface PanelProps {
  panelData: PanelData;
  panelIndex: number;
  onUpdatePanel: (panelIndex: number, updatedData: Partial<PanelData>) => void;
  onRegenerateImage: (panelIndex: number) => void;
  isLoading: boolean;
}

const Panel: React.FC<PanelProps> = ({ panelData, panelIndex, onUpdatePanel, onRegenerateImage, isLoading }) => {
  const [userTags, setUserTags] = useState(panelData.user_consistency_tags || '');
  const boundaryRef = useRef<HTMLDivElement>(null);
  
  const handleUserTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserTags(e.target.value);
  };
  
  const handleUserTagsBlur = () => {
    onUpdatePanel(panelIndex, { user_consistency_tags: userTags });
  };
  
  const handleRegenerateClick = () => {
    // Ensure the latest tags are saved before regenerating
    onUpdatePanel(panelIndex, { user_consistency_tags: userTags });
    onRegenerateImage(panelIndex);
  };

  const updateBubble = useCallback((id: string, newPos: ElementPosition, newSize: ElementSize) => {
    const updatedBubbles = panelData.bubbles.map(b => 
        b.id === id ? { ...b, position: newPos, size: newSize } : b
    );
    onUpdatePanel(panelIndex, { bubbles: updatedBubbles });
  }, [panelData.bubbles, panelIndex, onUpdatePanel]);

  const updateSfx = useCallback((id: string, newPos: ElementPosition, newSize: ElementSize) => {
    const updatedSfx = panelData.sfx.map(s => 
        s.id === id ? { ...s, position: newPos, size: newSize } : s
    );
    onUpdatePanel(panelIndex, { sfx: updatedSfx });
  }, [panelData.sfx, panelIndex, onUpdatePanel]);

  const panelLayoutClasses = {
    'standard': 'aspect-square',
    'large': 'aspect-[4/3]',
    'double-width': 'aspect-[2/1] col-span-2',
  };

  return (
    <div className={`panel-container bg-white border-2 border-black p-3 flex flex-col gap-2 ${panelData.layout === 'double-width' ? 'col-span-2' : ''}`}>
       <div ref={boundaryRef} className={`relative overflow-hidden border-2 border-black ${panelLayoutClasses[panelData.layout]}`}>
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-20">
            <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-black"></div>
          </div>
        )}
        <img
          src={`data:image/png;base64,${panelData.image}`}
          alt={panelData.visual_prompt}
          className="w-full h-full object-cover"
        />

        {panelData.bubbles.map((bubble) => (
          <Transformable
            key={bubble.id}
            initialPosition={bubble.position}
            initialSize={bubble.size}
            onPositionChange={(pos) => updateBubble(bubble.id, pos, bubble.size)}
            onSizeChange={(size) => updateBubble(bubble.id, bubble.position, size)}
            boundaryRef={boundaryRef}
          >
            <div className="speech-bubble w-full h-full bg-white border-2 border-black rounded-lg p-2 flex items-center justify-center text-center">
              <p className="text-sm font-special-elite">{bubble.text}</p>
            </div>
          </Transformable>
        ))}

        {panelData.sfx.map((sfx) => (
           <Transformable
            key={sfx.id}
            initialPosition={sfx.position}
            initialSize={sfx.size}
            onPositionChange={(pos) => updateSfx(sfx.id, pos, sfx.size)}
            onSizeChange={(size) => updateSfx(sfx.id, sfx.position, size)}
            boundaryRef={boundaryRef}
          >
            <div className="sfx-text w-full h-full flex items-center justify-center text-center">
                <p className="font-bangers text-4xl text-yellow-400" style={{ WebkitTextStroke: '2px black' }}>{sfx.text}</p>
            </div>
          </Transformable>
        ))}
      </div>

       {panelData.caption.text && (
          <p className="caption text-center italic px-2 text-sm">{panelData.caption.text}</p>
       )}
      
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-200">
        <Tooltip text="Add keywords to refine this image (e.g., 'wearing a blue hat', 'sad expression').">
          <WandIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
        </Tooltip>
        <input
          type="text"
          value={userTags}
          onChange={handleUserTagsChange}
          onBlur={handleUserTagsBlur}
          placeholder="Add consistency tags..."
          className="w-full text-xs p-1 bg-gray-100 border border-gray-300 rounded focus:ring-1 focus:ring-black focus:outline-none"
        />
        <Tooltip text="Regenerate this panel's image">
          <button 
            onClick={handleRegenerateClick}
            disabled={isLoading}
            className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Regenerate panel image"
          >
            <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default Panel;