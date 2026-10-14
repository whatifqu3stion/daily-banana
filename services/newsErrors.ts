import type { NewsIssue } from '../types';

export class NewsRequestError extends Error {
  constructor(public issue: NewsIssue) {
    super(issue.message);
    this.name = 'NewsRequestError';
  }
}

export function newsError(code: string, title: string, message: string, action: NewsIssue['action'] = 'retry') {
  return new NewsRequestError({ code, title, message, action });
}

export function describeNewsError(error: unknown): NewsIssue {
  if (error instanceof NewsRequestError) return error.issue;
  const text = error instanceof Error ? error.message : String(error);
  if (/connect.*(?:key|settings)|no.*key/i.test(text)) {
    return { code: 'key', title: 'Connect your Google key to find news', message: 'Open API settings to connect your Google API key, then return to recent news. Your comic inputs will stay here.', action: 'settings' };
  }
  if (/RESOURCE_EXHAUSTED|\b(?:402|429)\b/i.test(text)) {
    return { code: 'quota', title: 'Google news lookup reached a usage limit', message: 'Check the credits, billing and quotas on your Google project, or wait for a rate limit to reset. This is not a problem with your topic.', action: 'settings' };
  }
  if (/API_KEY_INVALID|API key not valid|UNAUTHENTICATED|PERMISSION_DENIED|\b(?:401|403)\b/i.test(text)) {
    return { code: 'access', title: 'Check your Google API access', message: 'Your Google key could not access news search. Open API settings to reconnect or replace it, and check your project’s Gemini API permissions.', action: 'settings' };
  }
  if (/timeout|timed out|deadline|\b408\b/i.test(text)) {
    return { code: 'timeout', title: 'News search took too long', message: 'Google did not finish in time. Try again, or continue with your own topic. A request already sent to Google may still incur usage charges.', action: 'retry' };
  }
  if (/fetch|network|offline|internet/i.test(text)) {
    return { code: 'network', title: 'Could not reach Google news search', message: 'Check your internet connection and try again. Your comic inputs have not changed.', action: 'retry' };
  }
  return { code: 'service', title: 'Recent news is temporarily unavailable', message: 'Google could not complete this news lookup. Try again, or continue with your own idea.', action: 'retry' };
}

export function isTransientNewsError(error: unknown): boolean {
  if (error instanceof NewsRequestError) return false;
  const text = error instanceof Error ? error.message : String(error);
  return /(?:\b(?:408|500|502|503|504)\b|UNAVAILABLE|INTERNAL|Failed to fetch|NetworkError|network request failed)/i.test(text)
    && !/RESOURCE_EXHAUSTED|PERMISSION_DENIED|UNAUTHENTICATED|\b(?:402|429)\b/i.test(text);
}
