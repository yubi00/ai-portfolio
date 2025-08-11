import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand
} from "@aws-sdk/client-bedrock-agent-runtime";

interface AgentRuntimeConfig {
  agentId: string;
  agentAliasId: string;
  region?: string;
  mcpServerUrl?: string;
}

export class BedrockAgentRuntime {
  private client: BedrockAgentRuntimeClient;
  private agentId: string;
  private agentAliasId: string;
  private mcpServerUrl: string;

  constructor(config: AgentRuntimeConfig) {
    this.client = new BedrockAgentRuntimeClient({ 
      region: config.region || 'us-east-1' 
    });
    this.agentId = config.agentId;
    this.agentAliasId = config.agentAliasId;
    this.mcpServerUrl = config.mcpServerUrl || 'http://localhost:8081';
    
    console.log('🤖 Bedrock Agent Runtime initialized');
    console.log(`   Agent ID: ${this.agentId}`);
    console.log(`   Alias ID: ${this.agentAliasId}`);
    console.log(`   MCP Server: ${this.mcpServerUrl}`);
  }

  async chat(message: string, sessionId?: string): Promise<string> {
    const actualSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    console.log(`💬 Invoking Bedrock Agent with message: "${message}"`);
    console.log(`📋 Session ID: ${actualSessionId}`);

    try {
      const command = new InvokeAgentCommand({
        agentId: this.agentId,
        agentAliasId: this.agentAliasId,
        sessionId: actualSessionId,
        inputText: message,
        enableTrace: true, // Helpful for debugging
      });

      const response = await this.client.send(command);
      console.log('✅ Received response from Bedrock Agent');

      // Extract response from the streaming response
      return await this.processStreamingResponse(response);
      
    } catch (error) {
      console.error('❌ Bedrock Agent error:', error);
      throw new Error(`Bedrock Agent invocation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processStreamingResponse(response: any): Promise<string> {
    try {
      let fullResponse = '';
      let hasActionGroupCalls = false;
      
      // The response is typically a streaming response
      if (response.completion) {
        // Handle streaming response
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            // Decode the bytes
            const chunkText = new TextDecoder().decode(chunk.chunk.bytes);
            fullResponse += chunkText;
          }
          
          // Check for action group invocations
          if (chunk.returnControl) {
            hasActionGroupCalls = true;
            console.log('🔧 Action group invocation detected');
            
            // Handle action group calls here
            const actionResults = await this.handleActionGroupInvocations(chunk.returnControl);
            
            // Continue the conversation (this would require another API call)
            // For now, we'll return what we have
            break;
          }
        }
      }
      
      return fullResponse || 'No response generated from agent';
      
    } catch (error) {
      console.error('Error processing streaming response:', error);
      return 'Error processing agent response';
    }
  }

  private async handleActionGroupInvocations(returnControl: any): Promise<any[]> {
    console.log('�️ Processing action group invocations...');
    
    // This is a simplified version - in practice you'd need to handle
    // the specific format of the return control and make MCP calls
    
    try {
      // Call MCP server (simplified)
      const response = await fetch(`${this.mcpServerUrl}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'list_repositories',
          arguments: { type: 'owner', limit: 10 }
        })
      });
      
      const mcpResult = await response.json();
      console.log('✅ MCP server response received');
      
      return [mcpResult];
      
    } catch (error) {
      console.error('❌ MCP server call failed:', error);
      return [];
    }
  }

  // Utility methods
  async testConnection(): Promise<{ bedrock: boolean; mcp: boolean }> {
    const results = { bedrock: false, mcp: false };
    
    // Test MCP server connection
    try {
      const response = await fetch(`${this.mcpServerUrl}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      results.mcp = response.ok;
      console.log('✅ MCP server connection: OK');
    } catch (error) {
      console.log('❌ MCP server connection: FAILED');
      results.mcp = false;
    }
    
    // Test Bedrock agent configuration
    try {
      results.bedrock = !!(this.agentId && this.agentAliasId);
      console.log(`${results.bedrock ? '✅' : '❌'} Bedrock agent configuration: ${results.bedrock ? 'OK' : 'MISSING'}`);
    } catch (error) {
      console.log('❌ Bedrock agent configuration: FAILED');
      results.bedrock = false;
    }
    
    return results;
  }

  getConfiguration() {
    return {
      agentId: this.agentId,
      agentAliasId: this.agentAliasId,
      mcpServerUrl: this.mcpServerUrl,
      region: 'us-east-1' // Default region
    };
  }
}

export default BedrockAgentRuntime;
