import React from 'react';
import type { ComicStripData } from '../types';
import { approvedNumericDecisions, inspectNumericFacts, stripAsNumericPlan } from '../services/numericFacts';

/** Read-only export-adjacent warning; source checks do not inspect rendered image lettering. */
export default function NumericConsistencyNotice({ comicData }: { comicData: ComicStripData }) {
  const plan = stripAsNumericPlan(comicData);
  const issues = inspectNumericFacts(plan);
  const decisions = approvedNumericDecisions(plan);
  const unresolved = issues.length > 0;

  if (!unresolved && !comicData.archiveWarning && !decisions.length) return null;

  return (
    <aside
      aria-label="Numeric consistency and archive notice"
      role={issues.some(issue => issue.blocking) || comicData.archiveWarning ? 'alert' : 'status'}
      className="w-full border-2 border-black bg-banana/50 p-3 font-open-sans text-sm leading-6 text-black"
    >
      {unresolved && (
        <div>
          <p className="font-special-elite text-base font-bold">
            {issues.length} unresolved numeric source {issues.length === 1 ? 'issue' : 'issues'}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {issues.map((issue, index) => <li key={`${issue.code}-${issue.location}-${index}`}>{issue.message}</li>)}
          </ul>
          <p className="mt-2 text-xs leading-5">Text checks cannot verify lettering painted inside generated images. Supplied figures are not independently verified.</p>
        </div>
      )}
      {comicData.archiveWarning && (
        <p className={unresolved ? 'mt-3 border-t border-black/30 pt-2' : ''}>
          {comicData.archiveWarning}
        </p>
      )}
      {decisions.length > 0 && <ul aria-label="Creator-approved numeric decisions" className="mt-2 list-disc pl-5">
        {decisions.map((decision, index) => <li key={index}>{decision}</li>)}
      </ul>}
    </aside>
  );
}
