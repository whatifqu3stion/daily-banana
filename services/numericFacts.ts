import type { ComicPlan, ComicStripData, NumericApproval, NumericFact, NumericUse, StoryBrief } from '../types';
import { isPermittedRounding, moneyMentions, type MoneyMention } from './moneyNormalization';

export interface NumericIssue {
  code: string;
  message: string;
  blocking: boolean;
  location: string;
  quote: string;
  factId?: string;
  approvalKey?: string;
  canRound?: boolean;
  canFiction?: boolean;
}
type NumericPlan = Pick<ComicPlan, 'title' | 'summary' | 'premise' | 'set_description' | 'story' | 'brief' | 'panels' | 'numericFacts' | 'numericUses' | 'numericApprovals'>;
const hash = (text: string) => {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
};
export const numericApprovalKey = (location: string, quote: string, factId: string, kind: string) =>
  `${kind}:${hash(JSON.stringify([location, quote, factId]))}`;

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
      roundingPolicy: 'exact-unless-creator-approves-nearest-unit-within-1pct' as const,
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
      const candidates = candidatesFor(mention, updated.numericFacts);
      if (updated.numericFacts.length === 1 && candidates.length === 1) updated.numericUses.push({
        location, quote: mention.raw, fact_id: candidates[0].id, intent: 'source', approximation: 'exact',
      });
    }
  }
  return updated;
}

function candidatesFor(mention: MoneyMention, facts: NumericFact[]): NumericFact[] {
  const currency = facts.filter(fact => !mention.currency || mention.currency === fact.currency);
  const exact = currency.filter(fact => fact.value === mention.value);
  return exact.length ? exact : currency;
}

export function inspectNumericFacts(plan: NumericPlan): NumericIssue[] {
  const facts = factsForPlan(plan);
  const issues: NumericIssue[] = [];
  for (const { location, text } of numericLocations(plan)) {
    const mentions = moneyMentions(text);
    for (const mention of mentions) {
      const quote = mention.raw;
      const use = plan.numericUses?.find(item => item.location === location && item.quote.toLowerCase() === quote.toLowerCase());
      const candidates = candidatesFor(mention, facts);
      const fact = use?.fact_id ? facts.find(item => item.id === use.fact_id)
        : facts.length === 1 && candidates.length === 1 ? candidates[0] : undefined;
      const add = (code: string, message: string, extra: Partial<NumericIssue> = {}) =>
        issues.push({ code, message, blocking: true, location, quote, factId: fact?.id, ...extra });
      if (facts.length > 1 && mentions.filter(item => item.raw.toLowerCase() === quote.toLowerCase()).length > 1) {
        add('amount-repeated-ambiguous', `${location}: “${quote}” occurs more than once among multiple source claims. Spell out one occurrence differently (for example, $1 million versus $1,000,000) so each claim can be bound separately. Matching values do not establish matching subjects.`);
        continue;
      }
      if (mention.value === undefined) {
        add('amount-format', `${location}: “${quote}” uses an unsupported or ambiguous monetary format. Use an unambiguous English amount and currency.`);
        continue;
      }
      const fictionKey = numericApprovalKey(location, quote, '', 'fiction');
      if (use?.intent === 'fiction') {
        if (!facts.length && plan.brief?.sourceKind !== 'provided-context') continue;
        if (plan.numericApprovals?.some(item => item.kind === 'fiction' && item.key === fictionKey)) continue;
        add('amount-fiction', `${location}: “${quote}” is labelled fictional, not supported by the supplied figures. Confirm it is a distinct invented claim, not a changed source amount.`, { approvalKey: fictionKey, canFiction: true });
        continue;
      }
      if (!facts.length && plan.brief?.sourceKind !== 'provided-context') {
        add('amount-topic-fiction', `${location}: “${quote}” has no supplied monetary evidence. It is topic-only fiction, not verified reporting.`, { blocking: false });
        continue;
      }
      if (use?.fact_id && !fact) {
        add('amount-reference', `${location}: “${quote}” references a missing source amount. Select its supporting excerpt or correct the text.`);
        continue;
      }
      if (!fact) {
        add('amount-ambiguous', `${location}: “${quote}” ${facts.length ? 'could refer to different amounts, subjects or claims' : 'has no monetary evidence in the supplied text'}. Select its supporting source, remove it, or explicitly identify a distinct fictional claim.`);
        continue;
      }
      if (mention.currency && mention.currency !== fact.currency) {
        add('amount-currency', `${location}: “${quote}” uses ${mention.currency}; its source is ${fact.currency} ${fact.display}. Currency conversion is not inferred.`);
        continue;
      }
      if (!mention.currency && new Set(facts.map(item => item.currency)).size > 1 && !use?.fact_id) {
        add('amount-currency-ambiguous', `${location}: “${quote}” omits a currency where the source contains multiple currencies. Bind the intended claim explicitly.`);
        continue;
      }
      if (mention.value === fact.value) continue;
      const key = numericApprovalKey(location, quote, fact.id, 'rounding');
      const canRound = fact.roundingPolicy === 'exact-unless-creator-approves-nearest-unit-within-1pct'
        && isPermittedRounding(fact.value, mention);
      if (canRound && use?.approximation === 'rounded' && plan.numericApprovals?.some(item => item.kind === 'rounding' && item.key === key)) continue;
      add(canRound ? 'amount-rounding' : 'amount-mismatch',
        `${location}: planned “${quote}” conflicts with supplied ${fact.currency} “${fact.display}” (${fact.evidence}). ${canRound ? 'This can be used only as a creator-approved approximation.' : 'Correct this amount before drawing; it is not equivalent to the source.'}`,
        { canRound, approvalKey: canRound ? key : undefined });
    }
  }
  return issues;
}

export function bindNumericUse(plan: ComicPlan, location: string, quote: string, factId: string): ComicPlan {
  const use: NumericUse = { location, quote, fact_id: factId, intent: 'source', approximation: 'exact' };
  return { ...plan, numericUses: [...(plan.numericUses || []).filter(item => item.location !== location || item.quote.toLowerCase() !== quote.toLowerCase()), use] };
}

export function approveNumericUse(plan: ComicPlan, issue: NumericIssue, kind: NumericApproval['kind']): ComicPlan {
  if (!issue.approvalKey || (kind === 'rounding' ? !issue.canRound : !issue.canFiction)) return plan;
  let updated = bindNumericUse(plan, issue.location, issue.quote, kind === 'fiction' ? '' : issue.factId || '');
  updated.numericUses = updated.numericUses!.map(use => use.location === issue.location && use.quote === issue.quote
    ? { ...use, intent: kind === 'fiction' ? 'fiction' : 'source', approximation: kind === 'rounding' ? 'rounded' : 'exact' } : use);
  return { ...updated, numericApprovals: [...(plan.numericApprovals || []).filter(item => item.key !== issue.approvalKey), { key: issue.approvalKey, kind }] };
}

export function replaceNumericText(plan: ComicPlan, location: string, quote: string, replacement: string): ComicPlan {
  const updated = structuredClone(plan);
  const replace = (text: string) => text.replace(quote, replacement);
  if (['title', 'summary', 'premise', 'set_description'].includes(location)) {
    const key = location as 'title' | 'summary' | 'premise' | 'set_description';
    updated[key] = replace(updated[key] || '');
  } else if (location.startsWith('story:') && updated.story) {
    const key = location.slice(6) as 'source_anchor' | 'satirical_argument' | 'setup' | 'payoff';
    if (key in updated.story) updated.story[key] = replace(updated.story[key]);
  } else {
    for (const panel of updated.panels) {
      const base = `panel:${panel.slug}:`;
      if (!location.startsWith(base)) continue;
      const field = location.slice(base.length);
      if (field === 'visual') panel.visual_prompt = replace(panel.visual_prompt);
      else if (field === 'scene_state') panel.scene_state = replace(panel.scene_state || '');
      else if (field === 'tags') panel.consistency_tags = panel.consistency_tags.map(replace);
      else if (field.startsWith('action:') && panel.action) {
        const key = field.slice(7) as 'description' | 'before' | 'after';
        if (key in panel.action) panel.action[key] = replace(panel.action[key]);
      } else if (field.startsWith('text:')) {
        const element = panel.text_elements[Number(field.slice(5))];
        if (element) element.text = replace(element.text);
      }
    }
  }
  updated.numericUses = (updated.numericUses || []).map(use => use.location === location && use.quote.toLowerCase() === quote.toLowerCase()
    ? { ...use, quote: replacement } : use).filter(use => use.quote.trim());
  return updated;
}

export function stripAsNumericPlan(data: ComicStripData): ComicPlan {
  return { ...data, summary: '', panels: data.panels.map(panel => ({
    ...panel, slug: panel.planSlug || panel.id, size: 'medium', aspect_ratio: panel.layoutProps.aspectRatio,
    comedic_role: ['establish', 'escalate', 'punchline', 'button'].includes(panel.comedic_role || '')
      ? panel.comedic_role as 'establish' | 'escalate' | 'punchline' | 'button' : undefined,
  })) };
}

export function approvedNumericDecisions(plan: NumericPlan): string[] {
  return (plan.numericUses || []).flatMap(use => {
    const current = numericLocations(plan).find(field => field.location === use.location);
    const mention = current && moneyMentions(current.text).find(item => item.raw.toLowerCase() === use.quote.toLowerCase());
    if (!mention) return [];
    const kind = use.intent === 'fiction' ? 'fiction' : use.approximation === 'rounded' ? 'rounding' : undefined;
    if (!kind || !plan.numericApprovals?.some(approval => approval.kind === kind &&
      approval.key === numericApprovalKey(use.location, mention.raw, kind === 'fiction' ? '' : use.fact_id, kind))) return [];
    const fact = factsForPlan(plan).find(fact => fact.id === use.fact_id);
    return kind === 'rounding' && fact
      ? [`Approximate “${mention.raw}”, approved by creator (supplied: ${fact.currency} ${fact.display}).`]
      : kind === 'fiction' ? [`“${mention.raw}” is a creator-confirmed distinct fictional claim, not supplied reporting.`] : [];
  });
}

/** Free-text research cannot establish subject/claim identity, even for equal amounts. */
export function checkArchiveAmounts(text: string, plan: NumericPlan): string | undefined {
  const facts = factsForPlan(plan);
  const mentions = moneyMentions(text);
  if (!mentions.length) return;
  if (!facts.length) return 'Archive note withheld: later research introduces monetary claims without supplied monetary evidence to link them to. An invented comic amount is not evidence of a real event. Review the research sources before using a factual note; your comic is preserved.';
  if (facts.length > 1) return 'Archive note withheld: supplied evidence contains multiple monetary subjects or claims. A matching number alone cannot establish which claim this later research describes. Review the research sources and the separate supplied excerpts; your comic has not been changed.';
  const approvedRounded = numericLocations(plan).flatMap(({ location, text }) =>
    moneyMentions(text).flatMap(mention => {
      const use = plan.numericUses?.find(use => use.location === location && use.quote.toLowerCase() === mention.raw.toLowerCase()
        && use.approximation === 'rounded' && plan.numericApprovals?.some(approval =>
          approval.kind === 'rounding' && approval.key === numericApprovalKey(location, mention.raw, use.fact_id, 'rounding')));
      const fact = use && facts.find(fact => fact.id === use.fact_id);
      return fact && isPermittedRounding(fact.value, mention) ? [{ ...mention, currency: mention.currency || fact.currency }] : [];
    }));
  const conflicts = mentions.filter(mention => !facts.some(fact => fact.value === mention.value && (!mention.currency || mention.currency === fact.currency))
    && !approvedRounded.some(item => item.value === mention.value && (!mention.currency || item.currency === mention.currency)));
  if (conflicts.length) return `Archive note withheld: later research uses ${conflicts.map(item => `“${item.raw}”`).join(', ')}, while supplied evidence uses ${facts.map(fact => `${fact.currency} ${fact.display}`).join('; ')}. These have distinct provenance and are not confirmed to be the same claims. Your comic is preserved. Review the sources before adding a factual note.`;
  return 'Archive note withheld: matching monetary values do not establish the same subject or claim. This unstructured later-research note needs claim-linked review before it can be used as factual context. Supplied evidence and later research remain separate; your comic is preserved.';
}
