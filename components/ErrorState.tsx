// components/ErrorState.tsx
// Shown when an unrecoverable error occurs during generation.
// Attempts to parse JSON API error bodies for friendlier messages;
// falls back to displaying the raw error string.
import React from 'react';

interface ErrorStateProps {
  error: string | null;
  onStartOver: () => void;
  onOpenApiSettings?: () => void;
}

const errorClassification = (error: string): string => {
  try {
    const value = JSON.parse(error);
    const detail = value?.error || value;
    if (detail?.code) {
      const keyError = /API_KEY_INVALID|API key not valid/i.test(String(detail.message || '')) ? 'API_KEY_INVALID' : '';
      return `${detail.code} ${detail.status || ''} ${detail.kind || ''} ${keyError}`;
    }
  } catch { /* Legacy plain-text errors still need keyword classification. */ }
  return error;
};

const parseErrorMessage = (error: string): { title: string; message: string } => {
  try {
    const value = JSON.parse(error);
    const detail = value?.error || value;
    const operation = detail.operation === 'image' ? 'Image generation' : detail.operation === 'text' ? 'Story or news generation' : 'AI request';
    const categories: Record<string, { title: string; advice: string }> = {
      GENERATION_NETWORK: { title: `${operation}: connection interrupted`, advice: 'Try again when the connection recovers. No automatic retry was made.' },
      GENERATION_TIMEOUT: { title: `${operation} timed out`, advice: 'Wait before trying again. No automatic retry was made.' },
      GENERATION_CANCELLED: { title: `${operation} was cancelled`, advice: 'No automatic retry was made.' },
      GENERATION_INCOMPLETE: { title: `${operation} did not finish`, advice: 'No automatic retry was made. Return to the desk when you are ready to try again.' },
      GENERATION_RESPONSE_INVALID: { title: `${operation}: unexpected response`, advice: 'The app could not use this result. No automatic retry was made.' },
      GENERATION_UNKNOWN: { title: `${operation}: cause not confirmed`, advice: 'Share this error message for troubleshooting, never your API key. No automatic retry was made.' },
      APP_NETWORK_ERROR: { title: `${operation}: app connection interrupted`, advice: 'This failure occurred between your browser and the app, not necessarily at Google.' },
      APP_RESPONSE_INVALID: { title: `${operation}: app response unavailable`, advice: 'This failure occurred at the app or hosting boundary, not necessarily at Google.' },
    };
    const category = categories[detail?.kind];
    if (category) {
      return { title: category.title, message: `${typeof detail.message === 'string' ? detail.message.slice(0, 1500) : 'No specific explanation was provided.'} ${category.advice} (Code: ${detail.code}).` };
    }
    if (Number(detail?.code) >= 500) {
      return {
        title: detail.kind === 'GOOGLE_UPSTREAM_ERROR' ? `${operation}: Google returned an error` : `${operation} could not finish`,
        message: `${typeof detail.message === 'string' ? detail.message.slice(0, 1500) : 'No specific explanation was provided.'} (Code: ${detail.code}${detail.status ? ` — ${detail.status}` : ''}). Try again later; this error alone does not establish that your key or topic is invalid. No automatic retry was made.`,
      };
    }
  } catch { /* Continue with legacy and access-error handling below. */ }
  const classification = errorClassification(error);
  if (/API_KEY_INVALID|API key not valid|UNAUTHENTICATED|PERMISSION_DENIED|(?:^|\D)(?:401|403)(?:\D|$)/i.test(classification)) {
    return {
      title: 'Check your Google API access',
      message: 'Open API settings to replace your key. Check that the Gemini API is enabled and the key’s Google project has billing and permission to use the selected model. Your topic is not the problem.',
    };
  }
  if (/RESOURCE_EXHAUSTED|(?:^|\D)(?:402|429)(?:\D|$)/i.test(classification)) {
    return {
      title: 'Google API usage limit reached',
      message: 'Check billing, credits, and quotas in your Google API project, or wait for a rate limit to reset. You can replace your key in API settings. This is not a problem with your topic.',
    };
  }
  if (/NOT_FOUND|(?:^|\D)404(?:\D|$)/i.test(classification)) {
    return {
      title: 'Image model unavailable',
      message: 'Check whether your Google project can access this model, or return to the desk and choose the other image model under More control.',
    };
  }
  try {
    // Attempt to parse the error message, which might be a JSON string from the API
    let errorData = JSON.parse(error);
    
    // The error object might be nested, e.g., { "error": { ... } }
    const innerError = errorData.error || errorData;

    if (Number(innerError?.code) === 400) {
      const detail = typeof innerError.message === 'string' && innerError.message.trim()
        ? innerError.message.trim().slice(0, 1500)
        : 'Google did not provide a specific explanation.';
      return {
        title: innerError.operation === 'image' ? 'Google rejected the image request' : 'Google rejected this request',
        message: `${detail} (Code: 400${innerError.status ? ` — ${innerError.status}` : ''}). This can be an unsupported model, image setting, or input—not necessarily your topic.`,
      };
    }

    if (innerError && innerError.code) {
      const { code, status } = innerError;
      if (Number(code) === 402 || status === 'RESOURCE_EXHAUSTED' || Number(code) === 429) {
        return {
          title: 'AI usage limit reached',
          message: Number(code) === 402
            ? 'Google rejected this request because of a billing, credit, or quota limit in your API project. Check your Google billing and usage allowance. This is not a problem with your topic.'
            : 'Your Google API project has reached a usage or rate limit. Wait for the limit to reset, or check your Google quota and billing. This is not a problem with your topic.',
        };
      }
      let userMessage = `${typeof innerError.message === 'string' ? innerError.message.slice(0, 1500) : 'No specific explanation was provided.'} (Code: ${code}${status ? ` - ${status}` : ''}).`;
      
      if (code === 500) {
        userMessage += " This is often a temporary internal issue on the server's end. We recommend starting over or trying your request again in a moment.";
      } else if (String(code).startsWith('4')) {
        userMessage += " Check the selected model, request settings, and Google API access. Changing your topic may not resolve this.";
      }
      
      return {
        title: 'An API Error Occurred',
        message: userMessage,
      };
    }
  } catch (e) {
    // If it's not a parsable JSON or doesn't have the expected structure, we'll just show the string.
  }
  
  // Fallback for non-JSON errors or parsing failures
  return {
    title: 'An Error Occurred',
         message: error || 'The newsroom could not finish this comic.',
  };
};

const ErrorState: React.FC<ErrorStateProps> = ({ error, onStartOver, onOpenApiSettings }) => {
  if (!error) return null;

  const { title, message } = parseErrorMessage(error);
  const classification = errorClassification(error);
  const isAppFailure = /APP_NETWORK_ERROR|APP_RESPONSE_INVALID/.test(classification);
  const isBillingError = !isAppFailure && /RESOURCE_EXHAUSTED|(?:^|\D)(?:402|429)(?:\D|$)|billing|quota|credit/i.test(classification);
  const isKeyAccessError = !isAppFailure && /API_KEY_INVALID|API key not valid|UNAUTHENTICATED|PERMISSION_DENIED|(?:^|\D)(?:401|403)(?:\D|$)/i.test(classification);

  return (
    <div className="w-full max-w-3xl mx-auto p-8 md:p-10 border-3 border-black bg-paper-light flex flex-col items-center shadow-xl rounded-lg text-center">
      <h4 className="text-2xl font-bold font-special-elite text-red-800">{title}</h4>
      <p className="text-lg font-lora text-black mt-4 break-words">
        {message}
      </p>
      {(isBillingError || isKeyAccessError) && onOpenApiSettings && (
        <button
          type="button"
          onClick={onOpenApiSettings}
          className="mt-5 border-2 border-black bg-banana px-4 py-2 font-bold hover:bg-yellow-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Open API settings
        </button>
      )}
      <p className="mt-3 text-sm font-open-sans text-gray-700">Your saved setup is preserved. Return to the desk to try again with the same topic, or adjust it before resubmitting.</p>
      <button
        onClick={onStartOver}
        className="mt-8 px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md font-special-elite text-lg"
      >
         Return to the desk
      </button>
    </div>
  );
};

export default ErrorState;