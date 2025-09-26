import React, { useState, useEffect } from 'react';
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
}

const StorySwiper: React.FC<StorySwiperProps> = ({ storyPlans, onSelectStory, onRegenerate, onReturnToForm }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const currentPlan = storyPlans[currentIndex];

    const handleNext = () => {
        setCurrentIndex(prev => Math.min(prev + 1, storyPlans.length - 1));
    };

    const handlePrev = () => {
        setCurrentIndex(prev => Math.max(prev - 1, 0));
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                handleNext();
            } else if (e.key === 'ArrowLeft') {
                handlePrev();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [storyPlans.length]); // Re-add listener if plans change, though not expected

    const handleSelect = () => {
        onSelectStory(currentPlan);
    }

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold font-special-elite text-black">Choose Your Story</h2>
                <p className="text-lg font-lora text-black">Here are a few story ideas. Pick your favorite to continue to the style preview.</p>
            </div>

            <div className="w-full bg-paper-light border-3 border-black relative shadow-xl rounded-lg overflow-hidden">
                <header className="text-center p-4 border-b-2 border-black bg-newsprint">
                    <h3 className="text-3xl font-bangers tracking-wider text-black">{currentPlan.title}</h3>
                </header>

                <div className="bg-paper-light p-6 min-h-[250px] flex flex-col justify-center items-center text-center">
                    <p className="text-3xl font-lora italic text-black">
                        "{currentPlan.summary}"
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex justify-between items-center p-4 border-t-2 border-black bg-newsprint">
                    <button 
                        onClick={handlePrev} 
                        disabled={currentIndex === 0} 
                        className="w-12 h-12 flex items-center justify-center bg-banana rounded-full text-black disabled:opacity-40 disabled:bg-yellow-200 transition-colors"
                        aria-label="Previous story"
                    >
                        <ChevronLeftIcon className="w-8 h-8" strokeWidth="2.5" />
                    </button>
                    <span className="font-special-elite text-lg text-black">Idea {currentIndex + 1} of {storyPlans.length}</span>
                    <button 
                        onClick={handleNext} 
                        disabled={currentIndex === storyPlans.length - 1} 
                        className="w-12 h-12 flex items-center justify-center bg-banana rounded-full text-black disabled:opacity-40 disabled:bg-yellow-200 transition-colors"
                        aria-label="Next story"
                    >
                         <ChevronRightIcon className="w-8 h-8" strokeWidth="2.5" />
                    </button>
                </div>
            </div>
            
            <div className="w-full flex justify-center items-center gap-4 pt-4">
                <Tooltip text="Go back and change the topic or style.">
                    <button onClick={onReturnToForm} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md">
                        Start Over
                    </button>
                </Tooltip>
                 <Tooltip text="Generate a completely new set of story ideas.">
                    <button onClick={onRegenerate} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md">
                        <RefreshIcon className="w-5 h-5" />
                        New Ideas
                    </button>
                </Tooltip>
                <Tooltip text="I like this story! Let's create the art." wrapperClassName="generate-button-wrapper">
                    <button 
                        onClick={handleSelect} 
                        className="inline-flex items-center justify-center gap-3 px-8 py-1.5 bg-banana text-black font-bangers text-xl tracking-wider border-2 border-black border-b-4 hover:-translate-y-0.5 active:border-b-2 active:translate-y-0 active:mt-0.5 transition-all rounded-md"
                    >
                        <SparklesIcon className="w-6 h-6" />
                        Choose This Story
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};

export default StorySwiper;