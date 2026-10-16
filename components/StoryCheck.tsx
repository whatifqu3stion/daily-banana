import React from 'react';
import type { ComicPlan, ExplainerSource } from '../types';
import { inspectStory } from '../services/storyContract';

/** Optional editorial advice. Technical drawing errors are the only blockers. */
export default function StoryCheck({ plan, additionalConcerns = [], archiveSources = [] }: {
  plan: ComicPlan;
  additionalConcerns?: string[];
  archiveSources?: ExplainerSource[];
}) {
  const issues = inspectStory(plan);
  const errors = issues.filter(issue => issue.blocking);
  const groups = new Map<string, { message: string; locations: Set<string> }>();
  for (const issue of issues.filter(issue => !issue.blocking)) {
    const numeric = typeof issue.quote === 'string';
    const key = numeric ? `${issue.code}:${issue.quote?.toLowerCase()}:${issue.factId || ''}` : `${issue.code}:${issue.message}`;
    const group = groups.get(key) || { message: issue.message, locations: new Set<string>() };
    if (numeric) {
      const panelIndex = plan.panels.findIndex(panel => issue.location?.startsWith(`panel:${panel.slug}:`));
      group.locations.add(panelIndex >= 0 ? `Panel ${panelIndex + 1}` : 'Story outline');
    }
    groups.set(key, group);
  }
  const concerns = [...groups.values()].map(group =>
    `${group.locations.size ? `${[...group.locations].join(', ')}: ` : ''}${group.message}`);
  concerns.push(...additionalConcerns.filter(Boolean));
  const unique = [...new Set(concerns)];
  if (!errors.length && !unique.length) return null;

  return <aside aria-label="Story concerns" className="no-export space-y-2 border border-stone-400 bg-newsprint/60 px-4 py-3 font-open-sans text-sm leading-relaxed text-stone-800">
    {errors.length > 0 && <p role="alert">{errors.map(issue => issue.message).join(' ')}</p>}
    {unique.length > 0 && <>
      <p>{issues.some(issue => issue.code.startsWith('amount-')) ? 'Some amounts may need a look.' : 'A few story details may need a look.'}{!errors.length && ' You can continue.'}</p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-bold underline decoration-stone-400 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Review details</summary>
        <ul className="list-disc space-y-2 pl-5">{unique.map(concern => <li key={concern}>{concern}</li>)}</ul>
        {archiveSources.length > 0 && <p className="mt-3 flex flex-wrap gap-x-3 gap-y-2">Background sources: {archiveSources.filter(source => /^https:\/\//i.test(source.url)).map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">{source.title}</a>)}</p>}
        <p className="mt-3 text-xs">These are text comparisons and editorial notes, not independent fact verification. You can edit dialogue in the finished comic; check lettering in the artwork itself.</p>
      </details>
    </>}
  </aside>;
}
