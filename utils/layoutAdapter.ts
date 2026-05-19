// utils/layoutAdapter.ts
import { PlanPanel, LayoutProps, AspectRatio } from '../types';

type TemplateSlot = {
    gridCols: number;
    aspectRatio: AspectRatio;
};

/**
 * Curated layout templates keyed by name.
 * Full-width panels (col-span-6) get a 16:9 cinematic ratio.
 * All other panels stay 1:1 — width variation alone provides differentiation.
 * This keeps rows consistent in height (no mixed-ratio mismatches within a row).
 */
const TEMPLATES: Record<string, TemplateSlot[]> = {
    // ── 1 panel ─────────────────────────────────────────────────────────────
    'single': [
        { gridCols: 6, aspectRatio: '16:9' },
    ],

    // ── 2 panels ─────────────────────────────────────────────────────────────
    // Default: equal halves
    'split': [
        { gridCols: 3, aspectRatio: '1:1' },
        { gridCols: 3, aspectRatio: '1:1' },
    ],
    // Establish shot gets extra width
    'feature-left': [
        { gridCols: 4, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
    ],
    // Punchline gets extra width
    'feature-right': [
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 4, aspectRatio: '1:1' },
    ],

    // ── 3 panels ─────────────────────────────────────────────────────────────
    // Default: three equal beats
    'triplet': [
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
    ],
    // Cinematic opener, then two smaller panels
    'cinematic-open-3': [
        { gridCols: 6, aspectRatio: '16:9' },
        { gridCols: 3, aspectRatio: '1:1' },
        { gridCols: 3, aspectRatio: '1:1' },
    ],
    // Two build-up panels, then a panoramic punchline
    'wide-punchline-3': [
        { gridCols: 3, aspectRatio: '1:1' },
        { gridCols: 3, aspectRatio: '1:1' },
        { gridCols: 6, aspectRatio: '16:9' },
    ],

    // ── 4 panels ─────────────────────────────────────────────────────────────
    // Default: two balanced rows
    'quad-equal': [
        { gridCols: 3, aspectRatio: '1:1' },
        { gridCols: 3, aspectRatio: '1:1' },
        { gridCols: 3, aspectRatio: '1:1' },
        { gridCols: 3, aspectRatio: '1:1' },
    ],
    // Cinematic opener, then three equal beats
    'cinematic-open-4': [
        { gridCols: 6, aspectRatio: '16:9' },
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
    ],
    // Three beats, then a panoramic punchline
    'wide-punchline-4': [
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 6, aspectRatio: '16:9' },
    ],
    // Wide establish + two tight beats + wide punchline — diagonal visual flow
    'bookend-4': [
        { gridCols: 4, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 2, aspectRatio: '1:1' },
        { gridCols: 4, aspectRatio: '1:1' },
    ],
};

const isLarge     = (p: PlanPanel) => p.size === 'large';
const isEstablish = (p: PlanPanel) => p.comedic_role === 'establish';
const isPunchline = (p: PlanPanel) => p.comedic_role === 'punchline' || p.comedic_role === 'button';

/**
 * Picks the best named template by reading comedic_role + size assignments.
 */
function pickTemplateName(panels: PlanPanel[]): string {
    const n   = panels.length;
    const p0  = panels[0];
    const pLast = panels[n - 1];

    switch (n) {
        case 1:
            return 'single';

        case 2:
            if (isEstablish(p0) && isLarge(p0))      return 'feature-left';
            if (isPunchline(pLast) && isLarge(pLast)) return 'feature-right';
            return 'split';

        case 3:
            if (isEstablish(p0) && isLarge(p0))      return 'cinematic-open-3';
            if (isPunchline(pLast) && isLarge(pLast)) return 'wide-punchline-3';
            return 'triplet';

        case 4:
            if (isEstablish(p0) && isLarge(p0) && isPunchline(pLast) && isLarge(pLast)) return 'bookend-4';
            if (isEstablish(p0) && isLarge(p0))      return 'cinematic-open-4';
            if (isPunchline(pLast) && isLarge(pLast)) return 'wide-punchline-4';
            return 'quad-equal';

        default:
            // Fallback for unexpected panel counts: distribute into equal columns
            return 'quad-equal';
    }
}

/**
 * Adapts the AI's panel plan into concrete layout props using curated,
 * comedic-role-aware named templates instead of a generic row-packer.
 */
export const layoutAdapter = (panels: PlanPanel[]): LayoutProps[] => {
    if (!panels || panels.length === 0) return [];

    const templateName = pickTemplateName(panels);
    const template = TEMPLATES[templateName];

    if (!template || template.length !== panels.length) {
        // Safety fallback: equal-width squares
        const cols = Math.max(2, Math.floor(6 / Math.min(panels.length, 3)));
        return panels.map(() => ({ gridCols: cols, aspectRatio: '1:1' as AspectRatio }));
    }

    return template.map(slot => ({
        gridCols: slot.gridCols,
        aspectRatio: slot.aspectRatio,
    }));
};
