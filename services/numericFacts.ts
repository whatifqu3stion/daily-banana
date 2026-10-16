import type { ComicPlan, ComicStripData, NumericFact, NumericUse, StoryBrief } from '../types';
import { isPermittedRounding, moneyMentions } from './moneyNormalization';

export interface NumericIssue {
  code: string;
  message: string;
  blocking: boolean;
  location: string;
  quote: string;
  factId?: string;
}
type NumericPlan = Pick<ComicPlan, 'title' | 'summary' | 'premise' | 'set_description' | 'story' | 'brief' | 'panels' | 'numericFacts' | 'numericUses' | 'numericApprovals'>;
const hash = (text: string) => {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
};

export function extractNumericFacts(brief: Pick<StoryBrief, 'background' | 'topic'>): NumericFact[] {
  // Neither input replaces the other: topic and background may supply different claims.
  const sources = [
    { text: brief.topic.trim(), provenance: 'supplied-topic' as const },
    { text: brief.background?.trim() || '', provenance: 'supplied-background' as const },
  ];
  return sources.flatMap(({ text, provenance }) => moneyMentions(text).flatMap(mention => {
    if (!mention.currency || mention.value === undefined) return [];
    // Sentence boundaries exclude decimal points.
    const before = text.slice(0, mention.start);
    const boundary = [...before.matchAll(/[.!?](?:\s|$)|\n/g)].at(-1);
    const start = boundary ? boundary.index! + boundary[0].length : 0;
    const endMatch = /[.!?](?:\s|$)|\n/.exec(text.slice(mention.end));
    const end = endMatch ? mention.end + endMatch.index + 1 : text.length;
    const evidence = text.slice(start, end).trim();
    return [{
      id: `amount-${hash(`${provenance}:${mention.start}:${mention.raw}:${evidence}`)}`,
      subject: text.slice(start, mention.start).trim().slice(0, 160) || 'Subject in supplied excerpt',
      claim: evidence, evidence, display: mention.raw, value: mention.value,
      currency: mention.currency, provenance,
      roundingPolicy: 'prefer-exact-allow-nearest-unit-within-1pct' as const,
    }];
  }));
}

export function sanitizeNumericUses(raw: unknown): NumericUse[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 150).flatMap(use => {
    if (!use || typeof use !== 'object' || typeof use.location !== 'string' || typeof use.quote !== 'string') return [];
    return [{
      location: use.location.trim().slice(0, 200), quote: use.quote.trim().slice(0, 300),
      fact_id: typeof use.fact_id === 'string' ? use.fact_id.trim().slice(0, 120) : '',
      intent: use.intent === 'fiction' ? 'fiction' as const : 'source' as const,
      approximation: use.approximation === 'rounded' ? 'rounded' as const : 'exact' as const,
    }];
  });
}

/** Include all language that can reach an image or be presented as story content. */
export function numericLocations(plan: NumericPlan): { location: string; text: string }[] {
  const fields = ['title', 'summary', 'premise', 'set_description'] as const;
  const result: { location: string; text: string }[] = fields.map(location => ({ location, text: plan[location] || '' }));
  for (const key of ['source_anchor', 'satirical_argument', 'setup', 'payoff'] as const) {
    result.push({ location: `story:${key}`, text: plan.story?.[key] || '' });
  }
  for (const panel of plan.panels) {
    const base = `panel:${panel.slug}`;
    result.push({ location: `${base}:visual`, text: panel.visual_prompt });
    result.push({ location: `${base}:scene_state`, text: panel.scene_state || '' });
    result.push({ location: `${base}:tags`, text: panel.consistency_tags.join('\n') });
    for (const key of ['description', 'before', 'after'] as const) {
      result.push({ location: `${base}:action:${key}`, text: panel.action?.[key] || '' });
    }
    panel.text_elements.forEach((element, index) => result.push({ location: `${base}:text:${index}`, text: element.text }));
  }
  return result;
}

export function factsForPlan(plan: Pick<ComicPlan, 'brief' | 'numericFacts'>): NumericFact[] {
  return plan.numericFacts ?? (plan.brief ? extractNumericFacts(plan.brief) : []);
}

/** App-authored facts replace any model-supplied ledger or approvals. */
export function attachNumericFacts(plan: ComicPlan, brief: StoryBrief): ComicPlan {
  const updated = { ...plan, numericFacts: extractNumericFacts(brief), numericUses: sanitizeNumericUses(plan.numericUses), numericApprovals: [] };
  for (const { location, text } of numericLocations(updated)) {
    for (const mention of moneyMentions(text)) {
      if (updated.numericUses.some(use => use.location === location && use.quote.toLowerCase() === mention.raw.toLowerCase())) continue;
      const candidates = updated.numericFacts.filter(fact => !mention.currency || fact.currency === mention.currency);
      if (updated.numericFacts.length === 1 && candidates.length === 1) updated.numericUses.push({
        location, quote: mention.raw, fact_id: candidates[0].id, intent: 'source', approximation: 'exact',
      });
    }
  }
  return updated;
}

/** Advisory text comparison, never independent fact verification or a drawing gate. */
export function inspectNumericFacts(plan: NumericPlan): NumericIssue[] {
  const facts = factsForPlan(plan);
  const issues: NumericIssue[] = [];
  for (const { location, text } of numericLocations(plan)) {
    for (const mention of moneyMentions(text)) {
      const use = plan.numericUses?.find(item => item.location === location && item.quote.toLowerCase() === mention.raw.toLowerCase());
      if (use?.intent === 'fiction' || (!facts.length && plan.brief?.sourceKind !== 'provided-context')) continue;
      const compatible = facts.filter(fact => !mention.currency || fact.currency === mention.currency);
      // Absence of an obvious numeric difference does not establish claim identity.
      // Normal formatting and nearest-unit rounding within 1% need no approval.
      if (mention.value !== undefined && compatible.some(fact => fact.value === mention.value || isPermittedRounding(fact.value, mention))) continue;
      const bound = facts.find(fact => fact.id === use?.fact_id);
      const source = bound || (compatible.length === 1 ? compatible[0] : undefined);
      const add = (code: string, message: string) => issues.push({
        code, message, blocking: false, location, quote: mention.raw, factId: source?.id,
      });
      if (mention.value === undefined) add('amount-format', `“${mention.raw}” could not be compared reliably with your supplied figures.`);
      else if (source) add(mention.currency && mention.currency !== source.currency ? 'amount-currency' : 'amount-mismatch',
        `“${mention.raw}” differs from supplied ${source.display} (${source.currency}).`);
      else if (facts.length) add('amount-ambiguous', `“${mention.raw}” does not clearly match the figures in your supplied text.`);
      else add('amount-unsourced', `“${mention.raw}” has no monetary source in your supplied text.`);
    }
  }
  return issues;
}

export function stripAsNumericPlan(data: ComicStripData): ComicPlan {
  return { ...data, summary: '', panels: data.panels.map(panel => ({
    ...panel, slug: panel.planSlug || panel.id, size: 'medium', aspect_ratio: panel.layoutProps.aspectRatio,
    comedic_role: ['establish', 'escalate', 'punchline', 'button'].includes(panel.comedic_role || '')
      ? panel.comedic_role as 'establish' | 'escalate' | 'punchline' | 'button' : undefined,
  })) };
}

/** Keep optional later research separate; flag obvious differences without claiming verification. */
export function checkArchiveAmounts(text: string, plan: NumericPlan): string | undefined {
  const mentions = moneyMentions(text);
  if (!mentions.length) return;
  const facts = factsForPlan(plan);
  const conflicts = mentions.filter(mention => !facts.some(fact =>
    (!mention.currency || fact.currency === mention.currency) &&
    (fact.value === mention.value || isPermittedRounding(fact.value, mention))));
  if (conflicts.length) return 'The optional background note included amounts that could not be matched to your supplied text, so it was left out. Your comic is ready.';
}
