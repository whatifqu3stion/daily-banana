import React, { useState, useRef, useCallback } from 'react';
import { PanelData, TextElementData, BubbleData } from '../types';
import Transformable from './Draggable';
import RefreshIcon from './icons/RefreshIcon';
import NewComicIcon from './icons/NewComicIcon';
import SparklesIcon from './icons/SparklesIcon';
import Tooltip from './Tooltip';
import EditableText from './EditableText';
import Bubble from './Bubble';

interface PanelProps {
  panelData: PanelData;
  panelIndex: number;
  onUpdatePanel: (panelIndex: number, updatedData: Partial<PanelData>) => void;
  onRegenerateImage: (panelIndex: number) => void;
  onRefineImage: (panelIndex: number) => void;
  isLoading: boolean;
}

const Panel: React.FC<PanelProps> = ({ panelData, panelIndex, onUpdatePanel, onRegenerateImage, onRefineImage, isLoading }) => {
  const [userTags, setUserTags] = useState(panelData.user_consistency_tags || '');
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  
  const { layoutProps } = panelData;

  const handleUserTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserTags(e.target.value);
  };
  
  const handleUserTagsBlur = () => {
    onUpdatePanel(panelIndex, { user_consistency_tags: userTags });
  };
  
  const handleRegenerateClick = () => {
    onUpdatePanel(panelIndex, { user_consistency_tags: userTags });
    onRegenerateImage(panelIndex);
  };

  const handleRefineClick = () => {
    onUpdatePanel(panelIndex, { user_consistency_tags: userTags });
    onRefineImage(panelIndex);
  };

  const handleUpdateTextElement = useCallback((elementId: string, updatedData: Partial<TextElementData>) => {
      const updatedElements = panelData.text_elements.map(el => 
          el.id === elementId ? { ...el, ...updatedData } : el
      );
      onUpdatePanel(panelIndex, { text_elements: updatedElements });
  }, [panelData.text_elements, onUpdatePanel, panelIndex]);


  const aspectRatioToClass = (aspectRatio: string) => {
    switch(aspectRatio) {
        case '1:1': return 'aspect-square';
        case '4:3': return 'aspect-[4/3]';
        case '3:4': return 'aspect-[3/4]';
        case '16:9': return 'aspect-[16/9]';
        case '9:16': return 'aspect-[9/16]';
        default: return 'aspect-square';
    }
  }
  
  const renderTextElement = (element: TextElementData) => {
    if (element.role === 'caption') {
      // Captions are rendered outside the draggable area.
      return null;
    }

    const transformableContent = () => {
        if (element.role === 'speech' || element.role === 'thought') {
            return (
                <Bubble
                    bubbleData={element as BubbleData} // Cast for compatibility
                    onUpdate={(updatedData) => handleUpdateTextElement(element.id, updatedData)}
                >
                    <EditableText
                        initialText={element.text}
                        onSave={(newText) => handleUpdateTextElement(element.id, { text: newText })}
                        onEditingChange={setIsEditingText}
                        className="font-special-elite text-center"
                        textareaClassName="font-special-elite text-center"
                    />
                </Bubble>
            );
        }
        if (element.role === 'sfx') {
            return (
                 <div className="sfx-text w-full h-full flex items-center justify-center text-center">
                    <EditableText
                      initialText={element.text}
                      onSave={(newText) => handleUpdateTextElement(element.id, { text: newText })}
                      onEditingChange={setIsEditingText}
                      className="font-bangers text-4xl text-yellow-400 text-center"
                      textareaClassName="font-bangers text-4xl text-yellow-400 text-center"
                      style={{ WebkitTextStroke: '2px black' }}
                    />
                </div>
            );
        }
        return null;
    };

    return (
      <Transformable
        key={element.id}
        initialPosition={element.position}
        initialSize={element.size}
        onPositionChange={(pos) => handleUpdateTextElement(element.id, { position: pos })}
        onSizeChange={(size) => handleUpdateTextElement(element.id, { size: size })}
        boundaryRef={boundaryRef}
        disableDrag={isEditingText}
      >
        {transformableContent()}
      </Transformable>
    );
  };

  const caption = panelData.text_elements.find(el => el.role === 'caption');

  return (
    <div className={`panel-container bg-white border-2 border-black flex flex-col col-span-6 md:col-span-${layoutProps.gridCols}`}>
       <div ref={boundaryRef} className={`relative overflow-hidden border-b-2 border-black ${aspectRatioToClass(layoutProps.aspectRatio)}`}>
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
        {panelData.text_elements.map(renderTextElement)}
      </div>

       <div className="caption text-center italic px-2 py-2 text-sm min-h-14 flex items-center justify-center">
         {caption && (
           <EditableText
             initialText={caption.text}
             onSave={(newText) => handleUpdateTextElement(caption.id, { text: newText })}
             onEditingChange={setIsEditingText}
             textareaClassName="text-center italic text-sm w-full"
           />
         )}
       </div>
      
      <div className="flex items-center gap-2 mt-auto p-2 border-t border-gray-200 no-export">
        <Tooltip text="Add keywords to refine this image (e.g., 'wearing a blue hat', 'sad expression').">
          <NewComicIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
        </Tooltip>
        <input
          type="text"
          value={userTags}
          onChange={handleUserTagsChange}
          onBlur={handleUserTagsBlur}
          placeholder="Add refinement details..."
          className="w-full text-xs p-1 bg-gray-100 border border-gray-300 rounded focus:ring-1 focus:ring-black focus:outline-none"
        />
        <Tooltip text="Refine the image using the original as a base plus your new tags. Good for small changes.">
          <button
            onClick={handleRefineClick}
            disabled={isLoading || isEditingText}
            className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Refine panel image"
          >
            <SparklesIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </Tooltip>
        <Tooltip text="Generate a completely new image from the original prompt plus your new tags. Good for major changes.">
          <button 
            onClick={handleRegenerateClick}
            disabled={isLoading || isEditingText}
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