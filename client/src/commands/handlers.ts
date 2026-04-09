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
    const B = '\x1b[1m'
    const R = '\x1b[0m'
    const D = '\x1b[38;5;244m'
    const S = '\x1b[38;5;238m'  // dim separator

    return {
      output: `\r\n${B}Commands${R}  ${S}${'─'.repeat(28)}${R}\r\n  ${B}help${R}    ${D}—${R} show this message\r\n  ${B}about${R}   ${D}—${R} profile and links\r\n  ${B}resume${R}  ${D}—${R} download resume\r\n  ${B}clear${R}   ${D}—${R} clear the terminal\r\n\r\n${B}Ask me anything:${R}\r\n  ${D}"What has Yubi built?"\r\n  "What's Yubi's experience with AI?"\r\n  "Tell me about Yubi's background"${R}\r\n\r\n`,
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
      output: `\r\n\x1b[1mServer Information\x1b[0m\r\n  Status:     Online\r\n  API:        ${apiUrl}\r\n  Session:    ${sessionId || 'not started'}\r\n\r\n`,
      sessionId
    };
  }
}

export class ResumeCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'resume';
  }

  async execute(command: string, sessionId: string): Promise<CommandResult> {
    // OSC 8 hyperlink for terminals that support it; WebLinksAddon auto-detects the plain URL too
    const url = `${window.location.origin}/resume.pdf`
    const link = `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`

    return {
      output: `\r\n\x1b[1mResume\x1b[0m \x1b[38;5;244m— Yubi Khadka\x1b[0m\r\n\r\n  Download: \x1b[38;2;147;197;253m${link}\x1b[0m\r\n\r\n`,
      sessionId
    };
  }
}
