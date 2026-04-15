import { getApiBaseUrl, isVoiceEnabled } from '../config/env'
import { getHelpMessage, getWelcomeMessage } from '../utils/terminal'

export interface CommandResult {
  output: string
  sessionId: string
}

export abstract class BaseCommandHandler {
  abstract canHandle(command: string): boolean
  abstract execute(command: string, sessionId: string): Promise<CommandResult>
}

export class HelpCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'help'
  }

  async execute(_command: string, sessionId: string): Promise<CommandResult> {
    return {
      output: getHelpMessage(isVoiceEnabled()),
      sessionId,
    }
  }
}

export class ClearCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'clear'
  }

  async execute(_command: string, sessionId: string): Promise<CommandResult> {
    return {
      output: `\x1b[H\x1b[2J\x1b[3J${getWelcomeMessage(isVoiceEnabled())}`,
      sessionId,
    }
  }
}

export class InfoCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'info'
  }

  async execute(_command: string, sessionId: string): Promise<CommandResult> {
    const apiUrl = getApiBaseUrl()

    return {
      output: `\r\n\x1b[1mServer Information\x1b[0m\r\n  Status:     Online\r\n  API:        ${apiUrl}\r\n  Session:    ${sessionId || 'not started'}\r\n\r\n`,
      sessionId,
    }
  }
}

export class ResumeCommandHandler extends BaseCommandHandler {
  canHandle(command: string): boolean {
    return command.trim() === 'resume'
  }

  async execute(_command: string, sessionId: string): Promise<CommandResult> {
    // OSC 8 hyperlink for terminals that support it; WebLinksAddon auto-detects the plain URL too
    const url = `${window.location.origin}/resume.pdf`
    const link = `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`

    return {
      output: `\r\n\x1b[1mResume\x1b[0m \x1b[38;5;244m- Yubi Khadka\x1b[0m\r\n\r\n  Download: \x1b[38;2;147;197;253m${link}\x1b[0m\r\n\r\n`,
      sessionId,
    }
  }
}
