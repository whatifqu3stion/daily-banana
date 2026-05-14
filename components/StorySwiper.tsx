// components/StorySwiper.tsx
// Card-swipe UI for choosing a story concept — used for both brainstorm mode
// (3 AI-generated plans) and non-brainstorm mode (1 AI plan).
// A permanent "Write Your Own Angle" card is appended after the AI concepts.
import React, { useState, useCallback } from 'react';
import { ComicPlan } from '../types';
import Tooltip from './Tooltip';
import RefreshIcon from './icons/RefreshIcon';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';
import SparklesIcon from './icons/SparklesIcon';

interface StorySwiperProps {
    storyPlans: ComicPlan[];
    onSelectStory: (plan: ComicPlan) => void;
    onRegenerate: () => void;
    onReturnToForm: () => void;
    onCustomPremise: (premise: string) => void;
    isCustomPremiseLoading?: boolean;
    customPremiseError?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  speech: '💬',
  thought: '💭',
  sfx: '💥',
  caption: '📰',
};

const StorySwiper: React.FC<StorySwiperProps> = ({
    storyPlans,
    onSelectStory,
    onRegenerate,
    onReturnToForm,
    onCustomPremise,
    isCustomPremiseLoading = false,
    customPremiseError,
}) => {
    const totalCards = storyPlans.length + 1;
    const [currentIndex, setCurrentIndex] = useState(0);
    const [customPremiseText, setCustomPremiseText] = useState('');

    const isOnCustomCard = currentIndex === storyPlans.length;
    const currentPlan = isOnCustomCard ? undefined : storyPlans[currentIndex];

    const handleNext = useCallback(() => setCurrentIndex(prev => Math.min(prev + 1, totalCards - 1)), [totalCards]);
    const handlePrev = useCallback(() => setCurrentIndex(prev => Math.max(prev - 1, 0)), []);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') handleNext();
            else if (e.key === 'ArrowLeft') handlePrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrev]);

    const handleSubmitCustomPremise = useCallback(() => {
        const trimmed = customPremiseText.trim();
        if (trimmed) onCustomPremise(trimmed);
    }, [customPremiseText, onCustomPremise]);

    const regenerateLabel = storyPlans.length === 1 ? 'New Idea' : 'New Ideas';
    const regenerateTooltip = storyPlans.length === 1
        ? 'Generate a fresh AI story concept.'
        : 'Generate a completely new set of story ideas.';

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold font-special-elite text-black">Choose Your Story</h2>
                <p className="text-lg font-lora text-black">
                    {storyPlans.length > 1
                        ? 'Here are a few story ideas. Pick your favourite to continue.'
                        : "Here's a story idea. Proceed with it or write your own angle."}
                </p>
            </div>

            <div className="w-full bg-paper-light border-3 border-black shadow-xl rounded-lg overflow-hidden">
                {isOnCustomCard ? (
                    <>
                        <header className="text-center p-4 border-b-2 border-black bg-newsprint">
                            <p className="text-sm font-special-elite text-gray-600 mb-1">
                                Card {totalCards} of {totalCards}
                            </p>
                            <h3 className="text-3xl font-bangers tracking-wider text-black">Write Your Own Angle</h3>
                            <p className="text-base font-lora italic text-gray-700 mt-1">
                                Describe your own premise and we'll build the entire strip around it.
                            </p>
                        </header>
                        <div className="p-6 flex flex-col gap-4">
                            <textarea
                                value={customPremiseText}
                                onChange={(e) => setCustomPremiseText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitCustomPremise();
                                }}
                                placeholder="Describe your own narrative angle or premise… e.g. 'A senator who campaigns against AI secretly uses it to write all his speeches — and gets caught when the AI recommends products he's never heard of.'"
                                className="w-full h-36 p-3 font-lora text-sm text-black bg-white border-2 border-black rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-banana placeholder:text-gray-400"
                                disabled={isCustomPremiseLoading}
                            />
                            {customPremiseError && (
                                <div className="p-3 bg-red-100 border border-red-300 rounded-md">
                                    <p className="text-sm font-bold text-red-800">{customPremiseError}</p>
                                    <p className="text-xs text-red-700 mt-1">Adjust your premise above and try again.</p>
                                </div>
                            )}
                            <button
                                onClick={handleSubmitCustomPremise}
                                disabled={!customPremiseText.trim() || isCustomPremiseLoading}
                                className="inline-flex items-center justify-center gap-3 w-full px-6 py-3 bg-banana text-black font-bangers text-xl tracking-wider border-2 border-black border-b-4 hover:-translate-y-0.5 active:border-b-2 active:translate-y-0 active:mt-0.5 transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:border-b-4 disabled:mt-0"
                            >
                                {isCustomPremiseLoading ? (
                                    <>
                                        <SparklesIcon className="w-6 h-6 animate-spin" />
                                        Generating strip plan…
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-6 h-6" />
                                        Generate from My Idea
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-center font-special-elite text-gray-500">
                                Tip: ⌘↵ / Ctrl↵ to submit
                            </p>
                        </div>
                    </>
                ) : currentPlan ? (
                    <>
                        <header className="text-center p-4 border-b-2 border-black bg-newsprint">
                            <p className="text-sm font-special-elite text-gray-600 mb-1">
                                Idea {currentIndex + 1} of {storyPlans.length}
                            </p>
                            <h3 className="text-3xl font-bangers tracking-wider text-black">{currentPlan.title}</h3>
                            <p className="text-base font-lora italic text-gray-700 mt-1">"{currentPlan.summary}"</p>
                            {currentPlan.premise && (
                                <p className="text-xs font-special-elite text-banana bg-black rounded px-2 py-1 mt-2 inline-block">
                                    Core joke: {currentPlan.premise}
                                </p>
                            )}
                        </header>
                        <div className="p-6 space-y-3">
                            {currentPlan.panels.map((panel, i) => (
                                <div key={panel.slug} className="flex gap-3 items-start text-sm border-b border-black/10 pb-3 last:border-b-0 last:pb-0">
                                    <div className="flex-shrink-0 w-16">
                                        <span className="font-bangers text-base text-gray-500">Panel {i + 1}</span>
                                        {panel.comedic_role && (
                                            <span className="block text-xs font-special-elite text-gray-400 uppercase">{panel.comedic_role}</span>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        {panel.text_elements.length > 0 ? (
                                            panel.text_elements.map((el, j) => (
                                                <p key={j} className="font-lora text-black">
                                                    <span className="mr-1">{ROLE_LABELS[el.role] ?? '•'}</span>
                                                    <span className="italic">"{el.text}"</span>
                                                </p>
                                            ))
                                        ) : (
                                            <p className="font-lora italic text-gray-500">Visual panel — no dialogue</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : null}

                <div className="flex justify-between items-center px-4 py-3 border-t-2 border-black bg-newsprint">
                    <button
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className="w-12 h-12 flex items-center justify-center bg-banana rounded-full text-black disabled:opacity-40 disabled:bg-yellow-200 transition-colors"
                        aria-label="Previous story"
                    >
                        <ChevronLeftIcon className="w-8 h-8" strokeWidth="2.5" />
                    </button>
                    <div className="flex gap-2 items-center">
                        {Array.from({ length: totalCards }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentIndex(i)}
                                className={`w-3 h-3 rounded-full transition-colors ${
                                    i === currentIndex
                                        ? 'bg-banana border-2 border-black'
                                        : i === storyPlans.length
                                            ? 'bg-white border-2 border-dashed border-black'
                                            : 'bg-white border-2 border-black'
                                }`}
                                aria-label={i === storyPlans.length ? 'Write your own angle' : `Go to idea ${i + 1}`}
                            />
                        ))}
                    </div>
                    <button
                        onClick={handleNext}
                        disabled={currentIndex === totalCards - 1}
                        className="w-12 h-12 flex items-center justify-center bg-banana rounded-full text-black disabled:opacity-40 disabled:bg-yellow-200 transition-colors"
                        aria-label="Next story"
                    >
                        <ChevronRightIcon className="w-8 h-8" strokeWidth="2.5" />
                    </button>
                </div>
            </div>

            <div className="w-full flex flex-wrap justify-center items-center gap-4 pt-2">
                <Tooltip text="Go back and change the topic or style.">
                    <button
                        onClick={onReturnToForm}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
                    >
                        Start Over
                    </button>
                </Tooltip>
                <Tooltip text={regenerateTooltip}>
                    <button
                        onClick={onRegenerate}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
                    >
                        <RefreshIcon className="w-5 h-5" />
                        {regenerateLabel}
                    </button>
                </Tooltip>
                {!isOnCustomCard && currentPlan && (
                    <Tooltip text="I like this story! Let's create the art." wrapperClassName="generate-button-wrapper">
                        <button
                            onClick={() => onSelectStory(currentPlan)}
                            className="inline-flex items-center justify-center gap-3 px-8 py-1.5 bg-banana text-black font-bangers text-xl tracking-wider border-2 border-black border-b-4 hover:-translate-y-0.5 active:border-b-2 active:translate-y-0 active:mt-0.5 transition-all rounded-md"
                        >
                            <SparklesIcon className="w-6 h-6" />
                            Choose This Story
                        </button>
                    </Tooltip>
                )}
            </div>
        </div>
    );
};

export default StorySwiper;
