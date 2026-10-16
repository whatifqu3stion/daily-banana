// components/StorySwiper.tsx
// Story-selection UI used for both brainstorm mode (multiple AI plans) and
// non-brainstorm mode (one AI plan), with a separate custom-angle option.
import React, { useState, useCallback } from 'react';
import { ComicPlan } from '../types';
import RefreshIcon from './icons/RefreshIcon';
import SparklesIcon from './icons/SparklesIcon';
import StoryCheck from './StoryCheck';
import WarningNotice from './WarningNotice';
import { inspectStory } from '../services/storyContract';

interface StorySwiperProps {
    storyPlans: ComicPlan[];
    onSelectStory: (plan: ComicPlan) => void;
    onUpdateStory?: (plan: ComicPlan) => void;
    onRegenerate: () => void;
    onReturnToForm: () => void;
    onCustomPremise: (premise: string) => void;
    isCustomPremiseLoading?: boolean;
    customPremiseError?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  speech: 'Speech',
  thought: 'Thought',
  sfx: 'Sound effect',
  caption: 'Caption',
};

const COMEDIC_ROLE_LABELS: Record<string, string> = {
  establish: 'Setup',
  escalate: 'Escalation',
  punchline: 'Punchline',
  button: 'Final beat',
};

const StorySwiper: React.FC<StorySwiperProps> = ({
    storyPlans,
    onSelectStory,
    onUpdateStory,
    onRegenerate,
    onReturnToForm,
    onCustomPremise,
    isCustomPremiseLoading = false,
    customPremiseError,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [customPremiseText, setCustomPremiseText] = useState('');

    const isOnCustomCard = currentIndex === storyPlans.length;
    const currentPlan = isOnCustomCard ? undefined : storyPlans[currentIndex];
    const totalChoices = storyPlans.length + 1;

    const handleSubmitCustomPremise = useCallback(() => {
        const trimmed = customPremiseText.trim();
        if (trimmed) onCustomPremise(trimmed);
    }, [customPremiseText, onCustomPremise]);

    const regenerateLabel = storyPlans.length === 1 ? 'New Idea' : 'New Ideas';
    const regenerateTooltip = storyPlans.length === 1
        ? 'Generate a fresh AI story concept.'
        : 'Generate a completely new set of story ideas.';

    const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const direction = e.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = (currentIndex + direction + totalChoices) % totalChoices;
        setCurrentIndex(nextIndex);
        requestAnimationFrame(() => {
            document.getElementById(`story-choice-tab-${nextIndex}`)?.focus();
        });
    };

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-6">
            <div className="text-center max-w-2xl px-2">
                <h2 className="text-2xl font-bold font-special-elite text-black">Choose Your Story</h2>
                <p className="mt-2 text-base font-open-sans leading-6 text-gray-700">
                    {storyPlans.length > 1
                        ? 'Compare the concepts, then choose the one you want to turn into a comic.'
                        : 'Review the concept below, or switch to your own angle.'}
                </p>
            </div>

            <div className="w-full min-w-0 bg-paper-light border-3 border-black shadow-xl rounded-lg overflow-hidden">
            <div
                role="tablist"
                aria-label="Story choices"
                onKeyDown={handleTabKeyDown}
                className="w-full flex flex-wrap gap-2 border-b-2 border-black p-4 sm:p-6"
            >
                {storyPlans.map((_, index) => (
                    <button
                        key={index}
                        id={`story-choice-tab-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={currentIndex === index}
                        aria-controls="story-choice-panel"
                        aria-disabled={isCustomPremiseLoading}
                        tabIndex={currentIndex === index ? 0 : -1}
                        disabled={isCustomPremiseLoading}
                        onClick={() => setCurrentIndex(index)}
                        className={`min-h-11 flex-1 basis-[calc(50%-0.25rem)] sm:basis-0 px-3 py-2 rounded-md border-2 font-open-sans font-bold text-sm md:text-base leading-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                            currentIndex === index
                                ? 'bg-black border-black text-white'
                                : 'bg-white border-transparent text-gray-800 hover:border-black'
                        }`}
                    >
                        {storyPlans.length === 1 ? 'Generated story' : `Story ${index + 1}`}
                    </button>
                ))}
                <button
                    id={`story-choice-tab-${storyPlans.length}`}
                    type="button"
                    role="tab"
                    aria-selected={isOnCustomCard}
                    aria-controls="story-choice-panel"
                    aria-disabled={isCustomPremiseLoading}
                    tabIndex={isOnCustomCard ? 0 : -1}
                    disabled={isCustomPremiseLoading}
                    onClick={() => setCurrentIndex(storyPlans.length)}
                        className={`min-h-11 flex-1 basis-[calc(50%-0.25rem)] sm:basis-0 px-3 py-2 rounded-md border-2 font-open-sans font-bold text-sm md:text-base leading-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                        isOnCustomCard
                            ? 'bg-banana border-black text-black'
                            : 'bg-white border-transparent text-gray-800 hover:border-black'
                    }`}
                >
                    Write my own
                </button>
            </div>

            <div
                id="story-choice-panel"
                role="tabpanel"
                aria-labelledby={`story-choice-tab-${currentIndex}`}
                aria-busy={isCustomPremiseLoading}
                className="w-full min-w-0"
            >
                {isOnCustomCard ? (
                    <>
                        <header className="text-left px-6 pt-8 pb-6 md:px-10">
                            <h3 className="text-xl font-special-elite font-bold text-black">Write Your Own Angle</h3>
                            <p className="max-w-xl text-base font-open-sans leading-6 text-gray-700 mt-2">
                                Describe your own premise and we'll build the entire strip around it.
                            </p>
                        </header>
                        <div className="px-6 pb-8 md:px-10 md:pb-10 flex flex-col gap-4">
                            <label htmlFor="custom-premise" className="text-lg font-special-elite font-bold text-black">
                                Your story premise
                            </label>
                            <textarea
                                id="custom-premise"
                                value={customPremiseText}
                                onChange={(e) => setCustomPremiseText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitCustomPremise();
                                }}
                                placeholder="Describe your own narrative angle or premise… e.g. 'A senator who campaigns against AI secretly uses it to write all his speeches — and gets caught when the AI recommends products he's never heard of.'"
                                className="w-full min-h-40 p-3 font-open-sans text-base leading-6 text-black bg-white border-2 border-black rounded-lg resize-y focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 placeholder:text-gray-600"
                                disabled={isCustomPremiseLoading}
                            />
                            {customPremiseError && (
                                <WarningNotice role="alert" title={customPremiseError} message="Adjust your premise above and try again." />
                            )}
                            <button
                                type="button"
                                onClick={handleSubmitCustomPremise}
                                disabled={!customPremiseText.trim() || isCustomPremiseLoading}
                                className="inline-flex min-h-12 items-center justify-center gap-3 w-full mt-4 px-6 py-4 bg-banana text-black font-bangers text-2xl tracking-wider border-2 border-black border-b-8 hover:bg-yellow-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <div className="min-h-5 text-center" aria-live="polite">
                                {isCustomPremiseLoading && (
                                    <p role="status" className="text-sm font-open-sans font-semibold text-gray-700">
                                        Building your custom story plan. Please keep this page open.
                                    </p>
                                )}
                            </div>
                            <p className="text-sm text-center font-open-sans text-gray-700">
                                Tip: ⌘↵ / Ctrl↵ to submit
                            </p>
                        </div>
                    </>
                ) : currentPlan ? (
                    <>
                        <header className="text-center px-6 pt-8 pb-6 md:px-10">
                            {storyPlans.length > 1 && (
                                    <p className="text-sm font-open-sans font-semibold text-gray-700 mb-2">
                                    Story {currentIndex + 1} of {storyPlans.length}
                                </p>
                            )}
                            <h3 className="text-3xl md:text-4xl font-bangers tracking-wider text-black [overflow-wrap:anywhere]">{currentPlan.title}</h3>
                            <p className="max-w-2xl mx-auto text-base font-open-sans leading-6 text-gray-700 mt-2">{currentPlan.summary}</p>
                        </header>
                        <div className="px-6 pb-8 md:px-10 space-y-8">
                            {currentPlan.premise && (
                                <div className="space-y-2">
                                    <h4 className="text-lg font-special-elite font-bold text-black">Core joke</h4>
                                    <p className="mt-1 text-sm md:text-base font-open-sans leading-6 text-gray-900">{currentPlan.premise}</p>
                                </div>
                            )}
                            <div>
                                <h4 className="font-special-elite font-bold text-lg text-black mb-3">Panel outline</h4>
                                <div className="divide-y divide-black/20 border-y border-black/20">
                            {currentPlan.panels.map((panel, i) => (
                                <div key={panel.slug} className="grid min-w-0 grid-cols-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] gap-2 sm:gap-5 py-4 first:pt-3 last:pb-3">
                                    <div>
                                        <span className="font-special-elite text-lg font-bold text-black">Panel {i + 1}</span>
                                        {panel.comedic_role && (
                                            <span className="block mt-0.5 text-xs font-open-sans font-bold tracking-wide text-gray-700 uppercase">
                                                {COMEDIC_ROLE_LABELS[panel.comedic_role] ?? panel.comedic_role}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-open-sans font-bold uppercase tracking-wide text-gray-700">
                                                Scene
                                            </span>
                                            <p className="font-open-sans text-base leading-6 text-gray-800 [overflow-wrap:anywhere]">
                                                {panel.visual_prompt}
                                            </p>
                                        </div>
                                        {panel.text_elements.length > 0 ? (
                                            panel.text_elements.map((el, j) => (
                                                <div key={j} className="flex flex-col xs:flex-row gap-1 xs:gap-3">
                                                    <span className="flex-shrink-0 text-xs font-open-sans font-bold uppercase tracking-wide text-gray-700">
                                                        {ROLE_LABELS[el.role] ?? 'Text'}
                                                    </span>
                                                    <p className="min-w-0 font-open-sans text-base leading-6 text-gray-900 [overflow-wrap:anywhere]">“{el.text}”</p>
                                                </div>
                                            ))
                                        ) : (
                                    <p className="font-open-sans text-sm italic leading-6 text-gray-700">No dialogue — the visual carries this beat.</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                                </div>
                            </div>
                            <StoryCheck plan={currentPlan} onChange={onUpdateStory} />
                        </div>
                    </>
                ) : null}

                {!isOnCustomCard && currentPlan && (
                <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-4 px-6 py-6 md:px-10 md:pb-10 border-t-2 border-black">
                    <button
                        type="button"
                        onClick={onRegenerate}
                        title={regenerateTooltip}
                        className="inline-flex min-h-11 items-center justify-center gap-2 w-full sm:w-auto px-4 py-3 bg-white text-black font-open-sans font-bold border-2 border-black hover:bg-stone-100 transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                        <RefreshIcon className="w-5 h-5" />
                        {regenerateLabel}
                    </button>
                    <button
                        type="button"
                                onClick={() => onSelectStory(currentPlan)}
                                disabled={inspectStory(currentPlan).some(issue => issue.blocking)}
                        className="inline-flex min-h-12 items-center justify-center gap-3 w-full sm:flex-1 px-6 py-4 bg-banana text-black font-bangers text-2xl tracking-wider border-2 border-black border-b-8 hover:bg-yellow-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <SparklesIcon className="w-6 h-6" />
                        Choose This Story
                    </button>
                </div>
                )}
            </div>
            </div>

            <button
                type="button"
                onClick={onReturnToForm}
                disabled={isCustomPremiseLoading}
                className="min-h-11 px-3 inline-flex items-center justify-center font-open-sans font-semibold text-gray-700 underline underline-offset-4 decoration-dotted hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
            >
                Back to topic and style
            </button>
        </div>
    );
};

export default StorySwiper;
