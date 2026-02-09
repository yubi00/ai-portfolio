import { BaseCommandHandler, CommandResult } from './handlers';
import { getApiBaseUrl, getAuthEnv } from '../config/env';
import { getAuthorizationHeader } from '../utils/auth';

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
        let detail = '';
        try {
          const j = await response.json();
          detail = j?.detail ? String(j.detail) : '';
        } catch {}
        throw new Error(detail ? `HTTP ${response.status} (${detail})` : `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        // Add a blank line after the user's command to match the streaming UX.
        output: `\r\n\r\n\x1b[38;5;250m${data.reply}\x1b[0m\n\n`,
        sessionId: data.session_id || sessionId
      };
    } catch (error) {
      return {
        output: `\r\n\r\n\x1b[2m\x1b[38;5;203mError: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m\n\n`,
        sessionId
      };
    }
  }
}
