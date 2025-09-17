import { BaseCommandHandler, CommandResult } from './handlers';

export class AIConversationHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    // This handler handles all commands that aren't handled by other handlers
    return true;
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    try {
      const getApiUrl = (): string => {
        return (import.meta.env?.VITE_API_URL as string) || 
               (typeof window !== 'undefined' && window.location?.port === '5173' 
                 ? 'http://127.0.0.1:9000' 
                 : '/api')
      }
      
      const response = await fetch(`${getApiUrl()}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: command.trim(),
          session_id: sessionId
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        output: `\r\n\x1b[1m\x1b[38;5;81mYubi Assistant:\x1b[0m\n${data.reply}\n\n`,
        sessionId: data.session_id || sessionId
      };
    } catch (error) {
      return {
        output: `\r\n\x1b[31m❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m\n\n`,
        sessionId
      };
    }
  }
}