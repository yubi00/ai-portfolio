export type ClientToServer =
  | { type: 'prompt'; id: string; content: string; meta?: Record<string, unknown> }
  | { type: 'interrupt'; id: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'meta'; key: string; value: unknown }

export type ServerToClient =
  | { type: 'ready'; protocol: '1.0' }
  | { type: 'status'; message: string; level: 'info' | 'warn' | 'error' }
  | { type: 'token'; id: string; content: string }
  | { type: 'line'; id: string; content: string }
  | { type: 'tool_result'; id: string; tool: string; data: unknown }
  | { type: 'error'; id?: string; message: string; code?: string }
