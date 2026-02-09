import { THEMES } from '../config/terminal';
import { getApiBaseUrl } from '../config/env';

export interface CommandResult {
  output: string;
  sessionId: string;
}

export abstract class BaseCommandHandler {
  abstract canHandle(command: string): boolean;
  abstract execute(command: string, sessionId: string): Promise<CommandResult>;
}

export class HelpCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'help';
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    return {
      output: `
Yubi Portfolio Assistant

How to interact:
  - Ask me about my projects, skills, or experience
  - Examples: "What are your projects?"
            "Tell me about your technical skills"
            "What programming languages do you know?"

Available commands:
  help         - Show this help message
  about        - About Yubi (profile)
  clear        - Clear the terminal
  info         - Show server info
 
Advanced: Contextual Conversations
  Ask: "Tell me your 5 projects"
  Then: "Tell me about the third one" -> Context remembered!

`,
      sessionId
    };
  }
}

export class ClearCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'clear';
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    return {
      output: `\x1b[H\x1b[2J\x1b[3J${THEMES.matrix.welcome}`, // Clear scrollback + re-print intro
      sessionId
    };
  }
}

export class InfoCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'info';
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    const apiUrl = getApiBaseUrl();
    
    return {
      output: `
📊 Server Information:
  • Status: Online
  • API Endpoint: ${apiUrl}
  • Session ID: ${sessionId || 'Not started'}

`,
      sessionId
    };
  }
}
