
import React from 'react';
import { NewsStory } from '../types';

interface NewsSelectorProps {
  stories: NewsStory[];
  isLoading: boolean;
  error: string | null;
  onSelectStory: (title: string) => void;
  onClose: () => void;
}

const NewsSelector: React.FC<NewsSelectorProps> = ({ stories, isLoading, error, onSelectStory, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="bg-stone-100 border-4 border-black w-full max-w-2xl max-h-[80vh] overflow-y-auto p-8 relative" 
        onClick={e => e.stopPropagation()}
        role="document"
      >
        <button 
          onClick={onClose} 
          className="absolute top-2 right-4 text-3xl font-bold text-gray-600 hover:text-black"
          aria-label="Close news selector"
        >
          &times;
        </button>
        <h3 className="text-2xl font-bold mb-6 font-special-elite text-center text-gray-900">Suggest from Today's Headlines</h3>
        
        {isLoading && (
          <div className="flex flex-col items-center justify-center p-8">
            <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-black"></div>
            <p className="mt-4 font-medium text-black">Fetching today's top stories...</p>
          </div>
        )}

        {error && (
          <div className="text-center my-4 p-4 bg-red-100 rounded-md">
            <h4 className="font-bold text-red-800">Could not load news</h4>
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        {!isLoading && !error && (
          <ul className="space-y-4">
            {stories.map((story, index) => (
              <li key={index}>
                <button 
                  onClick={() => onSelectStory(story.title)}
                  className="text-left w-full p-3 border-2 border-black bg-white hover:bg-yellow-100 focus:bg-yellow-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black rounded-md"
                >
                  <strong className="block text-lg font-special-elite text-gray-900">{story.title}</strong>
                  <p className="text-sm text-gray-600 font-lora mt-1 line-clamp-2">{story.description}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NewsSelector;