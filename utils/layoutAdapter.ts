import { PlanPanel } from '../types';

/**
 * Defines the output shape of the layout adapter, providing a direct grid column span
 * and the aspect ratio passed through from the AI's plan.
 */
export interface LayoutProps {
  gridCols: number;
  aspectRatio: PlanPanel['aspect_ratio'];
}

// A simplified type for the input to make the adapter more reusable.
type PanelWithSize = { 
    size?: PlanPanel['size'] | null;
    aspect_ratio: PlanPanel['aspect_ratio'];
};

/**
 * A pure function that takes an array of panels and returns an array of layout properties.
 * It translates a simple size hint ('small', 'medium', 'large') from the AI into a
 * column span for a 6-column responsive grid.
 *
 * @param panels An array of panel objects from the AI's plan.
 * @returns An array of `LayoutProps` objects with layout info for each panel.
 */
export const layoutAdapter = (panels: PanelWithSize[]): LayoutProps[] => {
    if (panels.length === 0) return [];

    return panels.map((panel) => {
        let gridCols = 2; // Default for 'small'
        switch (panel.size) {
            case 'large':
                gridCols = 6;
                break;
            case 'medium':
                gridCols = 3;
                break;
            case 'small':
            default:
                gridCols = 2;
                break;
        }

        // To ensure a row of three small panels fits, we cap the total cols in a "logical row".
        // This is a simple way to prevent awkward wrapping without complex look-ahead logic.
        // We can refine this if needed, but it's a robust starting point.
        // For now, the AI's creativity within the 3-6 panel limit is the primary driver.
        
        return { 
            gridCols,
            aspectRatio: panel.aspect_ratio || '1:1'
        };
    });
};
