// utils/layoutAdapter.ts
import { PlanPanel, LayoutProps } from '../types';

const sizeToGridCols = (size: PlanPanel['size']): number => {
    switch (size) {
        case 'large': return 6;
        case 'medium': return 3;
        case 'small': return 2;
        default: return 2;
    }
};

/**
 * Adapts the AI's layout plan into a concrete grid layout.
 * It translates 'small', 'medium', 'large' hints into column spans
 * for a 6-column grid and adjusts them to fill rows neatly.
 * @param panels The array of panel plans from the AI.
 * @returns An array of LayoutProps for each panel.
 */
export const layoutAdapter = (panels: PlanPanel[]): LayoutProps[] => {
    if (!panels || panels.length === 0) {
        return [];
    }

    const initialLayouts: LayoutProps[] = panels.map(panel => ({
        gridCols: sizeToGridCols(panel.size),
        aspectRatio: panel.aspect_ratio,
    }));
    
    // Handle single panel case (e.g., magazine gag)
    if (initialLayouts.length === 1) {
        initialLayouts[0].gridCols = 6;
        return initialLayouts;
    }

    const finalLayouts: LayoutProps[] = [];
    let currentRow: LayoutProps[] = [];
    let currentRowWidth = 0;

    const flushRow = () => {
        if (currentRow.length === 0) return;

        const totalWidth = currentRow.reduce((sum, p) => sum + p.gridCols, 0);
        
        // Simple adjustment logic for common awkward cases.
        // If a row has two panels and they don't fill the space, make them equal medium panels.
        if (currentRow.length === 2 && totalWidth < 6) {
            currentRow.forEach(p => p.gridCols = 3);
        } 
        // If a row has one panel that doesn't fill the space, make it a full-width large panel.
        else if (currentRow.length === 1 && totalWidth < 6) {
            currentRow[0].gridCols = 6;
        }

        finalLayouts.push(...currentRow);
        currentRow = [];
        currentRowWidth = 0;
    };

    initialLayouts.forEach(layout => {
        if (currentRow.length > 0 && currentRowWidth + layout.gridCols > 6) {
            flushRow();
        }
        currentRow.push(layout);
        currentRowWidth += layout.gridCols;
    });

    flushRow(); // Flush the last row

    return finalLayouts;
};
