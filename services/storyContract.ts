import type { ComicFormData, ComicPlan, PanelContext, PlanPanel, StoryBrief, StoryIntent } from '../types';
import { attachNumericFacts, inspectNumericFacts } from './numericFacts';

export type StoryIssue = { code: string; message: string; blocking: boolean };
const clean = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const comparable = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

export function captureBrief(form: ComicFormData): StoryBrief {
  return {
    sourceKind: form.newsContext?.trim() ? 'provided-context' : 'topic-only',
    topic: form.topic, background: form.newsContext, stance: form.stance, register: form.comedicStyle,
    illustrationStyle: form.illustrationStyle, imageModel: form.imageModel,
    customPremise: form.customPremise, brainstormMode: form.brainstormMode, includeContext: form.includeContext,
    referenceTags: (form.referenceImages || []).map(image => image.tag),
  };
}

export function sanitizeStory(raw: unknown): StoryIntent | undefined {
  if (!raw || typeof raw !== 'object') return;
  const story = raw as Record<string, unknown>;
  return {
    source_anchor: clean(story.source_anchor), source_excerpt: clean(story.source_excerpt),
    source_panel_slug: clean(story.source_panel_slug, 120),
    satirical_argument: clean(story.satirical_argument), setup: clean(story.setup), payoff: clean(story.payoff),
    review_notes: Array.isArray(story.review_notes) ? story.review_notes.slice(0, 6).map(note => clean(note, 500)).filter(Boolean) : [],
  };
}

/** Bind the model plan to the actual input, never model-echoed settings. */
export function attachStoryBrief(plan: ComicPlan, form: ComicFormData): ComicPlan {
  const brief = captureBrief(form);
  const snapshot = structuredClone(plan);
  return attachNumericFacts({ ...snapshot, id: crypto.randomUUID(), brief,
    panels: snapshot.panels.map(panel => ({ ...panel, id: crypto.randomUUID() })) }, brief);
}

export function inspectStory(plan: ComicPlan): StoryIssue[] {
  const issues: StoryIssue[] = [];
  const add = (code: string, message: string, blocking = true) => issues.push({ code, message, blocking });
  const count = plan.panels.length;
  const magazine = plan.brief?.illustrationStyle === 'magazine-gag';
  if (count < (magazine ? 1 : 2) || count > (magazine ? 1 : 4)) add('panel-count', magazine ? 'This illustration style needs one complete visual gag in one panel. Generate a new idea.' : 'This story needs 2–4 panels. Generate a new idea.');
  if (new Set(plan.panels.map(panel => panel.slug)).size !== count) add('panel-identity', 'Two panels share an identifier. Generate a new idea before drawing.');
  const actions = plan.panels.flatMap(panel => panel.action ? [panel.action.id] : []);
  if (new Set(actions).size !== actions.length) add('action-identity', 'Two actions share an identifier. Generate a new idea before drawing.');
  if (!plan.story || !plan.story.satirical_argument || !plan.story.setup || !plan.story.payoff) {
    add('legacy-story', 'Story intent is incomplete. Generate a new idea with a clear setup and payoff, or review an older imported plan yourself.', Boolean(plan.brief));
  }
  if (plan.brief?.customPremise && comparable(plan.premise || '') !== comparable(plan.brief.customPremise)) {
    add('premise-drift', 'The generated premise changed your required premise. Generate a new idea or revise your own angle.');
  }
  if (plan.brief?.sourceKind === 'provided-context') {
    if (!plan.story?.source_anchor || !plan.story.source_excerpt) add('source-missing', 'The plan has not identified its source detail. Generate a new idea that identifies the supplied fact before drawing.');
    else {
      if (!comparable(plan.brief.background || '').includes(comparable(plan.story.source_excerpt))) {
        add('source-excerpt', 'The chosen source excerpt is not present in your background. Generate a new idea rather than treating an invented detail as sourced.');
      }
      if (!plan.panels.some(panel => panel.slug === plan.story!.source_panel_slug)) add('source-panel', 'The source detail points to a missing panel. Generate a new idea.');
    }
  }
  for (const [index, panel] of plan.panels.entries()) {
    if (!panel.action?.id || !panel.action.description || !panel.action.before || !panel.action.after) add('action-missing', `Panel ${index + 1}: the action description is incomplete. Generate a new idea with a visible action and its before/after state.`, Boolean(plan.story));
    for (const effect of panel.text_elements.filter(element => element.role === 'sfx')) {
      if (!effect.action_id || !panel.action) add('effect-unbound', `“${effect.text}” has no explicit action binding. Assign its action below before drawing.`);
      else if (effect.action_id !== panel.action.id) add('effect-owner', `“${effect.text}” is attached to a different action than panel ${index + 1}. Assign it to the action that produces the sound.`);
    }
  }
  for (const note of plan.story?.review_notes || []) add('writer-note', `Writer’s review: ${note}`, false);
  return [...issues, ...inspectNumericFacts(plan)];
}

export function assertDrawableStory(plan: ComicPlan) {
  const blocking = inspectStory(plan).filter(issue => issue.blocking);
  if (blocking.length) throw new Error(`Check the story before drawing: ${blocking.map(issue => issue.message).join(' ')}`);
}

/** A deliberate user correction, not a heuristic guessing what a sound means. */
export function assignEffect(plan: ComicPlan, panelIndex: number, elementIndex: number, actionId: string): ComicPlan {
  const target = plan.panels.findIndex(panel => panel.action?.id === actionId);
  const effect = plan.panels[panelIndex]?.text_elements[elementIndex];
  if (target < 0 || effect?.role !== 'sfx') return plan;
  return { ...plan, panels: plan.panels.map((panel, index) => ({
    ...panel,
    text_elements: [
      ...panel.text_elements.filter((_, i) => index !== panelIndex || i !== elementIndex),
      ...(index === target ? [{ ...effect, action_id: actionId }] : []),
    ],
  })) };
}

export function panelStoryContext(plan: Pick<ComicPlan, 'premise' | 'story' | 'brief' | 'numericFacts' | 'numericUses'>, panel: { comedic_role?: string; action?: PlanPanel['action']; text_elements: { role: string; text: string; action_id?: string }[] }, index: number, total: number): PanelContext {
  return { premise: plan.premise, story: plan.story, brief: plan.brief, action: panel.action,
    numericFacts: plan.numericFacts, numericUses: plan.numericUses,
    effects: panel.text_elements.filter(element => element.role === 'sfx').map(({ text, action_id }) => ({ text, action_id })),
    comedicRole: panel.comedic_role, panelIndex: index, totalPanels: total };
}
