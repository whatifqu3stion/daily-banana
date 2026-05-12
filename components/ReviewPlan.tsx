// components/ReviewPlan.tsx
// Shown after panel 0 has been generated. Lets the user inspect the comic plan,
// refine or regenerate the first panel image, then continue generating the rest.
import React, { useState } from 'react';
import { ComicFormData, ReviewData } from '../types';
import { geminiService } from '../services/geminiService';
import RefreshIcon from './icons/RefreshIcon';
import SparklesIcon from './icons/SparklesIcon';
import NewComicIcon from './icons/NewComicIcon';
import Tooltip from './Tooltip';

interface ReviewPlanProps {
    reviewData: ReviewData;
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
    const [refinementTags, setRefinementTags] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const firstPanelPlan = reviewData.plan.panels[0];

    // Pool consistency tags across all panels, not just panel 0.
    const globalTags = [...new Set(reviewData.plan.panels.flatMap(p => p.consistency_tags ?? []))];

    const handleRefine = async () => {
        if (!refinementTags) {
            setError('Please enter some refinement details to describe the change.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const newImage = await geminiService.refinePanelImage(
                reviewData.firstPanelImage,
                refinementTags,
                firstPanelPlan.visual_prompt,
                globalTags,
                formData.illustrationStyle,
                formData.comedicStyle,
                reviewData.userProvidedImages,
                formData.imageModel,
                formData.stance,
                reviewData.panelLayouts[0]?.aspectRatio,
                firstPanelPlan.text_elements?.map(el => el.text) ?? [],
                { premise: reviewData.plan.premise, comedicRole: firstPanelPlan.comedic_role, panelIndex: 0, totalPanels: reviewData.plan.panels.length },
            );
            onUpdateReviewImage(newImage);
        } catch (err: any) {
            setError(err.message || "Image refinement failed. Please try again.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegenerate = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const userTags = refinementTags.split(',').map(t => t.trim()).filter(Boolean);
            const newImage = await geminiService.generatePanelImageWithReferences(
                firstPanelPlan.visual_prompt,
                [...globalTags, ...userTags],
                formData.illustrationStyle,
                formData.comedicStyle,
                reviewData.userProvidedImages,
                formData.imageModel,
                formData.stance,
                reviewData.panelLayouts[0]?.aspectRatio,
                firstPanelPlan.text_elements?.map(el => el.text) ?? [],
                { premise: reviewData.plan.premise, comedicRole: firstPanelPlan.comedic_role, panelIndex: 0, totalPanels: reviewData.plan.panels.length },
            );
            onUpdateReviewImage(newImage);
        } catch (err: any) {
            setError(err.message || "Image regeneration failed. Please try again.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-8">
            <div className="text-center">
                <h2 className="text-2xl font-bold font-special-elite text-black">Review Your Comic Plan</h2>
                <p className="text-lg font-lora text-black">Here's the plan for your comic. You can refine the first panel before generating the full strip.</p>
            </div>

            {error && (
                <div className="w-full text-center my-2 p-3 bg-red-100 rounded-md border border-red-300">
                    <p className="text-red-800 font-bold">{error}</p>
                </div>
            )}

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left side: Plan details */}
                <div className="bg-paper-light border-3 border-black p-6 flex flex-col shadow-xl rounded-lg">
                    <header className="text-center pb-4 border-b-2 border-black">
                        <h3 className="text-3xl font-bangers tracking-wider text-black">{reviewData.plan.title}</h3>
                        <p className="text-lg font-lora italic text-gray-800 mt-2">
                            "{reviewData.plan.summary}"
                        </p>
                    </header>
                    <div className="mt-4 space-y-4 overflow-y-auto max-h-[400px] pr-2">
                        {reviewData.plan.panels.map((panel, index) => (
                            <div key={panel.slug} className="text-sm border-b border-gray-300 pb-2 last:border-b-0">
                                <h4 className="font-bold font-special-elite text-gray-700">Panel {index + 1}:</h4>
                                <div className="font-lora text-gray-700 space-y-1 mt-1">
                                    {panel.text_elements.length > 0 ? (
                                        panel.text_elements.map((el, elIndex) => (
                                            <p key={elIndex}>
                                                <span className="font-bold capitalize">{el.role}:</span> "{el.text}"
                                            </p>
                                        ))
                                    ) : (
                                        <p className="italic">This panel is purely visual.</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right side: Image preview and controls */}
                <div className="flex flex-col">
                    <div className="bg-white border-2 border-black flex flex-col">
                        <div className="relative aspect-square border-b-2 border-black">
                             {isLoading && (
                                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20" />
                            )}
                            <img
                                src={`data:image/png;base64,${reviewData.firstPanelImage}`}
                                alt="First panel preview"
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div className="flex items-center gap-2 p-2 border-t border-gray-200">
                             <Tooltip text="Add keywords to refine this image (e.g., 'wearing a blue hat', 'sad expression').">
                                <NewComicIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                            </Tooltip>
                            <input
                                type="text"
                                value={refinementTags}
                                onChange={(e) => setRefinementTags(e.target.value)}
                                placeholder="Add refinement details..."
                                className="w-full text-xs p-1 bg-gray-100 border border-gray-300 rounded-md focus:ring-1 focus:ring-black focus:outline-none text-black placeholder:text-gray-500"
                            />
                            <Tooltip text="Refine the image using the original as a base plus your new tags. Good for small changes.">
                                <button onClick={handleRefine} disabled={isLoading} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50">
                                    <SparklesIcon className={`w-5 h-5 text-black ${isLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </Tooltip>
                            <Tooltip text="Generate a completely new image from the original prompt plus your new tags. Good for major changes.">
                                <button onClick={handleRegenerate} disabled={isLoading} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50">
                                    <RefreshIcon className={`w-5 h-5 text-black ${isLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full flex flex-wrap justify-center items-center gap-4 pt-4">
                <Tooltip text="Go back and change the topic or choose a different story idea.">
                    <button onClick={onReturnToForm} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md">
                        Go Back
                    </button>
                </Tooltip>
                <Tooltip text="Generate a completely new comic concept with the same settings.">
                    <button onClick={onRegenerateConcept} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md">
                        <RefreshIcon className="w-5 h-5" />
                        New Concept
                    </button>
                </Tooltip>
                <Tooltip text="Looks good! Generate the rest of the comic panels." wrapperClassName="generate-button-wrapper">
                    <button
                        onClick={onContinue}
                        className="inline-flex items-center justify-center gap-3 px-8 py-2 bg-banana text-black font-bangers text-xl tracking-wider border-2 border-black border-b-4 hover:-translate-y-0.5 active:border-b-2 active:translate-y-0 active:mt-0.5 transition-all rounded-md"
                    >
                        <SparklesIcon className="w-6 h-6" />
                        Continue Generation
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};

export default ReviewPlan;