import { BedrockAgentCoreClient } from '@aws-sdk/client-bedrock-agentcore';

// Example: create a client instance for AWS Bedrock AgentCore
export const agentCoreClient = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION || 'ap-southeast-2', // Default region, can be overridden by environment variable
  // Add credentials or config as needed
});

// You can now import agentCoreClient and use it in your Express routes
