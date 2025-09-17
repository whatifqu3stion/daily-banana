import React, { useState } from 'react';
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

    const handleSelect = () => {
        onSelectStory(currentPlan);
    }

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold font-special-elite">Choose Your Story</h2>
                <p className="text-lg font-lora">Here are a few story ideas. Pick your favorite to continue to the style preview.</p>
            </div>

            <div className="w-full bg-stone-100 border-4 border-black relative">
                <header className="text-center p-4 border-b-4 border-black">
                    <h3 className="text-3xl font-bangers tracking-wider">{currentPlan.title}</h3>
                </header>

                <div className="p-8 min-h-[300px] flex flex-col justify-center items-center text-center">
                    <p className="text-xl font-lora italic text-gray-800">
                        "{currentPlan.summary}"
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex justify-between items-center p-4 border-t-2 border-black">
                    <button onClick={handlePrev} disabled={currentIndex === 0} className="disabled:opacity-40 p-2">
                        <ChevronLeftIcon className="w-8 h-8" />
                    </button>
                    <span className="font-special-elite text-lg">Idea {currentIndex + 1} of {storyPlans.length}</span>
                    <button onClick={handleNext} disabled={currentIndex === storyPlans.length - 1} className="disabled:opacity-40 p-2">
                         <ChevronRightIcon className="w-8 h-8" />
                    </button>
                </div>
            </div>
            
            <div className="w-full flex justify-center items-center gap-4 pt-4">
                <Tooltip text="Go back and change the topic or style.">
                    <button onClick={onReturnToForm} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded">
                        Start Over
                    </button>
                </Tooltip>
                 <Tooltip text="Generate a completely new set of story ideas.">
                    <button onClick={onRegenerate} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded">
                        <RefreshIcon className="w-5 h-5" />
                        New Ideas
                    </button>
                </Tooltip>
                <Tooltip text="I like this story! Let's create the art.">
                    <button onClick={handleSelect} className="generate-button inline-flex items-center justify-center gap-3 px-8 py-3 bg-black text-white font-bangers text-xl tracking-wider border-2 border-black transition-colors rounded-none">
                        <SparklesIcon className="w-6 h-6" />
                        Choose This Story
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};

export default StorySwiper;