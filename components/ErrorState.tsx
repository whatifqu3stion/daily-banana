// components/ErrorState.tsx
// Shown when an unrecoverable error occurs during generation.
// Attempts to parse JSON API error bodies for friendlier messages;
// falls back to displaying the raw error string.
import React from 'react';

interface ErrorStateProps {
  error: string | null;
  onStartOver: () => void;
}

const parseErrorMessage = (error: string): { title: string; message: string } => {
  try {
    // Attempt to parse the error message, which might be a JSON string from the API
    let errorData = JSON.parse(error);
    
    // The error object might be nested, e.g., { "error": { ... } }
    const innerError = errorData.error || errorData;

    if (innerError && innerError.code && innerError.status) {
      const { code, status } = innerError;
      if (Number(code) === 402 || status === 'RESOURCE_EXHAUSTED' || Number(code) === 429) {
        return {
          title: 'AI usage limit reached',
          message: Number(code) === 402
            ? 'The AI provider rejected this request because of a billing, credit, or quota limit. This is not a problem with your topic. The app owner needs to check the AI service’s billing and usage allowance before trying again.'
            : 'The AI service has reached a usage or rate limit. This is not a problem with your topic. Wait for the limit to reset, or have the app owner check the AI service’s quota and billing.',
        };
      }
      let userMessage = `The AI model encountered an issue (Code: ${code} - ${status}).`;
      
      if (code === 500) {
        userMessage += " This is often a temporary internal issue on the server's end. We recommend starting over or trying your request again in a moment.";
      } else if (String(code).startsWith('4')) {
        userMessage += " There might be an issue with the request. Please try simplifying your topic.";
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

const ErrorState: React.FC<ErrorStateProps> = ({ error, onStartOver }) => {
  if (!error) return null;

  const { title, message } = parseErrorMessage(error);

  return (
    <div className="w-full max-w-3xl mx-auto p-8 md:p-10 border-3 border-black bg-paper-light flex flex-col items-center shadow-xl rounded-lg text-center">
      <h4 className="text-2xl font-bold font-special-elite text-red-800">{title}</h4>
      <p className="text-lg font-lora text-black mt-4 break-words">
        {message}
      </p>
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