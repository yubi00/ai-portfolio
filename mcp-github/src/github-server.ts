#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config();

import { FastMCP } from "fastmcp";
import { z } from "zod";
import { Octokit } from "octokit";

// Initialize GitHub client
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  // Error messages removed to avoid non-JSON output on stdio
  process.exit(1);
}

// Removed log to avoid non-JSON output on stdio

const octokit = new Octokit({
  auth: githubToken
});

// Create FastMCP server
const server = new FastMCP({
  name: "github-mcp-server",
  version: "1.0.0",
  instructions: `
A GitHub MCP server that provides tools to interact with GitHub repositories.
This server allows you to:
- List repositories for the authenticated user
- Get detailed repository information
- Search repositories on GitHub
- Get repository contents and file information

Authentication is handled via GITHUB_TOKEN environment variable.
  `.trim()
});

// List repositories tool
server.addTool({
  name: "list_repositories",
  description: "List GitHub repositories for the authenticated user",
  parameters: z.object({
    type: z.enum(['all', 'owner', 'public', 'private', 'member']).optional().default('all'),
    sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().default('updated'),
    direction: z.enum(['asc', 'desc']).optional().default('desc'),
    per_page: z.number().min(1).max(100).optional().default(30),
    page: z.number().min(1).optional().default(1)
  }),
  execute: async ({ type, sort, direction, per_page, page }) => {
    try {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        type,
        sort,
        direction,
        per_page,
        page
      });

      const repos = data.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        updated_at: repo.updated_at,
        created_at: repo.created_at
      }));

      return {
        content: [{
          type: "text",
          text: `Found ${repos.length} repositories:\n\n${JSON.stringify(repos, null, 2)}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to list repositories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});

// Get repository details tool
server.addTool({
  name: "get_repository",
  description: "Get detailed information about a specific repository",
  parameters: z.object({
    owner: z.string().describe("Repository owner username"),
    repo: z.string().describe("Repository name")
  }),
  execute: async ({ owner, repo }) => {
    try {
      const { data } = await octokit.rest.repos.get({
        owner,
        repo
      });

      const repoInfo = {
        name: data.name,
        full_name: data.full_name,
        description: data.description,
        private: data.private,
        html_url: data.html_url,
        clone_url: data.clone_url,
        ssh_url: data.ssh_url,
        language: data.language,
        stargazers_count: data.stargazers_count,
        watchers_count: data.watchers_count,
        forks_count: data.forks_count,
        open_issues_count: data.open_issues_count,
        size: data.size,
        default_branch: data.default_branch,
        topics: data.topics,
        license: data.license?.name,
        created_at: data.created_at,
        updated_at: data.updated_at,
        pushed_at: data.pushed_at
      };

      return {
        content: [{
          type: "text",
          text: `Repository Details:\n\n${JSON.stringify(repoInfo, null, 2)}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get repository ${owner}/${repo}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});

// Search repositories tool
server.addTool({
  name: "search_repositories",
  description: "Search for repositories on GitHub",
  parameters: z.object({
    q: z.string().describe("Search query (can include qualifiers like 'language:javascript', 'stars:>100', etc.)"),
    sort: z.enum(['stars', 'forks', 'help-wanted-issues', 'updated']).optional(),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    per_page: z.number().min(1).max(100).optional().default(30),
    page: z.number().min(1).optional().default(1)
  }),
  execute: async ({ q, sort, order, per_page, page }) => {
    try {
      const { data } = await octokit.rest.search.repos({
        q,
        sort,
        order,
        per_page,
        page
      });

      const repos = data.items.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        score: repo.score,
        updated_at: repo.updated_at
      }));

      return {
        content: [{
          type: "text",
          text: `Search Results (${data.total_count} total):\n\n${JSON.stringify({
            total_count: data.total_count,
            incomplete_results: data.incomplete_results,
            items: repos
          }, null, 2)}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to search repositories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});

// Get repository contents tool
server.addTool({
  name: "get_repository_contents",
  description: "Get the contents of a repository directory or file",
  parameters: z.object({
    owner: z.string().describe("Repository owner username"),
    repo: z.string().describe("Repository name"),
    path: z.string().optional().default("").describe("Path to file or directory (empty for root)"),
    ref: z.string().optional().describe("Branch, tag, or commit SHA (defaults to default branch)")
  }),
  execute: async ({ owner, repo, path, ref }) => {
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      if (Array.isArray(data)) {
        // Directory contents
        const contents = data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          download_url: item.download_url,
          html_url: item.html_url
        }));

        return {
          content: [{
            type: "text",
            text: `Directory Contents (${path || 'root'}):\n\n${JSON.stringify(contents, null, 2)}`
          }]
        };
      } else {
        // Single file
        const fileInfo = {
          name: data.name,
          path: data.path,
          type: data.type,
          size: data.size,
          encoding: (data as any).encoding || null,
          content: (data as any).content ? Buffer.from((data as any).content, 'base64').toString('utf-8') : null,
          download_url: data.download_url,
          html_url: data.html_url
        };

        return {
          content: [{
            type: "text",
            text: `File Details:\n\n${JSON.stringify(fileInfo, null, 2)}`
          }]
        };
      }
    } catch (error) {
      throw new Error(`Failed to get contents for ${owner}/${repo}${path ? `/${path}` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});

// Start server with HTTP streaming (AgentCore Runtime compatible)
if (process.env.NODE_ENV === 'production' || process.env.AGENTCORE === 'true') {
  // AgentCore Runtime mode - stateless HTTP streaming
  server.start({
    transportType: "httpStream",
    httpStream: {
      port: 8000,
      stateless: true  // Required for AgentCore Runtime
    }
  });
  // Removed log to avoid non-JSON output on stdio
} else {
  // Development mode - stdio for testing
  server.start({
    transportType: "stdio"
  });
  // Removed log to avoid non-JSON output on stdio
}
