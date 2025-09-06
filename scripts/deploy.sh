#!/bin/bash

# AI Portfolio Deployment Script for Render
# This script helps deploy the application using Render CLI

set -e

echo "🚀 AI Portfolio Deployment to Render"
echo "===================================="

# Check if render CLI is installed
if ! command -v render &> /dev/null; then
    echo "❌ Render CLI not found. Please install it first:"
    echo "   npm install -g @render/cli"
    echo "   or visit: https://render.com/docs/cli"
    exit 1
fi

# Check if user is logged in
if ! render whoami &> /dev/null; then
    echo "🔑 Please log in to Render first:"
    echo "   render login"
    echo ""
    echo "This will open your browser to authenticate with Render."
    exit 1
fi

echo "✅ Render CLI found and authenticated"

# Check if render.yaml exists
if [ ! -f "render.yaml" ]; then
    echo "❌ render.yaml not found in current directory"
    exit 1
fi

echo "✅ render.yaml found"

# Validate environment variables
echo ""
echo "🔍 Environment Variables Check:"
echo "==============================="

missing_vars=()

if [ -z "$OPENAI_API_KEY" ]; then
    missing_vars+=("OPENAI_API_KEY")
fi

if [ -z "$GITHUB_TOKEN" ]; then
    missing_vars+=("GITHUB_TOKEN")
fi

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "⚠️  Missing environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "💡 You'll need to set these in the Render dashboard after deployment."
    echo "   Or set them now and re-run this script:"
    echo ""
    for var in "${missing_vars[@]}"; do
        echo "   export $var=your_${var,,}_here"
    done
    echo ""
    read -p "Continue with deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
else
    echo "✅ All required environment variables are set"
fi

echo ""
echo "🚀 Starting deployment..."
echo "========================"

# Note: Current Render CLI doesn't support blueprint deployment
# We'll provide instructions for manual deployment instead

echo "📦 Blueprint Configuration Ready!"
echo ""
echo "⚠️  Note: The current Render CLI version doesn't support blueprint deployment."
echo "   You'll need to deploy manually through the Render dashboard."
echo ""
echo "🚀 Manual Deployment Steps:"
echo "=========================="
echo ""
echo "1. 📋 Go to Render Dashboard: https://dashboard.render.com"
echo "2. 🔗 Connect your Git repository (GitHub, GitLab, etc.)"
echo "3. 📄 Use the render.yaml file in your repository root"
echo "4. 🎯 Render will automatically detect and deploy all services"
echo ""
echo "📋 Services to be created:"
echo "- ai-portfolio-backend (Python/FastAPI)" 
echo "- ai-portfolio-frontend (Node.js/Static)"
echo ""
echo "🔐 Don't forget to set this environment variable:"
echo "- OPENAI_API_KEY (in backend service)"
echo ""
echo "✅ Using existing MCP server: https://yubi-github-mcp-server.onrender.com/mcp"
echo ""
echo "✅ Your render.yaml is ready for deployment!"
echo "🔗 Render Dashboard: https://dashboard.render.com"
