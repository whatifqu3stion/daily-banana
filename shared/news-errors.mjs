export class NewsRequestError extends Error {
  /** @param {import('../types').NewsIssue} issue */
  constructor(issue) {
    super(issue.message);
    this.name = 'NewsRequestError';
    this.issue = issue;
  }
}

/** @param {string} code
 * @param {string} title
 * @param {string} message
 * @param {import('../types').NewsIssue['action']} action */
export function newsError(code, title, message, action = 'retry') {
  return new NewsRequestError({ code, title, message, action });
}

const responseIssues = {
  NEWS_FORMAT: ['format', 'Google returned unreadable headlines', 'The news response could not be read safely. Try again; no incomplete stories were saved.'],
  NEWS_GROUNDING: ['grounding', 'Could not verify the news sources', 'Google did not return usable search sources. Try again; unsourced headlines will not be shown as current news.'],
  NEWS_EMPTY: ['empty', 'No usable sourced headlines found', 'Google did not return readable, source-backed stories. Try again, or start with your own idea.'],
  NEWS_BLOCKED: ['blocked', 'Google declined this news search', 'Try another lookup or use your own topic. No headlines were saved.'],
};

/** @param {unknown} error
 * @returns {import('../types').NewsIssue} */
export function describeNewsError(error) {
  if (error instanceof NewsRequestError) return error.issue;
  const text = error instanceof Error ? error.message : String(error);
  let detail;
  try { const data = JSON.parse(text); detail = data?.error || data; } catch { /* Legacy local errors only. */ }
  const kind = typeof detail?.kind === 'string' ? detail.kind : '';
  const responseIssue = responseIssues[kind];
  if (responseIssue) return { code: responseIssue[0], title: responseIssue[1], message: responseIssue[2], action: kind === 'NEWS_BLOCKED' ? null : 'retry' };
  if (['APP_NETWORK_ERROR', 'APP_RESPONSE_INVALID'].includes(kind)) {
    return { code: 'network', title: 'Could not reach the news desk', message: 'Your browser did not receive a usable response from the app server. Check your connection or try again shortly. No automatic retry was made; a request already sent may still count toward Google usage.', action: 'retry' };
  }
  // Structured status fields are authoritative. Never scan provider prose for
  // numbers such as 403, "no key", "quota", or "billing".
  const code = Number(detail?.code);
  const status = typeof detail?.status === 'string' ? detail.status : '';
  const legacy = detail ? '' : text;
  if (/^Connect your Google API key/i.test(legacy)) {
    return { code: 'key', title: 'Connect your Google key to find news', message: 'Open API settings to connect your Google API key, then return to recent news. Your comic inputs will stay here.', action: 'settings' };
  }
  if (code === 401) {
    return { code: 'key', title: 'Reconnect your Google key to find news', message: 'Your API key session expired or was removed. Reconnect in API settings; your comic inputs will stay here.', action: 'settings' };
  }
  if ([402, 429].includes(code) || status === 'RESOURCE_EXHAUSTED') {
    return { code: 'quota', title: 'Google news lookup reached a usage limit', message: 'Check the credits, billing and quotas on your Google project, or wait for a rate limit to reset. This is not a problem with your topic.', action: 'settings' };
  }
  if (code === 403 || ['API_KEY_INVALID', 'UNAUTHENTICATED', 'PERMISSION_DENIED'].includes(status)) {
    return { code: 'access', title: 'Check your Google API access', message: 'Your Google key could not access news search. Open API settings to reconnect or replace it, and check your project’s Gemini API permissions.', action: 'settings' };
  }
  if (kind === 'GENERATION_CANCELLED' || status === 'CANCELLED') {
    return { code: 'cancelled', title: 'News search closed', message: 'The news lookup was closed.', action: null };
  }
  if ([408, 504].includes(code) || kind === 'GENERATION_TIMEOUT' || status === 'DEADLINE_EXCEEDED' || /timeout|timed out|deadline/i.test(legacy)) {
    return { code: 'timeout', title: 'News search took too long', message: 'The news lookup reached its time limit. No automatic retry was made. Try again, or continue with your own topic. A request already sent to Google may still incur usage charges.', action: 'retry' };
  }
  if (kind === 'GENERATION_NETWORK') {
    return { code: 'network', title: 'Could not reach Google news search', message: 'The app server could not complete its connection to Google. This does not establish that your key is invalid. No automatic retry was made; the request may still count toward Google usage.', action: 'retry' };
  }
  if (code === 409) {
    return { code: 'busy', title: 'The news desk is finishing a request', message: 'Wait briefly for the previous lookup or key check to finish, then try again. No new Google request was made.', action: 'retry' };
  }
  return { code: 'service', title: 'Recent news is temporarily unavailable', message: 'The news lookup could not finish. No automatic retry was made. Try again, or continue with your own idea; this error alone does not establish a key, billing, or topic problem.', action: 'retry' };
}
