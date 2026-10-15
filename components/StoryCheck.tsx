import React from 'react';
import type { ComicPlan } from '../types';
import { assignEffect, inspectStory } from '../services/storyContract';

/** Readable evidence, not a claim that semantic or visual correctness is proven. */
export default function StoryCheck({ plan, onChange }: { plan: ComicPlan; onChange?: (plan: ComicPlan) => void }) {
  const issues = inspectStory(plan);
  return <section aria-label="Story checks" className="space-y-3 font-open-sans text-base leading-6">
    {issues.length > 0 && <div role={issues.some(issue => issue.blocking) ? 'alert' : 'status'} className="border-2 border-black bg-banana p-3 text-black">
      <p className="font-special-elite font-bold">Check before drawing</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>
      {issues.some(issue => issue.blocking) && <p className="mt-2 font-bold">No image requests will start until the blocking checks are resolved. Choose a new idea if the plan needs rewriting.</p>}
    </div>}
    <details className="border-y border-black/30 py-3">
      <summary className="cursor-pointer font-special-elite font-bold">Story intent and actions</summary>
      <div className="mt-3 space-y-3">
        {plan.brief && <p><strong>Source basis:</strong> {plan.brief.sourceKind === 'provided-context' ? 'Supplied background, not independently verified.' : 'Topic only. Invented story details are fiction, not verified reporting.'} <span className="block"><strong>Choices:</strong> {plan.brief.stance} · {plan.brief.register}</span></p>}
        {plan.story && <dl className="space-y-2">
          <div><dt className="font-bold">Source anchor</dt><dd>{plan.story.source_anchor || 'Not specified'}</dd>{plan.story.source_excerpt && <dd className="mt-1 border-l-2 border-black pl-3">Supplied excerpt: “{plan.story.source_excerpt}”</dd>}</div>
          <div><dt className="font-bold">Satirical argument</dt><dd>{plan.story.satirical_argument}</dd></div>
          <div><dt className="font-bold">Setup → payoff</dt><dd>{plan.story.setup} → {plan.story.payoff}</dd></div>
        </dl>}
        <p className="text-sm">These are the writer’s intentions, not an automatic check of the finished artwork. Check that each image actually shows its planned action.</p>
        {plan.panels.map((panel, panelIndex) => <div key={panel.id || panel.slug} className="border-t border-black/20 pt-2">
          <p><strong>Panel {panelIndex + 1}:</strong> {panel.action?.description || 'No structured action provided'}</p>
          {panel.action && <p className="mt-1"><strong>State:</strong> {panel.action.before} → {panel.action.after}</p>}
          {panel.text_elements.map((effect, elementIndex) => effect.role === 'sfx' && <div key={elementIndex} className="mt-2">
            {onChange ? <label className="block font-bold">Action for “{effect.text}”
              <select value={effect.action_id || ''} onChange={event => onChange(assignEffect(plan, panelIndex, elementIndex, event.target.value))}
                className="mt-1 block min-h-11 w-full border-2 border-black bg-white p-2 font-open-sans font-normal text-black">
                <option value="" disabled>Choose the action producing this sound</option>
                {plan.panels.filter(item => item.action?.id).map((item, index) => <option key={item.action!.id} value={item.action!.id}>Panel {plan.panels.indexOf(item) + 1}: {item.action!.description}</option>)}
              </select>
            </label> : <p><strong>Sound:</strong> {effect.text} — action {effect.action_id || 'not assigned'}</p>}
          </div>)}
        </div>)}
      </div>
    </details>
  </section>;
}
