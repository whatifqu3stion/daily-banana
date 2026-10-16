import type { ComicFormData, ComicPlan, PanelContext, PlanPanel, StoryBrief, StoryIntent } from '../types';
import { attachNumericFacts, inspectNumericFacts } from './numericFacts';

export type StoryIssue = { code: string; message: string; blocking: boolean; quote?: string; location?: string; factId?: string };
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
  const add = (code: string, message: string, blocking = false) => issues.push({ code, message, blocking });
  if (!Array.isArray(plan?.panels) || !plan.panels.length) {
    add('empty-plan', 'The response contains no drawable panels. Generate a new idea.', true);
    return issues;
  }
  for (const [index, panel] of plan.panels.entries()) {
    if (!panel || typeof panel.visual_prompt !== 'string' || !panel.visual_prompt.trim() ||
        !Array.isArray(panel.text_elements) || !Array.isArray(panel.consistency_tags) ||
        panel.text_elements.some(element => !element || typeof element.text !== 'string') ||
        panel.consistency_tags.some(tag => typeof tag !== 'string')) {
      add('panel-data', `Panel ${index + 1} is missing usable drawing data. Generate a new idea.`, true);
    }
  }
  if (issues.length) return issues;
  const count = plan.panels.length;
  const magazine = plan.brief?.illustrationStyle === 'magazine-gag';
  if (count > (magazine ? 1 : 6)) add('panel-count', magazine ? 'This style normally uses one complete visual gag.' : 'This story is longer than the usual 1–6 panels.');
  if (new Set(plan.panels.map(panel => panel.slug)).size !== count) add('panel-identity', 'Two panels share an identifier. Generate a new idea.', true);
  const actions = plan.panels.flatMap(panel => panel.action ? [panel.action.id] : []);
  if (new Set(actions).size !== actions.length) add('action-identity', 'Some planned actions share a label; their continuity may need a look.');
  if (!plan.story || !plan.story.satirical_argument || !plan.story.setup || !plan.story.payoff) {
    add('legacy-story', 'The story outline has an incomplete setup or payoff.');
  }
  if (plan.brief?.customPremise && comparable(plan.premise || '') !== comparable(plan.brief.customPremise)) {
    add('premise-drift', 'The generated angle differs from your original premise.');
  }
  if (plan.brief?.sourceKind === 'provided-context') {
    if (!plan.story?.source_anchor || !plan.story.source_excerpt) add('source-missing', 'The story has not clearly identified the supplied detail it uses.');
    else {
      if (!comparable(`${plan.brief.topic} ${plan.brief.background || ''}`).includes(comparable(plan.story.source_excerpt))) {
        add('source-excerpt', 'A quoted source detail does not appear in your supplied text.');
      }
      if (!plan.panels.some(panel => panel.slug === plan.story!.source_panel_slug)) add('source-panel', 'A source detail points to a panel outside this outline.');
    }
  }
  for (const [index, panel] of plan.panels.entries()) {
    if (!panel.action?.id || !panel.action.description || !panel.action.before || !panel.action.after) add('action-missing', `Panel ${index + 1}: the planned action may need a clearer description.`);
    for (const effect of panel.text_elements.filter(element => element.role === 'sfx')) {
      if (!effect.action_id || !panel.action) add('effect-unbound', `Panel ${index + 1}: check that “${effect.text}” fits the visible action.`);
      else if (effect.action_id !== panel.action.id) add('effect-owner', `Panel ${index + 1}: “${effect.text}” may belong with a different action.`);
    }
  }
  for (const note of plan.story?.review_notes || []) add('writer-note', `Writer’s review: ${note}`, false);
  return [...issues, ...inspectNumericFacts(plan)];
}

export function assertDrawableStory(plan: ComicPlan) {
  const blocking = inspectStory(plan).filter(issue => issue.blocking);
  if (blocking.length) throw new Error(`Check the story before drawing: ${blocking.map(issue => issue.message).join(' ')}`);
}

export function panelStoryContext(plan: Pick<ComicPlan, 'premise' | 'story' | 'brief' | 'numericFacts' | 'numericUses'>, panel: { comedic_role?: string; action?: PlanPanel['action']; text_elements: { role: string; text: string; action_id?: string }[] }, index: number, total: number): PanelContext {
  return { premise: plan.premise, story: plan.story, brief: plan.brief, action: panel.action,
    numericFacts: plan.numericFacts, numericUses: plan.numericUses,
    effects: panel.text_elements.filter(element => element.role === 'sfx').map(({ text, action_id }) => ({ text, action_id })),
    comedicRole: panel.comedic_role, panelIndex: index, totalPanels: total };
}
