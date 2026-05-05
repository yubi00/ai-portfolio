import { BaseCommandHandler, CommandResult } from './handlers';
import { getApiBaseUrl, getAuthEnv } from '../config/env';
import { getAuthorizationHeader } from '../utils/auth';

interface ApiErrorPayload {
  error?: {
    status?: number;
    code?: string;
    message?: string;
  };
}

interface PromptResponse {
  answer?: string;
  reply?: string;
  session_id?: string | null;
  suggested_prompts?: string[];
}

const GENERIC_ERROR = 'I had trouble generating a response. Please try again.';

const formatSuggestedPrompts = (suggestions: string[] | undefined): string => {
  const clean = (suggestions ?? []).map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return '';

  return [
    '\r\n\r\n\x1b[2m\x1b[38;5;244mSuggested follow-ups:\x1b[0m',
    ...clean.map((s) => `\x1b[2m\x1b[38;5;244m- ${s}\x1b[0m`),
  ].join('\r\n');
};

const parseApiError = async (response: Response): Promise<ApiErrorPayload['error'] | null> => {
  try {
    const json = await response.json();
    return json?.error ?? null;
  } catch {
    return null;
  }
};

const userFacingErrorMessage = (code?: string): string => {
  if (code === 'RATE_LIMIT_EXCEEDED') return 'Too many requests. Please wait a moment and try again.';
  if (code === 'STREAM_CONCURRENCY_LIMIT_EXCEEDED') return 'Another response is still running. Please wait a moment.';
  if (code === 'AUTH_REQUIRED' || code === 'INVALID_TOKEN') return 'Authentication failed. Please refresh and try again.';
  if (code === 'ORIGIN_NOT_ALLOWED') return 'This site is not allowed to use the assistant API.';
  return GENERIC_ERROR;
};

const sanitizeThrownError = (error: unknown): string => {
  if (!(error instanceof Error)) return GENERIC_ERROR;
  if (
    error.message.startsWith('auth_') ||
    error.message.startsWith('turnstile_') ||
    error.message.includes('turnstile') ||
    error.message.includes('auth')
  ) {
    return 'Authentication failed. Please refresh and try again.';
  }
  return error.message || GENERIC_ERROR;
};

export class AIConversationHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    // This handler handles all commands that aren't handled by other handlers
    return true;
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    try {
      const apiUrl = getApiBaseUrl();
      const { requireAuth } = getAuthEnv();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const authHeader = await getAuthorizationHeader({ enforce: requireAuth });
      if (authHeader) headers.Authorization = authHeader;

      const response = await fetch(`${apiUrl}/prompt`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: command.trim(),
          session_id: sessionId
        }),
      });
      
      if (!response.ok) {
        const apiError = await parseApiError(response);
        throw new Error(userFacingErrorMessage(apiError?.code));
      }
      
      const data = (await response.json()) as PromptResponse;
      const answer = data.answer ?? data.reply ?? '';
      const suggestions = formatSuggestedPrompts(data.suggested_prompts);
      
      return {
        // Add a blank line after the user's command to match the streaming UX.
        output: `\r\n\r\n\x1b[38;5;250m${answer}\x1b[0m${suggestions}\n\n`,
        sessionId: data.session_id || sessionId
      };
    } catch (error) {
      return {
        output: `\r\n\r\n\x1b[2m\x1b[38;5;203mError: ${sanitizeThrownError(error)}\x1b[0m\n\n`,
        sessionId
      };
    }
  }
}
