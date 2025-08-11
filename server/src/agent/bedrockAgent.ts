import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import { config } from '../config'
import { Agent, AgentEvent, AgentInput } from './index'
import { logger } from '../utils/logger'

export class BedrockAgent implements Agent {
  private client: BedrockAgentRuntimeClient

  constructor() {
    this.client = new BedrockAgentRuntimeClient({ region: config.awsRegion })
  }

  async *handle(input: AgentInput): AsyncGenerator<AgentEvent, void, void> {
  const { agentId, agentAliasId } = config.bedrock

    yield { type: 'status', message: 'contacting bedrock agent…', level: 'info' }

    try {
      const cmd = new InvokeAgentCommand({
        agentId,
        agentAliasId,
        sessionId: input.sessionId ?? input.id, // prefer WS session id for continuity
        enableTrace: false,
        inputText: input.text,
      })

      const resp = await this.client.send(cmd)

      const stream = resp.completion
      if (!stream) {
        yield { type: 'error', id: input.id, message: 'No stream from Bedrock Agent' }
        return
      }

      for await (const chunk of stream) {
        // Completion is a union of events; extract text when present
        const text = (chunk as any).chunk?.bytes ? new TextDecoder().decode((chunk as any).chunk.bytes) : undefined
        if (text) {
          yield { type: 'token', id: input.id, content: text }
        }
        const trace = (chunk as any).trace
        if (trace?.traceId) {
          logger.debug({ traceId: trace.traceId }, 'bedrock trace event')
        }
      }

      yield { type: 'status', message: 'done', level: 'info' }
    } catch (err) {
      const e = err as any
      const msg: string = (e?.message || '').toString()
      const credLike = /could not load credentials|credentials.*provider|ec2 metadata/i.test(msg)
      if (credLike) {
        const hasId = !!process.env.AWS_ACCESS_KEY_ID
        const hasSecret = !!process.env.AWS_SECRET_ACCESS_KEY
        const hasToken = !!process.env.AWS_SESSION_TOKEN
        const isTemp = (process.env.AWS_ACCESS_KEY_ID || '').startsWith('ASIA')
        const region = process.env.AWS_REGION || config.awsRegion
        const hints: string[] = []
        if (isTemp && !hasToken) {
          hints.push('Temporary STS credentials detected (ASIA...). AWS_SESSION_TOKEN is required.')
        }
        if (!hasId || !hasSecret) {
          hints.push('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if temporary).')
        }
        hints.push(`Ensure AWS_REGION is set to your agent's region (current: ${region}).`)
        hints.push('Restart the dev server after exporting creds, or create server/.env with these variables.')
        const hintMsg = `AWS credentials not found. ${hints.join(' ')}`
        logger.error({ err: e }, hintMsg)
        yield { type: 'error', id: input.id, message: hintMsg }
        return
      }
      logger.error({ err: e }, 'bedrock agent invocation failed')
      yield { type: 'error', id: input.id, message: `Bedrock error: ${msg || 'unknown error'}` }
    }
  }
}
