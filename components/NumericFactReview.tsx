import React, { useState } from 'react';
import type { ComicPlan } from '../types';
import {
  approveNumericUse,
  bindNumericUse,
  factsForPlan,
  inspectNumericFacts,
  replaceNumericText,
  approvedNumericDecisions,
} from '../services/numericFacts';
import type { NumericIssue } from '../services/numericFacts';

interface NumericFactReviewProps {
  plan: ComicPlan;
  onChange?: (plan: ComicPlan) => void;
}

function NumericIssueReview({
  issue,
  facts,
  plan,
  onChange,
}: {
  issue: NumericIssue;
  facts: ReturnType<typeof factsForPlan>;
  plan: ComicPlan;
  onChange?: (plan: ComicPlan) => void;
}) {
  const [factId, setFactId] = useState('');
  const [replacement, setReplacement] = useState('');

  return (
    <li className="border-t border-black/20 py-3 first:border-0 first:pt-0">
      <p className="font-bold">{issue.message}</p>
      {onChange && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {facts.length > 0 && (
            <label className="block text-sm font-bold">
              Bind “{issue.quote}” to supplied evidence
              <select
                value={factId}
                onChange={event => setFactId(event.target.value)}
                className="mt-1 block min-h-11 w-full border-2 border-black bg-paper-light p-2 font-open-sans font-normal text-black"
              >
                <option value="">Choose a source amount</option>
                {facts.map(fact => (
                  <option key={fact.id} value={fact.id}>
                    {fact.id} — {fact.currency} {fact.display}: {fact.subject}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!factId}
                onClick={() => onChange(bindNumericUse(plan, issue.location, issue.quote, factId))}
                className="mt-2 min-h-10 border-2 border-black bg-white px-3 py-1 font-bold hover:bg-banana disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bind source
              </button>
            </label>
          )}
          <form
            className="block text-sm font-bold"
            onSubmit={event => {
              event.preventDefault();
              if (replacement.trim()) onChange(replaceNumericText(plan, issue.location, issue.quote, replacement.trim()));
            }}
          >
            Correct or remove this text
            <input
              value={replacement}
              onChange={event => setReplacement(event.target.value)}
              aria-label={`Replacement for ${issue.quote}`}
              placeholder="Enter corrected wording"
              className="mt-1 block min-h-11 w-full border-2 border-black bg-paper-light p-2 font-open-sans font-normal text-black"
            />
            <button
              type="submit"
              disabled={!replacement.trim()}
              className="mt-2 min-h-10 border-2 border-black bg-white px-3 py-1 font-bold hover:bg-banana disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply text correction
            </button>
            <button
              type="button"
              onClick={() => onChange(replaceNumericText(plan, issue.location, issue.quote, ''))}
              className="ml-2 mt-2 min-h-10 border-2 border-black bg-white px-3 py-1 font-bold hover:bg-banana"
            >
              Remove amount
            </button>
          </form>
        </div>
      )}
      {onChange && issue.canRound && (
        <div className="mt-3">
          <p className="text-sm">This is an approximate rounding decision, not an exact match.</p>
          <button
            type="button"
            onClick={() => onChange(approveNumericUse(plan, issue, 'rounding'))}
            className="mt-2 min-h-10 border-2 border-black bg-banana px-3 py-1 font-bold hover:bg-yellow-300"
          >
            Approve approximate rounding
          </button>
        </div>
      )}
      {onChange && issue.canFiction && (
        <div className="mt-3">
          <p className="text-sm">Confirm deliberately that this is a distinct invented claim, not a changed source amount.</p>
          <button
            type="button"
            onClick={() => onChange(approveNumericUse(plan, issue, 'fiction'))}
            className="mt-2 min-h-10 border-2 border-black bg-banana px-3 py-1 font-bold hover:bg-yellow-300"
          >
            Confirm this claim is fictional
          </button>
        </div>
      )}
    </li>
  );
}

/** Compact review of app-extracted monetary evidence and unresolved uses. */
export default function NumericFactReview({ plan, onChange }: NumericFactReviewProps) {
  const facts = factsForPlan(plan);
  const issues = inspectNumericFacts(plan);
  const blocking = issues.some(issue => issue.blocking);
  const decisions = approvedNumericDecisions(plan);

  return (
    <section aria-label="Numeric source review" className="space-y-3 font-open-sans text-sm leading-6">
      <details className="border-y border-black/30 py-3">
        <summary className="cursor-pointer font-special-elite text-base font-bold">
          Supplied monetary evidence ({facts.length})
        </summary>
        <div className="mt-3 space-y-3">
          {facts.length ? facts.map(fact => (
            <article key={fact.id} className="border-l-2 border-black pl-3">
              <p className="font-bold">{fact.currency} {fact.display} <span className="font-normal">· {fact.provenance === 'supplied-background' ? 'Supplied background' : 'Supplied topic'}</span></p>
              <dl className="mt-1 grid gap-x-2 sm:grid-cols-[5rem_minmax(0,1fr)]">
                <dt className="font-bold">Source ID</dt><dd className="break-all font-mono text-xs">{fact.id}</dd>
                <dt className="font-bold">Subject</dt><dd>{fact.subject}</dd>
                <dt className="font-bold">Claim</dt><dd>{fact.claim}</dd>
                <dt className="font-bold">Display</dt><dd>{fact.display}</dd>
                <dt className="font-bold">Provenance</dt><dd>{fact.provenance}</dd>
              </dl>
            </article>
          )) : (
            <p className="border-l-2 border-black pl-3">No monetary figures were extracted from the supplied topic or background.</p>
          )}
          <p className="text-xs leading-5">These are figures extracted from supplied text, not independently verified facts.</p>
          <p className="text-xs leading-5">Exact amounts are the default. Approximation requires your explicit approval: nearest displayed unit, with at most 1% difference. Larger changes are not rounding.</p>
        </div>
      </details>
      {decisions.length > 0 && <ul aria-label="Approved numeric decisions" className="list-disc pl-5 text-sm">
        {decisions.map((decision, index) => <li key={index}>{decision}</li>)}
      </ul>}

      {issues.length > 0 && (
        <div
          role={blocking ? 'alert' : 'status'}
          aria-label={`${issues.length} numeric source ${issues.length === 1 ? 'issue' : 'issues'}`}
          className="border-2 border-black bg-banana p-3 text-black"
        >
          <p className="font-special-elite text-base font-bold">
            Numeric source review · {issues.length} unresolved
          </p>
          <ul className="mt-2 divide-y divide-black/20">
            {issues.map((issue, index) => (
              <React.Fragment key={`${issue.code}-${issue.location}-${issue.quote}-${index}`}>
                <NumericIssueReview
                  issue={issue}
                  facts={facts}
                  plan={plan}
                  onChange={onChange}
                />
              </React.Fragment>
            ))}
          </ul>
          {!onChange && <p className="mt-2 text-xs">Read-only review. Unresolved items remain visible and require a deliberate decision.</p>}
        </div>
      )}

      <p className="text-xs leading-5">
        Numeric text checks cannot verify lettering painted inside generated images. Inspect the artwork itself.
      </p>
    </section>
  );
}
