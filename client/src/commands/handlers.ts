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
🤖 Yubi AI Portfolio Assistant

How to interact:
  • Ask me about my projects, skills, or experience
  • Examples: "What are your projects?"
            "Tell me about your technical skills"
            "What programming languages do you know?"

Available commands:
  help         - Show this help message
  clear        - Clear the terminal
  info         - Show server info
  ping         - Test server connection

💬 Advanced: Contextual Conversations
  Ask: "Tell me your 5 projects"
  Then: "Tell me about the third one" ← Context remembered!

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
      output: '\x1b[2J\x1b[H', // Clear screen and move cursor to top
      sessionId
    };
  }
}

export class PingCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'ping';
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    return {
      output: '🏓 Pong! Server is responding.\n',
      sessionId
    };
  }
}

export class InfoCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'info';
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    const getApiUrl = (): string => {
      return (import.meta.env?.VITE_API_URL as string) || 
             (typeof window !== 'undefined' && window.location?.port === '5173' 
               ? 'http://127.0.0.1:9000' 
               : '/api')
    }
    
    return {
      output: `
📊 Server Information:
  • Status: Online
  • API Endpoint: ${getApiUrl()}
  • Session ID: ${sessionId || 'Not started'}

`,
      sessionId
    };
  }
}