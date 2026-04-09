import {
  BaseCommandHandler,
  HelpCommandHandler,
  ClearCommandHandler,
  ResumeCommandHandler,
  CommandResult
} from './handlers';
import { AIConversationHandler } from './aiHandler';

export class CommandProcessor {
  private handlers: BaseCommandHandler[];

  constructor() {
    this.handlers = [
      new HelpCommandHandler(),
      new ClearCommandHandler(),
      new ResumeCommandHandler(),
      // AI handler should be last as it handles all remaining commands
      new AIConversationHandler()
    ];
  }

  async processCommand(command: string, sessionId: string): Promise<CommandResult> {
    const trimmedCommand = command.trim();
    
    if (!trimmedCommand) {
      return { output: '', sessionId };
    }

    for (const handler of this.handlers) {
      if (handler.canHandle(trimmedCommand)) {
        return await handler.execute(trimmedCommand, sessionId);
      }
    }

    // Fallback (should never reach here due to AI handler being catch-all)
    return {
      output: `\r\n\x1b[2m\x1b[38;5;203mError: Unknown command: ${trimmedCommand}\x1b[0m\n\n`,
      sessionId
    };
  }
}

// Export a singleton instance
export const commandProcessor = new CommandProcessor();
