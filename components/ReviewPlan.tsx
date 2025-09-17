import React, { useState, useCallback } from 'react';
import { ComicPlan, PlanPanel, ComicFormData, ProcessedReferenceImage } from '../types';
import { layoutAdapter, LayoutProps } from '../utils/layoutAdapter';
import { geminiService } from '../services/geminiService';
import Tooltip from './Tooltip';
import RefreshIcon from './icons/RefreshIcon';
import NewComicIcon from './icons/NewComicIcon';
import SparklesIcon from './icons/SparklesIcon';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';


// A slimmed-down version of the Panel's refinement UI
const RefinementControls: React.FC<{
    panelData: { image: string, visual_prompt: string, consistency_tags: string[] };
    formData: ComicFormData;
    userProvidedImages: ProcessedReferenceImage[];
    onNewImage: (base64: string) => void;
}> = ({ panelData, formData, userProvidedImages, onNewImage }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [userTags, setUserTags] = useState('');
    const [error, setError] = useState<string|null>(null);

    const handleRefine = async () => {
        if (!userTags.trim()) {
            setError("Please add refinement details to describe the change.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const newImage = await geminiService.refinePanelImage(
                panelData.image,
                userTags,
                formData.illustrationStyle,
                // FIX: Corrected a typo. The `ComicFormData` type has `comedicStyle`, not `tone`.
                formData.comedicStyle,
                userProvidedImages
            );
            onNewImage(newImage);
        } catch (err) {
            setError("Failed to refine image. Please try again.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
      <div className="bg-stone-50 p-3 border-t-2 border-black">
        {error && <p className="text-red-600 text-sm mb-2 text-center">{error}</p>}
        <div className="flex items-center gap-2">
            <Tooltip text="Add keywords to refine this image (e.g., 'wearing a blue hat', 'sad expression').">
                <NewComicIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
            </Tooltip>
            <input
                type="text"
                value={userTags}
                onChange={(e) => { setUserTags(e.target.value); setError(null); }}
                placeholder="Refine style, character, etc..."
                className="w-full text-sm p-2 bg-gray-100 border border-gray-300 rounded focus:ring-1 focus:ring-black focus:outline-none"
            />
            <Tooltip text="Refine the image using your new tags. Good for small changes.">
                <button
                    onClick={handleRefine}
                    disabled={isLoading}
                    className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50"
                    aria-label="Refine panel image"
                >
                    <SparklesIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </Tooltip>
        </div>
      </div>
    );
};


interface ReviewPlanProps {
    reviewData: {
        plan: ComicPlan;
        firstPanelImage: string;
        userProvidedImages: ProcessedReferenceImage[];
        panelLayouts: LayoutProps[];
    };
    formData: ComicFormData;
    onContinue: () => void;
    onReturnToForm: () => void;
    onRegenerateConcept: () => void;
    onUpdateReviewImage: (newImage: string) => void;
}

const ReviewPlan: React.FC<ReviewPlanProps> = ({
    reviewData,
    formData,
    onContinue,
    onReturnToForm,
    onRegenerateConcept,
    onUpdateReviewImage
}) => {
    const { plan, firstPanelImage, userProvidedImages } = reviewData;
    const [currentIndex, setCurrentIndex] = useState(0);

    const handleNext = () => {
        setCurrentIndex(prev => Math.min(prev + 1, plan.panels.length - 1));
    };

    const handlePrev = () => {
        setCurrentIndex(prev => Math.max(prev - 1, 0));
    };

    const currentPanel = plan.panels[currentIndex];

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold font-special-elite">Review Your Comic Plan</h2>
                <p className="text-lg font-lora">Here's the script and a preview of the art style. Refine the first panel to lock in the look, then continue.</p>
            </div>

            <div className="w-full bg-stone-100 border-4 border-black">
                <header className="text-center p-4 border-b-4 border-black">
                    <h3 className="text-3xl font-bangers tracking-wider">{plan.title}</h3>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 min-h-[400px]">
                    {/* Left side: Panel Image (only for first panel) */}
                    <div className="flex flex-col justify-center items-center p-4 border-b-2 md:border-b-0 md:border-r-2 border-black">
                         {currentIndex === 0 ? (
                            <div className="w-full max-w-sm flex flex-col border-2 border-black">
                                <img
                                    src={`data:image/png;base64,${firstPanelImage}`}
                                    alt="Preview of the first panel's art style"
                                    className="w-full aspect-square object-cover"
                                />
                                <RefinementControls 
                                    panelData={{
                                        image: firstPanelImage,
                                        visual_prompt: plan.panels[0].visual_prompt,
                                        consistency_tags: plan.panels[0].consistency_tags
                                    }}
                                    formData={formData}
                                    userProvidedImages={userProvidedImages}
                                    onNewImage={onUpdateReviewImage}
                                />
                            </div>
                         ) : (
                            <div className="text-center text-gray-500 p-8">
                                <p className="font-bold">Panel {currentIndex + 1}</p>
                                <p>The image for this panel will be generated using the style from the first panel.</p>
                            </div>
                         )}
                    </div>

                    {/* Right side: Panel Details */}
                    <div className="p-6 flex flex-col">
                        <p className="font-bold text-lg mb-2 font-special-elite">
                            Panel {currentIndex + 1} of {plan.panels.length}: <span className="font-normal">{currentPanel.slug}</span>
                        </p>
                        
                        <div className="space-y-4 text-sm font-lora italic text-gray-800 mb-4 flex-grow">
                             <p><strong>Visual:</strong> {currentPanel.visual_prompt}</p>
                             {currentPanel.text_elements.map((el, i) => (
                                <p key={i}>
                                    <strong>{el.role.toUpperCase()}:</strong> "{el.text}"
                                </p>
                             ))}
                        </div>
                        
                        <div className="flex justify-between items-center mt-auto pt-4">
                            <button onClick={handlePrev} disabled={currentIndex === 0} className="disabled:opacity-40">
                                <ChevronLeftIcon className="w-8 h-8" />
                            </button>
                            <span className="font-special-elite">{currentIndex + 1} / {plan.panels.length}</span>
                            <button onClick={handleNext} disabled={currentIndex === plan.panels.length - 1} className="disabled:opacity-40">
                                 <ChevronRightIcon className="w-8 h-8" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="w-full flex justify-center items-center gap-4 pt-4">
                <Tooltip text="Go back and change the topic or style.">
                    <button onClick={onReturnToForm} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded">
                        Start Over
                    </button>
                </Tooltip>
                 <Tooltip text="Generate a completely new story and style preview.">
                    <button onClick={onRegenerateConcept} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded">
                        <RefreshIcon className="w-5 h-5" />
                        New Concept
                    </button>
                </Tooltip>
                <Tooltip text="Looks good! Generate the full comic strip.">
                    <button onClick={onContinue} className="generate-button inline-flex items-center justify-center gap-3 px-8 py-3 bg-black text-white font-bangers text-xl tracking-wider border-2 border-black transition-colors rounded-none">
                        Generate Full Comic
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};

export default ReviewPlan;