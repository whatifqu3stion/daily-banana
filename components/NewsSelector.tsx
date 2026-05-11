// components/NewsSelector.tsx
// Modal overlay that displays today's top headlines fetched via newsService.
// The user can select a story to pre-fill the Topic and News Context fields
// in ComicForm, or close the modal to continue with a custom topic.
import React, { useState, useEffect } from 'react';
import { NewsStory } from '../types';

interface NewsSelectorProps {
  stories: NewsStory[];
  isLoading: boolean;
  error: string | null;
  onSelectStory: (title: string, description?: string) => void;
  onClose: () => void;
}

// Funny half-finished headlines the "correspondent" keeps abandoning.
const ATTEMPTS = [
  "Senator Accepts Bribe From Big Ban",
  "Scientists Confirm Mondays Are Technically",
  "Local Man Discovers Everything Is Fin",
  "Breaking: Sources Say It Was Actuall",
  "Area Politician Still Somehow Winn",
  "World Leaders Agree To Just Kind Of",
  "CEO Insists Layoffs Are Actually a Gif",
  "Study Finds That Most People Are Just",
];

type Phase = 'typing' | 'holding' | 'deleting' | 'idle';

const TypingLoader: React.FC = () => {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('typing');
  const [attemptIndex, setAttemptIndex] = useState(0);

  useEffect(() => {
    const target = ATTEMPTS[attemptIndex % ATTEMPTS.length];

    if (phase === 'typing') {
      if (text.length < target.length) {
        // Type one character at a time, slightly variable speed for realism
        const delay = 65 + Math.random() * 40;
        const t = setTimeout(() => setText(target.slice(0, text.length + 1)), delay);
        return () => clearTimeout(t);
      } else {
        // Fully typed — pause as if reconsidering
        const t = setTimeout(() => setPhase('holding'), 900);
        return () => clearTimeout(t);
      }
    }

    if (phase === 'holding') {
      // Moment of doubt, then rage-delete
      const t = setTimeout(() => setPhase('deleting'), 0);
      return () => clearTimeout(t);
    }

    if (phase === 'deleting') {
      if (text.length > 0) {
        // Fast delete — frustrated journalist energy
        const t = setTimeout(() => setText(prev => prev.slice(0, -1)), 28);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setPhase('idle'), 500);
        return () => clearTimeout(t);
      }
    }

    if (phase === 'idle') {
      // Brief pause before the next attempt
      const t = setTimeout(() => {
        setAttemptIndex(i => i + 1);
        setPhase('typing');
      }, 350);
      return () => clearTimeout(t);
    }
  }, [text, phase, attemptIndex]);

  const attemptNumber = (attemptIndex % ATTEMPTS.length) + 1;

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      <p className="text-sm font-special-elite text-gray-500 mb-1 tracking-wide">
        Our correspondent is filing the story...
      </p>
      <p className="text-xs font-special-elite text-gray-400 mb-4">
        Attempt #{attemptNumber}
      </p>

      {/* Fake notepad / terminal */}
      <div className="w-full max-w-sm bg-white border-2 border-black rounded-md p-4 shadow-inner min-h-[3.5rem] flex items-center">
        <span className="font-special-elite text-black text-base leading-snug">
          {text}
        </span>
        <span className="blinking-cursor font-special-elite text-black text-base">|</span>
      </div>

      <p className="mt-4 text-xs font-special-elite text-gray-400 italic">
        {phase === 'deleting' ? 'Hmm. No, that\'s not right...' :
         phase === 'holding'  ? 'Actually wait—' :
         phase === 'idle'     ? 'OK. New angle.' :
                                'Scanning today\'s headlines...'}
      </p>
    </div>
  );
};

const NewsSelector: React.FC<NewsSelectorProps> = ({ stories, isLoading, error, onSelectStory, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="bg-paper-light border-3 border-black rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-8 relative" 
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
        
        {isLoading && <TypingLoader />}

        {error && (
          <div className="text-center my-4 p-4 bg-red-50 rounded-md border border-red-200">
            <h4 className="font-bold font-special-elite text-red-800">Could Not Load News</h4>
            <p className="text-black mt-1 font-lora">
              We were unable to fetch the latest headlines. Please close this window and try again in a moment.
            </p>
          </div>
        )}
        
        {!isLoading && !error && (
          <ul className="space-y-4">
            {stories.map((story, index) => (
              <li key={index}>
                <button 
                  onClick={() => onSelectStory(story.title, story.description)}
                  className="text-left w-full p-3 border-2 border-black bg-white hover:bg-yellow-100 focus:bg-yellow-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black rounded-md"
                >
                  <strong className="block text-lg font-special-elite text-black">{story.title}</strong>
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
