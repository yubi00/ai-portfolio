export type AgentEvent =
  | { type: 'token'; id: string; content: string }
  | { type: 'line'; id: string; content: string }
  | { type: 'status'; message: string; level: 'info'|'warn'|'error' }
  | { type: 'tool_result'; id: string; tool: string; data: unknown }
  | { type: 'error'; id?: string; message: string; code?: string }

export interface AgentInput {
  id: string
  text: string
  sessionId?: string
}

export interface Agent {
  handle(input: AgentInput): AsyncGenerator<AgentEvent, void, void>
}

// Export the AgentCore Runtime agent for connecting to our GitHub MCP server
export { BedrockAgentRuntime } from './bedrockAgentRuntime.js';
