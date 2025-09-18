

import React, { useRef } from 'react';
import { PanelData, TextElementData, BubbleData } from '../types';
import Draggable from './Draggable';
// Fix: Corrected the import for the Bubble component. The original error was caused by the Bubble.tsx file containing invalid content, not the import statement itself. With the Bubble component now correctly defined and exported, this import works as intended.
import Bubble from './Bubble';
import EditableText from './EditableText';
import RefreshIcon from './icons/RefreshIcon';
import WandIcon from './icons/WandIcon';
import Tooltip from './Tooltip';
import TextScaler from './TextScaler';

interface PanelProps {
  panelData: PanelData;
  panelIndex: number;
  onUpdatePanel: (panelIndex: number, updatedData: Partial<PanelData>) => void;
  onRegenerateImage: (panelIndex: number) => void;
  onRefineImage: (panelIndex: number) => void;
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

  const handleUpdateTextElement = (elementId: string, updatedData: Partial<TextElementData>) => {
    const updatedElements = panelData.text_elements.map(el =>
      el.id === elementId ? { ...el, ...updatedData } : el
    );
    onUpdatePanel(panelIndex, { text_elements: updatedElements });
  };
  
  const handleUserTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tags = e.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
    onUpdatePanel(panelIndex, { user_consistency_tags: tags });
  };
  
  const colSpanClasses: { [key: number]: string } = {
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
    6: 'col-span-6',
  };
  const gridClass = colSpanClasses[panelData.layoutProps.gridCols] || 'col-span-2';

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
                    className="text-center font-lora text-white bg-black/60 px-2 py-1"
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
    <div className={`relative group flex flex-col border-2 border-black ${gridClass}`}>
      <div className="relative w-full aspect-square">
        <div ref={boundaryRef} className="absolute inset-0 w-full h-full">
          <img
            src={`data:image/png;base64,${panelData.image}`}
            alt={panelData.visual_prompt}
            className="w-full h-full object-cover"
          />
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

      <div className="flex-grow"></div>

      <div className="no-export bg-black/60 p-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center gap-2">
        <input
          type="text"
          value={panelData.user_consistency_tags.join(', ')}
          onChange={handleUserTagsChange}
          placeholder="e.g., 'wearing a red hat', 'add a dog'"
          className="w-full text-xs p-1 bg-gray-100 border border-gray-300 rounded focus:ring-1 focus:ring-black focus:outline-none"
        />
        <Tooltip text="Refine image (small changes)">
            <button onClick={() => onRefineImage(panelIndex)} disabled={isLoading} className="p-1.5 bg-white rounded hover:bg-gray-200 disabled:opacity-50">
              <WandIcon className="w-4 h-4" />
            </button>
        </Tooltip>
        <Tooltip text="Regenerate image (major changes)">
            <button onClick={() => onRegenerateImage(panelIndex)} disabled={isLoading} className="p-1.5 bg-white rounded hover:bg-gray-200 disabled:opacity-50">
              <RefreshIcon className="w-4 h-4" />
            </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default Panel;