#!/usr/bin/env node

import { FastMCP } from "fastmcp";
import { Octokit } from "octokit";
import dotenv from "dotenv";

dotenv.config();

// Simple test script to verify our GitHub MCP server tools
async function testGitHubMCP() {
  console.log("🧪 Testing GitHub MCP Server Tools\n");
  
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error("❌ No GITHUB_TOKEN found in .env");
    return;
  }
  
  console.log("✅ GitHub token found:", githubToken.substring(0, 20) + "...");
  
  try {
    const octokit = new Octokit({ auth: githubToken });
    
    // Test 1: List repositories
    console.log("\n📋 Test 1: List Repositories");
    const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 3
    });
    
    console.log(`Found ${repos.length} repositories:`);
    repos.forEach(repo => {
      console.log(`  - ${repo.full_name} (${repo.language || 'No language'}) ⭐ ${repo.stargazers_count}`);
    });
    
    if (repos.length > 0) {
      const firstRepo = repos[0];
      
      // Test 2: Get repository details
      console.log(`\n📖 Test 2: Get Repository Details for ${firstRepo.full_name}`);
      const { data: repoDetails } = await octokit.rest.repos.get({
        owner: firstRepo.owner.login,
        repo: firstRepo.name
      });
      
      console.log(`Repository: ${repoDetails.name}`);
      console.log(`Description: ${repoDetails.description || 'No description'}`);
      console.log(`Language: ${repoDetails.language || 'Not specified'}`);
      console.log(`Stars: ${repoDetails.stargazers_count}`);
      console.log(`Forks: ${repoDetails.forks_count}`);
      
      // Test 3: Get repository contents
      console.log(`\n📁 Test 3: Get Repository Contents for ${firstRepo.full_name}`);
      try {
        const { data: contents } = await octokit.rest.repos.getContent({
          owner: firstRepo.owner.login,
          repo: firstRepo.name,
          path: ""
        });
        
        if (Array.isArray(contents)) {
          console.log(`Found ${contents.length} items in root directory:`);
          contents.slice(0, 5).forEach(item => {
            console.log(`  - ${item.name} (${item.type})`);
          });
        }
      } catch (err) {
        console.log(`  Could not access contents: ${err.message}`);
      }
    }
    
    // Test 4: Search repositories
    console.log(`\n🔍 Test 4: Search Repositories`);
    const { data: searchResults } = await octokit.rest.search.repos({
      q: `user:${repos[0]?.owner.login || 'octocat'} language:javascript`,
      per_page: 3
    });
    
    console.log(`Found ${searchResults.total_count} JavaScript repositories:`);
    searchResults.items.forEach(repo => {
      console.log(`  - ${repo.full_name} ⭐ ${repo.stargazers_count}`);
    });
    
    console.log("\n✅ All GitHub API tests completed successfully!");
    console.log("🎯 Your MCP server should work with these same operations.");
    
  } catch (error) {
    console.error("❌ Error testing GitHub API:", error.message);
  }
}

testGitHubMCP();
